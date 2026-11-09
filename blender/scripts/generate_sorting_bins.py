"""Left and right sorting bins.

The same machine is built twice, mirrored. Besides the accent colour, the two
differ by raised arrows pointing outward and by which side carries the intake
chute, so they stay distinct without relying on colour. The front panel is
blank: Phaser draws the LEFT and RIGHT labels and the accepted parcels there.
"""
import math

import bpy

import create_asset_studio as studio

BIN_FRAME_UNITS = 2.72
WIDTH = 2.1
DEPTH = 1.25
HEIGHT = 2.5
WALL = 0.13


def build_bin(side):
    direction = -1 if side == "left" else 1
    accent_hex = "#22f0ff" if side == "left" else "#ff3fd0"
    body = studio.material("BinBody", "#54678d", metallic=0.55, roughness=0.42)
    rim = studio.brushed_steel("BinRim", "#9aa9c2", 0.34)
    inner = studio.rubber("BinInner", "#0a0f1a", 0.85)
    panel = studio.material("BinPanel", "#26324c", metallic=0.2, roughness=0.55)
    bolt = studio.dark_steel("BinBolt", "#a8b6cf", 0.32)
    hazard = studio.material("BinHazard", "#e8a11a", roughness=0.5)
    accent = studio.neon(f"BinAccent_{side}", accent_hex, 3.2)

    top = HEIGHT
    half_w = WIDTH / 2
    half_d = DEPTH / 2

    # Outer shell built from walls, so the opening is a real hollow.
    wall_h = HEIGHT
    studio.box("Front", (WIDTH, WALL, wall_h), (0, -half_d + WALL / 2, wall_h / 2), body, bevel=0.03, segments=3)
    studio.box("Back", (WIDTH, WALL, wall_h), (0, half_d - WALL / 2, wall_h / 2), body, bevel=0.03, segments=3)
    for sx in (-1, 1):
        studio.box("Side", (WALL, DEPTH, wall_h), (sx * (half_w - WALL / 2), 0, wall_h / 2), body, bevel=0.03, segments=3)
    studio.box("Floor", (WIDTH - 0.1, DEPTH - 0.1, 0.1), (0, 0, top - 0.75), inner)

    # Rim around the opening.
    rim_h = 0.07
    rim_w = 0.15
    studio.box("RimFront", (WIDTH + 0.06, rim_w, rim_h), (0, -half_d + rim_w / 2 - 0.03, top + rim_h / 2), rim, bevel=0.022, segments=3)
    studio.box("RimBack", (WIDTH + 0.06, rim_w, rim_h), (0, half_d - rim_w / 2 + 0.03, top + rim_h / 2), rim, bevel=0.022, segments=3)
    for sx in (-1, 1):
        studio.box("RimSide", (rim_w, DEPTH + 0.06, rim_h), (sx * (half_w - rim_w / 2 + 0.03), 0, top + rim_h / 2), rim, bevel=0.022, segments=3)

    # Neon strip inside the back wall gives the opening depth.
    studio.box("InnerGlow", (WIDTH - 0.5, 0.02, 0.05), (0, half_d - WALL - 0.012, top - 0.2), accent)

    # Hazard stripes along the front lip.
    front_y = -half_d - 0.006
    stripe_z = top - 0.13
    studio.box("HazardBack", (WIDTH - 0.2, 0.01, 0.14), (0, front_y + 0.002, stripe_z), inner)
    for i in range(-7, 8):
        dash = studio.box("Hazard", (0.08, 0.012, 0.19), (i * 0.13, front_y - 0.002, stripe_z), hazard)
        dash.rotation_euler.y = math.radians(35)

    # Blank identification panel, where Phaser draws the label.
    panel_z = (top - 0.26) * 0.5 + 0.02
    panel_h = top - 0.42
    studio.box("IdPanel", (WIDTH - 0.3, 0.04, panel_h), (0, front_y - 0.012, panel_z), panel, bevel=0.012, segments=2)
    for sx in (-1, 1):
        for z in (panel_z - panel_h / 2 + 0.09, panel_z + panel_h / 2 - 0.09):
            studio.cylinder("Bolt", 0.035, 0.03, (sx * (half_w - 0.235), front_y - 0.04, z), bolt, bevel=0.01, segments=6, bevel_segments=1, axis="Y")

    # Raised arrows on the top rim point the way this bin faces.
    for step in range(3):
        x = direction * (0.26 + step * 0.26)
        arrow = [(-0.075, 0.1), (0.02, 0.1), (0.1, 0.0), (0.02, -0.1), (-0.075, -0.1), (0.005, 0.0)]
        points = [(direction * px, py) for px, py in arrow]
        studio.prism("Arrow", points, 0.03, (x, -half_d + 0.012, top + rim_h + 0.012), accent)

    # Intake chute on the belt-facing side, mirrored between the two bins.
    chute_x = -direction * (half_w + 0.14)
    studio.box("Chute", (0.3, 0.62, 0.3), (chute_x, 0, top - 0.3), body, bevel=0.045, segments=3)
    studio.box("ChuteLip", (0.09, 0.72, 0.4), (chute_x - direction * 0.14, 0, top - 0.3), rim, bevel=0.02, segments=3)
    studio.box("ChuteGlow", (0.012, 0.42, 0.05), (chute_x - direction * 0.187, 0, top - 0.3), accent)

    # Feet.
    for sx in (-1, 1):
        studio.box("Foot", (0.42, DEPTH - 0.1, 0.08), (sx * (half_w - 0.3), 0, 0.04), rim, bevel=0.02, segments=2)


def generate():
    for side in ("left", "right"):
        def attempt(side=side):
            studio.reset_scene()
            studio.set_resolution(840, 840)
            floor = studio.shadow_floor(30)
            before = set(bpy.data.objects)
            build_bin(side)
            studio.sprite_camera(BIN_FRAME_UNITS, target=(0, 0, HEIGHT * 0.5))
            studio.studio_lights(1.5)
            # The front carries the label, so it gets its own soft light.
            studio.area_light("FrontFill", (0, -6, 2.0), (0, 0, 1.2), 260, 5)
            subjects = studio.objects_created_since(before)
            studio.render_sprite("bins", f"sorting_bin_{side}", floor, subjects)

        studio.retry_scene(attempt)
        studio.save_project(f"sorting_bin_{side}")
