import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "https://esm.sh/three@0.164.1/examples/jsm/loaders/STLLoader.js";

const viewerElement = document.getElementById("viewer");
const inputElement = document.getElementById("stlInput");
const openFileButton = document.getElementById("openFileButton");
const resetViewButton = document.getElementById("resetViewButton");
const clearMeasureButton = document.getElementById("clearMeasureButton");
const newLineButton = document.getElementById("newLineButton");
const addFittingButton = document.getElementById("addFittingButton");
const lineListElement = document.getElementById("lineList");
const fittingListElement = document.getElementById("fittingList");
const contextMenu = document.getElementById("contextMenu");
const contextNewLineButton = document.getElementById("contextNewLine");
const contextDeleteLineButton = document.getElementById("contextDeleteLine");
const lineTypePanel = document.getElementById("lineTypePanel");
const lineTypeOptions = document.getElementById("lineTypeOptions");
const lineTypeCancelButton = document.getElementById("lineTypeCancel");
const dropZone = document.getElementById("dropZone");
const statusText = document.getElementById("statusText");
const measurementLabel = document.getElementById("measurementLabel");

if (
  !viewerElement ||
  !inputElement ||
  !resetViewButton ||
  !clearMeasureButton ||
  !newLineButton ||
  !addFittingButton ||
  !lineListElement ||
  !fittingListElement ||
  !contextMenu ||
  !contextNewLineButton ||
  !contextDeleteLineButton ||
  !lineTypePanel ||
  !lineTypeOptions ||
  !lineTypeCancelButton ||
  !dropZone ||
  !statusText ||
  !measurementLabel
) {
  throw new Error("Missing required UI elements.");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e8e8);

const camera = new THREE.PerspectiveCamera(
  60,
  viewerElement.clientWidth / viewerElement.clientHeight,
  0.1,
  5000
);
camera.position.set(180, 140, 180);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewerElement.clientWidth, viewerElement.clientHeight);
viewerElement.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = null;
// Many STL exports are Z-up; rotate to this viewer's Y-up world by default.
const defaultImportRotation = new THREE.Euler(-Math.PI / 2, 0, 0);
const pickRaycaster = new THREE.Raycaster();
const probeRaycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const insideTestDirections = [
  new THREE.Vector3(1, 0.173, 0.297).normalize(),
  new THREE.Vector3(-0.211, 1, 0.389).normalize(),
  new THREE.Vector3(0.143, -0.277, 1).normalize()
];

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const directional = new THREE.DirectionalLight(0xffffff, 1.1);
directional.position.set(100, 200, 150);
scene.add(directional);
const routeGroup = new THREE.Group();
scene.add(routeGroup);
const fittingGroup = new THREE.Group();
scene.add(fittingGroup);
const hoseRadialSegments = 12;
const hoseBraidPitch = 2.5;
const HOSE_OPTIONS = [
  { id: "6an", name: "6AN Braided", od: 0.56, minBendRadius: 0, hoseRadius: 0.30 },
  { id: "8an", name: "8AN Braided", od: 0.69, minBendRadius: 3.5, hoseRadius: 1.35 },
  { id: "10an", name: "10AN Braided", od: 0.88, minBendRadius: 4.5, hoseRadius: 1.65 }
];

const loader = new STLLoader();
let currentMesh = null;
let measurementLine = null;
let measurementGlow = null;
let startPoint = null;
let endPoint = null;
let startAttachment = null;
let endAttachment = null;
const bendPoints = [];
const measurementMarkers = [];
const measurementMidpoint = new THREE.Vector3();
let measurementDistance = 0;
let showMeasurement = false;
let isRouteBlocked = false;
let routeBlockPoint = null;
let routeBlockMarker = null;
const actionHistory = [];
let isDraggingBendPoint = false;
let draggedBendIndex = -1;
let draggedPointType = null;
let suppressNextClick = false;
const bendDragPlane = new THREE.Plane();
const bendDragIntersection = new THREE.Vector3();
let pendingBlockedCheck = false;
let selectedPointType = null;
let selectedBendIndex = -1;
const routes = [];
let activeRouteId = null;
let lineCounter = 1;
let contextMenuOpen = false;
let lineTypePanelOpen = false;
const fittings = [];
let fittingCounter = 1;
let selectedFittingId = null;
let isDraggingFitting = false;
let draggedFittingId = null;
const fittingDragPlane = new THREE.Plane();
const fittingDragIntersection = new THREE.Vector3();
const fittingModelPath = "./models/6AN_QD_Straight.stl";
const FITTING_MM_TO_IN = 1 / 25.4;
const FITTING_SNAP_DISTANCE = 1.2;
const FITTING_EXIT_OFFSET_HOSE_RADIUS_MULT = 1;
const FITTING_EXIT_MIN_OFFSET = 0.06;
const fittingPortOutwardScratch = new THREE.Vector3();
/** Uniform scale applied to the main imported STL (after centering). 0.5 = half size. */
const IMPORT_STL_SCALE = 0.3937007874015748;
let fittingTemplateGeometry = null;
let isRotatingFitting = false;
let rotatingFittingId = null;
let rotateStartX = 0;
let rotateStartY = 0;
let rotateMoved = false;
let suppressContextMenuOnce = false;

pickRaycaster.params.Line.threshold = 4;

function createIconTexture(drawIcon) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create marker icon context.");
  }

  drawIcon(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const circleIconTexture = createIconTexture((ctx, size) => {
  const center = size / 2;
  const radius = size * 0.16;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();
});

const xIconTexture = createIconTexture((ctx, size) => {
  const pad = size * 0.36;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.045;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(size - pad, size - pad);
  ctx.moveTo(size - pad, pad);
  ctx.lineTo(pad, size - pad);
  ctx.stroke();
});

const braidedHoseTexture = createIconTexture((ctx, size) => {
  const width = size;
  const height = size;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#1e1f21";
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  for (let i = -height; i < width + height; i += 8) {
    ctx.strokeStyle = "#9ca3af";
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }
  for (let i = -height; i < width + height; i += 8) {
    ctx.strokeStyle = "#4b5563";
    ctx.beginPath();
    ctx.moveTo(i, height);
    ctx.lineTo(i + height, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
});
braidedHoseTexture.wrapS = THREE.RepeatWrapping;
braidedHoseTexture.wrapT = THREE.RepeatWrapping;
braidedHoseTexture.anisotropy = 8;

function createRouteTubeMesh(controlPoints, routePoints, color, hoseRadius, opacity = 1) {
  if (controlPoints.length < 2 || routePoints.length < 2) return null;
  const curve =
    controlPoints.length === 2
      ? new THREE.LineCurve3(controlPoints[0].clone(), controlPoints[1].clone())
      : new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);

  const tubularSegments = Math.max(40, routePoints.length - 1);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, hoseRadius, hoseRadialSegments, false);
  const texture = braidedHoseTexture.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const routeLength = computePathLength(routePoints);
  texture.repeat.set(Math.max(routeLength / hoseBraidPitch, 1), 1);
  texture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color,
    roughness: 0.55,
    metalness: 0.38,
    transparent: opacity < 1,
    opacity
  });

  return new THREE.Mesh(geometry, material);
}

function createRouteGlowMesh(controlPoints, routePoints, color, hoseRadius) {
  if (controlPoints.length < 2 || routePoints.length < 2) return null;
  const curve =
    controlPoints.length === 2
      ? new THREE.LineCurve3(controlPoints[0].clone(), controlPoints[1].clone())
      : new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
  const tubularSegments = Math.max(40, routePoints.length - 1);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, hoseRadius * 1.45, hoseRadialSegments, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  return new THREE.Mesh(geometry, material);
}

