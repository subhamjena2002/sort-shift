"""Factory backdrops. Landscape and portrait are separate compositions, not crops.

Everything stays dark and low in contrast behind the play area, because the
parcels, rule panel and HUD have to read clearly on top of it.
"""
import math

import bpy

import create_asset_studio as studio


def _mats():
    return {
        "wall": studio.material("Wall", "#27365a", roughness=0.62),
        "panel": studio.material("WallPanel", "#34466f", metallic=0.15, roughness=0.5),
        "panel_alt": studio.material("WallPanelAlt", "#2d3d63", metallic=0.15, roughness=0.55),
        "frame": studio.material("Frame", "#5a6d92", metallic=0.4, roughness=0.42),
        "pipe": studio.material("Pipe", "#8092b4", metallic=0.5, roughness=0.34),
        "pipe_dark": studio.material("PipeDark", "#4d5e80", metallic=0.4, roughness=0.4),
        "floor": studio.material("Floor", "#2b3855", metallic=0.2, roughness=0.42),
        "floor_line": studio.material("FloorLine", "#10172a", roughness=0.6),
        "hazard": studio.material("Hazard", "#a97c1c", roughness=0.55),
        "machine": studio.material("Machine", "#465a82", metallic=0.35, roughness=0.42),
        "machine_dark": studio.material("MachineDark", "#222e49", metallic=0.2, roughness=0.5),
        "belt": studio.rubber("DistantBelt", "#1c2436", 0.65),
        "crate": studio.material("DistantCrate", "#6b5a44", roughness=0.6),
        "crate_alt": studio.material("DistantCrateAlt", "#3f5f86", roughness=0.55),
        "cyan": studio.neon("NeonCyan", "#22d8ff", 0.75),
        "magenta": studio.neon("NeonMagenta", "#ff36c8", 0.7),
        "amber": studio.neon("NeonAmber", "#ffb030", 0.6),
    }


def wall(m, x0, x1, z0, z1, width=1.5, height=1.5):
    """Back wall, in staggered rows of bolted panels."""
    studio.box("WallBack", (x1 - x0 + 8, 0.2, z1 - z0 + 8), ((x0 + x1) / 2, 1.0, (z0 + z1) / 2), m["wall"])
    row = 0
    z = z0
    while z < z1:
        x = x0 - (width / 2 if row % 2 else 0)
        column = 0
        while x < x1:
            mat = m["panel"] if (row * 3 + column * 5) % 4 else m["panel_alt"]
            studio.box("Panel", (width - 0.05, 0.06, height - 0.05), (x + width / 2, 0.86, z + height / 2), mat, bevel=0.02, segments=2)
            for sx in (-1, 1):
                for sz in (-1, 1):
                    studio.cylinder("PanelBolt", 0.026, 0.02, (x + width / 2 + sx * (width / 2 - 0.1), 0.82, z + height / 2 + sz * (height / 2 - 0.1)), m["frame"], segments=8, axis="Y")
            x += width
            column += 1
        z += height
        row += 1


def floor(m, x0, x1, y_near):
    studio.box("FloorPlate", (x1 - x0 + 12, 1.0 - y_near + 6, 0.1), ((x0 + x1) / 2, (1.0 + y_near) / 2, -0.05), m["floor"])
    y = y_near
    while y < 1.0:
        studio.box("FloorSeam", (x1 - x0 + 12, 0.025, 0.004), ((x0 + x1) / 2, y, 0.002), m["floor_line"])
        y += 1.1
    x = x0 - 4
    while x < x1 + 4:
        studio.box("FloorSeamV", (0.025, 1.0 - y_near + 6, 0.004), (x, (1.0 + y_near) / 2, 0.002), m["floor_line"])
        x += 1.5


def hazard_strip(m, x0, x1, y):
    studio.box("HazardBase", (x1 - x0, 0.32, 0.01), ((x0 + x1) / 2, y, 0.006), m["floor_line"])
    x = x0
    while x < x1:
        studio.box("HazardDash", (0.3, 0.3, 0.012), (x, y, 0.009), m["hazard"], rotation_z=math.radians(38))
        x += 0.62


def pipe_h(m, z, x0, x1, radius=0.11, y=0.62, mat="pipe"):
    studio.cylinder("PipeH", radius, x1 - x0, ((x0 + x1) / 2, y, z), m[mat], axis="X", segments=24)
    x = x0 + 0.6
    while x < x1:
        studio.cylinder("Clamp", radius + 0.03, 0.09, (x, y, z), m["frame"], axis="X", segments=24)
        x += 2.4


