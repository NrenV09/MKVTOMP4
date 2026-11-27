/// <reference types="vite/client" />

declare module 'dav1d.js' {
  export interface Dav1dFrame {
    width: number;
    height: number;
    data: Uint8Array;
  }

  export interface Dav1dInstance {
    ref: number;
    lastFrameRef: number | null;
    FFI?: {
      djs_free?: (ref: number) => void;
      djs_free_frame?: (frameRef: number) => void;
    };
    decodeFrameAsYUV(obu: Uint8Array | ArrayBuffer): Dav1dFrame;
    unsafeDecodeFrameAsYUV(obu: Uint8Array | ArrayBuffer): Uint8Array;
    unsafeCleanup(): void;
  }

  export function create(opts: {
    wasmURL?: string;
    wasmData?: ArrayBuffer | Uint8Array;
  }): Promise<Dav1dInstance>;

  const _default: { create: typeof create };
  export default _default;
}

declare module 'dav1d.js/dav1d.wasm?url' {
  const src: string;
  export default src;
}