function disposeRouteObject(object3D) {
  if (!object3D) return;
  if (object3D.geometry) {
    object3D.geometry.dispose();
  }
  const disposeTextureIfOwned = (texture) => {
    if (!texture) return;
    if (texture === xIconTexture || texture === circleIconTexture || texture === braidedHoseTexture) return;
    texture.dispose();
  };
  const material = object3D.material;
  if (Array.isArray(material)) {
    for (const mat of material) {
      if (mat?.map) disposeTextureIfOwned(mat.map);
      mat?.dispose();
    }
  } else if (material) {
    if (material.map) disposeTextureIfOwned(material.map);
    material.dispose();
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function getHoseOptionById(optionId) {
  return HOSE_OPTIONS.find((option) => option.id === optionId) ?? HOSE_OPTIONS[0];
}

function hideContextMenu() {
  contextMenu.classList.add("hidden");
  contextMenuOpen = false;
}

function showContextMenu(clientX, clientY) {
  contextDeleteLineButton.disabled = !activeRouteId;
  contextMenu.classList.remove("hidden");
  contextMenuOpen = true;

  const menuWidth = 190;
  const menuHeight = 86;
  const x = Math.min(clientX, window.innerWidth - menuWidth - 10);
  const y = Math.min(clientY, window.innerHeight - menuHeight - 10);
  contextMenu.style.left = `${Math.max(8, x)}px`;
  contextMenu.style.top = `${Math.max(8, y)}px`;
}

function hideLineTypePanel() {
  lineTypePanel.classList.add("hidden");
  lineTypePanelOpen = false;
}

function showLineTypePanel() {
  hideContextMenu();
  lineTypeOptions.innerHTML = "";
  for (const hoseOption of HOSE_OPTIONS) {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "line-type-option";
    optionButton.textContent = `${hoseOption.name} — OD ${hoseOption.od}" — Min Radius ${hoseOption.minBendRadius}"`;
    optionButton.addEventListener("click", () => {
      hideLineTypePanel();
      createNewLineAndActivate(hoseOption.id);
    });
    lineTypeOptions.appendChild(optionButton);
  }
  lineTypePanel.classList.remove("hidden");
  lineTypePanelOpen = true;
}

function createRouteObject(hoseOptionId) {
  const hoseOption = getHoseOptionById(hoseOptionId);
  return {
    id: `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `Line ${lineCounter++}`,
    hoseOptionId: hoseOption.id,
    hoseLabel: hoseOption.name,
    hoseOd: hoseOption.od,
    hoseRadius: hoseOption.hoseRadius,
    minBendRadius: hoseOption.minBendRadius,
    startPoint: null,
    endPoint: null,
    startAttachment: null,
    endAttachment: null,
    lockedBendLeadIn: false,
    lockedBendLeadOut: false,
    bendPoints: [],
    distance: 0,
    blocked: false,
    blockPoint: null
  };
}

function getActiveRoute() {
  return routes.find((route) => route.id === activeRouteId) ?? null;
}

function buildRouteControlPointsFromRoute(route) {
  if (!route?.startPoint || !route?.endPoint) return [];
  return [route.startPoint, ...route.bendPoints, route.endPoint];
}

function refreshLineList() {
  lineListElement.innerHTML = "";
  for (const route of routes) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `line-item${route.id === activeRouteId ? " active" : ""}`;
    const suffix = route.startPoint && route.endPoint ? ` (${route.distance.toFixed(2)}u)` : "";
    item.textContent = `${route.name} • ${route.hoseLabel}${suffix}`;
    item.addEventListener("click", () => activateRoute(route.id));
    lineListElement.appendChild(item);
  }
}

function refreshFittingList() {
  fittingListElement.innerHTML = "";
  for (const fitting of fittings) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `line-item${fitting.id === selectedFittingId ? " active" : ""}`;
    item.textContent = fitting.name;
    item.addEventListener("click", () => {
      selectFitting(fitting.id);
      setStatus(`${fitting.name} selected.`);
    });
    fittingListElement.appendChild(item);
  }
  updateFittingConnectorVisibility();
}

function isActiveLineAwaitingEndpoints() {
  if (!activeRouteId || !getActiveRoute()) return false;
  return !startPoint || !endPoint;
}

function updateFittingConnectorVisibility() {
  const showForLinePlacement = isActiveLineAwaitingEndpoints();
  for (const fitting of fittings) {
    const isSelected = fitting.id === selectedFittingId;
    const markers = fitting.connectorMarkers ?? [];
    const showMarkers = isSelected || showForLinePlacement;
    for (const marker of markers) {
      marker.visible = showMarkers;
    }
  }
}

function getFittingById(fittingId) {
  return fittings.find((fitting) => fitting.id === fittingId) ?? null;
}

function getFittingConnectorWorldPosition(fitting, connectorIndex) {
  if (!fitting) return null;
  const local = fitting.connectorsLocal[connectorIndex];
  return fitting.mesh.localToWorld(local.clone());
}

function getOppositeConnectorIndex(connectorIndex) {
  return connectorIndex === 0 ? 1 : 0;
}

/** Unit vector from port along the hose barb axis, pointing out of the fitting (away from the body). */
function getFittingPortOutwardWorldDirection(fitting, connectorIndex, target) {
  const c0 = getFittingConnectorWorldPosition(fitting, 0);
  const c1 = getFittingConnectorWorldPosition(fitting, 1);
  if (!c0 || !c1) return null;
  if (connectorIndex === 0) {
    return target.copy(c0).sub(c1).normalize();
  }
  return target.copy(c1).sub(c0).normalize();
}

function computeFittingRouteExitPointWorld(fitting, connectorIndex, hoseRadius) {
  if (!fitting) return null;
  const connector = getFittingConnectorWorldPosition(fitting, connectorIndex);
  /*const oppositeConnector = getFittingConnectorWorldPosition(fitting, connectorIndex);
  if (!connector || !oppositeConnector) return null;
  const axisLenSq = 2*2*hoseRadius*hoseRadius;
  if (axisLenSq < 1e-9) return null;*/
  const oppositeConnector = getFittingConnectorWorldPosition(fitting, 2);
  if (!connector || !oppositeConnector) return null;
  const axisLenSq = 2*2*hoseRadius*hoseRadius;
  if (axisLenSq < 1e-9) return null;
  fittingPortOutwardScratch.copy(oppositeConnector).sub(connector).normalize();
  const offset = Math.max(
    (hoseRadius ?? 0.05) * FITTING_EXIT_OFFSET_HOSE_RADIUS_MULT,
    FITTING_EXIT_MIN_OFFSET
  );
  // The hose should leave through the opposite end of the fitting, then continue outward.
  return oppositeConnector.clone().addScaledVector(fittingPortOutwardScratch, offset);
}

function syncRouteLockedExitBendPositions(route) {
  if (!route?.startPoint || !route.endPoint || !route.bendPoints?.length) return;
  const bends = route.bendPoints;
  if (route.lockedBendLeadIn && route.startAttachment && bends.length > 0) {
    const fit = getFittingById(route.startAttachment.fittingId);
    const p = computeFittingRouteExitPointWorld(fit, route.startAttachment.connectorIndex, route.hoseRadius);
    if (p) bends[0].copy(p);
  }
  if (route.lockedBendLeadOut && route.endAttachment && bends.length > 0) {
    const fit = getFittingById(route.endAttachment.fittingId);
    const p = computeFittingRouteExitPointWorld(fit, route.endAttachment.connectorIndex, route.hoseRadius);
    if (p) bends[bends.length - 1].copy(p);
  }
}

function syncLockedExitBendWorldPositionsEditorFromFittings() {
  const route = getActiveRoute();
  if (!route || !startPoint || !endPoint || bendPoints.length === 0) return;
  if (route.lockedBendLeadIn && startAttachment) {
    const fit = getFittingById(startAttachment.fittingId);
    const p = computeFittingRouteExitPointWorld(fit, startAttachment.connectorIndex, route.hoseRadius);
    if (p) bendPoints[0].copy(p);
  }
  if (route.lockedBendLeadOut && endAttachment) {
    const fit = getFittingById(endAttachment.fittingId);
    const p = computeFittingRouteExitPointWorld(fit, endAttachment.connectorIndex, route.hoseRadius);
    if (p) bendPoints[bendPoints.length - 1].copy(p);
  }
}

function isBendIndexLocked(bendIndex) {
  const route = getActiveRoute();
  if (!route || bendIndex < 0) return false;
  if (route.lockedBendLeadIn && bendIndex === 0) return true;
  if (route.lockedBendLeadOut && bendIndex === bendPoints.length - 1 && bendPoints.length > 0) return true;
  return false;
}

/** Add/remove locked exit knots when attachments change; updates editor `bendPoints` and active `route` flags. */
function ensureAttachmentExitBendsInEditor() {
  const route = getActiveRoute();
  if (!route || !startPoint || !endPoint) return;

  if (startAttachment) {
    const fit = getFittingById(startAttachment.fittingId);
    const pw = computeFittingRouteExitPointWorld(fit, startAttachment.connectorIndex, route.hoseRadius);
    if (pw) {
      if (!route.lockedBendLeadIn) {
        route.lockedBendLeadIn = true;
        bendPoints.unshift(pw.clone());
      } else {
        bendPoints[0].copy(pw);
      }
    }
  } else if (route.lockedBendLeadIn) {
    if (bendPoints.length > 0) bendPoints.shift();
    route.lockedBendLeadIn = false;
  }

  if (endAttachment) {
    const fit = getFittingById(endAttachment.fittingId);
    const pw = computeFittingRouteExitPointWorld(fit, endAttachment.connectorIndex, route.hoseRadius);
    if (pw) {
      if (!route.lockedBendLeadOut) {
        route.lockedBendLeadOut = true;
        bendPoints.push(pw.clone());
      } else {
        bendPoints[bendPoints.length - 1].copy(pw);
      }
    }
  } else if (route.lockedBendLeadOut) {
    if (bendPoints.length > 0) bendPoints.pop();
    route.lockedBendLeadOut = false;
  }

  route.bendPoints = bendPoints.map((point) => point.clone());
}

/** Pick connector 0 or 1 whose world position is closest to `worldReference` (e.g. ray hit on fitting mesh). */
function getNearestFittingConnectorFromWorldPoint(fitting, worldReference) {
  if (!fitting || !worldReference) return null;
  const c0 = getFittingConnectorWorldPosition(fitting, 0);
  const c1 = getFittingConnectorWorldPosition(fitting, 1);
  if (!c0 || !c1) return null;
  const d0 = worldReference.distanceToSquared(c0);
  const d1 = worldReference.distanceToSquared(c1);
  if (d0 <= d1) {
    return { connectorIndex: 0, snapPoint: c0.clone() };
  }
  return { connectorIndex: 1, snapPoint: c1.clone() };
}

function snapWorldPointToFittingConnectors(worldPoint) {
  let bestPoint = null;
  let bestFittingId = null;
  let bestConnectorIndex = -1;
  let bestDistanceSq = FITTING_SNAP_DISTANCE * FITTING_SNAP_DISTANCE;

  for (const fitting of fittings) {
    for (let connectorIndex = 0; connectorIndex < 2; connectorIndex += 1) {
      const connectorWorld = getFittingConnectorWorldPosition(fitting, connectorIndex);
      if (!connectorWorld) continue;
      const distanceSq = worldPoint.distanceToSquared(connectorWorld);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestPoint = connectorWorld.clone();
        bestFittingId = fitting.id;
        bestConnectorIndex = connectorIndex;
      }
    }
  }

  if (!bestPoint) return null;
  return { point: bestPoint, fittingId: bestFittingId, connectorIndex: bestConnectorIndex };
}

function updateAttachedRouteEndpoints() {
  for (const route of routes) {
    if (route.startAttachment) {
      const fitting = getFittingById(route.startAttachment.fittingId);
      const world = getFittingConnectorWorldPosition(fitting, route.startAttachment.connectorIndex);
      if (world) {
        route.startPoint = world;
      }
    }
    if (route.endAttachment) {
      const fitting = getFittingById(route.endAttachment.fittingId);
      const world = getFittingConnectorWorldPosition(fitting, route.endAttachment.connectorIndex);
      if (world) {
        route.endPoint = world;
      }
    }
    if (route.startPoint && route.endPoint) {
      syncRouteLockedExitBendPositions(route);
    }
  }
}

function rebuildInactiveRouteLines() {
  for (const child of routeGroup.children) {
    disposeRouteObject(child);
  }
  routeGroup.clear();
  for (const route of routes) {
    if (route.id === activeRouteId) continue;
    const controlPoints = buildRouteControlPointsFromRoute(route);
    const routePoints = buildRouteSamplePoints(controlPoints);
    if (routePoints.length < 2) continue;
    const mesh = createRouteTubeMesh(
      controlPoints,
      routePoints,
      route.blocked ? 0xef4444 : 0x9ca3af,
      route.hoseRadius,
      0.45
    );
    if (!mesh) continue;
    mesh.userData = { routeId: route.id };
    routeGroup.add(mesh);
    if (route.blockPoint) {
      const blockMarker = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: xIconTexture,
          color: 0xef4444,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: true
        })
      );
      blockMarker.position.copy(route.blockPoint);
    blockMarker.scale.set(3.2, 3.2, 1);
      blockMarker.userData = { routeId: route.id };
      routeGroup.add(blockMarker);
    }
  }
}

function persistActiveRoute() {
  const route = getActiveRoute();
  if (!route) return;
  route.startPoint = startPoint ? startPoint.clone() : null;
  route.endPoint = endPoint ? endPoint.clone() : null;
  route.startAttachment = startAttachment ? { ...startAttachment } : null;
  route.endAttachment = endAttachment ? { ...endAttachment } : null;
  route.bendPoints = bendPoints.map((point) => point.clone());
  route.distance = startPoint && endPoint ? measurementDistance : 0;
  route.blocked = startPoint && endPoint ? isRouteBlocked : false;
  route.blockPoint = startPoint && endPoint && routeBlockPoint ? routeBlockPoint.clone() : null;
}

function loadRouteIntoEditor(route) {
  clearMeasurement();
  if (!route) return;
  startPoint = route.startPoint ? route.startPoint.clone() : null;
  endPoint = route.endPoint ? route.endPoint.clone() : null;
  startAttachment = route.startAttachment ? { ...route.startAttachment } : null;
  endAttachment = route.endAttachment ? { ...route.endAttachment } : null;
  if (startAttachment) {
    const fitting = getFittingById(startAttachment.fittingId);
    const snapped = getFittingConnectorWorldPosition(fitting, startAttachment.connectorIndex);
    if (snapped) startPoint = snapped;
  }
  if (endAttachment) {
    const fitting = getFittingById(endAttachment.fittingId);
    const snapped = getFittingConnectorWorldPosition(fitting, endAttachment.connectorIndex);
    if (snapped) endPoint = snapped;
  }
  bendPoints.push(...route.bendPoints.map((point) => point.clone()));
  route.lockedBendLeadIn = !!route.lockedBendLeadIn;
  route.lockedBendLeadOut = !!route.lockedBendLeadOut;
  if (startPoint && endPoint) {
    if (startAttachment && !route.lockedBendLeadIn) {
      route.lockedBendLeadIn = true;
      const fit = getFittingById(startAttachment.fittingId);
      const pw = computeFittingRouteExitPointWorld(fit, startAttachment.connectorIndex, route.hoseRadius);
      if (pw) bendPoints.unshift(pw.clone());
    }
    if (endAttachment && !route.lockedBendLeadOut) {
      route.lockedBendLeadOut = true;
      const fit = getFittingById(endAttachment.fittingId);
      const pw = computeFittingRouteExitPointWorld(fit, endAttachment.connectorIndex, route.hoseRadius);
      if (pw) bendPoints.push(pw.clone());
    }
    syncRouteLockedExitBendPositions(route);
    route.bendPoints = bendPoints.map((point) => point.clone());
  }
  routeBlockPoint = route.blockPoint ? route.blockPoint.clone() : null;
  rebuildMarkers();
  if (startPoint && endPoint) {
    updateRouteMeasurement({ runBlockedCheck: true });
  }
}

function deselectActiveLine() {
  if (!activeRouteId) return;
  persistActiveRoute();
  clearMeasurement();
  activeRouteId = null;
  actionHistory.length = 0;
  refreshLineList();
  rebuildInactiveRouteLines();
  updateFittingConnectorVisibility();
}

function deactivateActiveRoute() {
  if (!activeRouteId) return;
  deselectActiveLine();
  setStatus("Line deselected. Click a line to select it.");
}

function selectFitting(fittingId) {
  deselectActiveLine();
  selectedFittingId = fittingId;
  refreshFittingList();
}

function clearFittingSelection() {
  selectedFittingId = null;
  refreshFittingList();
}

function activateRoute(routeId) {
  persistActiveRoute();
  selectedFittingId = null;
  activeRouteId = routeId;
  actionHistory.length = 0;
  const route = getActiveRoute();
  loadRouteIntoEditor(route);
  refreshLineList();
  refreshFittingList();
  rebuildInactiveRouteLines();
}

function createNewLineAndActivate(hoseOptionId) {
  persistActiveRoute();
  const route = createRouteObject(hoseOptionId);
  routes.push(route);
  activateRoute(route.id);
  setStatus(`${route.name} created (${route.hoseLabel}). Click first point.`);
}

function buildFittingConnectorsFromGeometry(geometry) {
  const bbox = geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
  const center = bbox.getCenter(new THREE.Vector3());
  const min = bbox.min;
  const max = bbox.max;
  const size = bbox.getSize(new THREE.Vector3());
  let axis = "x";
  if (size.y > size.x && size.y >= size.z) axis = "y";
  if (size.z > size.x && size.z > size.y) axis = "z";
  const connectorA = center.clone();
  const connectorB = center.clone();
  const connectorC = center.clone();
  if (axis === "x") {
    connectorA.x = min.x;
    connectorB.x = max.x;
    connectorC.x = max.x;
  } else if (axis === "y") {
    connectorA.y = min.y;
    connectorB.y = max.y;
    connectorC.y = max.y;
  } else {
    connectorA.z = min.z;
    connectorB.z = max.z + (min.z / 2.1);
    connectorC.z = max.z;
  }
  return [connectorA, connectorB, connectorC];
}

function createConnectorMarker(color, connectorIndex) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: circleIconTexture,
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
  sprite.scale.set(1, 1, 1);
  sprite.userData = { type: "fittingConnector", connectorIndex };
  return sprite;
}

function addFittingInstance() {
  if (!currentMesh) {
    setStatus("Load an STL first.");
    return;
  }

  const finalizeCreate = (geometry) => {
    const fitGeometry = geometry.clone();
    // Fitting STL is authored in millimeters; convert to inches for this scene.
    fitGeometry.scale(FITTING_MM_TO_IN, FITTING_MM_TO_IN, FITTING_MM_TO_IN);
    fitGeometry.computeBoundingBox();
    fitGeometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.03,
      metalness: 0.94
    });
    const mesh = new THREE.Mesh(fitGeometry, material);
    const placement = controls.target.clone();
    mesh.position.copy(placement);
    const connectorsLocal = buildFittingConnectorsFromGeometry(fitGeometry);
    const connectorMarkers = [
      createConnectorMarker(0xd1d1d1, 0)
      //createConnectorMarker(0x38bdf8, 1)
    ];
    connectorMarkers[0].position.copy(connectorsLocal[1]);
    //connectorMarkers[1].position.copy(connectorsLocal[1]);
    connectorMarkers[0].visible = false;
    connectorsLocal[0] = connectorsLocal[1];
    //connectorMarkers[1].visible = false;
    mesh.add(connectorMarkers[0]);
    //mesh.add(connectorMarkers[1]);
    fittingGroup.add(mesh);

    const fitting = {
      id: `fitting-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: `Fitting ${fittingCounter++}`,
      mesh,
      connectorsLocal,
      connectorMarkers
    };
    mesh.userData = { type: "fittingMesh", fittingId: fitting.id };
    fittings.push(fitting);
    selectFitting(fitting.id);
    setStatus(`${fitting.name} added. Drag to position; click connector to attach a line end.`);
  };

  if (fittingTemplateGeometry) {
    finalizeCreate(fittingTemplateGeometry);
    return;
  }

  loader.load(
    fittingModelPath,
    (geometry) => {
      fittingTemplateGeometry = geometry.clone();
      finalizeCreate(fittingTemplateGeometry);
    },
    undefined,
    () => {
      setStatus(`Could not load fitting model: ${fittingModelPath}`);
    }
  );
}

function deleteActiveRoute() {
  if (!activeRouteId) {
    setStatus("No selected line to delete.");
    return;
  }

  const index = routes.findIndex((route) => route.id === activeRouteId);
  if (index < 0) return;
  const deletedName = routes[index].name;

  clearMeasurement();
  routes.splice(index, 1);
  actionHistory.length = 0;

  if (routes.length === 0) {
    activeRouteId = null;
    refreshLineList();
    rebuildInactiveRouteLines();
    setStatus(`${deletedName} deleted. Create a new line to continue.`);
    return;
  }

  const nextIndex = Math.min(index, routes.length - 1);
  activateRoute(routes[nextIndex].id);
  setStatus(`${deletedName} deleted.`);
}

function clearMeasurementMarkers() {
  for (const marker of measurementMarkers) {
    scene.remove(marker);
    marker.material.dispose();
  }
  measurementMarkers.length = 0;
}

function clearRouteBlockMarker() {
  if (!routeBlockMarker) return;
  scene.remove(routeBlockMarker);
  routeBlockMarker.material.dispose();
  routeBlockMarker = null;
}

function updateRouteBlockMarker() {
  clearRouteBlockMarker();
  if (!routeBlockPoint) return;
  routeBlockMarker = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: xIconTexture,
      color: 0xef4444,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
  routeBlockMarker.scale.set(1, 1, 1);
  routeBlockMarker.position.copy(routeBlockPoint);
  scene.add(routeBlockMarker);
}

function updateMeasurementLabelPosition() {
  if (!showMeasurement || !measurementLine) return;
  const projected = measurementMidpoint.clone().project(camera);
  const width = viewerElement.clientWidth;
  const height = viewerElement.clientHeight;
  const x = (projected.x * 0.5 + 0.5) * width;
  const y = (-projected.y * 0.5 + 0.5) * height;

  if (projected.z < -1 || projected.z > 1) {
    measurementLabel.classList.add("hidden");
    return;
  }

  measurementLabel.style.left = `${x}px`;
  measurementLabel.style.top = `${y - 18}px`;
  measurementLabel.classList.remove("hidden");
}

function clearMeasurement() {
  if (measurementLine) {
    scene.remove(measurementLine);
    disposeRouteObject(measurementLine);
    measurementLine = null;
  }
  if (measurementGlow) {
    scene.remove(measurementGlow);
    disposeRouteObject(measurementGlow);
    measurementGlow = null;
  }

  clearMeasurementMarkers();
  clearRouteBlockMarker();
  startPoint = null;
  endPoint = null;
  startAttachment = null;
  endAttachment = null;
  bendPoints.length = 0;
  isDraggingBendPoint = false;
  draggedBendIndex = -1;
  draggedPointType = null;
  selectedPointType = null;
  selectedBendIndex = -1;
  suppressNextClick = false;
  bendDragPlane.set(new THREE.Vector3(0, 1, 0), 0);
  showMeasurement = false;
  isRouteBlocked = false;
  routeBlockPoint = null;
  measurementLabel.classList.add("hidden");
}

function clearRouteVisualization() {
  if (measurementLine) {
    scene.remove(measurementLine);
    disposeRouteObject(measurementLine);
    measurementLine = null;
  }
  if (measurementGlow) {
    scene.remove(measurementGlow);
    disposeRouteObject(measurementGlow);
    measurementGlow = null;
  }
  showMeasurement = false;
  pendingBlockedCheck = false;
  routeBlockPoint = null;
  clearRouteBlockMarker();
  measurementLabel.classList.add("hidden");
}

function setSelectedPoint(type, bendIndex = -1) {
  selectedPointType = type;
  selectedBendIndex = bendIndex;
}

function syncRouteAfterPointChange() {
  rebuildMarkers();
  if (startPoint && endPoint) {
    updateRouteMeasurement({ runBlockedCheck: true });
  } else {
    clearRouteVisualization();
    if (startPoint) {
      setStatus("Point 1 selected. Click another point to measure distance.");
    } else {
      setStatus("Measurement cleared. Click first point.");
    }
  }
  persistActiveRoute();
  refreshLineList();
  rebuildInactiveRouteLines();
}

function deleteSelectedPoint() {
  if (!selectedPointType) {
    if (activeRouteId) {
      deleteActiveRoute();
      return;
    }
    setStatus("No selected line or point to delete.");
    return;
  }

  if (selectedPointType === "bend" && isBendIndexLocked(selectedBendIndex)) {
    setStatus("This bend is fixed at the fitting exit and cannot be removed.");
    return;
  }

  pushUndoState();

  const route = getActiveRoute();
  if (selectedPointType === "bend" && selectedBendIndex >= 0 && selectedBendIndex < bendPoints.length) {
    bendPoints.splice(selectedBendIndex, 1);
  } else if (selectedPointType === "start") {
    startAttachment = null;
    if (route?.lockedBendLeadIn && bendPoints.length > 0) {
      bendPoints.shift();
      route.lockedBendLeadIn = false;
    }
    if (bendPoints.length > 0) {
      startPoint = bendPoints.shift();
    } else {
      startPoint = null;
    }
  } else if (selectedPointType === "end") {
    endAttachment = null;
    if (route?.lockedBendLeadOut && bendPoints.length > 0) {
      bendPoints.pop();
      route.lockedBendLeadOut = false;
    }
    if (bendPoints.length > 0) {
      endPoint = bendPoints.pop();
    } else {
      endPoint = null;
    }
  }

  setSelectedPoint(null, -1);
  syncRouteAfterPointChange();
}

function resetMeasurementForNewLine() {
  clearMeasurement();
  if (currentMesh) {
    setStatus("Measurement cleared. Click first point.");
  }
}

function getRouteStateSnapshot() {
  const route = getActiveRoute();
  return {
    startPoint: startPoint ? startPoint.clone() : null,
    endPoint: endPoint ? endPoint.clone() : null,
    startAttachment: startAttachment ? { ...startAttachment } : null,
    endAttachment: endAttachment ? { ...endAttachment } : null,
    bendPoints: bendPoints.map((point) => point.clone()),
    lockedBendLeadIn: !!(route?.lockedBendLeadIn),
    lockedBendLeadOut: !!(route?.lockedBendLeadOut)
  };
}

function restoreRouteFromSnapshot(snapshot) {
  clearMeasurement();

  startPoint = snapshot.startPoint ? snapshot.startPoint.clone() : null;
  endPoint = snapshot.endPoint ? snapshot.endPoint.clone() : null;
  startAttachment = snapshot.startAttachment ? { ...snapshot.startAttachment } : null;
  endAttachment = snapshot.endAttachment ? { ...snapshot.endAttachment } : null;
  bendPoints.push(...snapshot.bendPoints.map((point) => point.clone()));

  const route = getActiveRoute();
  if (route) {
    route.lockedBendLeadIn = !!snapshot.lockedBendLeadIn;
    route.lockedBendLeadOut = !!snapshot.lockedBendLeadOut;
  }

  rebuildMarkers();

  if (startPoint && endPoint) {
    updateRouteMeasurement();
    return;
  }

  if (startPoint) {
    setStatus("Point 1 selected. Click another point to measure distance.");
    return;
  }

  if (currentMesh) {
    setStatus("Measurement cleared. Click first point.");
  }
}

function pushUndoState() {
  actionHistory.push(getRouteStateSnapshot());
}

function undoLastAction() {
  if (actionHistory.length === 0) {
    setStatus("Nothing to undo.");
    return;
  }

  const previousState = actionHistory.pop();
  restoreRouteFromSnapshot(previousState);
  setStatus("Undid last action.");
}

function rebuildMarkers() {
  clearMeasurementMarkers();
  const defaultPointColor = 0x94a3b8;
  const selectedPointColor = 0x22c55e;
  const defaultPointScale = 1;
  const selectedPointScale = 2;

  if (startPoint) {
    const isSelected = selectedPointType === "start";
    const startMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: circleIconTexture,
        color: isSelected ? selectedPointColor : defaultPointColor,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true
      })
    );
    startMarker.scale.set(
      isSelected ? selectedPointScale : defaultPointScale,
      isSelected ? selectedPointScale : defaultPointScale,
      1
    );
    startMarker.position.copy(startPoint);
    startMarker.userData = { type: "start" };
    scene.add(startMarker);
    measurementMarkers.push(startMarker);
  }

  if (endPoint) {
    const isSelected = selectedPointType === "end";
    const endMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: circleIconTexture,
        color: isSelected ? selectedPointColor : defaultPointColor,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true
      })
    );
    endMarker.scale.set(
      isSelected ? selectedPointScale : defaultPointScale,
      isSelected ? selectedPointScale : defaultPointScale,
      1
    );
    endMarker.position.copy(endPoint);
    endMarker.userData = { type: "end" };
    scene.add(endMarker);
    measurementMarkers.push(endMarker);
  }

  const lockedBendColor = 0x64748b;
  const route = getActiveRoute();
  for (let i = 0; i < bendPoints.length; i += 1) {
    const locked = route && isBendIndexLocked(i);
    const isSelected = selectedPointType === "bend" && selectedBendIndex === i;
    const bendMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: circleIconTexture,
        color: isSelected ? selectedPointColor : locked ? lockedBendColor : defaultPointColor,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true
      })
    );
    bendMarker.scale.set(
      isSelected ? selectedPointScale : defaultPointScale,
      isSelected ? selectedPointScale : defaultPointScale,
      1
    );
    bendMarker.position.copy(bendPoints[i]);
    bendMarker.userData = { type: "bend", bendIndex: i, locked: !!locked };
    scene.add(bendMarker);
    measurementMarkers.push(bendMarker);
  }

  updateFittingConnectorVisibility();
}

