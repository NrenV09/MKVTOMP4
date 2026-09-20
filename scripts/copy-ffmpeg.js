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
  {
    src: path.join(root, 'node_modules', '7z-wasm', '7zz.wasm'),
    dest: path.join(root, 'public', '7z', '7zz.wasm'),
    isFile: true,
  },
  {
    src: path.join(root, 'node_modules', 'node-unrar-js', 'dist', 'js', 'unrar.wasm'),
    dest: path.join(root, 'public', 'rar', 'unrar.wasm'),
    isFile: true,
  },
  {
    src: path.join(root, 'node_modules', '@bitplane', 'rars', 'browser', 'wasm', 'rars_wasm_bg.wasm'),
    dest: path.join(root, 'public', 'rars', 'rars_wasm_bg.wasm'),
    isFile: true,
  },
  {
    src: path.join(root, 'node_modules', '@bitplane', 'rars', 'browser', 'wasm', 'rars_wasm_bg.wasm'),
    dest: path.join(root, 'public', 'rars_wasm_bg.wasm'),
    isFile: true,
  },
];

for (const { src, dest, isFile } of targets) {
  if (fs.existsSync(src)) {
    if (isFile) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`Copied wasm binary from ${src} to ${dest}`);
    } else {
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      console.log(`Copied directory assets from ${src} to ${dest}`);
    }
  } else {
    console.warn(`Source path not found: ${src}`);
  }
}
