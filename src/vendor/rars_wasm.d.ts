export interface RarBuilderOptions {
  format?: 'rar50' | 'rar40' | string;
  compression?: number;
  store?: boolean;
  solid?: boolean;
  password?: string;
  encryptHeaders?: boolean;
  comment?: string;
  recoveryPercent?: number;
  volumeSize?: number;
}

export interface RarEntryOptions {
  mtime?: number;
  mode?: number;
}

export interface RarInfo {
  readonly crc: number;
  readonly flags: number;
  readonly isDirectory: boolean;
  readonly isEncrypted: boolean;
  readonly isSolid: boolean;
  readonly isSplitAfter: boolean;
  readonly isSplitBefore: boolean;
  readonly method: number;
  readonly fileTime?: number;
  readonly hostOs: number;
  readonly name: string;
  readonly packedSize: number;
  readonly size: number;
  readonly version: number;
  free(): void;
}

export class RarBuilder {
  constructor(options?: RarBuilderOptions | null);
  addBytes(name: string, data: Uint8Array, options?: RarEntryOptions | null): void;
  addBytesRaw(name: Uint8Array, data: Uint8Array, options?: RarEntryOptions | null): void;
  readonly length: number;
  names(): string[];
  remove(name: string): void;
  rename(from: string, to: string): void;
  toBytes(): Uint8Array;
  toVolumes(): Uint8Array[];
  free(): void;
}

export class RarFile {
  constructor(data: Uint8Array, password?: string);
  static openVolumes(volumes: Uint8Array[], password?: string): RarFile;
  readonly comment?: Uint8Array;
  readonly hasEncryptedHeaders: boolean;
  readonly hasRecoveryRecord: boolean;
  readonly isSolid: boolean;
  readonly isVolume: boolean;
  readonly needsPassword: boolean;
  readonly version: number;
  entries(): RarInfo[];
  fileNames(): string[];
  read(name: string, password?: string): Uint8Array;
  readAt(index: number, password?: string): Uint8Array;
  test(password?: string): void;
  free(): void;
}

export function initSync(module: BufferSource | WebAssembly.Module): any;
export default function __wbg_init(
  module_or_path?: { module_or_path?: BufferSource | WebAssembly.Module | string | URL | Request } | BufferSource | WebAssembly.Module | string | URL | Request
): Promise<any>;
