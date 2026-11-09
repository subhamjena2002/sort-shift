"""Conveyor parts: seamless belt tile, seamless side rail tile and a roller hub.

The Phaser Conveyor scrolls and spins these, so nothing here is a fixed picture
of a whole conveyor. Tiles are lit only by directional lights, and each repeating
element is built one period above and below the frame, so the edges wrap.
"""
import math

import bpy

import create_asset_studio as studio

BELT_WIDTH = 2.0
BELT_PERIOD = 1.0
RAIL_WIDTH = 1.0
RAIL_PERIOD = 2.0


def build_belt_tile():
    studio.reset_scene()
    scene = bpy.context.scene
    scene.render.film_transparent = False
    studio.setup_world(scene, 0.35)
    studio.top_camera(BELT_WIDTH)
    studio.tile_lights()

    base = studio.rubber("BeltGap", "#080b14")
    slat = studio.material("BeltSlat", "#3a4865", metallic=0.15, roughness=0.55)
    tread = studio.material("BeltTread", "#7388ad", metallic=0.3, roughness=0.42)
    edge = studio.material("BeltEdge", "#55678a", metallic=0.5, roughness=0.4)
    stud = studio.dark_steel("BeltStud", "#b6c4dc", 0.34)
    led = studio.neon("BeltLed", "#22f0ff", 1.2)

    studio.box("Base", (BELT_WIDTH + 1, BELT_PERIOD * 5, 0.1), (0, 0, -0.1), base)
    for offset in (-BELT_PERIOD, 0.0, BELT_PERIOD):
        studio.box("Slat", (BELT_WIDTH + 0.4, 0.84, 0.1), (0, offset, 0.0), slat, bevel=0.03, segments=3)

        # Chevron tread pointing in the direction of travel.
        for sx in (-1, 1):
            studio.box("Tread", (0.74, 0.085, 0.05), (sx * 0.31, offset + 0.075, 0.07), tread, bevel=0.016, segments=2, rotation_z=sx * math.radians(26))

        for sx in (-1, 1):
            studio.box("SlatEdge", (0.14, 0.8, 0.03), (sx * 0.89, offset, 0.058), edge, bevel=0.01, segments=2)
            studio.cylinder("Stud", 0.04, 0.03, (sx * 0.89, offset, 0.08), stud, bevel=0.01, segments=20, bevel_segments=2)
            studio.box("Led", (0.11, 0.016, 0.008), (sx * 0.66, offset - 0.33, 0.052), led)


def build_rail_tile():
    studio.reset_scene()
    scene = bpy.context.scene
    scene.render.film_transparent = False
    studio.setup_world(scene, 0.45)
    studio.top_camera(RAIL_PERIOD)
    studio.tile_lights()

    steel = studio.brushed_steel("RailSteel", "#6d7c98", 0.44)
    dark = studio.dark_steel("RailDark", "#232d42", 0.55)
    bolt = studio.dark_steel("RailBolt", "#a8b6cf", 0.32)

    studio.box("RailBase", (RAIL_WIDTH + 0.4, RAIL_PERIOD * 4, 0.1), (0, 0, -0.05), dark)
    for sx in (-1, 1):
        studio.box("RailLip", (0.2, RAIL_PERIOD * 4, 0.12), (sx * 0.36, 0, 0.06), steel, bevel=0.03, segments=3)
    for offset in (-RAIL_PERIOD, 0.0, RAIL_PERIOD):
        for sy in (-0.5, 0.5):
            studio.box("Rib", (0.5, 0.16, 0.05), (0, offset + sy, 0.02), steel, bevel=0.012, segments=2)
            for sx in (-1, 1):
                studio.cylinder("Bolt", 0.045, 0.04, (sx * 0.36, offset + sy, 0.13), bolt, bevel=0.012, segments=6, bevel_segments=1)


def build_roller():
    studio.reset_scene()
    studio.setup_world(bpy.context.scene, 0.5)
    studio.top_camera(1.08)
    studio.tile_lights()

    rim = studio.brushed_steel("RollerRim", "#8796b2", 0.34)
    face = studio.dark_steel("RollerFace", "#2a3650", 0.5)
    spoke = studio.brushed_steel("RollerSpoke", "#a7b5cd", 0.34)
    cap = studio.neon("RollerCap", "#22f0ff", 1.6)

    studio.cylinder("Rim", 0.5, 0.16, (0, 0, 0), rim, bevel=0.04, segments=96)
    studio.cylinder("Face", 0.41, 0.03, (0, 0, 0.078), face, bevel=0.008, segments=96)
    for i in range(4):
        studio.box("Spoke", (0.68, 0.085, 0.05), (0, 0, 0.1), spoke, bevel=0.018, segments=2, rotation_z=math.pi * i / 4)
    studio.cylinder("Hub", 0.15, 0.06, (0, 0, 0.13), rim, bevel=0.015, segments=48)
    studio.cylinder("Cap", 0.075, 0.02, (0, 0, 0.165), cap, bevel=0.006, segments=32)


def generate():
    for build, name, width, height in (
        (build_belt_tile, "conveyor_belt_tile", 512, 256),
        (build_rail_tile, "conveyor_rail", 256, 512),
        (build_roller, "conveyor_roller", 256, 256),
    ):
        def attempt(build=build, name=name, width=width, height=height):
            build()
            studio.set_resolution(width, height)
            studio.render_to(f"{studio.SOURCE_DIR}/conveyor/{name}.png")

        studio.retry_scene(attempt)
        studio.save_project(name)