function buildRouteControlPoints() {
  if (!startPoint || !endPoint) return [];
  return [startPoint, ...bendPoints, endPoint];
}

function buildRouteSamplePoints(controlPoints) {
  if (controlPoints.length < 2) return [];
  if (controlPoints.length === 2) return controlPoints.map((point) => point.clone());

  const curve = new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
  const divisions = Math.max(40, 30 * (controlPoints.length - 1));
  return curve.getPoints(divisions);
}

function computePathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += points[i - 1].distanceTo(points[i]);
  }
  return length;
}

function computeCircumcircleRadius(a, b, c) {
  const ab = a.distanceTo(b);
  const bc = b.distanceTo(c);
  const ca = c.distanceTo(a);
  const abVec = new THREE.Vector3().subVectors(b, a);
  const acVec = new THREE.Vector3().subVectors(c, a);
  const areaTwice = new THREE.Vector3().crossVectors(abVec, acVec).length();
  if (areaTwice < 1e-6) return Infinity;
  return (ab * bc * ca) / (2 * areaTwice);
}

function getMinimumBendRadiusForPoints(points) {
  let minRadius = Infinity;
  let minIndex = -1;
  for (let i = 1; i < points.length - 1; i += 1) {
    const radius = computeCircumcircleRadius(points[i - 1], points[i], points[i + 1]);
    if (radius < minRadius) {
      minRadius = radius;
      minIndex = i;
    }
  }
  return { minRadius, minIndex };
}

