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

export function buildAssembly(layout) {
  const classified = layout.components.map((c) => ({ ...c, slot: classifySlot(c) }));

  const bandSource = classified.find((c) => c.slot === "band") || {
    id: "band",
    type: "Strap/Band",
    material: "unspecified",
    groundedIn: "illustrative only - no direct evidence"
  };
  const mountable = classified.filter((c) => c.slot !== "band");
  // Housing goes first (angle 0), everything else follows in whatever order the model gave.
  const ordered = [...mountable].sort((a, b) => (a.slot === "housing" ? -1 : b.slot === "housing" ? 1 : 0));

  const parts = [];

  const bandGeom = primitives.torus({
    innerRadius: BAND_TUBE_RADIUS,
    outerRadius: BAND_OUTER_RADIUS,
    innerSegments: 24,
    outerSegments: 48
  });
  parts.push({
    id: bandSource.id,
    type: bandSource.type,
    material: bandSource.material,
    groundedIn: bandSource.groundedIn,
    geom3: bandGeom,
    color: SLOT_COLOR.band
  });

  const n = Math.max(ordered.length, 1);
  ordered.forEach((c, i) => {
    const angle = (2 * Math.PI * i) / n;
    const size = SLOT_SIZE[c.slot] || SLOT_SIZE.module;
    // Slight overlap with the band's outer surface so the union produces one connected solid.
    const radialOffset = BAND_OUTER_RADIUS + BAND_TUBE_RADIUS + size[0] / 2 - 0.06;

    let geom = primitives.roundedCuboid({ size, roundRadius: Math.min(...size) * 0.25, segments: 12 });
    geom = transforms.translate([radialOffset, 0, 0], geom);
    geom = transforms.rotate([0, 0, angle], geom);

    parts.push({
      id: c.id,
      type: c.type,
      material: c.material,
      groundedIn: c.groundedIn,
      geom3: geom,
      color: SLOT_COLOR[c.slot] || SLOT_COLOR.module
    });
  });

  const unioned = booleans.union(...parts.map((p) => p.geom3));
  return { parts, unioned };
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
