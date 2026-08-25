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
  module: "#08c9d6"
};

// Deterministic keyword classification (same pattern as PubTator fallback matching
// in web/pubtator.js) - the LLM names parts, this decides where they physically go.
function classifySlot(component) {
  const text = `${component.type} ${component.id}`.toLowerCase();
  if (/\b(strap|band)\b/.test(text)) return "band";
  if (/\b(housing|pcb|controller|display|main)\b/.test(text)) return "housing";
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
  if (/\b(handheld|scanner|reader|wand|grip|portable|inhaler)\b/.test(text)) return "handheld";
  return "wristband";
}

function partFromGeom(component, geom3, color) {
  return {
    id: component.id,
    type: component.type,
    material: component.material,
    groundedIn: component.groundedIn,
    geom3,
    color
  };
}

function moduleGeom(component, position, scale = 1) {
  const slot = classifySlot(component);
  const size = SLOT_SIZE[slot] || SLOT_SIZE.module;
  let geom = primitives.roundedCuboid({
    size: size.map((value) => value * scale),
    roundRadius: Math.min(...size) * scale * 0.22,
    segments: 10
  });
  return transforms.translate(position, geom);
}

function buildMountedParts(components, positions, scale = 1) {
  return components.map((component, index) => {
    const position = positions[index % positions.length];
    return partFromGeom(component, moduleGeom(component, position, scale), SLOT_COLOR[classifySlot(component)] || SLOT_COLOR.module);
  });
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
    let geom = primitives.roundedCuboid({ size, roundRadius: Math.min(...size) * 0.25, segments: 12 });
    geom = transforms.translate([radialOffset, 0, 0], geom);
    geom = transforms.rotate([0, 0, angle], geom);
    parts.push(partFromGeom(component, geom, SLOT_COLOR[slot] || SLOT_COLOR.module));
  });
  return parts;
}

function buildMouthguardAssembly(layout, components) {
  const base = {
    id: "mouthguard-base",
    type: "Mouthguard base",
    material: "biocompatible flexible polymer",
    groundedIn: "selected mouthguard form factor"
  };
  const baseGeom = transforms.scale(
    [1.15, 0.72, 0.18],
    primitives.torus({ innerRadius: 0.08, outerRadius: 1.1, innerSegments: 16, outerSegments: 56 })
  );
  const positions = [[0, -0.86, 0.22], [-0.55, -0.35, 0.22], [0.55, -0.35, 0.22], [0, 0.2, 0.22], [-0.35, 0.55, 0.22], [0.35, 0.55, 0.22]];
  return [partFromGeom(base, baseGeom, SLOT_COLOR.base), ...buildMountedParts(components, positions, 0.82)];
}

function buildCastAssembly(layout, components) {
  const base = {
    id: "cast-shell",
    type: "Cast shell",
    material: "breathable semi-rigid polymer",
    groundedIn: "selected cast form factor"
  };
  const shell = primitives.roundedCuboid({ size: [1.15, 2.35, 0.34], roundRadius: 0.08, segments: 16 });
  const positions = [[0, -0.78, 0.28], [0, 0, 0.28], [0, 0.78, 0.28], [-0.34, -0.32, 0.28], [0.34, 0.32, 0.28]];
  return [partFromGeom(base, shell, SLOT_COLOR.base), ...buildMountedParts(components, positions, 0.9)];
}

function buildPatchAssembly(layout, components) {
  const base = {
    id: "adhesive-patch-base",
    type: "Adhesive patch base",
    material: "skin-safe adhesive laminate",
    groundedIn: "selected patch form factor"
  };
  const patch = primitives.roundedCuboid({ size: [1.8, 1.12, 0.08], roundRadius: 0.02, segments: 18 });
  const positions = [[0, 0, 0.14], [-0.5, 0, 0.14], [0.5, 0, 0.14], [0, -0.32, 0.14], [0, 0.32, 0.14]];
  return [partFromGeom(base, patch, SLOT_COLOR.base), ...buildMountedParts(components, positions, 0.75)];
}

function buildHandheldAssembly(layout, components) {
  const base = {
    id: "handheld-enclosure",
    type: "Handheld enclosure",
    material: "medical-grade plastic enclosure",
    groundedIn: "selected handheld form factor"
  };
  const enclosure = primitives.roundedCuboid({ size: [0.86, 1.65, 0.34], roundRadius: 0.08, segments: 14 });
  const positions = [[0, 0.45, 0.28], [0, 0, 0.28], [0, -0.48, 0.28], [-0.23, -0.05, 0.28], [0.23, -0.05, 0.28]];
  return [partFromGeom(base, enclosure, SLOT_COLOR.base), ...buildMountedParts(components, positions, 0.78)];
}

export function buildAssembly(layout) {
  const ordered = [...layout.components].sort((a, b) => (classifySlot(a) === "housing" ? -1 : classifySlot(b) === "housing" ? 1 : 0));
  const formFactor = inferFormFactor(layout);
  const parts =
    formFactor === "mouthguard" ? buildMouthguardAssembly(layout, ordered) :
    formFactor === "cast" ? buildCastAssembly(layout, ordered) :
    formFactor === "patch" ? buildPatchAssembly(layout, ordered) :
    formFactor === "handheld" ? buildHandheldAssembly(layout, ordered) :
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
