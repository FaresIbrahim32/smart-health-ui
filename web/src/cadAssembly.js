import jscadModeling from "@jscad/modeling";
import stlSerializerPkg from "@jscad/stl-serializer";
import * as THREE from "three";

const { primitives, booleans, transforms, geometries } = jscadModeling;
const stlSerializer = stlSerializerPkg.serialize ? stlSerializerPkg : stlSerializerPkg.default;

const BAND_OUTER_RADIUS = 1.3;
const BAND_TUBE_RADIUS = 0.12;

const SLOT_SIZE = {
  housing: [0.55, 0.4, 0.24],
  battery: [0.42, 0.28, 0.16],
  clasp: [0.26, 0.22, 0.1],
  module: [0.32, 0.24, 0.14]
};

const SLOT_COLOR = {
  band: "#2f6fa8",
  base: "#2f6fa8",
  housing: "#52b9ff",
  battery: "#41c96b",
  clasp: "#a8b7c7",
  module: "#08c9d6",
  sensor: "#f3bc26",
  channel: "#9b55e6",
  display: "#061826",
  contact: "#dce7f1",
  hinge: "#a8b7c7"
};

// Deterministic keyword classification (same pattern as PubTator fallback matching
// in web/pubtator.js) - the LLM names parts, this decides where they physically go.
function classifySlot(component) {
  const text = `${component.type} ${component.id} ${component.placement || ""}`.toLowerCase();
  if (/\b(strap|band)\b/.test(text)) return "band";
  if (/\b(display|screen|window|readout)\b/.test(text)) return "display";
  if (/\b(sensor|electrode|probe|optical|ecg|ppg|temperature|pressure|glucose|saliva|accelerometer|imu)\b/.test(text)) return "sensor";
  if (/\b(channel|microfluidic|tube|vent|airflow)\b/.test(text)) return "channel";
  if (/\b(hinge|spring|clamp)\b/.test(text)) return "hinge";
  if (/\b(contact|pad|adhesive|interface)\b/.test(text)) return "contact";
  if (/\b(housing|pcb|controller|main|processor|electronics)\b/.test(text)) return "housing";
  if (/\bbattery\b/.test(text)) return "battery";
  if (/\b(clasp|buckle)\b/.test(text)) return "clasp";
  return "module";
}

function inferFormFactor(layout) {
  if (layout.formFactor) return layout.formFactor;
  const text = `${layout.device || ""} ${(layout.components || []).map((c) => `${c.id} ${c.type}`).join(" ")}`.toLowerCase();
  if (/\b(mouth|oral|dental|tooth|teeth|gum|saliva|palate|bite|brux|mouthguard)\b/.test(text)) return "mouthguard";
  if (/\b(cast|splint|orthopedic|fracture|immobil|limb|wrist support|ankle|rehab)\b/.test(text)) return "cast";
  if (/\b(patch|adhesive|skin|chest|ecg|wound|glucose|insulin|temperature patch)\b/.test(text)) return "patch";
  if (/\b(clip|clamp|finger|ear|earlobe|cane|wheelchair|tube|accessory|mounted)\b/.test(text)) return "clip-on";
  if (/\b(handheld|scanner|reader|wand|grip|portable|inhaler)\b/.test(text)) return "handheld";
  return "wristband";
}

function partFromGeom(component, geom3, color) {
  return {
    id: component.id,
    type: component.type,
    material: component.material,
    groundedIn: component.groundedIn,
    placement: component.placement,
    geom3,
    color
  };
}

function roundedBox(size, roundRadius = 0.04, segments = 14) {
  return primitives.roundedCuboid({
    size,
    roundRadius: Math.min(roundRadius, ...size.map((value) => value * 0.45)),
    segments
  });
}

function moduleGeom(component, position, scale = 1) {
  const slot = classifySlot(component);
  const size = (SLOT_SIZE[slot] || SLOT_SIZE.module).map((value) => value * scale);
  let geom = slot === "sensor"
    ? primitives.roundedCylinder({ radius: Math.max(size[0], size[1]) * 0.34, height: size[2], roundRadius: size[2] * 0.18, segments: 24 })
    : roundedBox(size, Math.min(...size) * 0.22, 10);
  return transforms.translate(position, geom);
}