function routeRespectsMinBendRadius(controlPoints, minBendRadius) {
  if (controlPoints.length < 3) {
    return { valid: true, minRadius: Infinity, minIndex: -1 };
  }

  // Evaluate radius on the actual routed spline, not just control points.
  const curve =
    controlPoints.length === 2
      ? new THREE.LineCurve3(controlPoints[0].clone(), controlPoints[1].clone())
      : new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
  const divisions = Math.max(180, 80 * (controlPoints.length - 1));
  const sampledPoints = curve.getPoints(divisions);
  if (sampledPoints.length < 3) {
    return { valid: true, minRadius: Infinity, minIndex: -1 };
  }

  const result = getMinimumBendRadiusForPoints(sampledPoints);
  return {
    valid: result.minRadius >= minBendRadius,
    minRadius: result.minRadius,
    minIndex: result.minIndex
  };
}

function findRouteBlockPoint(routePoints, mesh) {
  if (!mesh || routePoints.length < 3) return null;

  // Skip start/end samples because they are intentionally on the surface.
  for (let i = 1; i < routePoints.length - 1; i += 1) {
    if (isPointInsideMesh(routePoints[i], mesh)) {
      return routePoints[i].clone();
    }
  }

  return null;
}

function updateRouteMeasurement(options = {}) {
  const runBlockedCheck = options.runBlockedCheck ?? true;

  if (getActiveRoute() && startPoint && endPoint) {
    syncLockedExitBendWorldPositionsEditorFromFittings();
  }

  if (measurementLine) {
    scene.remove(measurementLine);
    disposeRouteObject(measurementLine);
    measurementLine = null;
  }
  if (measurementGlow) {
    scene.remove(measurementGlow);
    disposeRouteObject(measurementGlow);
    measurementGlow = null;
  }

  const controlPoints = buildRouteControlPoints();
  const routePoints = buildRouteSamplePoints(controlPoints);
  if (controlPoints.length < 2 || routePoints.length < 2) return;
  const activeRoute = getActiveRoute();
  const minBendRadius = activeRoute?.minBendRadius ?? HOSE_OPTIONS[0].minBendRadius;
  const bendCheck = routeRespectsMinBendRadius(controlPoints, minBendRadius);

  if (runBlockedCheck) {
    routeBlockPoint = currentMesh ? findRouteBlockPoint(routePoints, currentMesh) : null;
    isRouteBlocked = !!routeBlockPoint;
    pendingBlockedCheck = false;
  } else {
    pendingBlockedCheck = true;
    routeBlockPoint = null;
  }

  measurementLine = createRouteTubeMesh(
    controlPoints,
    routePoints,
    runBlockedCheck ? (isRouteBlocked ? 0xef4444 : 0x22c55e) : 0xf59e0b,
    getActiveRoute()?.hoseRadius ?? HOSE_OPTIONS[0].hoseRadius
  );
  if (!measurementLine) return;
  measurementLine.userData = { routeId: activeRouteId };
  scene.add(measurementLine);
  measurementGlow = createRouteGlowMesh(
    controlPoints,
    routePoints,
    runBlockedCheck ? (isRouteBlocked ? 0xf87171 : 0x86efac) : 0xfde68a,
    getActiveRoute()?.hoseRadius ?? HOSE_OPTIONS[0].hoseRadius
  );
  if (measurementGlow) {
    measurementGlow.userData = { routeId: activeRouteId };
    scene.add(measurementGlow);
  }
  updateRouteBlockMarker();

  measurementDistance = computePathLength(routePoints);
  const midpointIndex = Math.floor(routePoints.length / 2);
  measurementMidpoint.copy(routePoints[midpointIndex]);
  measurementLabel.textContent = runBlockedCheck
    ? `${measurementDistance.toFixed(2)}in • ${isRouteBlocked ? "blocked" : "clear"}`
    : `${measurementDistance.toFixed(2)}in • checking...`;
  showMeasurement = true;
  if (runBlockedCheck) {
    setStatus(
      `Distance: ${measurementDistance.toFixed(3)} units | Route ${
        isRouteBlocked ? "blocked" : "clear"
      } | Bends: ${bendPoints.length} | MinR: ${
        Number.isFinite(bendCheck.minRadius) ? bendCheck.minRadius.toFixed(2) : "n/a"
      } / ${minBendRadius.toFixed(2)}.`
    );
  } else {
    setStatus(
      `Distance: ${measurementDistance.toFixed(3)} units | Bends: ${bendPoints.length} | checking route...`
    );
  }
  persistActiveRoute();
  if (runBlockedCheck) {
    refreshLineList();
  }
}