def pipe_v(m, x, z0, z1, radius=0.11, y=0.62, mat="pipe"):
    studio.cylinder("PipeV", radius, z1 - z0, (x, y, (z0 + z1) / 2), m[mat], segments=24)
    z = z0 + 0.5
    while z < z1:
        studio.cylinder("ClampV", radius + 0.03, 0.09, (x, y, z), m["frame"], segments=24)
        z += 2.0


def machine(m, x, width, height, base=0.0, y=0.2, accent="cyan", depth=1.0):
    """A housing with vents and a small status strip."""
    z = base + height / 2
    studio.box("Housing", (width, depth, height), (x, y, z), m["machine"], bevel=0.05, segments=3)
    front = y - depth / 2
    studio.box("Door", (width * 0.72, 0.04, height * 0.52), (x, front - 0.015, base + height * 0.42), m["machine_dark"], bevel=0.012, segments=2)
    vents = max(3, int(height * 2.4))
    for i in range(vents):
        studio.box("Vent", (width * 0.54, 0.02, 0.035), (x, front - 0.04, base + height * 0.22 + i * (height * 0.42 / vents)), m["frame"])
    studio.box("Status", (width * 0.56, 0.02, 0.04), (x, front - 0.02, base + height * 0.85), m[accent])
    studio.box("Cap", (width + 0.1, depth + 0.1, 0.08), (x, y, base + height + 0.04), m["frame"], bevel=0.02, segments=2)


def distant_conveyor(m, z, x0, x1, y=0.5):
    studio.box("DistantBelt", (x1 - x0, 0.3, 0.14), ((x0 + x1) / 2, y, z), m["belt"], bevel=0.04, segments=2)
    studio.box("DistantRail", (x1 - x0, 0.32, 0.03), ((x0 + x1) / 2, y, z + 0.075), m["frame"])
    x = x0 + 0.5
    index = 0
    while x < x1:
        studio.cylinder("DistantRoller", 0.1, 0.34, (x, y, z - 0.03), m["pipe_dark"], axis="Y", segments=20)
        studio.box("DistantLeg", (0.08, 0.1, z - 0.1), (x, y, (z - 0.1) / 2), m["frame"])
        # Parcels riding it make it read as a conveyor, not a railing.
        size = 0.42 if index % 2 else 0.54
        studio.box("DistantCrate", (size, 0.26, size * 0.8), (x + 0.75, y, z + 0.09 + size * 0.4), m["crate" if index % 2 else "crate_alt"], bevel=0.02, segments=2)
        x += 1.6
        index += 1


def neon_strip(m, x0, x1, z, color, y=0.8):
    studio.box("Neon", (x1 - x0, 0.03, 0.035), ((x0 + x1) / 2, y, z), m[color])


def neon_strip_v(m, x, z0, z1, color, y=0.8):
    studio.box("NeonV", (0.035, 0.03, z1 - z0), (x, y, (z0 + z1) / 2), m[color])


def _camera(width, height, center_z, lens_distance=15.0):
    data = bpy.data.cameras.new("FactoryCamera")
    data.type = "PERSP"
    data.sensor_fit = "AUTO"
    data.sensor_width = 36
    frame = max(width, height)
    data.lens = 36 * lens_distance / frame
    data.clip_end = 200
    camera = bpy.data.objects.new("FactoryCamera", data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -lens_distance + 0.9, center_z)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.camera = camera


def _lights(width, height, center_z):
    """Low, soft top light, darker in the centre where gameplay sits."""
    for sx in (-1, 1):
        studio.area_light("Bay", (sx * width * 0.3, -6, center_z + height * 0.34), (sx * width * 0.3, 0.8, center_z), 130, 8.0, "#c7d5f5")
    studio.area_light("Centre", (0, -7, center_z + height * 0.2), (0, 0.8, center_z), 34, 9.0, "#aebfe6")
    studio.area_light("CyanWash", (-width * 0.48, -3, center_z), (-width * 0.3, 0.8, center_z), 60, 5.0, "#22d8ff")
    studio.area_light("MagentaWash", (width * 0.48, -3, center_z), (width * 0.3, 0.8, center_z), 54, 5.0, "#ff36c8")


def _prepare(width, height, center_z, res_x, res_y):
    studio.reset_scene()
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.eevee.taa_render_samples = 64
    studio.setup_world(scene, 0.12)
    studio.set_resolution(res_x, res_y)
    _camera(width, height, center_z)
    _lights(width, height, center_z)
    return _mats()