function buildMountedParts(components, positions, scale = 1) {
  return components.map((component, index) => {
    const position = positions[index % positions.length];
    return partFromGeom(component, moduleGeom(component, position, scale), SLOT_COLOR[classifySlot(component)] || SLOT_COLOR.module);
  });
}

function envelopeScale(layout, defaults) {
  const dims = layout.dimensions || {};
  const length = Math.max(Number(dims.lengthMm) || defaults.lengthMm, 20);
  const width = Math.max(Number(dims.widthMm) || defaults.widthMm, 12);
  const height = Math.max(Number(dims.heightMm) || defaults.heightMm, 4);
  return {
    x: Math.min(Math.max(width / defaults.widthMm, 0.75), 1.35),
    y: Math.min(Math.max(length / defaults.lengthMm, 0.75), 1.35),
    z: Math.min(Math.max(height / defaults.heightMm, 0.75), 1.45)
  };
}

function buildWristbandAssembly(layout, ordered) {
  const bandSource = ordered.find((c) => classifySlot(c) === "band") || {
    id: "band",
    type: "Wrist band base",
    material: "flexible medical-grade polymer",
    groundedIn: "selected wristband form factor"
  };
  const mountable = ordered.filter((c) => classifySlot(c) !== "band");
  const parts = [
    partFromGeom(
      bandSource,
      primitives.torus({ innerRadius: BAND_TUBE_RADIUS, outerRadius: BAND_OUTER_RADIUS, innerSegments: 24, outerSegments: 48 }),
      SLOT_COLOR.band
    )
  ];

  const n = Math.max(mountable.length, 1);
  mountable.forEach((component, i) => {
    const slot = classifySlot(component);
    const angle = (2 * Math.PI * i) / n;
    const size = SLOT_SIZE[slot] || SLOT_SIZE.module;
    const radialOffset = BAND_OUTER_RADIUS + BAND_TUBE_RADIUS + size[0] / 2 - 0.06;
    let geom = roundedBox(size, Math.min(...size) * 0.25, 12);
    geom = transforms.translate([radialOffset, 0, 0], geom);
    geom = transforms.rotate([0, 0, angle], geom);
    parts.push(partFromGeom(component, geom, SLOT_COLOR[slot] || SLOT_COLOR.module));
  });
  return parts;
}

function buildMouthguardAssembly(layout, components) {
  const scale = envelopeScale(layout, { lengthMm: 70, widthMm: 55, heightMm: 12 });
  const base = {
    id: "mouthguard-base",
    type: "Mouthguard base",
    material: "biocompatible flexible polymer",
    groundedIn: "selected mouthguard form factor"
  };
  const outerArc = transforms.scale(
    [1.15 * scale.x, 0.82 * scale.y, 0.18 * scale.z],
    primitives.torus({ innerRadius: 0.1, outerRadius: 1.12, innerSegments: 18, outerSegments: 64 })
  );
  const biteOpening = transforms.translate([0, 0.62 * scale.y, 0], primitives.cuboid({ size: [3.4 * scale.x, 1.45 * scale.y, 1] }));
  const baseGeom = booleans.subtract(outerArc, biteOpening);
  const palateBridge = transforms.translate(
    [0, -0.52 * scale.y, 0.02],
    roundedBox([1.05 * scale.x, 0.28 * scale.y, 0.08 * scale.z], 0.035, 18)
  );
  const channel = transforms.translate(
    [0, -0.9 * scale.y, 0.16],
    roundedBox([1.35 * scale.x, 0.08, 0.04], 0.016, 12)
  );
  const positions = [[0, -0.86, 0.24], [-0.62, -0.4, 0.24], [0.62, -0.4, 0.24], [-0.78, 0.06, 0.22], [0.78, 0.06, 0.22], [0, -0.2, 0.26]];
  return [
    partFromGeom(base, booleans.union(baseGeom, palateBridge), SLOT_COLOR.base),
    partFromGeom({ id: "oral-sensor-channel", type: "Embedded oral sensor channel", material: "sealed flexible insert", groundedIn: "selected mouthguard form factor" }, channel, SLOT_COLOR.channel),
    ...buildMountedParts(components, positions, 0.72)
  ];
}

