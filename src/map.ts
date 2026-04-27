import L from './leaflet-shim';

let map: L.Map | null = null;

const config = {
  defaultCenter: [54.5, -3.5] as [number, number],
  defaultZoom: 6,
  minZoom: 5,
  maxZoom: 14,
  maxBounds: [
    [49.5, -11],
    [61, 3],
  ] as [[number, number], [number, number]],
};

export function init(containerId: string): L.Map {
  if (map) return map;

  map = L.map(containerId, {
    center: config.defaultCenter,
    zoom: config.defaultZoom,
    minZoom: config.minZoom,
    maxZoom: config.maxZoom,
    maxBounds: config.maxBounds,
    maxBoundsViscosity: 1.0,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: <a href="https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads">UK Land Registry</a>',
  }).addTo(map);

  L.control
    .scale({
      imperial: false,
      metric: true,
      position: 'bottomright',
    })
    .addTo(map);

  return map;
}

export function getMap(): L.Map | null {
  return map;
}

export function fitBounds(bounds: L.LatLngBoundsExpression): void {
  if (map && bounds) {
    map.fitBounds(bounds, { padding: [20, 20] });
  }
}

export function resetView(): void {
  if (map) {
    map.setView(config.defaultCenter, config.defaultZoom);
  }
}

export function getZoom(): number {
  return map ? map.getZoom() : config.defaultZoom;
}

export function invalidateSize(): void {
  if (map) {
    map.invalidateSize();
  }
}
