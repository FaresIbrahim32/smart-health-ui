#!/usr/bin/env python3
import json
import math
import sys

try:
    import cadquery as cq
    from cadquery import exporters
except Exception as exc:
    raise SystemExit(f"CadQuery is not installed or could not be imported: {exc}")


def clamp(value, low, high):
    return max(low, min(high, value))


def dims(layout, defaults):
    raw = layout.get("dimensions") or {}
    return {
        "length": clamp(float(raw.get("lengthMm") or defaults["length"]), 20, 260),
        "width": clamp(float(raw.get("widthMm") or defaults["width"]), 12, 140),
        "height": clamp(float(raw.get("heightMm") or defaults["height"]), 3, 70),
    }


def text_for(component):
    return " ".join(str(component.get(key, "")) for key in ("id", "type", "placement")).lower()


def slot(component):
    text = text_for(component)
    if any(word in text for word in ("battery", "power", "charge")):
        return "battery"
    if any(word in text for word in ("sensor", "electrode", "probe", "optical", "ecg", "ppg", "temperature", "pressure", "glucose", "saliva", "accelerometer", "imu")):
        return "sensor"
    if any(word in text for word in ("display", "screen", "window", "readout")):
        return "display"
    if any(word in text for word in ("channel", "microfluidic", "tube", "vent", "airflow")):
        return "channel"
    if any(word in text for word in ("hinge", "spring", "clamp")):
        return "hinge"
    if any(word in text for word in ("housing", "pcb", "controller", "main", "electronics")):
        return "housing"
    return "module"


def module(component, x, y, z, scale=1.0):
    kind = slot(component)
    if kind == "sensor":
        return cq.Workplane("XY").circle(4.2 * scale).extrude(2.2 * scale).translate((x, y, z))
    if kind == "battery":
        return cq.Workplane("XY").box(18 * scale, 9 * scale, 3.5 * scale).edges("|Z").fillet(1.3 * scale).translate((x, y, z))
    if kind == "display":
        return cq.Workplane("XY").box(18 * scale, 11 * scale, 1.4 * scale).edges("|Z").fillet(1.0 * scale).translate((x, y, z))
    if kind == "channel":
        return cq.Workplane("XY").box(24 * scale, 2.2 * scale, 1.3 * scale).edges("|Z").fillet(0.7 * scale).translate((x, y, z))
    return cq.Workplane("XY").box(13 * scale, 10 * scale, 4 * scale).edges("|Z").fillet(1.5 * scale).translate((x, y, z))


def add_modules(base, components, positions, scale=1.0):
    model = base
    for index, component in enumerate(components):
        x, y, z = positions[index % len(positions)]
        model = model.union(module(component, x, y, z, scale))
    return model


def wristband(layout, components):
    d = dims(layout, {"length": 65, "width": 45, "height": 12})
    outer = cq.Workplane("XY").ellipse(d["width"] / 2, d["length"] / 2).extrude(d["height"] * 0.32)
    inner = cq.Workplane("XY").ellipse(d["width"] / 2 - 6, d["length"] / 2 - 8).extrude(d["height"])
    band = outer.cut(inner).edges("|Z").fillet(2.0)
    positions = [(0, d["length"] / 2 - 8, d["height"] * 0.23), (d["width"] / 2 - 6, 0, d["height"] * 0.23), (-d["width"] / 2 + 6, 0, d["height"] * 0.23), (0, -d["length"] / 2 + 8, d["height"] * 0.23)]
    return add_modules(band, components, positions, 0.75)


def mouthguard(layout, components):
    d = dims(layout, {"length": 70, "width": 55, "height": 12})
    outer = cq.Workplane("XY").ellipse(d["width"] / 2, d["length"] / 2).extrude(d["height"] * 0.36)
    inner = cq.Workplane("XY").ellipse(d["width"] / 2 - 7, d["length"] / 2 - 8).extrude(d["height"])
    front_cut = cq.Workplane("XY").box(d["width"] * 1.4, d["length"] * 0.58, d["height"] * 2).translate((0, d["length"] * 0.25, d["height"] * 0.05))
    base = outer.cut(inner).cut(front_cut).edges("|Z").fillet(2.2)
    bridge = cq.Workplane("XY").box(d["width"] * 0.38, 8, 2.2).edges("|Z").fillet(1.4).translate((0, -d["length"] * 0.22, d["height"] * 0.22))
    channel = cq.Workplane("XY").box(d["width"] * 0.5, 2.3, 1.2).edges("|Z").fillet(0.6).translate((0, -d["length"] * 0.38, d["height"] * 0.38))
    positions = [(0, -d["length"] * 0.35, d["height"] * 0.45), (-d["width"] * 0.27, -d["length"] * 0.1, d["height"] * 0.42), (d["width"] * 0.27, -d["length"] * 0.1, d["height"] * 0.42), (0, -d["length"] * 0.02, d["height"] * 0.5)]
    return add_modules(base.union(bridge).union(channel), components, positions, 0.62)