function isPointInsideMesh(point, mesh) {
  let insideVotes = 0;
  const offset = 0.001;

  for (const direction of insideTestDirections) {
    const origin = point.clone().addScaledVector(direction, offset);
    probeRaycaster.set(origin, direction);
    probeRaycaster.near = 0;
    probeRaycaster.far = Infinity;
    const intersections = probeRaycaster.intersectObject(mesh, false);
    if (intersections.length % 2 === 1) {
      insideVotes += 1;
    }
  }

  return insideVotes >= 2;
}

function getPointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function distanceToSegmentSquared(point, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(point, a);
  const denom = ab.lengthSq();
  if (denom === 0) return point.distanceToSquared(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / denom));
  const closest = a.clone().addScaledVector(ab, t);
  return point.distanceToSquared(closest);
}

function insertBendPointAtClosestSegment(pointOnLine) {
  const controlPoints = buildRouteControlPoints();
  if (controlPoints.length < 2) return;
  const route = getActiveRoute();

  let closestSegmentIndex = 0;
  let closestDistanceSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < controlPoints.length - 1; i += 1) {
    if (route?.lockedBendLeadIn && i === 0) continue;
    if (route?.lockedBendLeadOut && i === controlPoints.length - 2) continue;
    const distanceSq = distanceToSegmentSquared(pointOnLine, controlPoints[i], controlPoints[i + 1]);
    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closestSegmentIndex = i;
    }
  }

  if (closestDistanceSq === Number.POSITIVE_INFINITY) return;

  bendPoints.splice(closestSegmentIndex, 0, pointOnLine.clone());
}

