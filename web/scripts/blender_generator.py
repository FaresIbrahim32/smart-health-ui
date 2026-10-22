import json
import math
import sys

import bpy
from mathutils import Vector


def material(name, color, metallic=0.0, roughness=0.42):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.metallic = metallic
    mat.roughness = roughness
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
    return mat


BODY = material("Concept body", (0.055, 0.22, 0.32), 0.25, 0.28)
SOFT = material("Soft interface", (0.06, 0.48, 0.46), 0.0, 0.55)
ACCENT = material("Signal accent", (0.15, 0.78, 0.95), 0.45, 0.22)
POWER = material("Power module", (0.13, 0.16, 0.2), 0.5, 0.3)
WARNING = material("Review marker", (0.86, 0.47, 0.08), 0.15, 0.35)


def bevel(obj, amount=0.08):
    modifier = obj.modifiers.new("Soft concept edges", "BEVEL")
    modifier.width = amount
    modifier.segments = 4
    obj.modifiers.new("Weighted concept normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, location, scale, mat=BODY, bevel_amount=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return bevel(obj, bevel_amount)


def cylinder(name, location, radius, depth, mat=BODY, rotation=(0, 0, 0), vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return bevel(obj, min(radius * 0.22, 0.12))


def torus(name, location, major, minor, mat=SOFT, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=18, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def hollow_tube(name, location, outer_radius, inner_radius, depth, mat, rotation=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=outer_radius, depth=depth, location=location, rotation=rotation)
    outer = bpy.context.object
    outer.name = name
    outer.data.materials.append(mat)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=inner_radius, depth=depth + 0.08, location=location, rotation=rotation)
    inner = bpy.context.object
    modifier = outer.modifiers.new("Open interior", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = inner
    bpy.context.view_layer.objects.active = outer
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(inner, do_unlink=True)
    return bevel(outer, min((outer_radius - inner_radius) * 0.35, 0.06))


def add_sleeve_form(length, width, height, cast=False):
    tube_length = length * 0.76
    outer_radius = max(min(width, height) * 0.56, 0.22)
    wall = max(min(height * 0.22, 0.1), 0.055)
    inner_radius = max(outer_radius - wall, 0.12)
    shell = hollow_tube("Open wearable sleeve shell", (0, 0, height * 0.55), outer_radius, inner_radius, tube_length, SOFT)
    cuff_material = BODY if cast else ACCENT
    torus("Proximal comfort cuff", (-tube_length * 0.5, 0, height * 0.55), outer_radius * 0.98, wall * 0.65, cuff_material, (0, math.pi / 2, 0))
    torus("Distal comfort cuff", (tube_length * 0.5, 0, height * 0.55), outer_radius * 0.98, wall * 0.65, cuff_material, (0, math.pi / 2, 0))
    rail_y = outer_radius * 0.86
    cube("Lateral support rail", (0, rail_y, height * 0.55), (tube_length * 0.38, wall * 0.32, height * 0.12), BODY, 0.035)
    cube("Medial support rail", (0, -rail_y, height * 0.55), (tube_length * 0.38, wall * 0.32, height * 0.12), BODY, 0.035)
    cylinder("Range of motion hinge", (0, rail_y + wall * 0.55, height * 0.55), wall * 1.55, wall * 0.7, ACCENT, (math.pi / 2, 0, 0))
    return shell


def add_form(form, dims):
    length, width, height = [max(float(value or 1) / 100.0, 0.1) for value in dims]
    if form in ("bottle", "cup"):
        body = cylinder("Container body", (0, 0, height * 0.5), min(width, height) * 0.48, height, BODY)
        cylinder("Smart cap", (0, 0, height * 1.02), min(width, height) * 0.34, height * 0.12, ACCENT)
        torus("Grip ring", (0, 0, height * 0.52), min(width, height) * 0.49, height * 0.025, SOFT)
        return body
    if form in ("helmet", "headgear"):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, location=(0, 0, height * 0.65), scale=(length * 0.48, width * 0.48, height * 0.48))
        shell = bpy.context.object
        shell.name = "Helmet shell"
        shell.data.materials.append(BODY)
        bevel(shell, 0.04)
        torus("Helmet comfort rim", (0, 0, height * 0.28), min(length, width) * 0.32, height * 0.045, SOFT, (math.pi / 2, 0, 0))
        return shell
    if form in ("sleeve", "textile", "cast"):
        return add_sleeve_form(length, width, height, cast=form == "cast")
    if form in ("wristband", "belt", "ring"):
        return torus("Wearable band", (0, 0, height * 0.45), min(length, width) * 0.32, height * 0.16, SOFT, (math.pi / 2, 0, 0))
    if form == "glove":
        return cube("Glove palm", (0, 0, height * 0.55), (length * 0.35, width * 0.4, height * 0.35), SOFT, 0.14)
    if form == "insole":
        return cube("Insole base", (0, 0, height * 0.35), (length * 0.48, width * 0.46, height * 0.18), SOFT, 0.12)
    if form == "sword":
        blade = cube("Training blade", (length * 0.25, 0, height * 0.7), (length * 0.42, width * 0.09, height * 0.08), BODY, 0.06)
        cube("Sensor grip", (-length * 0.3, 0, height * 0.7), (length * 0.14, width * 0.16, height * 0.12), SOFT, 0.07)
        cube("Guard", (-length * 0.12, 0, height * 0.7), (length * 0.05, width * 0.4, height * 0.06), ACCENT, 0.04)
        return blade
    return cube("Adaptive concept body", (0, 0, height * 0.5), (length * 0.42, width * 0.42, height * 0.35), BODY, 0.12)


def add_modules(layout, form, dims):
    components = layout.get("components") or []
    count = max(len(components), 1)
    length, width, height = [max(float(value or 1) / 100.0, 0.1) for value in dims]
    if form in ("sleeve", "textile", "cast"):
        tube_length = length * 0.76
        radius = max(min(width, height) * 0.56, 0.22)
        for index, component in enumerate(components[:8]):
            x = -tube_length * 0.36 + (index % 4) * tube_length * 0.24
            y = radius + 0.08 if index % 2 == 0 else -radius - 0.08
            label = str(component.get("type") or component.get("id") or "module")
            lower = label.lower()
            mat = POWER if any(word in lower for word in ("battery", "power", "control", "pcb")) else ACCENT if any(word in lower for word in ("sensor", "signal", "motion", "pressure")) else WARNING
            module = cube("Surface layer: " + label[:45], (x, y, height * 0.55), (0.12, 0.055, 0.07), mat, 0.025)
            module.rotation_euler[2] = math.pi / 2 if index % 2 else -math.pi / 2
        return
    for index, component in enumerate(components[:8]):
        angle = (index / count) * math.tau
        radius = 0.55 + (index % 2) * 0.12
        x, y = math.cos(angle) * radius, math.sin(angle) * radius
        label = str(component.get("type") or component.get("id") or "module")
        lower = label.lower()
        mat = POWER if any(word in lower for word in ("battery", "power", "control", "pcb")) else ACCENT if any(word in lower for word in ("sensor", "signal", "motion", "pressure")) else WARNING
        module = cube("Layer: " + label[:45], (x, y, 0.28 + (index % 3) * 0.12), (0.1, 0.07, 0.045), mat, 0.025)
        module.rotation_euler[2] = angle


def add_floor_and_lights():
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, -0.08))
    floor = bpy.context.object
    floor.name = "Preview floor"
    floor.data.materials.append(material("Preview floor material", (0.012, 0.028, 0.04), 0.05, 0.6))
    bpy.ops.object.light_add(type="AREA", location=(3, -4, 5))
    bpy.context.object.data.energy = 850
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 4
    bpy.context.object.rotation_euler = (math.radians(20), 0, math.radians(35))
    bpy.ops.object.light_add(type="AREA", location=(-4, 2, 3))
    bpy.context.object.data.energy = 500
    bpy.context.object.data.color = (0.12, 0.55, 1.0)
    bpy.context.object.data.size = 3
    bpy.context.object.rotation_euler = (math.radians(35), 0, math.radians(-65))


def render_preview(render_path):
    bpy.ops.object.camera_add(location=(3.8, -5.2, 3.4))
    camera = bpy.context.object
    camera.name = "Preview camera"
    target = Vector((0, 0, 0.55))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 55
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 680
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = render_path
    scene.world.color = (0.006, 0.018, 0.03)
    bpy.ops.render.render(write_still=True)


def main():
    layout = json.loads(sys.stdin.read() or "{}")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    form = str(layout.get("formFactor") or "adaptive").lower()
    dims = layout.get("dimensions") or {"lengthMm": 96, "widthMm": 54, "heightMm": 20}
    add_form(form, (dims.get("lengthMm"), dims.get("widthMm"), dims.get("heightMm")))
    add_modules(layout, form, (dims.get("lengthMm"), dims.get("widthMm"), dims.get("heightMm")))
    add_floor_and_lights()
    if layout.get("renderPath"):
        render_preview(layout["renderPath"])
    bpy.ops.wm.save_as_mainfile(filepath=layout.get("blendPath", "/tmp/smart-health-preview.blend"))
    bpy.ops.export_scene.gltf(filepath=layout["glbPath"], export_format="GLB", export_materials="EXPORT")


if __name__ == "__main__":
    main()