def cast(layout, components):
    d = dims(layout, {"length": 180, "width": 85, "height": 45})
    shell = cq.Workplane("YZ").circle(d["width"] / 2).extrude(d["length"]).translate((-d["length"] / 2, 0, 0))
    inner = cq.Workplane("YZ").circle(d["width"] / 2 - 9).extrude(d["length"] + 8).translate((-d["length"] / 2 - 4, 0, 0))
    opening = cq.Workplane("XY").box(d["length"] * 1.15, d["width"], d["height"] * 1.6).translate((0, d["width"] * 0.43, 0))
    model = shell.cut(inner).cut(opening)
    for x in (-d["length"] * 0.32, -d["length"] * 0.12, d["length"] * 0.08, d["length"] * 0.28):
        for z in (-d["height"] * 0.18, d["height"] * 0.18):
            vent = cq.Workplane("YZ").circle(3.2).extrude(d["width"]).translate((x, -d["width"] * 0.52, z))
            model = model.cut(vent)
    spine = cq.Workplane("XY").box(d["length"] * 0.92, 8, 5).edges("|Z").fillet(2).translate((0, -d["width"] * 0.37, d["height"] * 0.15))
    positions = [(-d["length"] * 0.26, -d["width"] * 0.43, d["height"] * 0.25), (0, -d["width"] * 0.43, d["height"] * 0.28), (d["length"] * 0.26, -d["width"] * 0.43, d["height"] * 0.25)]
    return add_modules(model.union(spine), components, positions, 0.9)


def patch(layout, components):
    d = dims(layout, {"length": 85, "width": 55, "height": 9})
    base = cq.Workplane("XY").box(d["width"], d["length"], 1.8).edges("|Z").fillet(8)
    island = cq.Workplane("XY").box(d["width"] * 0.42, d["length"] * 0.34, d["height"] * 0.45).edges("|Z").fillet(4).translate((0, 0, d["height"] * 0.25))
    routes = cq.Workplane("XY").box(3, d["length"] * 0.72, 1.2).union(cq.Workplane("XY").box(d["width"] * 0.7, 3, 1.2)).translate((0, 0, d["height"] * 0.45))
    positions = [(0, 0, d["height"] * 0.65), (-d["width"] * 0.26, d["length"] * 0.22, d["height"] * 0.35), (d["width"] * 0.26, d["length"] * 0.22, d["height"] * 0.35), (0, -d["length"] * 0.28, d["height"] * 0.35)]
    return add_modules(base.union(island).union(routes), components, positions, 0.55)


def handheld(layout, components):
    d = dims(layout, {"length": 135, "width": 58, "height": 28})
    body = cq.Workplane("XY").box(d["width"], d["length"], d["height"]).edges("|Z").fillet(9).edges(">Z").fillet(2)
    grip = cq.Workplane("XY").box(d["width"] * 0.75, d["length"] * 0.45, d["height"] * 0.75).edges("|Z").fillet(10).translate((0, -d["length"] * 0.2, -d["height"] * 0.12))
    screen = cq.Workplane("XY").box(d["width"] * 0.65, d["length"] * 0.22, 1.2).edges("|Z").fillet(2).translate((0, d["length"] * 0.22, d["height"] * 0.52))
    buttons = cq.Workplane("XY").circle(3.5).extrude(1.5).translate((-d["width"] * 0.14, -d["length"] * 0.08, d["height"] * 0.52)).union(
        cq.Workplane("XY").circle(3.5).extrude(1.5).translate((d["width"] * 0.14, -d["length"] * 0.08, d["height"] * 0.52))
    )
    positions = [(0, d["length"] * 0.33, d["height"] * 0.6), (0, 0, d["height"] * 0.6), (0, -d["length"] * 0.36, d["height"] * 0.55)]
    return add_modules(body.union(grip).union(screen).union(buttons), components, positions, 0.7)


def clip_on(layout, components):
    d = dims(layout, {"length": 52, "width": 28, "height": 22})
    upper = cq.Workplane("XY").box(d["width"], d["length"] * 0.72, d["height"] * 0.28).edges("|Z").fillet(4).translate((0, d["length"] * 0.12, d["height"] * 0.22))
    lower = cq.Workplane("XY").box(d["width"], d["length"] * 0.72, d["height"] * 0.22).edges("|Z").fillet(4).translate((0, -d["length"] * 0.1, -d["height"] * 0.18))
    hinge = cq.Workplane("YZ").circle(d["height"] * 0.18).extrude(d["width"] * 1.15).translate((-d["width"] * 0.58, -d["length"] * 0.42, 0))
    pads = cq.Workplane("XY").box(d["width"] * 0.64, d["length"] * 0.28, 1.5).edges("|Z").fillet(2.5).translate((0, d["length"] * 0.18, 1.5)).union(
        cq.Workplane("XY").box(d["width"] * 0.64, d["length"] * 0.28, 1.5).edges("|Z").fillet(2.5).translate((0, -d["length"] * 0.08, -1.5))
    )
    positions = [(0, d["length"] * 0.18, d["height"] * 0.45), (0, -d["length"] * 0.38, d["height"] * 0.2), (0, -d["length"] * 0.06, -d["height"] * 0.38)]
    return add_modules(upper.union(lower).union(hinge).union(pads), components, positions, 0.48)


BUILDERS = {
    "wristband": wristband,
    "mouthguard": mouthguard,
    "cast": cast,
    "patch": patch,
    "handheld": handheld,
    "clip-on": clip_on,
}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: cadquery_generator.py output.stl")
    layout = json.load(sys.stdin)
    components = layout.get("components") or []
    form_factor = layout.get("formFactor") if layout.get("formFactor") in BUILDERS else "wristband"
    model = BUILDERS[form_factor](layout, components)
    exporters.export(model, sys.argv[1])


if __name__ == "__main__":
    main()
