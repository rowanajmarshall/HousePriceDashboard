/**
 * Shim for Leaflet — loaded from CDN as a global `L`.
 * This re-exports the global so TypeScript modules can `import L from './leaflet-shim'`.
 */
declare const L: typeof import('leaflet');
export default L;
