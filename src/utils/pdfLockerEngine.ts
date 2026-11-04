import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFString,
  PDFHexString,
  PDFRawStream,
  PDFNumber,
  PDFRef,
  PDFObject,
  StandardFonts,
  rgb,
  degrees,
} from 'pdf-lib';

// ISO 32000-1 Section 7.6.3.3 Standard 32-byte Encryption Padding String
const PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

export interface PdfPermissions {
  allowPrinting: boolean;
  allowHighResPrinting: boolean;
  allowModifying: boolean;
  allowCopying: boolean;
  allowAnnotating: boolean;
  allowFillingForms: boolean;
  allowAccessibility: boolean;
  allowAssembly: boolean;
}

export interface PdfLockOptions {
  userPassword: string;
  ownerPassword?: string;
  encryptionAlgorithm?: 'rc4-128' | 'aes-128';
  permissions: PdfPermissions;
  scrubMetadata: boolean;
  watermarkText?: string;
}

export interface PdfInspectionResult {
  fileName: string;
  fileSize: number;
  pageCount: number;
  isEncrypted: boolean;
  encryptionDetails?: {
    version: number;
    revision: number;
    keyLengthBits: number;
    cipher: string;
    permissionsMask: number;
    permissions: PdfPermissions;
  };
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  pageDimensions?: { width: number; height: number };
}

export const DEFAULT_PDF_PERMISSIONS: PdfPermissions = {
  allowPrinting: true,
  allowHighResPrinting: true,
  allowModifying: false,
  allowCopying: false,
  allowAnnotating: false,
  allowFillingForms: true,
  allowAccessibility: true,
  allowAssembly: false,
};

/**
 * Pure TypeScript MD5 implementation (RFC 1321) for zero-dependency offline PDF key derivation.
 */
export function md5(input: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
    0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
    0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
    0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const origLen = input.length;
  const bitLenLo = (origLen * 8) >>> 0;
  const bitLenHi = Math.floor((origLen * 8) / 0x100000000) >>> 0;

  const padLen = ((56 - ((origLen + 1) % 64)) + 64) % 64;
  const totalLen = origLen + 1 + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(input, 0);
  buf[origLen] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(totalLen - 8, bitLenLo, true);
  view.setUint32(totalLen - 4, bitLenHi, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const rot = (F << S[i]) | (F >>> (32 - S[i]));
      B = (B + rot) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

/**
 * Symmetric RC4 stream cipher (ARCFOUR) used by PDF Standard Security Handler.
 */
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;

  let j = 0;
  const keyLen = key.length;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % keyLen]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }

  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    const rnd = S[(S[i] + S[j]) & 0xff];
    out[k] = data[k] ^ rnd;
  }
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const res = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    res.set(arr, offset);
    offset += arr.length;
  }
  return res;
}

function padPassword(password: string): Uint8Array {
  // Convert password to Latin1 / UTF-8 bytes
  const bytes: number[] = [];
  for (let i = 0; i < password.length && bytes.length < 32; i++) {
    bytes.push(password.charCodeAt(i) & 0xff);
  }
  const out = new Uint8Array(32);
  out.set(bytes, 0);
  if (bytes.length < 32) {
    out.set(PADDING.subarray(0, 32 - bytes.length), bytes.length);
  }
  return out;
}

/**
 * Encode permissions into ISO 32000-1 Table 22 32-bit signed integer `/P`.
 */
export function encodePermissionsMask(perms: PdfPermissions): number {
  // Bits 1-2 must be 0; bits 7-8 must be 1; bits 13-32 must be 1 (0xfffff0c0)
  let p = 0xfffff0c0;
  if (perms.allowPrinting) p |= 1 << 2; // bit 3 (4)
  if (perms.allowModifying) p |= 1 << 3; // bit 4 (8)
  if (perms.allowCopying) p |= 1 << 4; // bit 5 (16)
  if (perms.allowAnnotating) p |= 1 << 5; // bit 6 (32)
  if (perms.allowFillingForms) p |= 1 << 8; // bit 9 (256)
  if (perms.allowAccessibility) p |= 1 << 9; // bit 10 (512)
  if (perms.allowAssembly) p |= 1 << 10; // bit 11 (1024)
  if (perms.allowPrinting && perms.allowHighResPrinting) p |= 1 << 11; // bit 12 (2048)
  // Force signed 32-bit integer
  return p | 0;
}