function canApplyRouteShape(candidateStart, candidateEnd, candidateBends) {
  if (!candidateStart || !candidateEnd) return { valid: true, minRadius: Infinity };
  const candidateControlPoints = [candidateStart, ...candidateBends, candidateEnd];
  const activeRoute = getActiveRoute();
  const minBendRadius = activeRoute?.minBendRadius ?? HOSE_OPTIONS[0].minBendRadius;
  return routeRespectsMinBendRadius(candidateControlPoints, minBendRadius);
}

function pickPointOnModel(event) {
  if (!currentMesh) return;
  if (lineTypePanelOpen) return;
  if (contextMenuOpen) return;
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }

  getPointerFromEvent(event);
  pickRaycaster.setFromCamera(pointer, camera);
  pickRaycaster.near = 0;
  pickRaycaster.far = Infinity;

  const fittingHits = fittings.length > 0 ? pickRaycaster.intersectObjects(fittingGroup.children, true) : [];
  const connectorHit = fittingHits.find((hit) => hit.object.userData?.type === "fittingConnector");
  if (connectorHit) {
    const fittingMesh = connectorHit.object.parent;
    const fittingId = fittingMesh?.userData?.fittingId;
    const pickedConnectorIndex = connectorHit.object.userData?.connectorIndex ?? 0;
    const fitting = getFittingById(fittingId);
    if (fitting && getActiveRoute()) {
      const connectorIndex = getOppositeConnectorIndex(pickedConnectorIndex);
      const snapPoint = getFittingConnectorWorldPosition(fitting, connectorIndex);
      if (!startPoint) {
        pushUndoState();
        startPoint = snapPoint;
        startAttachment = { fittingId: fitting.id, connectorIndex };
        setSelectedPoint(null, -1);
        if (endPoint) {
          ensureAttachmentExitBendsInEditor();
        }
        rebuildMarkers();
        if (endPoint) {
          updateRouteMeasurement();
        }
        setStatus("Start point attached to fitting connector.");
        return;
      }
      if (!endPoint) {
        pushUndoState();
        endPoint = snapPoint;
        endAttachment = { fittingId: fitting.id, connectorIndex };
        setSelectedPoint(null, -1);
        ensureAttachmentExitBendsInEditor();
        rebuildMarkers();
        updateRouteMeasurement();
        setStatus("End point attached to fitting connector.");
        return;
      }
      selectFitting(fitting.id);
      setStatus(`${fitting.name} connector selected.`);
      return;
    }
  }

  const fittingMeshHit = fittingHits.find((hit) => hit.object.userData?.type === "fittingMesh");
  if (fittingMeshHit) {
    const fittingId = fittingMeshHit.object.userData?.fittingId;
    if (fittingId) {
      const fitting = getFittingById(fittingId);
      if (fitting && getActiveRoute() && (!startPoint || !endPoint)) {
        const nearest = getNearestFittingConnectorFromWorldPoint(fitting, fittingMeshHit.point);
        if (nearest) {
          const connectorIndex = getOppositeConnectorIndex(nearest.connectorIndex);
          const snapPoint = getFittingConnectorWorldPosition(fitting, connectorIndex);
          if (!snapPoint) return;
          if (!startPoint) {
            pushUndoState();
            startPoint = snapPoint;
            startAttachment = { fittingId: fitting.id, connectorIndex };
            setSelectedPoint(null, -1);
            if (endPoint) {
              ensureAttachmentExitBendsInEditor();
            }
            rebuildMarkers();
            if (endPoint) {
              updateRouteMeasurement();
            }
            setStatus("Start point attached to fitting (nearest connector).");
            return;
          }
          if (!endPoint) {
            pushUndoState();
            endPoint = snapPoint;
            endAttachment = { fittingId: fitting.id, connectorIndex };
            setSelectedPoint(null, -1);
            ensureAttachmentExitBendsInEditor();
            rebuildMarkers();
            updateRouteMeasurement();
            setStatus("End point attached to fitting (nearest connector).");
            return;
          }
        }
      }
      selectFitting(fittingId);
      setStatus(`${getFittingById(fittingId)?.name ?? "Fitting"} selected.`);
      return;
    }
  }

  const lineCandidates = [];
  if (measurementLine) lineCandidates.push(measurementLine);
  if (routeGroup.children.length > 0) lineCandidates.push(...routeGroup.children);
  const routeLineHits = lineCandidates.length > 0 ? pickRaycaster.intersectObjects(lineCandidates, false) : [];
  if (routeLineHits.length > 0) {
    const clickedRouteId = routeLineHits[0].object.userData?.routeId ?? null;
    if (clickedRouteId && clickedRouteId !== activeRouteId) {
      activateRoute(clickedRouteId);
      const clickedRoute = getActiveRoute();
      setStatus(`${clickedRoute?.name ?? "Line"} selected.`);
      return;
    }
  }

  const markerHits = pickRaycaster.intersectObjects(measurementMarkers, false);
  if (markerHits.length > 0) {
    const marker = markerHits[0].object;
    const markerType = marker.userData?.type ?? null;
    const markerBendIndex = marker.userData?.bendIndex ?? -1;
    clearFittingSelection();
    setSelectedPoint(markerType, markerType === "bend" ? markerBendIndex : -1);
    rebuildMarkers();
    setStatus(`Selected ${markerType} point. Press Delete/Backspace to remove.`);
    return;
  }

  if (!getActiveRoute()) {
    setStatus("No line selected. Click a line in the view or Objects panel.");
    return;
  }

  if (!startPoint) {
    const intersections = pickRaycaster.intersectObject(currentMesh, false);
    if (intersections.length === 0) {
      deactivateActiveRoute();
      return;
    }

    pushUndoState();
    const pickedPoint = intersections[0].point.clone();
    setSelectedPoint(null, -1);
    startPoint = pickedPoint;
    startAttachment = null;
    if (endPoint) {
      ensureAttachmentExitBendsInEditor();
    }
    rebuildMarkers();
    if (endPoint) {
      updateRouteMeasurement();
    }
    setStatus("Point 1 selected. Click another point to measure distance.");
    return;
  }

  if (!endPoint) {
    const intersections = pickRaycaster.intersectObject(currentMesh, false);
    if (intersections.length === 0) {
      deactivateActiveRoute();
      return;
    }

    pushUndoState();
    const pickedPoint = intersections[0].point.clone();
    setSelectedPoint(null, -1);
    endPoint = pickedPoint;
    endAttachment = null;
    ensureAttachmentExitBendsInEditor();
    rebuildMarkers();
    updateRouteMeasurement();
    setStatus("Route created. Click the route line to add bend points. Drag yellow points to move them.");
    return;
  }

  if (!measurementLine) {
    setStatus("Click the route line to add a bend point.");
    return;
  }

  pickRaycaster.setFromCamera(pointer, camera);
  pickRaycaster.near = 0;
  pickRaycaster.far = Infinity;
  const lineHits = pickRaycaster.intersectObject(measurementLine, false);
  if (lineHits.length === 0) {
    const meshHits = pickRaycaster.intersectObject(currentMesh, false);
    if (meshHits.length === 0) {
      deactivateActiveRoute();
      return;
    }
    setStatus("Click directly on the route line to add a bend point.");
    return;
  }

  pushUndoState();
  setSelectedPoint(null, -1);
  const originalBends = bendPoints.map((point) => point.clone());
  insertBendPointAtClosestSegment(lineHits[0].point.clone());
  const bendLockCheck = canApplyRouteShape(startPoint, endPoint, bendPoints);
  if (!bendLockCheck.valid) {
    const minBendRadius = getActiveRoute()?.minBendRadius ?? HOSE_OPTIONS[0].minBendRadius;
    bendPoints.length = 0;
    bendPoints.push(...originalBends);
    setStatus(
      `Minimum bend radius is ${minBendRadius.toFixed(2)}. Change rejected (current: ${bendLockCheck.minRadius.toFixed(
        2
      )}).`
    );
    return;
  }
  rebuildMarkers();
  updateRouteMeasurement();
}

