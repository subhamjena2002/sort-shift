"""The eight parcel variants and the golden bonus carrier.

No sorting text is modelled here: each parcel has a blank label plate on which
Phaser draws the colour name and symbol, so the game stays readable and
accessible.

One world unit is the width of a parcel. Sprites use a fixed framing, so all
parcels share the same scale and centre.
"""
import math

import bpy

import create_asset_studio as studio

PARCEL_FRAME_UNITS = 1.36
GOLD_FRAME_UNITS = 1.96
PARCEL_HEIGHT = 0.44
LABEL_Y = 0.02

PALETTE = {
    "blue": {"body": "#0f5cff", "dark": "#0a349a", "light": "#6fb1ff"},
    "red": {"body": "#f00a2a", "dark": "#8e0a22", "light": "#ff7a8a"},
    "yellow": {"body": "#ffc000", "dark": "#a87300", "light": "#ffe680"},
    "green": {"body": "#07b84f", "dark": "#056b31", "light": "#7eeeab"},
}


def _materials(color):
    swatch = PALETTE[color]
    return {
        "body": studio.material(f"Body_{color}", swatch["body"], roughness=0.5, coat=0.08),
        "dark": studio.material(f"Trim_{color}", swatch["dark"], roughness=0.42),
        "light": studio.material(f"Light_{color}", swatch["light"], roughness=0.4),
        "label": studio.material("LabelPlate", "#f4f6fa", roughness=0.55),
        "ink": studio.material("Barcode", "#121826", roughness=0.6),
        "steel": studio.brushed_steel(),
    }


def _barcode(y, top, mats, width=0.26):
    x = -width / 2
    for step, bar in enumerate((3, 1, 2, 1, 3, 2, 1, 3, 1, 2, 1)):
        bar_width = bar * 0.0085
        studio.box(f"Bar{step}", (bar_width, 0.075, 0.004), (x + bar_width / 2, y, top + 0.002), mats["ink"])
        x += bar_width + 0.0085


def build_square(color):
    mats = _materials(color)
    h = PARCEL_HEIGHT
    studio.box("Body", (1.0, 1.0, h), (0, 0, h / 2), mats["body"], bevel=0.055, segments=5)

    # Raised lid inset, giving the top face a machined edge.
    studio.plan_rounded_box("Lid", 0.86, 0.86, 0.016, 0.05, (0, 0, h + 0.003), mats["light"], edge_bevel=0.005)
    studio.plan_rounded_box("LidCentre", 0.82, 0.82, 0.016, 0.04, (0, 0, h + 0.009), mats["body"], edge_bevel=0.004)

    # Darker strap wrapping front to back, under the label plate.
    studio.box("StrapTop", (0.15, 1.012, 0.012), (0, 0, h + 0.012), mats["dark"], bevel=0.003, segments=2)
    studio.box("StrapFront", (0.15, 0.012, h - 0.06), (0, -0.503, h / 2), mats["dark"], bevel=0.003, segments=2)

    # Corner guards in steel.
    for sx in (-1, 1):
        for sy in (-1, 1):
            studio.box("GuardA", (0.15, 0.04, 0.02), (sx * 0.405, sy * 0.46, h + 0.012), mats["steel"], bevel=0.006, segments=2)
            studio.box("GuardB", (0.04, 0.15, 0.02), (sx * 0.46, sy * 0.405, h + 0.012), mats["steel"], bevel=0.006, segments=2)
        studio.box("FrontGuard", (0.05, 0.016, h - 0.1), (sx * 0.43, -0.504, h / 2), mats["steel"], bevel=0.004, segments=2)

    top = h + 0.02
    studio.plan_rounded_box("Label", 0.84, 0.25, 0.012, 0.03, (0, LABEL_Y, top + 0.004), mats["label"], edge_bevel=0.003)
    _barcode(-0.31, top, mats)