export function decodePermissionsMask(p: number): PdfPermissions {
  return {
    allowPrinting: Boolean(p & (1 << 2)),
    allowModifying: Boolean(p & (1 << 3)),
    allowCopying: Boolean(p & (1 << 4)),
    allowAnnotating: Boolean(p & (1 << 5)),
    allowFillingForms: Boolean(p & (1 << 8)),
    allowAccessibility: Boolean(p & (1 << 9)),
    allowAssembly: Boolean(p & (1 << 10)),
    allowHighResPrinting: Boolean(p & (1 << 11)),
  };
}

/**
 * ISO 32000-1 Algorithm 3: Compute the encryption dictionary's `/O` (Owner Password) value.
 */
function computeOwnerValue(
  userPassword: string,
  ownerPassword: string,
  revision: number,
  keyLenBytes: number
): Uint8Array {
  const effectiveOwner = ownerPassword.length > 0 ? ownerPassword : userPassword;
  const paddedOwner = padPassword(effectiveOwner);
  let digest = md5(paddedOwner);

  if (revision >= 3) {
    for (let i = 0; i < 50; i++) {
      digest = md5(digest.subarray(0, keyLenBytes));
    }
  }

  const rc4Key = digest.subarray(0, keyLenBytes);
  const paddedUser = padPassword(userPassword);
  let encrypted = rc4(rc4Key, paddedUser);

  if (revision >= 3) {
    const tempKey = new Uint8Array(keyLenBytes);
    for (let i = 1; i <= 19; i++) {
      for (let j = 0; j < keyLenBytes; j++) {
        tempKey[j] = rc4Key[j] ^ i;
      }
      encrypted = rc4(tempKey, encrypted);
    }
  }

  return encrypted;
}

/**
 * ISO 32000-1 Algorithm 2: Compute the File Encryption Key.
 */
function computeEncryptionKey(
  paddedUser: Uint8Array,
  ownerValue: Uint8Array,
  permissionsSigned32: number,
  fileId: Uint8Array,
  revision: number,
  keyLenBytes: number
): Uint8Array {
  const pBytes = new Uint8Array(4);
  new DataView(pBytes.buffer).setInt32(0, permissionsSigned32, true);

  let digest = md5(concatBytes(paddedUser, ownerValue, pBytes, fileId));

  if (revision >= 3) {
    for (let i = 0; i < 50; i++) {
      digest = md5(digest.subarray(0, keyLenBytes));
    }
  }

  return digest.subarray(0, keyLenBytes);
}

/**
 * ISO 32000-1 Algorithm 4 & 5: Compute the `/U` (User Password) value.
 */
function computeUserValue(
  encryptionKey: Uint8Array,
  fileId: Uint8Array,
  revision: number
): Uint8Array {
  if (revision === 2) {
    return rc4(encryptionKey, PADDING);
  }

  // Revision >= 3 (Algorithm 5)
  const digest = md5(concatBytes(PADDING, fileId));
  let encrypted = rc4(encryptionKey, digest);
  const tempKey = new Uint8Array(encryptionKey.length);

  for (let i = 1; i <= 19; i++) {
    for (let j = 0; j < encryptionKey.length; j++) {
      tempKey[j] = encryptionKey[j] ^ i;
    }
    encrypted = rc4(tempKey, encrypted);
  }

  // Append 16 bytes of arbitrary padding to make 32 bytes
  const out = new Uint8Array(32);
  out.set(encrypted, 0);
  out.set(PADDING.subarray(0, 16), 16);
  return out;
}