function startBendDrag(event) {
  if (!currentMesh) return;
  if (lineTypePanelOpen) return;
  if (event.button !== 0) return;
  getPointerFromEvent(event);
  pickRaycaster.setFromCamera(pointer, camera);
  pickRaycaster.near = 0;
  pickRaycaster.far = Infinity;
  const markerHits = pickRaycaster.intersectObjects(measurementMarkers, false);
  if (markerHits.length === 0) return;

  const markerType = markerHits[0].object.userData?.type;
  if (markerType !== "bend" && markerType !== "start" && markerType !== "end") return;

  const bendIdx = markerHits[0].object.userData?.bendIndex ?? -1;
  if (markerType === "bend" && isBendIndexLocked(bendIdx)) {
    return;
  }

  pushUndoState();
  isDraggingBendPoint = true;
  draggedPointType = markerType;
  draggedBendIndex = markerType === "bend" ? markerHits[0].object.userData.bendIndex : -1;
  setSelectedPoint(draggedPointType, draggedBendIndex);
  const dragAnchor =
    markerType === "start" ? startPoint : markerType === "end" ? endPoint : bendPoints[draggedBendIndex];
  const dragNormal = camera.getWorldDirection(new THREE.Vector3()).normalize();
  bendDragPlane.setFromNormalAndCoplanarPoint(dragNormal, dragAnchor);
  suppressNextClick = true;
  controls.enabled = false;
}

function dragBendPoint(event) {
  if (!isDraggingBendPoint || !draggedPointType) return;
  getPointerFromEvent(event);
  pickRaycaster.setFromCamera(pointer, camera);
  pickRaycaster.near = 0;
  pickRaycaster.far = Infinity;
  const hit = pickRaycaster.ray.intersectPlane(bendDragPlane, bendDragIntersection);
  if (!hit) return;

  if (draggedPointType === "start") {
    const candidateStart = bendDragIntersection.clone();
    const snap = snapWorldPointToFittingConnectors(candidateStart);
    let snappedStart = candidateStart;
    let nextStartAttachment = null;
    if (snap) {
      const fitting = getFittingById(snap.fittingId);
      const connectorIndex = getOppositeConnectorIndex(snap.connectorIndex);
      const rearSnapPoint = getFittingConnectorWorldPosition(fitting, connectorIndex);
      if (rearSnapPoint) {
        snappedStart = rearSnapPoint;
        nextStartAttachment = { fittingId: snap.fittingId, connectorIndex };
      }
    }
    syncLockedExitBendWorldPositionsEditorFromFittings();
    const routeForCheck = getActiveRoute();
    let bendsForCheck = bendPoints.map((p) => p.clone());
    if (routeForCheck?.lockedBendLeadIn && !nextStartAttachment) {
      bendsForCheck.shift();
    }
    const bendLockCheck = canApplyRouteShape(snappedStart, endPoint, bendsForCheck);
    if (!bendLockCheck.valid) return;
    startPoint = snappedStart;
    startAttachment = nextStartAttachment;
  } else if (draggedPointType === "end") {
    const candidateEnd = bendDragIntersection.clone();
    const snap = snapWorldPointToFittingConnectors(candidateEnd);
    let snappedEnd = candidateEnd;
    let nextEndAttachment = null;
    if (snap) {
      const fitting = getFittingById(snap.fittingId);
      const connectorIndex = getOppositeConnectorIndex(snap.connectorIndex);
      const rearSnapPoint = getFittingConnectorWorldPosition(fitting, connectorIndex);
      if (rearSnapPoint) {
        snappedEnd = rearSnapPoint;
        nextEndAttachment = { fittingId: snap.fittingId, connectorIndex };
      }
    }
    syncLockedExitBendWorldPositionsEditorFromFittings();
    const routeForCheckEnd = getActiveRoute();
    let bendsForCheckEnd = bendPoints.map((p) => p.clone());
    if (routeForCheckEnd?.lockedBendLeadOut && !nextEndAttachment) {
      bendsForCheckEnd.pop();
    }
    const bendLockCheck = canApplyRouteShape(startPoint, snappedEnd, bendsForCheckEnd);
    if (!bendLockCheck.valid) return;
    endPoint = snappedEnd;
    endAttachment = nextEndAttachment;
  } else if (draggedPointType === "bend" && draggedBendIndex >= 0) {
    const nextBends = bendPoints.map((point) => point.clone());
    nextBends[draggedBendIndex] = bendDragIntersection.clone();
    const bendLockCheck = canApplyRouteShape(startPoint, endPoint, nextBends);
    if (!bendLockCheck.valid) return;
    bendPoints[draggedBendIndex] = bendDragIntersection.clone();
  }
  if (startPoint && endPoint) {
    ensureAttachmentExitBendsInEditor();
  }
  rebuildMarkers();
  updateRouteMeasurement({ runBlockedCheck: false });
  setStatus(`Dragging ${draggedPointType} point in free space.`);
}

function endBendDrag() {
  if (!isDraggingBendPoint) return;
  isDraggingBendPoint = false;
  draggedBendIndex = -1;
  draggedPointType = null;
  controls.enabled = true;
  if (pendingBlockedCheck) {
    updateRouteMeasurement({ runBlockedCheck: true });
  }
}

function startFittingDrag(event) {
  if (!currentMesh || fittings.length === 0 || lineTypePanelOpen || contextMenuOpen) return;
  if (event.button !== 0) return;
  getPointerFromEvent(event);
  pickRaycaster.setFromCamera(pointer, camera);
  pickRaycaster.near = 0;
  pickRaycaster.far = Infinity;
  const hits = pickRaycaster.intersectObjects(fittingGroup.children, true);
  if (hits.length === 0) return;

  const closest = hits[0];
  const closestType = closest.object.userData?.type;
  // Connector clicks are handled on `click` by pickPointOnModel (attach / select). Do not start a drag
  // or call selectFitting here — that was stealing the click via suppressNextClick.
  if (closestType === "fittingConnector") {
    return;
  }
  if (isActiveLineAwaitingEndpoints() && closestType === "fittingMesh") {
    return;
  }

  const meshHit = hits.find((hit) => hit.object.userData?.type === "fittingMesh");
  if (!meshHit) return;

  draggedFittingId = meshHit.object.userData.fittingId;
  selectFitting(draggedFittingId);
  isDraggingFitting = true;
  const dragNormal = camera.getWorldDirection(new THREE.Vector3()).normalize();
  fittingDragPlane.setFromNormalAndCoplanarPoint(dragNormal, meshHit.object.position);
  controls.enabled = false;
  suppressNextClick = true;
}