def build_circle(color):
    mats = _materials(color)
    h = PARCEL_HEIGHT
    radius = 0.5
    studio.cylinder("Drum", radius, h, (0, 0, h / 2), mats["body"], bevel=0.05, bevel_segments=5)

    # Two bands around the drum make it read as a barrel, not a flat token.
    studio.ring("BandLow", radius + 0.006, radius - 0.04, 0.05, (0, 0, h * 0.28), mats["dark"], bevel=0.008)
    studio.ring("BandHigh", radius + 0.006, radius - 0.04, 0.05, (0, 0, h * 0.7), mats["dark"], bevel=0.008)

    # Lid: raised steel collar around a recessed disc.
    studio.ring("Collar", radius - 0.035, radius - 0.095, 0.03, (0, 0, h + 0.006), mats["steel"], bevel=0.01)
    studio.cylinder("LidDisc", radius - 0.09, 0.012, (0, 0, h + 0.002), mats["light"], bevel=0.003)
    studio.cylinder("LidCentre", radius - 0.115, 0.012, (0, 0, h + 0.008), mats["body"], bevel=0.003)

    # Rivets around the collar.
    for i in range(12):
        angle = 2 * math.pi * (i + 0.5) / 12
        studio.cylinder(
            "Rivet",
            0.014,
            0.012,
            ((radius - 0.065) * math.cos(angle), (radius - 0.065) * math.sin(angle), h + 0.024),
            mats["dark"],
            bevel=0.004,
            segments=16,
            bevel_segments=2,
        )

    top = h + 0.014
    studio.plan_rounded_box("Label", 0.74, 0.25, 0.012, 0.03, (0, LABEL_Y, top + 0.004), mats["label"], edge_bevel=0.003)
    _barcode(-0.27, top, mats, width=0.22)


def build_golden_carrier():
    """A gold plate, frame and star that sit under the real parcel.

    Golden parcels are still sorted by colour or shape, so the parcel itself
    stays visible on top. The carrier is what makes it read as gold.
    """
    plate_mat = studio.gold("GoldPlate", 0.34)
    frame_mat = studio.gold("GoldFrame", 0.18)
    dark = studio.material("GoldShadow", "#3a2500", metallic=0.7, roughness=0.5)
    recess_mat = studio.material("GoldRecess", "#f0b83a", metallic=0.8, roughness=0.5)
    half = 0.8

    studio.plan_rounded_box("Plate", half * 2, half * 2, 0.07, 0.16, (0, 0, 0.035), plate_mat, edge_bevel=0.012)
    studio.plan_rounded_box("Recess", half * 2 - 0.2, half * 2 - 0.2, 0.012, 0.09, (0, 0, 0.073), recess_mat)

    # Raised frame, as four rails with corner blocks.
    rail = 0.1
    rail_h = 0.11
    edge = half - rail / 2 - 0.02
    span = half * 2 - 0.42
    for sign in (-1, 1):
        studio.box("RailX", (span, rail, rail_h), (0, sign * edge, rail_h / 2 + 0.05), frame_mat, bevel=0.02, segments=3)
        studio.box("RailY", (rail, span, rail_h), (sign * edge, 0, rail_h / 2 + 0.05), frame_mat, bevel=0.02, segments=3)
    corners = [(sx, sy) for sx in (-1, 1) for sy in (-1, 1)]
    for sx, sy in corners:
        at = half - 0.17
        studio.cylinder("Corner", 0.135, 0.15, (sx * at, sy * at, 0.125), frame_mat, bevel=0.025, segments=48)

    # The star badge stands on the rear-right corner, clear of the parcel.
    at = half - 0.17
    studio.cylinder("Badge", 0.215, 0.06, (at, at, 0.23), dark, bevel=0.015, segments=64)
    studio.ring("BadgeRim", 0.235, 0.19, 0.075, (at, at, 0.232), frame_mat, bevel=0.012, segments=64)
    outline = studio.star_outline(0.175, 0.078)
    studio.prism("Star", outline, 0.05, (at, at, 0.285), studio.gold("StarGold", 0.12), bevel=0.012)


def _shoot(name, builder, frame_units):
    def attempt():
        studio.reset_scene()
        studio.set_resolution(512, 512)
        floor = studio.shadow_floor()
        before = set(bpy.data.objects)
        builder()
        studio.sprite_camera(frame_units)
        studio.studio_lights()
        subjects = studio.objects_created_since(before)
        studio.render_sprite("parcels", name, floor, subjects)

    studio.retry_scene(attempt)
    return name


def generate(save_blend=True):
    for color in PALETTE:
        _shoot(f"{color}_square", lambda c=color: build_square(c), PARCEL_FRAME_UNITS)
        if save_blend and color == "blue":
            studio.save_project("parcel_square")
        _shoot(f"{color}_circle", lambda c=color: build_circle(c), PARCEL_FRAME_UNITS)
        if save_blend and color == "blue":
            studio.save_project("parcel_circle")
    _shoot("golden_bonus", build_golden_carrier, GOLD_FRAME_UNITS)
    if save_blend:
        studio.save_project("golden_bonus")