/**
 * ISO 32000-1 Algorithm 1: Derive per-object encryption key from `(objectNumber, generationNumber)`.
 */
function deriveObjectKey(
  encryptionKey: Uint8Array,
  objectNumber: number,
  generationNumber: number,
  useAesSalt = false
): Uint8Array {
  const extra = new Uint8Array(useAesSalt ? 9 : 5);
  extra[0] = objectNumber & 0xff;
  extra[1] = (objectNumber >>> 8) & 0xff;
  extra[2] = (objectNumber >>> 16) & 0xff;
  extra[3] = generationNumber & 0xff;
  extra[4] = (generationNumber >>> 8) & 0xff;
  if (useAesSalt) {
    // 'sAlT' (0x73, 0x41, 0x6c, 0x54) per ISO 32000-1 Algorithm 1
    extra[5] = 0x73;
    extra[6] = 0x41;
    extra[7] = 0x6c;
    extra[8] = 0x54;
  }

  const digest = md5(concatBytes(encryptionKey, extra));
  const keyLen = Math.min(encryptionKey.length + 5, 16);
  return digest.subarray(0, keyLen);
}

async function aes128CbcEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv);
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, cryptoKey, plaintext));
  return concatBytes(iv, ciphertext);
}

async function aes128CbcDecrypt(key: Uint8Array, ivAndCiphertext: Uint8Array): Promise<Uint8Array> {
  if (ivAndCiphertext.length < 16) return ivAndCiphertext;
  const iv = ivAndCiphertext.subarray(0, 16);
  const ciphertext = ivAndCiphertext.subarray(16);
  if (ciphertext.length === 0) return new Uint8Array(0);
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, ciphertext);
  return new Uint8Array(decrypted);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function bytesToPdfHexString(bytes: Uint8Array): PDFHexString {
  return PDFHexString.of(bytesToHex(bytes));
}

function extractRawBytesFromPdfString(obj: PDFString | PDFHexString): Uint8Array {
  return obj.asBytes();
}

async function transformPdfObjectInPlace(
  obj: PDFObject,
  transformBytes: (data: Uint8Array) => Promise<Uint8Array>,
  visited = new Set<PDFObject>()
): Promise<void> {
  if (!obj || visited.has(obj)) return;
  visited.add(obj);

  if (obj instanceof PDFRawStream) {
    // Transform raw stream contents and keep /Length synchronized
    const nextContents = await transformBytes(obj.contents);
    (obj as any).contents = nextContents;
    obj.dict.set(PDFName.of('Length'), PDFNumber.of(nextContents.length));
    // Transform strings inside the stream dictionary (except /Filter etc. which are PDFName)
    await transformPdfObjectInPlace(obj.dict, transformBytes, visited);
  } else if (obj instanceof PDFDict) {
    const entries = obj.entries();
    for (const [key, val] of entries) {
      // Do not encrypt /Length or PDFNames; only PDFString / PDFHexString / nested dicts / arrays
      if (val instanceof PDFString || val instanceof PDFHexString) {
        const raw = extractRawBytesFromPdfString(val);
        const out = await transformBytes(raw);
        obj.set(key, bytesToPdfHexString(out));
      } else if (val instanceof PDFDict || val instanceof PDFArray) {
        await transformPdfObjectInPlace(val, transformBytes, visited);
      }
    }
  } else if (obj instanceof PDFArray) {
    const size = obj.size();
    for (let i = 0; i < size; i++) {
      const item = obj.get(i);
      if (item instanceof PDFString || item instanceof PDFHexString) {
        const raw = extractRawBytesFromPdfString(item);
        const out = await transformBytes(raw);
        obj.set(i, bytesToPdfHexString(out));
      } else if (item instanceof PDFDict || item instanceof PDFArray) {
        await transformPdfObjectInPlace(item, transformBytes, visited);
      }
    }
  }
}

