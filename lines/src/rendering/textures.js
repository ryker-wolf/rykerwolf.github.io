import * as THREE from "https://esm.sh/three@0.164.1";
import { HOSE_TEXTURE_MAX_DIMENSION, HOSE_TEXTURE_ANISOTROPY } from "../config/constants.js";

function downscaleTextureImage(texture, maxDimension) {
  const img = texture.image;
  if (!img || !(img.width > 0) || !(img.height > 0)) return;
  const max = Math.max(img.width, img.height);
  if (max <= maxDimension) return;
  const scale = maxDimension / max;
  const w = Math.max(1, Math.floor(img.width * scale));
  const h = Math.max(1, Math.floor(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0, w, h);
  texture.image = canvas;
}

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

const textureLoader = new THREE.TextureLoader();
const braidedHoseTexture = textureLoader.load("./textures/braided_nylon.jpg", (tex) => {
  downscaleTextureImage(tex, HOSE_TEXTURE_MAX_DIMENSION);
  tex.needsUpdate = true;
});
braidedHoseTexture.wrapS = THREE.RepeatWrapping;
braidedHoseTexture.wrapT = THREE.RepeatWrapping;
braidedHoseTexture.repeat.set(1, 1);
braidedHoseTexture.anisotropy = HOSE_TEXTURE_ANISOTROPY;
braidedHoseTexture.colorSpace = THREE.SRGBColorSpace;

export { circleIconTexture, xIconTexture, braidedHoseTexture };