function buildCastAssembly(layout, components) {
  const scale = envelopeScale(layout, { lengthMm: 180, widthMm: 85, heightMm: 45 });
  const base = {
    id: "cast-shell",
    type: "Cast shell",
    material: "breathable semi-rigid polymer",
    groundedIn: "selected cast form factor"
  };
  const outer = transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: 0.74 * scale.x, height: 2.35 * scale.y, segments: 48 }));
  const inner = transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: 0.52 * scale.x, height: 2.55 * scale.y, segments: 48 }));
  const opening = transforms.translate([0.58 * scale.x, 0, 0], primitives.cuboid({ size: [1.1 * scale.x, 2.8 * scale.y, 1.7 * scale.z] }));
  const vents = [-0.78, -0.38, 0.02, 0.42, 0.82].flatMap((y) => (
    [-0.22, 0.22].map((z) => transforms.translate([-0.48 * scale.x, y * scale.y, z], transforms.rotateY(Math.PI / 2, primitives.cylinder({ radius: 0.045, height: 0.7, segments: 18 }))))
  ));
  const shell = booleans.subtract(outer, inner, opening, ...vents);
  const spine = transforms.translate([-0.58 * scale.x, 0, 0], roundedBox([0.18, 2.15 * scale.y, 0.22], 0.05, 16));
  const positions = [[-0.66, -0.78, 0.2], [-0.72, 0, 0.22], [-0.66, 0.78, 0.2], [-0.38, -0.32, 0.52], [-0.38, 0.32, 0.52]];
  return [
    partFromGeom(base, booleans.union(shell, spine), SLOT_COLOR.base),
    ...buildMountedParts(components, positions, 0.86)
  ];
}

function buildPatchAssembly(layout, components) {
  const scale = envelopeScale(layout, { lengthMm: 85, widthMm: 55, heightMm: 9 });
  const base = {
    id: "adhesive-patch-base",
    type: "Adhesive patch base",
    material: "skin-safe adhesive laminate",
    groundedIn: "selected patch form factor"
  };
  const patch = roundedBox([1.6 * scale.x, 2.0 * scale.y, 0.07 * scale.z], 0.025, 28);
  const island = transforms.translate([0, 0, 0.09], roundedBox([0.68 * scale.x, 0.72 * scale.y, 0.12 * scale.z], 0.05, 20));
  const channels = [
    roundedBox([0.08, 1.55 * scale.y, 0.035], 0.014, 10),
    roundedBox([1.2 * scale.x, 0.08, 0.035], 0.014, 10)
  ].map((geom) => transforms.translate([0, 0, 0.16], geom));
  const positions = [[0, 0, 0.24], [-0.48, 0.46, 0.16], [0.48, 0.46, 0.16], [-0.48, -0.46, 0.16], [0.48, -0.46, 0.16]];
  return [
    partFromGeom(base, patch, SLOT_COLOR.base),
    partFromGeom({ id: "central-sensor-island", type: "Central sensor island", material: "low-profile sealed electronics", groundedIn: "selected patch form factor" }, island, SLOT_COLOR.housing),
    partFromGeom({ id: "microfluidic-routes", type: "Microfluidic or trace routing", material: "sealed conductive/flow channels", groundedIn: "selected patch form factor" }, booleans.union(...channels), SLOT_COLOR.channel),
    ...buildMountedParts(components, positions, 0.62)
  ];
}

function buildHandheldAssembly(layout, components) {
  const scale = envelopeScale(layout, { lengthMm: 135, widthMm: 58, heightMm: 28 });
  const base = {
    id: "handheld-enclosure",
    type: "Handheld enclosure",
    material: "medical-grade plastic enclosure",
    groundedIn: "selected handheld form factor"
  };
  const enclosure = roundedBox([0.88 * scale.x, 1.85 * scale.y, 0.34 * scale.z], 0.11, 18);
  const display = transforms.translate([0, 0.42 * scale.y, 0.2 * scale.z], roundedBox([0.62 * scale.x, 0.42 * scale.y, 0.035], 0.014, 12));
  const grip = transforms.translate([0, -0.46 * scale.y, -0.02], roundedBox([0.62 * scale.x, 0.7 * scale.y, 0.22 * scale.z], 0.09, 18));
  const buttons = [-0.18, 0.18].map((x) => transforms.translate([x, -0.08, 0.22 * scale.z], primitives.roundedCylinder({ radius: 0.07, height: 0.04, roundRadius: 0.01, segments: 22 })));
  const positions = [[0, 0.68, 0.28], [0, 0.02, 0.3], [0, -0.62, 0.28], [-0.27, -0.2, 0.28], [0.27, -0.2, 0.28]];
  return [
    partFromGeom(base, booleans.union(enclosure, grip), SLOT_COLOR.base),
    partFromGeom({ id: "display-window", type: "Display or indicator window", material: "recessed clear polymer", groundedIn: "selected handheld form factor" }, display, SLOT_COLOR.display),
    partFromGeom({ id: "control-buttons", type: "Control buttons", material: "sealed elastomer", groundedIn: "selected handheld form factor" }, booleans.union(...buttons), SLOT_COLOR.contact),
    ...buildMountedParts(components, positions, 0.68)
  ];
}