def build_landscape():
    width, height = 16.0, 9.0
    bottom = -0.9
    top = bottom + height
    m = _prepare(width, height, (top + bottom) / 2, 1920, 1080)
    x0, x1 = -width / 2 - 1, width / 2 + 1

    wall(m, x0, x1, 0.0, top + 2)
    floor(m, x0, x1, -3.6)
    hazard_strip(m, x0, x1, -2.4)

    pipe_h(m, top - 1.15, x0, x1, 0.14)
    pipe_h(m, top - 1.55, x0, x1, 0.08, mat="pipe_dark")
    for x in (-7.0, -5.3, 5.3, 7.0):
        pipe_v(m, x, 0, top - 1.1, 0.09)

    distant_conveyor(m, 3.4, -8.5, -3.2)
    distant_conveyor(m, 3.4, 3.2, 8.5)
    neon_strip(m, x0, -3.6, 5.05, "cyan")
    neon_strip(m, 3.6, x1, 5.05, "magenta")

    machine(m, -6.4, 2.0, 2.4, accent="cyan")
    machine(m, -4.2, 1.5, 1.7, accent="amber")
    machine(m, 4.2, 1.5, 1.7, accent="amber")
    machine(m, 6.4, 2.0, 2.4, accent="magenta")

    neon_strip_v(m, -7.75, 0.3, 4.4, "cyan")
    neon_strip_v(m, 7.75, 0.3, 4.4, "magenta")
    studio.box("CeilingBeam", (width + 4, 0.4, 0.4), (0, 0.3, top - 0.28), m["frame"], bevel=0.04, segments=2)


def build_portrait():
    width, height = 9.0, 16.0
    bottom = -1.1
    top = bottom + height
    m = _prepare(width, height, (top + bottom) / 2, 1080, 1920)
    x0, x1 = -width / 2 - 1, width / 2 + 1

    wall(m, x0, x1, 0.0, top + 2)
    floor(m, x0, x1, -4.2)
    hazard_strip(m, x0, x1, -2.8)

    # Ground tier.
    machine(m, -3.5, 1.7, 2.8, accent="cyan")
    machine(m, 3.5, 1.7, 2.8, accent="magenta")

    # Catwalk with railing and a distant conveyor above the bins.
    deck_z = 6.2
    studio.box("Catwalk", (x1 - x0, 0.9, 0.16), (0, 0.3, deck_z), m["frame"], bevel=0.03, segments=2)
    studio.box("HandRail", (x1 - x0, 0.06, 0.06), (0, -0.1, deck_z + 0.95), m["pipe"], bevel=0.015, segments=2)
    studio.box("MidRail", (x1 - x0, 0.05, 0.05), (0, -0.1, deck_z + 0.5), m["pipe_dark"])
    x = x0
    while x < x1:
        studio.box("Post", (0.07, 0.07, 1.0), (x, -0.1, deck_z + 0.5), m["pipe"])
        x += 1.5
    for sx in (-1, 1):
        studio.box("Column", (0.3, 0.3, deck_z), (sx * 4.1, 0.3, deck_z / 2), m["frame"], bevel=0.03, segments=2)

    # Upper tier: stacked machines, risers and a high conveyor.
    machine(m, -3.3, 2.0, 2.2, base=deck_z + 0.08, y=0.42, depth=0.7, accent="amber")
    machine(m, 3.3, 2.0, 2.2, base=deck_z + 0.08, y=0.42, depth=0.7, accent="amber")
    distant_conveyor(m, 10.2, -5.0, -1.8)
    distant_conveyor(m, 10.2, 1.8, 5.0)
    neon_strip(m, x0, -1.8, 11.3, "cyan")
    neon_strip(m, 1.8, x1, 11.3, "magenta")

    for x in (-4.0, -2.4, 2.4, 4.0):
        pipe_v(m, x, deck_z + 2.3, top, 0.1)
    pipe_h(m, 12.6, x0, x1, 0.14)
    pipe_h(m, 13.0, x0, x1, 0.08, mat="pipe_dark")
    neon_strip_v(m, -4.35, 0.3, 5.8, "cyan")
    neon_strip_v(m, 4.35, 0.3, 5.8, "magenta")
    studio.box("CeilingBeam", (width + 4, 0.4, 0.5), (0, 0.3, top - 0.3), m["frame"], bevel=0.04, segments=2)


def generate():
    for build, name in ((build_landscape, "factory_landscape"), (build_portrait, "factory_portrait")):
        def attempt(build=build, name=name):
            build()
            studio.render_to(f"{studio.SOURCE_DIR}/backgrounds/{name}.png")

        studio.retry_scene(attempt)
        studio.save_project(name)
