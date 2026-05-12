const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1C1C1E';
  ctx.fillRect(0, 0, size, size);

  // Rounded rect background accent
  const pad = size * 0.15;
  ctx.fillStyle = '#A8D5A2';
  ctx.beginPath();
  const r = size * 0.18;
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, r);
  ctx.fill();

  // Clock symbol
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.22;
  ctx.strokeStyle = '#1C1C1E';
  ctx.lineWidth = size * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Hour hand
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - radius * 0.55);
  ctx.stroke();

  // Minute hand
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * 0.45, cy);
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated ${outputPath}`);
}

generateIcon(192, './public/icon-192.png');
generateIcon(512, './public/icon-512.png');
