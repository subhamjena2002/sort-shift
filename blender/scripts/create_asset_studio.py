"""Reusable Blender studio for SORT SHIFT: scene setup, materials, meshes, camera, lights, rendering.

Imported by the generate_* scripts. Every asset goes through these helpers, so
camera angle, lighting, material quality and scale stay consistent.
"""
import math
import os
import shutil

import bmesh
import bpy
import numpy as np
from mathutils import Vector

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE_DIR = os.path.join(REPO_ROOT, "blender", "source")
PROJECT_DIR = os.path.join(REPO_ROOT, "blender", "projects")

# Elevation of the sprite camera. High enough that the top face (where Phaser
# draws labels) dominates, low enough that the front face shows depth.
SPRITE_ELEVATION_DEG = 64

# A real shadow removes only part of the light, so a correct render stays close
# to the shadowless reference. See render_to.
ACCEPTED_LIGHT_RATIO = 0.84
RENDER_ATTEMPTS = 8
SCENE_REBUILDS = 8


class LightLossError(Exception):
    """A render never reached the light level of its shadowless reference."""


# ---------------------------------------------------------------- colour


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_color(value, alpha=1.0):
    """'#rrggbb' to the linear RGBA tuple Blender expects."""
    text = value.lstrip("#")
    return tuple(srgb_to_linear(int(text[i : i + 2], 16) / 255) for i in (0, 2, 4)) + (alpha,)


# ---------------------------------------------------------------- scene


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    render = scene.render
    render.engine = "BLENDER_EEVEE"
    render.film_transparent = True
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"
    render.image_settings.color_depth = "8"
    render.resolution_percentage = 100
    # Standard keeps colours saturated. AgX would wash out the parcel hues that
    # players must tell apart.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.eevee.taa_render_samples = 48
    scene.eevee.use_shadows = True
    # Ray tracing left coloured noise on dark metals. The world dome gives
    # stable reflections that are also much faster.
    scene.eevee.use_raytracing = False
    setup_world(scene)
    return scene


def setup_world(scene, strength=0.8):
    """A soft navy studio dome with cyan and magenta sides, reflected by metals."""
    world = bpy.data.worlds.new("Studio")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Generated"], separate.inputs[0])

    height = nodes.new("ShaderNodeValToRGB")
    height.color_ramp.elements[0].position = 0.35
    height.color_ramp.elements[0].color = hex_color("#0b1226")
    height.color_ramp.elements[1].position = 1.0
    height.color_ramp.elements[1].color = hex_color("#c8d6ee")
    remap_z = nodes.new("ShaderNodeMapRange")
    remap_z.inputs["From Min"].default_value = -1
    links.new(separate.outputs["Z"], remap_z.inputs["Value"])
    links.new(remap_z.outputs[0], height.inputs[0])

    side = nodes.new("ShaderNodeValToRGB")
    side.color_ramp.elements[0].color = hex_color("#22d8ff")
    side.color_ramp.elements[1].color = hex_color("#ff3fd0")
    remap_x = nodes.new("ShaderNodeMapRange")
    remap_x.inputs["From Min"].default_value = -1
    links.new(separate.outputs["X"], remap_x.inputs["Value"])
    links.new(remap_x.outputs[0], side.inputs[0])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "ADD"
    mix.inputs["Factor"].default_value = 0.1
    links.new(height.outputs[0], mix.inputs["A"])
    links.new(side.outputs[0], mix.inputs["B"])
    links.new(mix.outputs["Result"], background.inputs["Color"])
    background.inputs["Strength"].default_value = strength
    links.new(background.outputs[0], output.inputs["Surface"])


# ---------------------------------------------------------------- materials


def material(name, color, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0, coat=0.0):
    """Principled material from a hex colour. Reused by name, so looks stay identical."""
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = hex_color(color)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = 0.2
    if emission:
        shader.inputs["Emission Color"].default_value = hex_color(emission)
        shader.inputs["Emission Strength"].default_value = emission_strength
    return mat


def brushed_steel(name="Steel", color="#7f8ea6", roughness=0.42):
    return material(name, color, metallic=1.0, roughness=roughness)


def dark_steel(name="DarkSteel", color="#39445a", roughness=0.5):
    return material(name, color, metallic=0.9, roughness=roughness)


def rubber(name="Rubber", color="#141a26", roughness=0.75):
    return material(name, color, roughness=roughness)


def neon(name, color, strength=5.0):
    return material(name, "#000000", roughness=0.4, emission=color, emission_strength=strength)


def gold(name="Gold", roughness=0.26):
    return material(name, "#ffcb52", metallic=0.92, roughness=roughness)


# ---------------------------------------------------------------- meshes


def _object_from_bmesh(name, bm, mat, flat_axes):
    """Finish a bmesh: crisp large flat faces, smoothly shaded bevels and curves."""
    bm.normal_update()
    axes = [Vector(a) for a in flat_axes]

    def is_flat(face):
        return any(abs(face.normal.dot(axis)) > 0.9999 for axis in axes)

    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        faces = edge.link_faces
        if len(faces) != 2:
            continue
        a, b = faces
        coplanar = a.normal.dot(b.normal) > 0.9999
        creased = a.normal.dot(b.normal) < math.cos(math.radians(40))
        edge.smooth = not (creased or ((is_flat(a) or is_flat(b)) and not coplanar))

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat:
        mesh.materials.append(mat)
    return obj