/**
 * Inspect any PDF file to check if it is encrypted, read its page count, metadata, and permission flags.
 */
export async function inspectPdfBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName = 'document.pdf'
): Promise<PdfInspectionResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const pdfDoc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const encryptRef = pdfDoc.context.trailerInfo.Encrypt;
  let isEncrypted = Boolean(encryptRef);
  let encryptionDetails: PdfInspectionResult['encryptionDetails'];

  if (encryptRef) {
    const encryptObj =
      encryptRef instanceof PDFRef ? pdfDoc.context.lookup(encryptRef) : encryptRef;
    if (encryptObj instanceof PDFDict) {
      const vObj = encryptObj.get(PDFName.of('V'));
      const rObj = encryptObj.get(PDFName.of('R'));
      const lenObj = encryptObj.get(PDFName.of('Length'));
      const pObj = encryptObj.get(PDFName.of('P'));

      const v = vObj instanceof PDFNumber ? vObj.asNumber() : 2;
      const r = rObj instanceof PDFNumber ? rObj.asNumber() : 3;
      const lengthBits = lenObj instanceof PDFNumber ? lenObj.asNumber() : v === 1 ? 40 : 128;
      const pMask = pObj instanceof PDFNumber ? pObj.asNumber() : -4;

      let cipher = 'RC4-128 Standard';
      if (v === 1) cipher = 'RC4-40 Legacy';
      else if (v === 2) cipher = `RC4-${lengthBits} Standard (ISO 32000-1)`;
      else if (v === 4) cipher = 'AES-128 / RC4-128 Crypt Filter (V4)';
      else if (v >= 5) cipher = 'AES-256 Standard (V5)';

      encryptionDetails = {
        version: v,
        revision: r,
        keyLengthBits: lengthBits,
        cipher,
        permissionsMask: pMask,
        permissions: decodePermissionsMask(pMask),
      };
    }
  }

  let pageCount = 0;
  let pageDimensions: { width: number; height: number } | undefined;
  try {
    pageCount = pdfDoc.getPageCount();
    if (pageCount > 0) {
      const firstPage = pdfDoc.getPage(0);
      pageDimensions = firstPage.getSize();
    }
  } catch {
    // If page tree is encrypted inside an object stream, estimate page count from /Type /Page dicts
    let count = 0;
    for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Page')) {
        count++;
      }
    }
    pageCount = count || 1;
  }

  let title: string | undefined;
  let author: string | undefined;
  let creator: string | undefined;
  let producer: string | undefined;

  if (!isEncrypted) {
    try {
      title = pdfDoc.getTitle();
      author = pdfDoc.getAuthor();
      creator = pdfDoc.getCreator();
      producer = pdfDoc.getProducer();
    } catch {}
  }

  return {
    fileName,
    fileSize: bytes.byteLength,
    pageCount,
    isEncrypted,
    encryptionDetails,
    title,
    author,
    creator,
    producer,
    pageDimensions,
  };
}

/**
 * Lock a PDF document with User & Owner Passwords, granular permissions, optional watermark, and metadata scrubbing.
 */
