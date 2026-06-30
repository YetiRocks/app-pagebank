/// <reference types="vite/client" />

// Runtime base, injected into the served index.html by the Yeti web server
// (`window.__YETI_BASE_PATH="{mount}/"`). Undefined under `npm run dev` and for
// a standalone mount → callers fall back to `/`.
interface Window {
  __YETI_BASE_PATH?: string
  // No-trailing-slash static root derived from __YETI_BASE_PATH in index.html;
  // `__STATIC_ROOT__` is mapped to this global by Vite `define`.
  __YETI_STATIC_ROOT__?: string
}

// `__STATIC_ROOT__` is substituted by Vite `define` with a RUNTIME expression
// that reads `window.__YETI_BASE_PATH` (no trailing slash); typed as a string
// so tsc resolves call sites.
declare const __STATIC_ROOT__: string
declare const __RESOURCES_ROOT__: string
