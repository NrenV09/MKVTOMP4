import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const targets = [
  {
    src: path.join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm'),
    dest: path.join(root, 'public', 'ffmpeg', 'core'),
  },
  {
    src: path.join(root, 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'esm'),
    dest: path.join(root, 'public', 'ffmpeg', 'core-mt'),
  },
];

for (const { src, dest } of targets) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    console.log(`Copied ffmpeg assets from ${src} to ${dest}`);
  } else {
    console.warn(`Source path not found: ${src}`);
  }
}