export async function lockPdfDocument(
  sourceBuffer: ArrayBuffer | Uint8Array,
  options: PdfLockOptions
): Promise<Uint8Array> {
  const inputBytes = sourceBuffer instanceof Uint8Array ? sourceBuffer : new Uint8Array(sourceBuffer);

  // Step 1: Load source PDF (if already encrypted, throw clear message asking to unlock first)
  const workingDoc = await PDFDocument.load(inputBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });

  // Step 2: Optional Metadata Scrubbing for privacy
  if (options.scrubMetadata) {
    workingDoc.setTitle('');
    workingDoc.setAuthor('');
    workingDoc.setSubject('');
    workingDoc.setKeywords([]);
    workingDoc.setCreator('CYBER//MUX Offline Vault');
    workingDoc.setProducer('CYBER//MUX Offline Vault');
  }

  // Step 3: Optional Diagonal Security Stamp / Watermark across all pages
  if (options.watermarkText && options.watermarkText.trim().length > 0) {
    const font = await workingDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = workingDoc.getPages();
    const stamp = options.watermarkText.trim();
    for (const page of pages) {
      const { width, height } = page.getSize();
      const fontSize = Math.max(24, Math.min(width, height) * 0.065);
      const textWidth = font.widthOfTextAtSize(stamp, fontSize);
      page.drawText(stamp, {
        x: Math.max(20, (width - textWidth * 0.7) / 2),
        y: height / 2,
        size: fontSize,
        font,
        color: rgb(0.85, 0.12, 0.2),
        opacity: 0.18,
        rotate: degrees(35),
      });
    }
  }

  // Step 4: Normalize the PDF with useObjectStreams: false so all objects have stable indirect refs and raw streams
  const normalizedBytes = await workingDoc.save({ useObjectStreams: false });
  const pdfDoc = await PDFDocument.load(normalizedBytes, { updateMetadata: false });

  // Step 5: Compute ISO 32000-1 Encryption parameters
  const useAes128 = options.encryptionAlgorithm === 'aes-128';
  const version = useAes128 ? 4 : 2;
  const revision = useAes128 ? 4 : 3;
  const keyLengthBits = 128;
  const keyLenBytes = 16;

  const fileId = new Uint8Array(16);
  crypto.getRandomValues(fileId);

  const permissionsMask = encodePermissionsMask(options.permissions);
  const ownerValue = computeOwnerValue(
    options.userPassword,
    options.ownerPassword || options.userPassword,
    revision,
    keyLenBytes
  );
  const paddedUser = padPassword(options.userPassword);
  const encryptionKey = computeEncryptionKey(
    paddedUser,
    ownerValue,
    permissionsMask,
    fileId,
    revision,
    keyLenBytes
  );
  const userValue = computeUserValue(encryptionKey, fileId, revision);

  // Step 6: Encrypt every indirect object in pdfDoc.context
  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
  for (const [ref, obj] of indirectObjects) {
    const objKey = deriveObjectKey(
      encryptionKey,
      ref.objectNumber,
      ref.generationNumber,
      useAes128
    );

    const transformFn = useAes128
      ? (data: Uint8Array) => aes128CbcEncrypt(objKey, data)
      : async (data: Uint8Array) => rc4(objKey, data);

    await transformPdfObjectInPlace(obj, transformFn);
  }

  // Step 7: Create & register the /Encrypt dictionary (unencrypted itself)
  const encryptDictMap: Record<string, any> = {
    Filter: PDFName.of('Standard'),
    V: PDFNumber.of(version),
    R: PDFNumber.of(revision),
    Length: PDFNumber.of(keyLengthBits),
    P: PDFNumber.of(permissionsMask),
    O: bytesToPdfHexString(ownerValue),
    U: bytesToPdfHexString(userValue),
  };

  if (useAes128) {
    const stdCfDict = pdfDoc.context.obj({
      Type: PDFName.of('CryptFilter'),
      CFM: PDFName.of('AESV2'),
      AuthEvent: PDFName.of('DocOpen'),
      Length: PDFNumber.of(16),
    });
    const cfDict = pdfDoc.context.obj({
      StdCF: stdCfDict,
    });
    encryptDictMap.CF = cfDict;
    encryptDictMap.StmF = PDFName.of('StdCF');
    encryptDictMap.StrF = PDFName.of('StdCF');
  }

  const encryptDict = pdfDoc.context.obj(encryptDictMap);
  const encryptRef = pdfDoc.context.register(encryptDict);

  pdfDoc.context.trailerInfo.Encrypt = encryptRef;
  pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([
    bytesToPdfHexString(fileId),
    bytesToPdfHexString(fileId),
  ]);

  // Step 8: Serialize final locked PDF without object streams
  return await pdfDoc.save({ useObjectStreams: false });
}

