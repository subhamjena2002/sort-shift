"""Turns blender/source/ renders into production WebP files and the contact sheet.

Run with a normal Python that has Pillow and NumPy, after render_assets.py:

    python blender/scripts/build_web_assets.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE = os.path.join(ROOT, "blender", "source")
OUTPUT = os.path.join(ROOT, "public", "assets", "images", "blender")
PREVIEWS = os.path.join(ROOT, "blender", "previews")

SHADOW_STRENGTH = 0.75
# Darkening below this is render noise or bounced light, not a shadow.
SHADOW_NOISE_FLOOR = 0.03

PARCELS = [f"{color}_{shape}" for color in ("blue", "red", "yellow", "green") for shape in ("square", "circle")]

# group, source name, output name, (width, height), quality, has a measured shadow
ASSETS = [
    *[("parcels", name, name, (256, 256), 88, True) for name in PARCELS],
    ("parcels", "golden_bonus", "golden_bonus", (368, 368), 88, True),
    ("conveyor", "conveyor_belt_tile", "conveyor_belt_tile", (256, 128), 86, False),
    ("conveyor", "conveyor_rail", "conveyor_rail", (64, 128), 86, False),
    ("conveyor", "conveyor_roller", "conveyor_roller", (96, 96), 88, False),
    ("bins", "sorting_bin_left", "sorting_bin_left", (420, 420), 86, True),
    ("bins", "sorting_bin_right", "sorting_bin_right", (420, 420), 86, True),
    ("backgrounds", "factory_landscape", "factory_landscape", (1280, 720), 80, False),
    ("backgrounds", "factory_portrait", "factory_portrait", (720, 1280), 80, False),
]


def load(path, mode="RGBA"):
    return np.asarray(Image.open(path).convert(mode), dtype=np.float64) / 255.0


def edge_fade(height, width, margin=0.06):
    """1 inside the image, falling to 0 at the borders, so sprites never end in a hard line."""
    ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / (n * margin), 0.0, 1.0)
    return np.outer(ramp(height), ramp(width))


def compose_shadow(group, name):
    """Lay the render over the shadow measured from its two floor renders."""
    beauty = load(os.path.join(SOURCE, group, f"{name}.png"))
    with_object = load(os.path.join(SOURCE, group, f"{name}__with_object.png"), "RGB").mean(axis=2)
    floor_only = load(os.path.join(SOURCE, group, f"{name}__floor_only.png"), "RGB").mean(axis=2)
    darkening = np.clip(1.0 - with_object / np.maximum(floor_only, 1e-4) - SHADOW_NOISE_FLOOR, 0.0, 1.0)
    shadow = darkening * SHADOW_STRENGTH * edge_fade(*darkening.shape)

    alpha = beauty[..., 3]
    out_alpha = alpha + shadow * (1.0 - alpha)
    # Black shadow beneath, so only the object contributes colour.
    rgb = beauty[..., :3] * alpha[..., None] / np.maximum(out_alpha[..., None], 1e-6)
    return np.dstack((rgb, out_alpha))


def resize(pixels, size):
    """Downscale with premultiplied alpha, which avoids dark or bright fringes."""
    alpha = pixels[..., 3]
    premultiplied = np.dstack((pixels[..., :3] * alpha[..., None], alpha))
    channels = [Image.fromarray(premultiplied[..., i].astype(np.float32), "F").resize(size, Image.LANCZOS) for i in range(4)]
    out = np.dstack([np.asarray(c, dtype=np.float64) for c in channels]).clip(0, 1)
    out_alpha = out[..., 3]
    rgb = out[..., :3] / np.maximum(out_alpha[..., None], 1e-6)
    return np.dstack((rgb.clip(0, 1), out_alpha))


def to_image(pixels):
    return Image.fromarray((pixels * 255.0 + 0.5).astype(np.uint8), "RGBA")


def seam_error(pixels):
    """Average difference across the tile's wrap, compared with neighbouring rows."""
    rgb = pixels[..., :3]
    wrap = np.abs(rgb[0] - rgb[-1]).mean()
    inner = np.abs(rgb[1] - rgb[0]).mean()
    return float(wrap), float(inner)


