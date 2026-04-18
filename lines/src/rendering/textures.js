import * as THREE from "https://esm.sh/three@0.164.1";

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

  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  for (let i = -height; i < width + height; i += 8) {
    ctx.strokeStyle = "#3a3b3d";
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }
  for (let i = -height; i < width + height; i += 8) {
    ctx.strokeStyle = "#3a3b3d";
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

export { circleIconTexture, xIconTexture, braidedHoseTexture };
