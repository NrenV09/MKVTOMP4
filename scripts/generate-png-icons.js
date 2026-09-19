import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, drawFn) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width(4), height(4), bitDepth(1), colorType(6=RGBA), comp(0), filter(0), interlace(0)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Scanlines: (1 byte filter (0) + width * 4 bytes RGBA) per row
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function drawBrandIcon(isMaskable) {
  return (x, y, w, h) => {
    const nx = x / w; // 0..1
    const ny = y / h; // 0..1
    const cx = 0.5;
    const cy = 0.5;
    const dx = nx - cx;
    const dy = ny - cy;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

    // Dark background gradient
    let bgR = Math.round(24 - ny * 15);
    let bgG = Math.round(24 - ny * 15);
    let bgB = Math.round(27 - ny * 16);

    // If not maskable, round corners with squircle or rounded rect
    if (!isMaskable) {
      const cornerRadius = 0.22;
      const qx = Math.max(Math.abs(dx) - (0.5 - cornerRadius), 0);
      const qy = Math.max(Math.abs(dy) - (0.5 - cornerRadius), 0);
      const outsideCorner = Math.sqrt(qx * qx + qy * qy);
      if (outsideCorner > cornerRadius) {
        return [0, 0, 0, 0]; // Transparent outside icon border
      }
    }

    // Inside icon graphics: safe zone center
    const scale = isMaskable ? 0.72 : 0.88;
    const sx = (nx - 0.5) / scale + 0.5;
    const sy = (ny - 0.5) / scale + 0.5;

    // Draw central play/convert badge
    // 1. Central box
    const inBox = (sx >= 0.22 && sx <= 0.78 && sy >= 0.22 && sy <= 0.78);
    const boxDx = Math.max(Math.abs(sx - 0.5) - 0.24, 0);
    const boxDy = Math.max(Math.abs(sy - 0.5) - 0.24, 0);
    const boxCorner = Math.sqrt(boxDx * boxDx + boxDy * boxDy);

    if (boxCorner < 0.05) {
      // Inside rounded card: darker slate
      let r = 18, g = 18, b = 21;

      // Draw Orbit Arc around center
      const cdx = sx - 0.5;
      const cdy = sy - 0.46;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy);

      // Emerald ring arc
      if (cdist >= 0.14 && cdist <= 0.17) {
        return [16, 185, 129, 255]; // Emerald
      }

      // Center triangle (Play / Convert arrow)
      // Triangle vertices: (0.45, 0.38), (0.58, 0.46), (0.45, 0.54)
      if (sx >= 0.45 && sx <= 0.58) {
        const tProgress = (sx - 0.45) / (0.58 - 0.45);
        const topY = 0.38 + tProgress * 0.08;
        const botY = 0.54 - tProgress * 0.08;
        if (sy >= topY && sy <= botY) {
          return [52, 211, 153, 255]; // Bright Emerald
        }
      }

      // Bottom pill badge: MKV -> MP4
      if (sy >= 0.64 && sy <= 0.73 && sx >= 0.30 && sx <= 0.70) {
        return [16, 185, 129, 240];
      }

      return [r, g, b, 255];
    }

    return [bgR, bgG, bgB, 255];
  };
}

const publicDir = path.join(process.cwd(), 'public');

console.log('Generating PWA icons in public directory...');

const icon192 = createPng(192, 192, drawBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);

const icon512 = createPng(512, 512, drawBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);

const iconMaskable = createPng(512, 512, drawBrandIcon(true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), iconMaskable);

const appleIcon = createPng(180, 180, drawBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);

// Favicon fallback
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icon192);

console.log('Successfully generated all PWA icons:');
console.log('- public/pwa-192x192.png');
console.log('- public/pwa-512x512.png');
console.log('- public/pwa-maskable-512x512.png');
console.log('- public/apple-touch-icon.png');
console.log('- public/favicon.ico');
