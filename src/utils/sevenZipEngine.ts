import SevenZip, { SevenZipModule } from '7z-wasm';
import { ExtractedArchiveItem, guessMimeType, getPreviewType } from './archiveEngine';

let cachedSevenZipModule: any = null;

/**
 * Initialize or get 7z-wasm WebAssembly instance
 */
export async function getSevenZipModule(onLog?: (line: string) => void): Promise<SevenZipModule> {
  // Fresh module instance per major invocation prevents MEMFS collisions
  return await SevenZip({
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        return '/7z/7zz.wasm';
      }
      return path;
    },
    print: (line: string) => {
      if (onLog) onLog(line);
    },
    printErr: (line: string) => {
      console.warn('[7z-wasm:err]', line);
    },
  });
}

/**
 * Clean up files in an Emscripten FS directory recursively
 */
function cleanupFSDir(FS: any, dirPath: string) {
  try {
    const entries = FS.readdir(dirPath).filter((e: string) => e !== '.' && e !== '..');
    for (const entry of entries) {
      const fullPath = dirPath === '/' ? `/${entry}` : `${dirPath}/${entry}`;
      try {
        const stat = FS.stat(fullPath);
        if (FS.isDir(stat.mode)) {
          cleanupFSDir(FS, fullPath);
          FS.rmdir(fullPath);
        } else {
          FS.unlink(fullPath);
        }
      } catch {
        // ignore individual unlink error
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Recursively collect files from an FS directory
 */
function collectExtractedFiles(FS: any, dirPath: string, prefix = ''): { relPath: string; data: Uint8Array }[] {
  const results: { relPath: string; data: Uint8Array }[] = [];
  const entries = FS.readdir(dirPath).filter((e: string) => e !== '.' && e !== '..');

  for (const entry of entries) {
    const fullPath = dirPath === '/' ? `/${entry}` : `${dirPath}/${entry}`;
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    const stat = FS.stat(fullPath);

    if (FS.isDir(stat.mode)) {
      results.push(...collectExtractedFiles(FS, fullPath, relPath));
    } else if (FS.isFile(stat.mode)) {
      const data = FS.readFile(fullPath);
      // Copy array buffer to ensure safe detached ownership
      const safeData = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      results.push({ relPath, data: safeData });
    }
  }

  return results;
}

/**
 * Compress multiple files into a .7z archive using LZMA2/7-Zip WASM
 */
export async function create7zArchive(
  files: { name: string; data: Uint8Array; mtime?: number }[],
  level: number, // 0 to 9
  onProgress?: (percent: number, status: string) => void
): Promise<Uint8Array> {
  onProgress?.(35, 'Initializing 7-Zip WebAssembly core...');
  const sevenZip = await getSevenZipModule((line) => {
    if (line.includes('%')) {
      const match = line.match(/(\d+)%/);
      if (match) {
        const pct = parseInt(match[1], 10);
        onProgress?.(40 + Math.floor(pct * 0.5), `7-Zip LZMA2 compressing (${pct}%)...`);
      }
    }
  });

  const FS = sevenZip.FS;
  const inDir = `/in_${Date.now()}`;
  const outArchive = `/output_${Date.now()}.7z`;

  try {
    FS.mkdir(inDir);
    onProgress?.(40, 'Writing staged files into 7-Zip memory filesystem...');

    const fileNames: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const targetPath = `${inDir}/${f.name}`;
      // Ensure nested directories inside inDir if file has relative path
      const parts = f.name.split('/');
      if (parts.length > 1) {
        let cur = inDir;
        for (let p = 0; p < parts.length - 1; p++) {
          cur = `${cur}/${parts[p]}`;
          try {
            FS.mkdir(cur);
          } catch {
            // already exists
          }
        }
      }

      FS.writeFile(targetPath, f.data);
      fileNames.push(f.name);
      onProgress?.(
        40 + Math.floor(((i + 1) / files.length) * 15),
        `Prepared ${f.name} for 7-Zip engine`
      );
    }

    onProgress?.(55, `Running 7-Zip LZMA2 compression (Level: ${level})...`);

    // Change directory to inDir so archive stores relative names
    FS.chdir(inDir);

    // Build 7z CLI arguments
    // 'a' = add
    // '-t7z' = 7z format
    // '-mx=N' = compression level (0, 1, 4, 6, 9)
    // '-m0=lzma2' = LZMA2 compression
    // '-ms=on' = solid archive for maximum ratio
    // '-y' = assume yes
    const args = [
      'a',
      '-t7z',
      `-mx=${level}`,
      '-m0=lzma2',
      '-ms=on',
      '-y',
      outArchive,
      '*',
    ];

    sevenZip.callMain(args);

    onProgress?.(90, 'Extracting compressed 7z payload...');
    const outBytes = FS.readFile(outArchive);
    // Clone Uint8Array so memory isn't tied to MEMFS
    const finalBuffer = new Uint8Array(
      outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength)
    );

    return finalBuffer;
  } finally {
    // Cleanup MEMFS
    try {
      cleanupFSDir(FS, inDir);
      FS.rmdir(inDir);
    } catch {
      // ignore
    }
    try {
      FS.unlink(outArchive);
    } catch {
      // ignore
    }
  }
}

/**
 * Extract an archive (.7z, .rar, etc.) using 7-Zip WASM
 */
export async function extractWithSevenZip(
  archiveBytes: Uint8Array,
  ext: string,
  password?: string,
  onProgress?: (percent: number, status: string) => void
): Promise<ExtractedArchiveItem[]> {
  onProgress?.(25, 'Spinning up 7-Zip WebAssembly extraction engine...');
  const sevenZip = await getSevenZipModule((line) => {
    if (line.includes('%')) {
      const match = line.match(/(\d+)%/);
      if (match) {
        const pct = parseInt(match[1], 10);
        onProgress?.(30 + Math.floor(pct * 0.5), `Unpacking archive (${pct}%)...`);
      }
    }
  });

  const FS = sevenZip.FS;
  const session = Date.now();
  const archivePath = `/input_${session}.${ext.replace(/^\./, '')}`;
  const outDir = `/out_${session}`;

  try {
    onProgress?.(30, 'Mounting archive buffer in memory...');
    FS.writeFile(archivePath, archiveBytes);
    FS.mkdir(outDir);

    onProgress?.(45, 'Executing 7-Zip extraction command...');
    // 'x' = extract with full paths
    // '-o<dir>' = output directory (no space after -o)
    // '-y' = assume Yes on all queries
    // '-p<pass>' = password if provided
    const args = ['x', archivePath, `-o${outDir}`, '-y'];
    if (password) {
      args.push(`-p${password}`);
    }

    sevenZip.callMain(args);

    onProgress?.(75, 'Reading extracted files from virtual filesystem...');
    const extractedList = collectExtractedFiles(FS, outDir);

    if (extractedList.length === 0) {
      throw new Error(
        password
          ? 'Extraction produced no files. Password may be incorrect or archive is corrupt.'
          : 'Extraction produced no files. The archive may be encrypted or corrupted.'
      );
    }

    const items: ExtractedArchiveItem[] = [];
    for (let i = 0; i < extractedList.length; i++) {
      const file = extractedList[i];
      const name = file.relPath.split('/').filter(Boolean).pop() || file.relPath;
      const mime = guessMimeType(name);
      const preview = getPreviewType(name);
      const blob = new Blob([file.data], { type: mime });

      items.push({
        id: `7z-item-${i}-${Date.now()}`,
        path: file.relPath,
        name,
        size: file.data.length,
        isDir: false,
        lastModified: new Date(),
        mimeType: mime,
        data: file.data,
        url: URL.createObjectURL(blob),
        previewType: preview,
      });
    }

    return items;
  } finally {
    // Cleanup
    try {
      cleanupFSDir(FS, outDir);
      FS.rmdir(outDir);
    } catch {
      // ignore
    }
    try {
      FS.unlink(archivePath);
    } catch {
      // ignore
    }
  }
}