function dragFitting(event) {
  if (!isDraggingFitting || !draggedFittingId) return;
  const fitting = getFittingById(draggedFittingId);
  if (!fitting) return;
  getPointerFromEvent(event);
  pickRaycaster.setFromCamera(pointer, camera);
  pickRaycaster.near = 0;
  pickRaycaster.far = Infinity;
  const hit = pickRaycaster.ray.intersectPlane(fittingDragPlane, fittingDragIntersection);
  if (!hit) return;
  fitting.mesh.position.copy(fittingDragIntersection);
  updateAttachedRouteEndpoints();
  if (activeRouteId) {
    loadRouteIntoEditor(getActiveRoute());
  } else {
    rebuildInactiveRouteLines();
  }
}

function endFittingDrag() {
  if (!isDraggingFitting) return;
  isDraggingFitting = false;
  draggedFittingId = null;
  controls.enabled = true;
  persistActiveRoute();
  refreshLineList();
  rebuildInactiveRouteLines();
}

function startFittingRotate(event) {
  if (!currentMesh || fittings.length === 0 || lineTypePanelOpen || contextMenuOpen) return;
  if (event.button !== 2) return;
  if (!selectedFittingId) return;

  getPointerFromEvent(event);
  pickRaycaster.setFromCamera(pointer, camera);
  pickRaycaster.near = 0;
  pickRaycaster.far = Infinity;
  const hits = pickRaycaster.intersectObjects(fittingGroup.children, true);
  const meshHit = hits.find((hit) => hit.object.userData?.type === "fittingMesh");
  if (!meshHit) return;
  if (meshHit.object.userData?.fittingId !== selectedFittingId) return;

  isRotatingFitting = true;
  rotatingFittingId = selectedFittingId;
  rotateStartX = event.clientX;
  rotateStartY = event.clientY;
  rotateMoved = false;
  controls.enabled = false;
  event.preventDefault();
}

function rotateFitting(event) {
  if (!isRotatingFitting || !rotatingFittingId) return;
  const fitting = getFittingById(rotatingFittingId);
  if (!fitting) return;

  const dx = event.clientX - rotateStartX;
  const dy = event.clientY - rotateStartY;
  rotateStartX = event.clientX;
  rotateStartY = event.clientY;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) rotateMoved = true;

  fitting.mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dx * 0.01);
  fitting.mesh.rotateX(dy * 0.01);

  updateAttachedRouteEndpoints();
  if (activeRouteId) {
    loadRouteIntoEditor(getActiveRoute());
  } else {
    rebuildInactiveRouteLines();
  }
  setStatus(`Rotating ${fitting.name}.`);
  event.preventDefault();
}

function endFittingRotate(event) {
  if (!isRotatingFitting) return;
  isRotatingFitting = false;
  rotatingFittingId = null;
  controls.enabled = true;
  if (rotateMoved) {
    suppressContextMenuOnce = true;
    persistActiveRoute();
    refreshLineList();
    rebuildInactiveRouteLines();
  }
  if (event) event.preventDefault();
}

function frameModel(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  controls.target.copy(center);
  const distance = maxDim * 1.9 || 150;
  camera.position.set(center.x + distance, center.y + distance * 0.8, center.z + distance);
  camera.near = Math.max(distance / 500, 0.1);
  camera.far = Math.max(distance * 20, 1000);
  camera.updateProjectionMatrix();
  controls.update();
}

function clearModel() {
  actionHistory.length = 0;
  routes.length = 0;
  fittings.length = 0;
  activeRouteId = null;
  selectedFittingId = null;
  lineCounter = 1;
  fittingCounter = 1;
  for (const child of fittingGroup.children) {
    if (child.parent) child.parent.remove(child);
    disposeRouteObject(child);
  }
  fittingGroup.clear();
  refreshFittingList();
  clearMeasurement();
  if (!currentMesh) return;
  scene.remove(currentMesh);
  currentMesh.geometry.dispose();
  currentMesh.material.dispose();
  currentMesh = null;
}

function useLoadedGeometry(geometry, fileName) {
  if (!geometry || !geometry.attributes?.position || geometry.attributes.position.count === 0) {
    setStatus(`Invalid STL geometry: ${fileName}`);
    return;
  }

  clearModel();
  geometry.center();
  geometry.scale(IMPORT_STL_SCALE, IMPORT_STL_SCALE, IMPORT_STL_SCALE);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xa6a6a6,
    metalness: 0.18,
    roughness: 0.45,
    side: THREE.DoubleSide
  });

  currentMesh = new THREE.Mesh(geometry, material);
  currentMesh.rotation.copy(defaultImportRotation);
  scene.add(currentMesh);
  frameModel(currentMesh);
  routes.length = 0;
  activeRouteId = null;
  lineCounter = 1;
  refreshLineList();
  rebuildInactiveRouteLines();
  showLineTypePanel();
  setStatus(`Loaded: ${fileName}. Choose a hose type to create your first line.`);
  dropZone.classList.add("hidden");
}

function readAndLoadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith(".stl")) {
    setStatus("Please choose a .stl file.");
    return;
  }

  setStatus(`Reading ${file.name}...`);
  const blobUrl = URL.createObjectURL(file);
  loader.load(
    blobUrl,
    (geometry) => {
      URL.revokeObjectURL(blobUrl);
      useLoadedGeometry(geometry, file.name);
    },
    undefined,
    (error) => {
      URL.revokeObjectURL(blobUrl);
      setStatus(`Could not load STL file: ${file.name}`);
      console.error(error);
    }
  );
}

inputElement.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  readAndLoadFile(file);
  // Allow loading the same file repeatedly after edits.
  event.target.value = "";
});

if (openFileButton) {
  openFileButton.addEventListener("click", () => {
    inputElement.click();
  });
}

resetViewButton.addEventListener("click", () => {
  if (currentMesh) {
    frameModel(currentMesh);
    setStatus("View reset.");
  }
});

clearMeasureButton.addEventListener("click", () => {
  if (startPoint || endPoint || bendPoints.length > 0) {
    pushUndoState();
  }
  resetMeasurementForNewLine();
  persistActiveRoute();
  refreshLineList();
  rebuildInactiveRouteLines();
});

newLineButton.addEventListener("click", () => {
  if (!currentMesh) {
    setStatus("Load an STL first.");
    return;
  }
  showLineTypePanel();
});

addFittingButton.addEventListener("click", () => {
  addFittingInstance();
});

contextNewLineButton.addEventListener("click", () => {
  hideContextMenu();
  if (!currentMesh) {
    setStatus("Load an STL first.");
    return;
  }
  showLineTypePanel();
});

contextDeleteLineButton.addEventListener("click", () => {
  hideContextMenu();
  deleteActiveRoute();
});

lineTypeCancelButton.addEventListener("click", () => {
  hideLineTypePanel();
});

lineTypePanel.addEventListener("pointerdown", (event) => {
  if (event.target === lineTypePanel) {
    hideLineTypePanel();
  }
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

window.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const file = event.dataTransfer?.files?.[0];
  readAndLoadFile(file);
});

renderer.domElement.addEventListener("click", pickPointOnModel);
renderer.domElement.addEventListener("pointerdown", startFittingRotate);
renderer.domElement.addEventListener("pointerdown", startFittingDrag);
renderer.domElement.addEventListener("pointerdown", startBendDrag);
renderer.domElement.addEventListener("pointermove", rotateFitting);
renderer.domElement.addEventListener("pointermove", dragFitting);
renderer.domElement.addEventListener("pointermove", dragBendPoint);
window.addEventListener("pointerup", endFittingRotate);
window.addEventListener("pointerup", endFittingDrag);
window.addEventListener("pointerup", endBendDrag);
renderer.domElement.addEventListener("contextmenu", (event) => {
  if (isRotatingFitting || suppressContextMenuOnce) {
    event.preventDefault();
    suppressContextMenuOnce = false;
    return;
  }
  event.preventDefault();
  showContextMenu(event.clientX, event.clientY);
});

window.addEventListener("pointerdown", (event) => {
  if (!contextMenuOpen) return;
  if (event.target === contextMenu || contextMenu.contains(event.target)) return;
  hideContextMenu();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lineTypePanelOpen) {
    hideLineTypePanel();
    return;
  }

  if (event.key === "Escape" && contextMenuOpen) {
    hideContextMenu();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastAction();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelectedPoint();
    return;
  }

  if (event.key === "Escape") {
    deactivateActiveRoute();
    return;
  }
});

window.addEventListener("error", (event) => {
  if (event.message) {
    setStatus(`Runtime error: ${event.message}`);
  }
});

window.addEventListener("resize", () => {
  const width = viewerElement.clientWidth;
  const height = viewerElement.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateMeasurementLabelPosition();
  renderer.render(scene, camera);
}

animate();
setStatus("Viewer ready. Click Open STL or use the file input.");
