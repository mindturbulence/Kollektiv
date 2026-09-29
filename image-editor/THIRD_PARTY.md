# Third-party code in the image editor

Kollektiv is GPL-3.0. Runtime dependencies used by `image-editor/` (not vendored, unmodified):

- `libraw-wasm-nothread` 1.6.0 — ISC wrapper around **LibRaw 0.22.1** (LGPL-2.1 or CDDL-1.0),
  compiled to WebAssembly. Used unmodified for camera RAW/DNG decoding (`core/io/rawImport.ts`),
  loaded lazily in its own worker. LibRaw source: https://github.com/LibRaw/LibRaw ;
  wrapper source: https://github.com/garbarok/libraw-wasm-nothread .
- `ag-psd` (MIT) — PSD import (`core/io/psdImport.ts`).

Bundled look assets are listed in `public/looks/LICENSES.md`.