/**
 * Unlock / Decrypt a password-protected PDF (supports Standard RC4-40, RC4-128, and AES-128 V4).
 */
export async function unlockPdfDocument(
  encryptedBuffer: ArrayBuffer | Uint8Array,
  password: string
): Promise<Uint8Array> {
  const bytes = encryptedBuffer instanceof Uint8Array ? encryptedBuffer : new Uint8Array(encryptedBuffer);
  const pdfDoc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const encryptRef = pdfDoc.context.trailerInfo.Encrypt;
  if (!encryptRef) {
    throw new Error('This PDF is not encrypted.');
  }

  const encryptObj =
    encryptRef instanceof PDFRef ? pdfDoc.context.lookup(encryptRef) : encryptRef;
  if (!(encryptObj instanceof PDFDict)) {
    throw new Error('Malformed /Encrypt dictionary in PDF trailer.');
  }

  const vObj = encryptObj.get(PDFName.of('V'));
  const rObj = encryptObj.get(PDFName.of('R'));
  const lenObj = encryptObj.get(PDFName.of('Length'));
  const pObj = encryptObj.get(PDFName.of('P'));
  const oObj = encryptObj.get(PDFName.of('O'));
  const uObj = encryptObj.get(PDFName.of('U'));

  const v = vObj instanceof PDFNumber ? vObj.asNumber() : 2;
  const r = rObj instanceof PDFNumber ? rObj.asNumber() : 3;
  const lengthBits = lenObj instanceof PDFNumber ? lenObj.asNumber() : v === 1 ? 40 : 128;
  const keyLenBytes = v === 1 ? 5 : Math.max(5, Math.min(16, Math.floor(lengthBits / 8)));
  const pMask = pObj instanceof PDFNumber ? pObj.asNumber() : -4;

  if (v >= 5) {
    throw new Error('PDF uses V5 (AES-256 extension) encryption. Only V1/V2/V4 Standard PDFs can be unlocked directly.');
  }

  if (!(oObj instanceof PDFString || oObj instanceof PDFHexString) ||
      !(uObj instanceof PDFString || uObj instanceof PDFHexString)) {
    throw new Error('Missing /O or /U password hashes in PDF /Encrypt dictionary.');
  }

  const ownerBytes = extractRawBytesFromPdfString(oObj);
  const userBytes = extractRawBytesFromPdfString(uObj);

  // Extract first element of trailer /ID
  let fileId: Uint8Array = new Uint8Array(0);
  const idObj = pdfDoc.context.trailerInfo.ID;
  const resolvedId = idObj instanceof PDFRef ? pdfDoc.context.lookup(idObj) : idObj;
  if (resolvedId instanceof PDFArray && resolvedId.size() > 0) {
    const firstId = resolvedId.get(0);
    if (firstId instanceof PDFString || firstId instanceof PDFHexString) {
      fileId = extractRawBytesFromPdfString(firstId);
    }
  }

  // Check if AESV2 CryptFilter is active (V=4)
  let useAes128 = false;
  if (v === 4) {
    const cf = encryptObj.get(PDFName.of('CF'));
    const resolvedCf = cf instanceof PDFRef ? pdfDoc.context.lookup(cf) : cf;
    if (resolvedCf instanceof PDFDict) {
      const stdCf = resolvedCf.get(PDFName.of('StdCF'));
      const resolvedStdCf = stdCf instanceof PDFRef ? pdfDoc.context.lookup(stdCf) : stdCf;
      if (resolvedStdCf instanceof PDFDict) {
        const cfm = resolvedStdCf.get(PDFName.of('CFM'));
        if (cfm === PDFName.of('AESV2')) {
          useAes128 = true;
        }
      }
    }
  }

  // Try authenticating as User Password first
  const paddedCandidate = padPassword(password);
  let candidateKey = computeEncryptionKey(
    paddedCandidate,
    ownerBytes,
    pMask,
    fileId,
    r,
    keyLenBytes
  );
  let expectedU = computeUserValue(candidateKey, fileId, r);

  const compareLen = r >= 3 ? 16 : 32;
  let matched = true;
  for (let i = 0; i < compareLen; i++) {
    if (expectedU[i] !== userBytes[i]) {
      matched = false;
      break;
    }
  }

  // If User Password didn't match, try authenticating as Owner Password (ISO 32000-1 Algorithm 7)
  if (!matched) {
    let digest = md5(paddedCandidate);
    if (r >= 3) {
      for (let i = 0; i < 50; i++) {
        digest = md5(digest.subarray(0, keyLenBytes));
      }
    }
    const rc4Key = digest.subarray(0, keyLenBytes);
    let recoveredUserPadded: Uint8Array = new Uint8Array(ownerBytes);

    if (r === 2) {
      recoveredUserPadded = rc4(rc4Key, recoveredUserPadded);
    } else {
      const tempKey = new Uint8Array(keyLenBytes);
      for (let i = 19; i >= 1; i--) {
        for (let j = 0; j < keyLenBytes; j++) {
          tempKey[j] = rc4Key[j] ^ i;
        }
        recoveredUserPadded = rc4(tempKey, recoveredUserPadded);
      }
      recoveredUserPadded = rc4(rc4Key, recoveredUserPadded);
    }

    candidateKey = computeEncryptionKey(
      recoveredUserPadded,
      ownerBytes,
      pMask,
      fileId,
      r,
      keyLenBytes
    );
    expectedU = computeUserValue(candidateKey, fileId, r);

    matched = true;
    for (let i = 0; i < compareLen; i++) {
      if (expectedU[i] !== userBytes[i]) {
        matched = false;
        break;
      }
    }
  }

  if (!matched) {
    throw new Error('Invalid password. Could not authenticate against PDF User or Owner key.');
  }

  // Password verified! Decrypt all indirect objects (except the /Encrypt dictionary itself)
  const encryptObjNum = encryptRef instanceof PDFRef ? encryptRef.objectNumber : -1;
  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();

  for (const [ref, obj] of indirectObjects) {
    if (ref.objectNumber === encryptObjNum) continue;

    const objKey = deriveObjectKey(
      candidateKey,
      ref.objectNumber,
      ref.generationNumber,
      useAes128
    );

    const decryptFn = useAes128
      ? (data: Uint8Array) => aes128CbcDecrypt(objKey, data)
      : async (data: Uint8Array) => rc4(objKey, data);

    await transformPdfObjectInPlace(obj, decryptFn);
  }

  // Remove /Encrypt from trailer and delete the indirect object
  delete pdfDoc.context.trailerInfo.Encrypt;
  if (encryptRef instanceof PDFRef) {
    pdfDoc.context.delete(encryptRef);
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

/**
 * Generate a realistic multi-page sample PDF completely offline for 1-click testing.
 */
export async function generateSampleClassifiedPdf(): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('CYBER//MUX Tactical Architecture Dossier');
  pdfDoc.setAuthor('Zero-Cloud Security Division');
  pdfDoc.setSubject('Offline WebAssembly & Cryptographic Specification');
  pdfDoc.setKeywords(['cyber', 'offline', 'wasm', 'encryption', 'iso-32000']);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Page 1
  const page1 = pdfDoc.addPage([612, 792]);
  page1.drawRectangle({
    x: 0,
    y: 710,
    width: 612,
    height: 82,
    color: rgb(0.03, 0.05, 0.1),
  });
  page1.drawText('CYBER//MUX TACTICAL DOSSIER // LEVEL-4', {
    x: 40,
    y: 750,
    size: 16,
    font: fontBold,
    color: rgb(0, 0.9, 1),
  });
  page1.drawText('100% Client-Side Zero-Cloud Cryptographic Document Sample', {
    x: 40,
    y: 730,
    size: 10,
    font: fontMono,
    color: rgb(0.6, 0.85, 0.9),
  });

  page1.drawText('1. EXECUTIVE OVERVIEW', {
    x: 40,
    y: 665,
    size: 13,
    font: fontBold,
    color: rgb(0.08, 0.12, 0.2),
  });

  const bodyLines = [
    'This PDF document was synthesized entirely inside your browser using the local PDF Vault',
    'engine with zero external network calls. You can test locking this document with:',
    '',
    '  • User Open Password (prompts immediately in Chrome, Safari, iOS, macOS Preview, Adobe)',
    '  • Owner Master Password & Granular Permission Bitmasks (Print, Copy, Edit, Annotate)',
    '  • RC4-128 (ISO 32000-1 Rev 3) or AES-128 (ISO 32000-1 Rev 4 CryptFilter)',
    '  • Diagonal Tactical Security Stamp & Zero-Trace Metadata Scrubbing',
    '',
    'Once locked, you can download the protected PDF or switch to the "Unlock PDF" tab to',
    'verify password authentication and lossless decryption back to an unlocked PDF.',
  ];

  let y = 640;
  for (const line of bodyLines) {
    page1.drawText(line, {
      x: 40,
      y,
      size: 10.5,
      font: line.startsWith('  •') ? fontMono : fontRegular,
      color: rgb(0.15, 0.18, 0.24),
    });
    y -= 18;
  }

  // Telemetry box
  page1.drawRectangle({
    x: 40,
    y: 340,
    width: 532,
    height: 105,
    borderColor: rgb(0, 0.65, 0.75),
    borderWidth: 1.2,
    color: rgb(0.95, 0.98, 1),
  });
  page1.drawText('CRYPTOGRAPHIC TELEMETRY MATRIX', {
    x: 54,
    y: 422,
    size: 10,
    font: fontBold,
    color: rgb(0, 0.45, 0.55),
  });
  page1.drawText('Standard Handler : /Filter /Standard (ISO 32000-1 Section 7.6)', {
    x: 54,
    y: 402,
    size: 9.5,
    font: fontMono,
    color: rgb(0.1, 0.2, 0.3),
  });
  page1.drawText('Key Derivation   : 50-Round MD5 + 19-Round XOR Key Schedule + Per-Object Salt', {
    x: 54,
    y: 385,
    size: 9.5,
    font: fontMono,
    color: rgb(0.1, 0.2, 0.3),
  });
  page1.drawText('Air-Gap Status   : 100% In-Browser Memory Execution (0 Bytes Uploaded)', {
    x: 54,
    y: 368,
    size: 9.5,
    font: fontMono,
    color: rgb(0.05, 0.5, 0.35),
  });

  // Page 2
  const page2 = pdfDoc.addPage([612, 792]);
  page2.drawText('2. PERMISSION BITMASK SPECIFICATION (ISO 32000-1 TABLE 22)', {
    x: 40,
    y: 730,
    size: 13,
    font: fontBold,
    color: rgb(0.08, 0.12, 0.2),
  });

  const permTable = [
    'Bit 3  (0x004) : Print Document',
    'Bit 4  (0x008) : Modify Contents',
    'Bit 5  (0x010) : Copy / Extract Text & Graphics',
    'Bit 6  (0x020) : Add / Modify Text Annotations & Interactive Form Fields',
    'Bit 9  (0x100) : Fill Existing Interactive Form Fields',
    'Bit 10 (0x200) : Extract Text & Graphics for Accessibility',
    'Bit 11 (0x400) : Assemble Document (Insert, Rotate, Delete Pages)',
    'Bit 12 (0x800) : High-Resolution Faithful Printing',
  ];

  let y2 = 695;
  for (const row of permTable) {
    page2.drawText(row, {
      x: 48,
      y: y2,
      size: 10,
      font: fontMono,
      color: rgb(0.2, 0.24, 0.3),
    });
    y2 -= 20;
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  return new File([pdfBytes], 'cyber_tactical_dossier_sample.pdf', {
    type: 'application/pdf',
  });
}
