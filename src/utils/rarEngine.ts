import { createExtractorFromData } from 'node-unrar-js';
import { ExtractedArchiveItem, guessMimeType, getPreviewType } from './archiveEngine';
import { extractWithSevenZip } from './sevenZipEngine';

let cachedUnrarWasmBinary: ArrayBuffer | null = null;

async function getUnrarWasmBinary(): Promise<ArrayBuffer> {
  if (cachedUnrarWasmBinary) {
    return cachedUnrarWasmBinary;
  }
  const response = await fetch('/rar/unrar.wasm');
  if (!response.ok) {
    throw new Error(`Failed to load unrar WebAssembly binary: HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  cachedUnrarWasmBinary = buffer;
  return buffer;
}

/**
 * Extract RAR archive (supporting RAR v1.5, v2, v3, v4, and modern RAR5)
 */
export async function extractRarArchive(
  archiveBytes: Uint8Array,
  password?: string,
  onProgress?: (percent: number, status: string) => void
): Promise<ExtractedArchiveItem[]> {
  onProgress?.(20, 'Loading UnRAR WebAssembly module...');

  try {
    const wasmBinary = await getUnrarWasmBinary();
    onProgress?.(35, 'Initializing official UnRAR 6.x engine...');

    const bufferCopy = new Uint8Array(archiveBytes.byteLength);
    bufferCopy.set(archiveBytes);
    const arrayBuffer = bufferCopy.buffer as ArrayBuffer;

    const extractor = await createExtractorFromData({
      data: arrayBuffer,
      wasmBinary,
      password: password || '',
    });

    onProgress?.(50, 'Extracting records from RAR archive...');
    const extracted = extractor.extract({
      password: password || '',
    });

    const items: ExtractedArchiveItem[] = [];
    let idx = 0;

    for (const file of extracted.files) {
      // Check if item is a file with extraction payload
      if (!file.fileHeader.flags.directory && file.extraction) {
        idx++;
        const filePath = file.fileHeader.name.replace(/\\/g, '/').replace(/^\/+/, '');
        const fileName = filePath.split('/').filter(Boolean).pop() || filePath;
        const mime = guessMimeType(fileName);
        const preview = getPreviewType(fileName);
        const u8Data = file.extraction;
        const blob = new Blob([u8Data], { type: mime });

        items.push({
          id: `rar-item-${idx}-${Date.now()}`,
          path: filePath,
          name: fileName,
          size: file.fileHeader.unpSize || u8Data.length,
          compressedSize: file.fileHeader.packSize,
          isDir: false,
          lastModified: file.fileHeader.time ? new Date(file.fileHeader.time) : new Date(),
          mimeType: mime,
          data: u8Data,
          url: URL.createObjectURL(blob),
          previewType: preview,
        });

        onProgress?.(
          50 + Math.min(40, Math.floor(idx * 5)),
          `Extracted ${fileName} (${file.fileHeader.unpSize || u8Data.length} bytes)`
        );
      }
    }

    if (items.length > 0) {
      return items;
    }

    // If zero items were returned, throw to trigger fallback
    throw new Error('Zero files returned from primary UnRAR engine');
  } catch (err: any) {
    console.warn('Primary UnRAR engine notice:', err?.message, '- Trying 7-Zip fallback...');

    // If it's a missing password error, inform user clearly
    if (err?.message?.includes('ERAR_MISSING_PASSWORD') || err?.message?.includes('ERAR_BAD_PASSWORD')) {
      throw new Error(
        err?.message?.includes('ERAR_BAD_PASSWORD')
          ? 'Incorrect RAR password provided. Please check the password and try again.'
          : 'This RAR archive is password-protected. Please enter the archive password to extract.'
      );
    }

    // Fallback to 7-Zip engine which natively supports RAR4 and RAR5 extraction
    onProgress?.(40, 'Attempting RAR extraction via 7-Zip WASM core...');
    return await extractWithSevenZip(archiveBytes, 'rar', password, onProgress);
  }
}
