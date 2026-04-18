import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";

export function createSceneContext(viewerElement) {
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
  pickRaycaster.params.Line.threshold = 4;
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

  return {
    scene,
    camera,
    renderer,
    controls,
    defaultImportRotation,
    pickRaycaster,
    probeRaycaster,
    pointer,
    insideTestDirections,
    routeGroup,
    fittingGroup
  };
}
