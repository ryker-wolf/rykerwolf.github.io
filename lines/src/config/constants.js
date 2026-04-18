export const HOSE_OPTIONS = [
  { id: "4an", name: "4AN Braided", od: 0.43, minBendRadius: 0, hoseRadius: 0.20 },
  { id: "6an", name: "6AN Braided", od: 0.56, minBendRadius: 0, hoseRadius: 0.30 },
  { id: "8an", name: "8AN Braided", od: 0.69, minBendRadius: 3.5, hoseRadius: 1.35 },
  { id: "10an", name: "10AN Braided", od: 0.88, minBendRadius: 4.5, hoseRadius: 1.65 }
];

export const HOSE_RADIAL_SEGMENTS = 12;
export const HOSE_BRAID_PITCH = 1;

export const FITTING_MODEL_PATH = "./models/6AN_QD_Straight.stl";
export const FITTING_MM_TO_IN = 1 / 25.4;
export const FITTING_SNAP_DISTANCE = 1.2;
export const FITTING_EXIT_OFFSET_HOSE_RADIUS_MULT = 1;
export const FITTING_EXIT_MIN_OFFSET = 0.06;

/** Uniform scale applied to the main imported STL (after centering). 0.5 = half size. */
export const IMPORT_STL_SCALE = 1 / 25.4; // 0.3937007874015748

/**
 * When true, the routed hose is tested against the mesh (many raycasts) to flag "blocked" segments.
 * Set to false if that pass tanks performance; turn back on when you need collision feedback again.
 */
export const ROUTE_MESH_BLOCK_CHECK_ENABLED = false;