def build():
    report = []
    images = {}
    for group, source, output, size, quality, shadowed in ASSETS:
        beauty_path = os.path.join(SOURCE, group, f"{source}.png")
        if not os.path.exists(beauty_path):
            print(f"SKIP   {group}/{source} (not rendered yet)")
            continue
        pixels = compose_shadow(group, source) if shadowed else load(beauty_path)
        final = resize(pixels, size)
        image = to_image(final)
        folder = os.path.join(OUTPUT, group)
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f"{output}.webp")
        opaque = bool(final[..., 3].min() > 0.999)
        image.convert("RGB" if opaque else "RGBA").save(path, "WEBP", quality=quality, alpha_quality=92, method=6)
        images[output] = image
        corners = [float(final[y, x, 3]) for y in (0, -1) for x in (0, -1)]
        entry = {"name": output, "group": group, "width": size[0], "height": size[1], "bytes": os.path.getsize(path), "opaque": opaque, "maxCornerAlpha": round(max(corners), 3)}
        if "tile" in source or "rail" in source:
            wrap, inner = seam_error(final)
            entry["seam"] = {"wrap": round(wrap, 4), "adjacentRow": round(inner, 4)}
        report.append(entry)
        print(f"BUILT  {group}/{output}.webp {size[0]}x{size[1]} {entry['bytes'] / 1024:.1f} KB corners={entry['maxCornerAlpha']}")

    total = sum(e["bytes"] for e in report)
    print(f"TOTAL  {len(report)} files, {total / 1024:.1f} KB")
    os.makedirs(PREVIEWS, exist_ok=True)
    with open(os.path.join(PREVIEWS, "asset_report.json"), "w", encoding="utf8") as handle:
        json.dump({"totalBytes": total, "assets": report}, handle, indent=2)
    contact_sheet(images)


def font(size):
    for candidate in ("arialbd.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def contact_sheet(images):
    """All assets on one sheet, including small sizes where recognition matters most."""
    width, height = 2000, 1500
    sheet = Image.new("RGBA", (width, height), (12, 20, 42, 255))
    draw = ImageDraw.Draw(sheet)
    title, small = font(30), font(18)

    def label(x, y, text, f=small):
        draw.text((x, y), text, fill=(214, 228, 255, 255), font=f)

    def paste(name, x, y, size=None):
        if name not in images:
            return
        image = images[name]
        if size:
            image = image.resize(size, Image.LANCZOS)
        sheet.alpha_composite(image, (x, y))

    label(30, 18, "SORT SHIFT - Blender asset contact sheet", title)
    label(30, 70, "Parcels at production size")
    for index, name in enumerate(PARCELS):
        paste(name, 30 + index * 214, 92, (208, 208))
        label(50 + index * 214, 300, name)

    label(30, 334, "Parcels at 56 px, the small-screen check")
    for index, name in enumerate(PARCELS):
        paste(name, 30 + index * 72, 360, (56, 56))

    label(640, 334, "Golden carrier, alone and under parcels")
    if "golden_bonus" in images:
        paste("golden_bonus", 640, 360, (200, 200))
        for index, name in enumerate(("blue_square", "yellow_circle")):
            x = 860 + index * 220
            paste("golden_bonus", x, 360, (200, 200))
            inner = round(200 * 1.36 / 1.96)
            paste(name, x + (200 - inner) // 2, 360 + (200 - inner) // 2, (inner, inner))
        for index, name in enumerate(("red_circle", "green_square")):
            x = 1310 + index * 90
            paste("golden_bonus", x, 420, (84, 84))
            inner = round(84 * 1.36 / 1.96)
            paste(name, x + (84 - inner) // 2, 420 + (84 - inner) // 2, (inner, inner))

    label(30, 580, "Conveyor (belt tile repeated, rail repeated, roller)")
    if "conveyor_belt_tile" in images:
        for row in range(4):
            paste("conveyor_belt_tile", 30, 606 + row * 128)
    if "conveyor_rail" in images:
        for row in range(4):
            paste("conveyor_rail", 300, 606 + row * 128)
            paste("conveyor_rail", 370, 606 + row * 128)
    paste("conveyor_roller", 450, 620, (160, 160))

    label(640, 580, "Sorting bins")
    paste("sorting_bin_left", 640, 606, (420, 420))
    paste("sorting_bin_right", 1070, 606, (420, 420))
    paste("sorting_bin_left", 1500, 606, (150, 150))
    paste("sorting_bin_right", 1660, 606, (150, 150))

    label(30, 1130, "Backgrounds")
    paste("factory_landscape", 30, 1156, (610, 343))
    paste("factory_portrait", 660, 1156, (193, 343))

    path = os.path.join(PREVIEWS, "asset_contact_sheet.png")
    sheet.convert("RGB").save(path)
    print(f"SHEET  {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    build()