function buildClipOnAssembly(layout, components) {
  const scale = envelopeScale(layout, { lengthMm: 52, widthMm: 28, heightMm: 22 });
  const base = {
    id: "clip-on-clamp",
    type: "Clip-on clamp body",
    material: "spring polymer with soft contact pads",
    groundedIn: "selected clip-on form factor"
  };
  const upperJaw = transforms.translate([0, 0.28 * scale.y, 0.16], roundedBox([0.58 * scale.x, 0.86 * scale.y, 0.16 * scale.z], 0.065, 16));
  const lowerJaw = transforms.translate([0, -0.28 * scale.y, -0.16], roundedBox([0.58 * scale.x, 0.86 * scale.y, 0.16 * scale.z], 0.065, 16));
  const hinge = transforms.translate([0, -0.78 * scale.y, 0], transforms.rotateX(Math.PI / 2, primitives.roundedCylinder({ radius: 0.17 * scale.x, height: 0.68 * scale.x, roundRadius: 0.02, segments: 24 })));
  const contactPads = [
    transforms.translate([0, 0.4 * scale.y, 0.045], roundedBox([0.42 * scale.x, 0.42 * scale.y, 0.045], 0.018, 14)),
    transforms.translate([0, -0.02 * scale.y, -0.045], roundedBox([0.42 * scale.x, 0.42 * scale.y, 0.045], 0.018, 14))
  ];
  const positions = [[0, 0.3, 0.31], [-0.18, 0.02, 0.3], [0.18, 0.02, 0.3], [0, -0.72, 0.23], [0, -0.2, -0.31]];
  return [
    partFromGeom(base, booleans.union(upperJaw, lowerJaw, hinge), SLOT_COLOR.base),
    partFromGeom({ id: "soft-contact-pads", type: "Soft contact pads", material: "skin-safe elastomer", groundedIn: "selected clip-on form factor" }, booleans.union(...contactPads), SLOT_COLOR.contact),
    ...buildMountedParts(components, positions, 0.58)
  ];
}

export function buildAssembly(layout) {
  const ordered = [...(layout.components || [])].sort((a, b) => (classifySlot(a) === "housing" ? -1 : classifySlot(b) === "housing" ? 1 : 0));
  const formFactor = inferFormFactor(layout);
  const parts =
    formFactor === "mouthguard" ? buildMouthguardAssembly(layout, ordered) :
    formFactor === "cast" ? buildCastAssembly(layout, ordered) :
    formFactor === "patch" ? buildPatchAssembly(layout, ordered) :
    formFactor === "handheld" ? buildHandheldAssembly(layout, ordered) :
    formFactor === "clip-on" ? buildClipOnAssembly(layout, ordered) :
    buildWristbandAssembly(layout, ordered);

  const unioned = booleans.union(...parts.map((p) => p.geom3));
  return { parts, unioned, formFactor };
}

// JSCAD polygons are documented as always convex, so fan triangulation from
// vertex 0 is safe here (not true for arbitrary polygon soups in general).
export function geom3ToBufferGeometry(geom3) {
  const polygons = geometries.geom3.toPolygons(geom3);
  const positions = [];
  for (const poly of polygons) {
    const verts = poly.vertices;
    for (let i = 1; i < verts.length - 1; i++) {
      positions.push(...verts[0], ...verts[i], ...verts[i + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function exportStlBlob(geom3) {
  const rawData = stlSerializer.serialize({ binary: true }, geom3);
  return new Blob(rawData);
}