ALL_AXES = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
Z_AXIS = ((0, 0, 1),)


def box(name, size, location, mat, bevel=0.0, segments=4, rotation_z=0.0):
    """A box centred on `location`, with optionally rounded edges."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    obj = _object_from_bmesh(name, bm, mat, ALL_AXES)
    obj.location = location
    obj.rotation_euler.z = rotation_z
    return obj


def plan_rounded_box(name, width, depth, height, corner, location, mat, edge_bevel=0.0, corner_segments=8):
    """A box whose vertical corners are strongly rounded, like a tray or housing."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(width, depth, height), verts=bm.verts)
    bm.edges.ensure_lookup_table()
    vertical = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-6]
    bmesh.ops.bevel(bm, geom=vertical, offset=corner, segments=corner_segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    if edge_bevel > 0:
        bm.edges.ensure_lookup_table()
        horizontal = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=horizontal, offset=edge_bevel, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    obj = _object_from_bmesh(name, bm, mat, Z_AXIS)
    obj.location = location
    return obj


def cylinder(name, radius, height, location, mat, bevel=0.0, segments=128, axis="Z", bevel_segments=4):
    """A cylinder centred on `location`, along Z unless `axis` says otherwise."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius, depth=height)
    if bevel > 0:
        rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=bevel_segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    obj = _object_from_bmesh(name, bm, mat, Z_AXIS)
    obj.location = location
    if axis == "X":
        obj.rotation_euler.y = math.pi / 2
    elif axis == "Y":
        obj.rotation_euler.x = math.pi / 2
    return obj


def ring(name, outer, inner, height, location, mat, bevel=0.0, segments=128):
    """A flat circular collar."""
    bm = bmesh.new()
    top = []
    bottom = []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        c, s = math.cos(angle), math.sin(angle)
        for r, z, store in ((outer, 1, top), (inner, 1, top), (outer, -1, bottom), (inner, -1, bottom)):
            store.append(bm.verts.new((r * c, r * s, z * height / 2)))
    for i in range(segments):
        j = (i + 1) % segments
        oa, ia, ob, ib = top[2 * i], top[2 * i + 1], bottom[2 * i], bottom[2 * i + 1]
        oc, ic, od, id_ = top[2 * j], top[2 * j + 1], bottom[2 * j], bottom[2 * j + 1]
        bm.faces.new((oa, ob, od, oc))
        bm.faces.new((ia, ic, id_, ib))
        bm.faces.new((oa, oc, ic, ia))
        bm.faces.new((ob, ib, id_, od))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel > 0:
        rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    obj = _object_from_bmesh(name, bm, mat, Z_AXIS)
    obj.location = location
    return obj


def prism(name, points, height, location, mat, bevel=0.0, rotation_z=0.0):
    """Extrude a closed outline (list of (x, y)) along Z."""
    bm = bmesh.new()
    top = [bm.verts.new((x, y, height / 2)) for x, y in points]
    bottom = [bm.verts.new((x, y, -height / 2)) for x, y in points]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bottom)))
    count = len(points)
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((top[i], bottom[i], bottom[j], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel > 0:
        rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    obj = _object_from_bmesh(name, bm, mat, Z_AXIS)
    obj.location = location
    obj.rotation_euler.z = rotation_z
    return obj


def star_outline(outer, inner, tips=5):
    points = []
    for i in range(tips * 2):
        radius = outer if i % 2 == 0 else inner
        angle = math.pi / 2 + math.pi * i / tips
        points.append((radius * math.cos(angle), radius * math.sin(angle)))
    return points


# ---------------------------------------------------------------- camera and light


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def sprite_camera(ortho_scale, target=(0, 0, 0.2), elevation_deg=SPRITE_ELEVATION_DEG):
    """Orthographic camera looking down at the object from the front."""
    camera_data = bpy.data.cameras.new("SpriteCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ortho_scale
    camera_data.clip_end = 100
    camera = bpy.data.objects.new("SpriteCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    elevation = math.radians(elevation_deg)
    camera.location = Vector(target) + Vector((0, -math.cos(elevation), math.sin(elevation))) * 20
    look_at(camera, target)
    bpy.context.scene.camera = camera
    return camera


def top_camera(ortho_scale, target=(0, 0, 0)):
    """Straight-down orthographic camera, for seamless tiles."""
    return sprite_camera(ortho_scale, target, 90 - 1e-3)


def area_light(name, location, target, power, size, color="#ffffff"):
    data = bpy.data.lights.new(name, "AREA")
    data.shape = "SQUARE"
    data.size = size
    data.energy = power
    data.color = hex_color(color)[:3]
    data.use_shadow = True
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    look_at(light, target)
    return light


def sun_light(name, direction, strength, color="#ffffff", angle_deg=8):
    data = bpy.data.lights.new(name, "SUN")
    data.energy = strength
    data.angle = math.radians(angle_deg)
    data.color = hex_color(color)[:3]
    data.use_shadow = True
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = Vector(direction).normalized() * 30
    look_at(light, (0, 0, 0))
    return light


def studio_lights(scale=1.0):
    """The one lighting rig for all sprites: soft key, cool fill, magenta kicker."""
    area_light("Key", (-3.2 * scale, -2.6 * scale, 5.0 * scale), (0, 0, 0), 170 * scale * scale, 3.5 * scale)
    area_light("Fill", (3.6 * scale, -2.2 * scale, 2.6 * scale), (0, 0, 0), 30 * scale * scale, 4 * scale, "#9fe6ff")
    area_light("Kicker", (2.2 * scale, 3.6 * scale, 2.2 * scale), (0, 0, 0), 26 * scale * scale, 3 * scale, "#ff8fe0")


def tile_lights():
    """Directional-only rig: identical at every position, so tiles stay seamless."""
    sun_light("KeySun", (-0.5, -0.45, 1.0), 1.6)
    sun_light("FillSun", (0.6, 0.2, 0.8), 0.35, "#9fe6ff")


# ---------------------------------------------------------------- rendering


def shadow_floor(size=12):
    """White floor used only to measure each sprite's contact shadow."""
    mat = material("ShadowFloor", "#ffffff", roughness=1.0)
    floor = box("ShadowFloor", (size, size, 0.02), (0, 0, -0.01), mat)
    floor.hide_render = True
    return floor


def set_resolution(width, height):
    render = bpy.context.scene.render
    render.resolution_x = width
    render.resolution_y = height


def _render_raw(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _mean_luma(path):
    image = bpy.data.images.load(path, check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    alpha = pixels[3::4]
    luma = (0.2126 * pixels[0::4] + 0.7152 * pixels[1::4] + 0.0722 * pixels[2::4]) * alpha
    return float(luma.sum() / max(float(alpha.sum()), 1.0))


def render_to(path):
    """Render, defending against intermittent light loss.

    With shadows on, Eevee sometimes renders as if every lamp were off (measured
    on Iris Xe in background mode, for all shadow settings tried). A shadowless
    render is stable, so it sets the expected light level. The real render
    repeats until it reaches that level, and the brightest attempt is kept.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    stem, _ = os.path.splitext(path)
    reference_path, attempt_path = f"{stem}.__reference.png", f"{stem}.__attempt.png"

    lamps = [o.data for o in bpy.context.scene.objects if o.type == "LIGHT"]
    settings = [lamp.use_shadow for lamp in lamps]
    for lamp in lamps:
        lamp.use_shadow = False
    _render_raw(reference_path)
    expected = _mean_luma(reference_path)
    for lamp, setting in zip(lamps, settings):
        lamp.use_shadow = setting

    best = -1.0
    tries = 0
    for tries in range(1, RENDER_ATTEMPTS + 1):
        _render_raw(attempt_path)
        luma = _mean_luma(attempt_path)
        if luma > best:
            best = luma
            shutil.copyfile(attempt_path, path)
        if luma >= expected * ACCEPTED_LIGHT_RATIO:
            break
    os.remove(reference_path)
    os.remove(attempt_path)

    ratio = best / max(expected, 1e-6)
    if ratio < ACCEPTED_LIGHT_RATIO:
        raise LightLossError(f"{os.path.relpath(path, REPO_ROOT)} reached only {ratio:.3f} of expected light")
    print(f"RENDERED {os.path.relpath(path, REPO_ROOT)} light={ratio:.3f} tries={tries}")


def retry_scene(build_and_render):
    """Light loss can persist for a whole scene, so a failure rebuilds it from scratch."""
    for attempt in range(1, SCENE_REBUILDS + 1):
        try:
            build_and_render()
            return
        except LightLossError as error:
            print(f"REBUILD attempt {attempt}: {error}")
    raise RuntimeError(f"Could not get a correctly lit render after {SCENE_REBUILDS} scene rebuilds")


def render_sprite(category, name, floor, objects):
    """Beauty render plus the two floor renders the build step turns into a soft shadow."""
    scene = bpy.context.scene
    folder = os.path.join(SOURCE_DIR, category)

    scene.render.film_transparent = True
    floor.hide_render = True
    render_to(os.path.join(folder, f"{name}.png"))

    scene.render.film_transparent = False
    floor.hide_render = False
    render_to(os.path.join(folder, f"{name}__with_object.png"))

    for obj in objects:
        obj.hide_render = True
    render_to(os.path.join(folder, f"{name}__floor_only.png"))
    for obj in objects:
        obj.hide_render = False
    floor.hide_render = True
    scene.render.film_transparent = True


def save_project(name):
    os.makedirs(PROJECT_DIR, exist_ok=True)
    path = os.path.join(PROJECT_DIR, f"{name}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print(f"SAVED {os.path.relpath(path, REPO_ROOT)}")


def objects_created_since(before):
    return [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
