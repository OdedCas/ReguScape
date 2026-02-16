/**
 * GovMap coordinate → parcel (gush/helka) lookup via WFS.
 *
 * Uses GovMap's public GeoServer WFS endpoint to resolve ITM coordinates
 * to a cadastral parcel (gush + helka). The WFS stores geometries in
 * EPSG:3857 (Web Mercator), so we convert from ITM (EPSG:2039) first.
 */

const GOVMAP_WFS_URL =
  'https://www.govmap.gov.il/api/geoserver/wfs';

const REQUEST_TIMEOUT_MS = 8000;

export interface ParcelResult {
  gush: string;
  helka: string;
}

// ---- Coordinate conversion: ITM (EPSG:2039) → WGS84 → Web Mercator (EPSG:3857) ----

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

const ITM_LAT0 = (31 + 44 / 60 + 3.817 / 3600) * (Math.PI / 180);
const ITM_LON0 = (35 + 12 / 60 + 16.261 / 3600) * (Math.PI / 180);
const ITM_K0 = 1.0000067;
const ITM_FE = 219529.584;
const ITM_FN = 626907.39;

function itmToWgs84(easting: number, northing: number): { lat: number; lon: number } {
  const ePrime2 = WGS84_E2 / (1 - WGS84_E2);
  const e1 = (1 - Math.sqrt(1 - WGS84_E2)) / (1 + Math.sqrt(1 - WGS84_E2));

  const xAdj = (easting - ITM_FE) / ITM_K0;

  const m0 =
    WGS84_A *
    ((1 - WGS84_E2 / 4 - (3 * WGS84_E2 ** 2) / 64 - (5 * WGS84_E2 ** 3) / 256) * ITM_LAT0 -
      ((3 * WGS84_E2) / 8 + (3 * WGS84_E2 ** 2) / 32 + (45 * WGS84_E2 ** 3) / 1024) *
        Math.sin(2 * ITM_LAT0) +
      ((15 * WGS84_E2 ** 2) / 256 + (45 * WGS84_E2 ** 3) / 1024) * Math.sin(4 * ITM_LAT0) -
      ((35 * WGS84_E2 ** 3) / 3072) * Math.sin(6 * ITM_LAT0));

  const mTotal = (northing - ITM_FN) / ITM_K0 + m0;
  const mu =
    mTotal / (WGS84_A * (1 - WGS84_E2 / 4 - (3 * WGS84_E2 ** 2) / 64 - (5 * WGS84_E2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const n1 = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ePrime2 * Math.cos(phi1) ** 2;
  const r1 = (WGS84_A * (1 - WGS84_E2)) / (1 - WGS84_E2 * Math.sin(phi1) ** 2) ** 1.5;
  const d = xAdj / n1;

  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ePrime2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ePrime2 - 3 * c1 ** 2) * d ** 6) / 720);

  const lon =
    ITM_LON0 +
    (1 / Math.cos(phi1)) *
      (d -
        ((1 + 2 * t1 + c1) * d ** 3) / 6 +
        ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ePrime2 + 24 * t1 ** 2) * d ** 5) / 120);

  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

function wgs84ToWebMercator(lat: number, lon: number): { x: number; y: number } {
  const x = (lon * 20037508.34) / 180;
  const yRad = Math.log(Math.tan(((90 + lat) / 360) * Math.PI));
  const y = (yRad / Math.PI) * 20037508.34;
  return { x, y };
}

function itmToWebMercator(easting: number, northing: number): { x: number; y: number } {
  const { lat, lon } = itmToWgs84(easting, northing);
  return wgs84ToWebMercator(lat, lon);
}

// ---- WFS query ----

interface WfsFeature {
  properties: Record<string, unknown>;
}

interface WfsResponse {
  features: WfsFeature[];
}

function toStringValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function buildWfsUrl(x3857: number, y3857: number): string {
  const xRound = Math.round(x3857);
  const yRound = Math.round(y3857);
  const cqlFilter = `INTERSECTS(shape,POINT(${xRound} ${yRound}))`;

  const params = new URLSearchParams({
    service: 'wfs',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: 'govmap:layer_parcel_all',
    CQL_FILTER: cqlFilter,
    maxFeatures: '1',
    outputFormat: 'application/json',
    propertyName: 'gush_num,gush_suffix,parcel',
  });

  return `${GOVMAP_WFS_URL}?${params.toString()}`;
}

/**
 * Resolve ITM coordinates to gush/helka via GovMap's public WFS endpoint.
 *
 * Returns `null` when the lookup fails or no parcel is found at the given point.
 */
export async function getParcelByCoordinates(
  itmX: number,
  itmY: number,
): Promise<ParcelResult | null> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { x, y } = itmToWebMercator(itmX, itmY);
    const url = buildWfsUrl(x, y);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Origin: 'https://www.govmap.gov.il',
        Referer: 'https://www.govmap.gov.il/',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as WfsResponse;
    if (!json.features || json.features.length === 0) {
      return null;
    }

    const props = json.features[0].properties;
    const gushNum = toStringValue(props.gush_num);
    const parcel = toStringValue(props.parcel);

    if (!gushNum || !parcel) {
      return null;
    }

    return { gush: gushNum, helka: parcel };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
