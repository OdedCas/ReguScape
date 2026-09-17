/**
 * Direct GovMap REST API client.
 *
 * Calls the same endpoints that govmap.gov.il uses internally,
 * eliminating the need for an external scraper service for many operations.
 *
 * Base URL: https://www.govmap.gov.il/api
 * Coordinate system: EPSG:3857 (Web Mercator) for search results
 */

import type { LandPlotIdentifiers, TabaInfo, ParcelPlanningData, TabaRadiusPlan } from '@/types';
import { getParcelByCoordinates } from '@/services/govmap-parcel';

const API_BASE = 'https://www.govmap.gov.il/api';

const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Origin: 'https://www.govmap.gov.il',
  Referer: 'https://www.govmap.gov.il/',
};

// ── Search / Geocoding ─────────────────────────────────────────────────────

interface GovMapSearchResult {
  id: string;
  text: string;
  type: string;
  score: number;
  /** WKT geometry, e.g. "POINT(x y)" */
  shape: string;
  data: Record<string, unknown>;
  originalText?: string;
}

interface GovMapSearchResponse {
  resultsCount: number;
  results: GovMapSearchResult[];
  aggregations: Array<{ key: string; count: number }>;
}

/**
 * Free-text search via GovMap autocomplete API.
 * Returns geocoded results with EPSG:3857 coordinates in WKT format.
 */
export async function searchGovMapApi(
  searchText: string,
  opts: {
    language?: 'he' | 'en' | 'ar';
    maxResults?: number;
    filterType?: string;
    isAccurate?: boolean;
  } = {},
): Promise<GovMapSearchResponse> {
  console.log(`[govmap-api] search: "${searchText}"`);

  const response = await fetch(`${API_BASE}/search-service/autocomplete`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({
      searchText,
      language: opts.language ?? 'he',
      maxResults: opts.maxResults ?? 10,
      filterType: opts.filterType,
      isAccurate: opts.isAccurate ?? false,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap search API returned ${response.status}`);
  }

  return (await response.json()) as GovMapSearchResponse;
}

function parseWktPoint(wkt: string): { x: number; y: number } | null {
  const m = wkt.match(/POINT\(([^ ]+) ([^ ]+)\)/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

// ── Parcel / Address conversion ────────────────────────────────────────────

/**
 * Find parcel (gush/helka) for an address by searching GovMap.
 * Uses the search API to find a parcel-type result.
 */
export async function getParcelFromAddressGovMap(address: string): Promise<LandPlotIdentifiers> {
  console.log(`[govmap-api] getParcelFromAddress: "${address}"`);

  const res = await searchGovMapApi(address, { maxResults: 5, isAccurate: true });

  // Try to extract gush/helka from the search result ID
  // Parcel IDs look like: "parcel|PARCEL_ALL|...|6158|1300"
  // Address IDs look like: "address|ADDR|...|הרצל|1|תל אביב"
  let gush = '';
  let helka = '';
  const addresses: string[] = [];

  for (const result of res.results) {
    if (result.text) {
      addresses.push(result.text);
    }

    if (result.type === 'parcel' && result.id) {
      // Try to extract gush/helka from ID parts
      const gushMatch = result.text.match(/גוש\s+(\d+)/);
      const helkaMatch = result.text.match(/חלקה\s+(\d+)/);
      if (gushMatch) gush = gushMatch[1];
      if (helkaMatch) helka = helkaMatch[1];
      if (gush && helka) break;
    }
  }

  // If no parcel result, try searching specifically for parcel
  if (!gush && res.results.length > 0) {
    const firstResult = res.results[0];
    const coord = parseWktPoint(firstResult.shape);
    if (coord) {
      // Search for parcel at these coordinates
      const parcelSearch = await searchGovMapApi(
        `${firstResult.text}`,
        { filterType: 'parcel', maxResults: 3 },
      );
      for (const r of parcelSearch.results) {
        const gushMatch = r.text.match(/גוש\s+(\d+)/);
        const helkaMatch = r.text.match(/חלקה\s+(\d+)/);
        if (gushMatch) gush = gushMatch[1];
        if (helkaMatch) helka = helkaMatch[1];
        if (gush && helka) break;
      }

      if (!gush || !helka) {
        const parcel = await getParcelByCoordinates(coord.x, coord.y, true);
        if (parcel) {
          gush = gush || parcel.gush;
          helka = helka || parcel.helka;
        }
      }
    }
  }

  return { gush, helka, addresses: [...new Set(addresses)] };
}

/**
 * Find address(es) for a given gush/helka by searching GovMap.
 */
export async function getAddressFromParcelGovMap(
  gush: string,
  helka: string,
): Promise<LandPlotIdentifiers> {
  console.log(`[govmap-api] getAddressFromParcel: gush=${gush} helka=${helka}`);

  const res = await searchGovMapApi(`גוש ${gush} חלקה ${helka}`, {
    maxResults: 5,
    isAccurate: true,
  });

  const addresses: string[] = [];
  for (const result of res.results) {
    if (result.text) {
      addresses.push(result.text);
    }
  }

  return { gush, helka, addresses: [...new Set(addresses)] };
}

/**
 * Get land plot identifiers from coordinates or address.
 */
export async function getLandPlotIdentifiersGovMap(params: {
  coordinateX?: number;
  coordinateY?: number;
  landPlotId?: string;
}): Promise<LandPlotIdentifiers> {
  if (params.landPlotId) {
    return getParcelFromAddressGovMap(params.landPlotId);
  }

  if (params.coordinateX !== undefined && params.coordinateY !== undefined) {
    // Reverse-geocode: search near these coordinates
    // Note: govmap search API doesn't support coordinate-based search directly,
    // but we can use the layers-catalog endpoint
    console.log(
      `[govmap-api] getLandPlotIdentifiers by coords: ${params.coordinateX}, ${params.coordinateY}`,
    );

    try {
      const primaryEndpoint = `${API_BASE}/apps/parcel-search/address/${params.coordinateX},${params.coordinateY}`;
      const secondaryEndpoint = `${API_BASE}/layers-catalog/apps/parcel-search/address/${params.coordinateX},${params.coordinateY}`;
      const response = await fetch(primaryEndpoint, { headers: DEFAULT_HEADERS, cache: 'no-store' })
        .catch(async () => fetch(secondaryEndpoint, { headers: DEFAULT_HEADERS, cache: 'no-store' }));

      if (response.ok) {
        const data = await response.json();
        if (data?.properties) {
          return {
            gush: String(data.properties.gushnumber ?? ''),
            helka: String(data.properties.parcelnumber ?? ''),
            addresses: [],
          };
        }
      }
    } catch {
      // Fallback below
    }
  }

  return { gush: '', helka: '', addresses: [] };
}

// ── Layer Catalog ──────────────────────────────────────────────────────────

/**
 * Get the full GovMap layer catalog.
 */
export async function getLayerCatalog(language: 'he' | 'en' | 'ar' = 'he'): Promise<unknown> {
  console.log(`[govmap-api] getLayerCatalog: language=${language}`);

  const response = await fetch(
    `${API_BASE}/layers-catalog/catalog?language=${language}`,
    { headers: DEFAULT_HEADERS, cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error(`GovMap catalog API returned ${response.status}`);
  }

  return response.json();
}

// ── Taba / Planning ────────────────────────────────────────────────────────

interface GovMapTabaPlan {
  [key: string]: unknown;
}

/**
 * Get taba (planning) layers list from GovMap.
 */
export async function getTabaLayersGovMap(): Promise<GovMapTabaPlan[]> {
  console.log('[govmap-api] getTabaLayers');

  const response = await fetch(`${API_BASE}/taba/taba/layers`, {
    headers: DEFAULT_HEADERS,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap taba layers API returned ${response.status}`);
  }

  const data = await response.json();
  return data?.tabaLayers ?? data ?? [];
}

/**
 * Search taba plans by plan number/name.
 */
export async function getTabaPlanGovMap(planId: string): Promise<TabaInfo[]> {
  console.log(`[govmap-api] getTabaPlan: "${planId}"`);

  const response = await fetch(
    `${API_BASE}/taba/taba/plan/${encodeURIComponent(planId)}`,
    { headers: DEFAULT_HEADERS, cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error(`GovMap taba plan API returned ${response.status}`);
  }

  const data = await response.json();
  const plans: unknown[] = Array.isArray(data) ? data : data?.plans ?? [data];

  return plans
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map(normalizeTabaPlan)
    .filter((p): p is TabaInfo => p !== null);
}

/**
 * Search taba plans by gush/helka.
 * First searches for the parcel to get coordinates, then searches by radius.
 */
export async function getTabaPlansByParcelGovMap(
  gush: string,
  helka: string,
): Promise<TabaInfo[]> {
  console.log(`[govmap-api] getTabaPlansByParcel: gush=${gush} helka=${helka}`);

  // First, geocode the parcel
  const searchRes = await searchGovMapApi(`גוש ${gush} חלקה ${helka}`, {
    maxResults: 1,
  });

  if (searchRes.results.length === 0) {
    return [];
  }

  const coord = parseWktPoint(searchRes.results[0].shape);
  if (!coord) {
    return [];
  }

  // Search taba plans by radius around the parcel
  const response = await fetch(`${API_BASE}/taba/taba/radius`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ x: coord.x, y: coord.y, radius: 50 }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap taba radius API returned ${response.status}`);
  }

  const data = await response.json();
  const plans: unknown[] = Array.isArray(data) ? data : data?.plans ?? [];

  return plans
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map(normalizeTabaPlan)
    .filter((p): p is TabaInfo => p !== null);
}

function normalizeTabaPlan(record: Record<string, unknown>): TabaInfo | null {
  const tabaCode = String(
    record.taba_code ?? record.tabaCode ?? record.plan_number ??
    record.planNumber ?? record.code ?? record.PL_NUMBER ?? '',
  ).trim();

  const tabaDescription = String(
    record.taba_description ?? record.tabaDescription ?? record.plan_name ??
    record.planName ?? record.description ?? record.PL_NAME ?? '',
  ).trim();

  if (!tabaCode && !tabaDescription) {
    return null;
  }

  return {
    taba_code: tabaCode,
    taba_description: tabaDescription,
    plan_status: String(
      record.plan_status ?? record.planStatus ?? record.status ?? record.PL_STATUS ?? '',
    ).trim() || undefined,
    locality: String(record.locality ?? record.city ?? record.PL_CITY ?? '').trim() || undefined,
    place: String(record.place ?? record.plan_place ?? record.PL_PLACE ?? '').trim() || undefined,
    source: 'govmap-api',
  };
}

// ── Spatial Queries ────────────────────────────────────────────────────────

/**
 * Query entities (features) by point on specific layers.
 */
export async function getEntitiesByPoint(
  point: [number, number],
  layers: Array<{ layerId: string; filter?: string }>,
): Promise<unknown[]> {
  console.log(`[govmap-api] getEntitiesByPoint: (${point[0]}, ${point[1]})`);

  const response = await fetch(`${API_BASE}/layers-catalog/entitiesByPoint`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ point, layers }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap entities API returned ${response.status}`);
  }

  const data = await response.json();
  return data?.data ?? data ?? [];
}

/**
 * Query entities by a field value on a layer.
 */
export async function getEntitiesByField(
  layerId: string,
  fieldName: string,
  fieldValue: string | number,
): Promise<unknown[]> {
  console.log(`[govmap-api] getEntitiesByField: ${layerId}.${fieldName}=${fieldValue}`);

  const response = await fetch(`${API_BASE}/layers-catalog/entitiesByField`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ layerId, fieldName, fieldValue }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap entities API returned ${response.status}`);
  }

  const data = await response.json();
  return data?.data ?? data ?? [];
}

// ── WFS / GeoServer vector queries ──────────────────────────────────────

/**
 * Get exact parcel centroid via WFS CQL_FILTER on gush_num + parcel.
 * Returns centroid [x, y] in EPSG:3857.
 */
export async function getParcelCentroidWFS(
  gush: number,
  helka: number,
): Promise<{ centroid: [number, number]; parcelLabel: string }> {
  console.log(`[govmap-api] getParcelCentroidWFS: gush=${gush} helka=${helka}`);

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'govmap:layer_parcel_all',
    CQL_FILTER: `gush_num=${gush} AND parcel=${helka}`,
    outputFormat: 'application/json',
    count: '1',
  });

  const response = await fetch(`${API_BASE}/geoserver/wfs?${params}`, {
    headers: { ...DEFAULT_HEADERS, Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap WFS API returned ${response.status}`);
  }

  const data = await response.json();
  const features = data?.features ?? [];
  if (features.length === 0) {
    throw new Error(`WFS: parcel gush ${gush} helka ${helka} not found`);
  }

  const geom = features[0].geometry;
  let cx: number, cy: number;

  if (geom.type === 'Point') {
    [cx, cy] = geom.coordinates;
  } else if (geom.type === 'Polygon') {
    const ring: number[][] = geom.coordinates[0];
    let sumX = 0, sumY = 0;
    for (const [x, y] of ring) {
      sumX += x;
      sumY += y;
    }
    cx = sumX / ring.length;
    cy = sumY / ring.length;
  } else if (geom.type === 'MultiPolygon') {
    const ring: number[][] = geom.coordinates[0][0];
    let sumX = 0, sumY = 0;
    for (const [x, y] of ring) {
      sumX += x;
      sumY += y;
    }
    cx = sumX / ring.length;
    cy = sumY / ring.length;
  } else {
    throw new Error(`Unexpected geometry type: ${geom.type}`);
  }

  const props = features[0].properties ?? {};
  const parcelLabel = `גוש ${props.gush_num ?? gush} חלקה ${props.parcel ?? helka}`;

  return { centroid: [cx, cy], parcelLabel };
}

/**
 * Search taba plans by radius using geoJson point format.
 */
export async function getTabaByRadiusGeoJson(
  x: number,
  y: number,
  radius = 50,
): Promise<TabaRadiusPlan[]> {
  console.log(`[govmap-api] getTabaByRadiusGeoJson: (${x}, ${y}) r=${radius}`);

  const response = await fetch(`${API_BASE}/taba/taba/radius`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({
      geoJson: { type: 'Point', coordinates: [x, y] },
      radius,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap taba radius API returned ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data?.tabaPlans ?? data?.plans ?? [];
}

// ── Planning data (all layers for a parcel) ────────────────────────────────

const PLANNING_LAYERS = [
  { id: '294', name: 'תב"ע', serviceLayerId: 'govmap:layer_taba_msbs_itm' },
  { id: '358', name: 'רמ"י-תכניות אב', serviceLayerId: 'govmap:layer_tochniot' },
  { id: '50', name: 'תכניות בהכנה', serviceLayerId: 'govmap:layer_talar_prep' },
  { id: '361', name: 'תכניות בעבודה-רמ"י', serviceLayerId: 'govmap:layer_tochniotavoda' },
  { id: '203', name: 'קווים כחולים מבא"ת', serviceLayerId: 'govmap:layer_mehoziot_app_taba' },
  { id: '14', name: 'יעודי קרקע-מבא"ת', serviceLayerId: 'govmap:layer_mehoziot_app_yk' },
] as const;

interface RawEntityField {
  fieldName: string;
  fieldDisplay: string;
  fieldValue: string | null;
  fieldType: number;
}

interface RawEntity {
  objectId: number;
  centroid: number[];
  geom: string;
  fields: RawEntityField[];
}

interface RawLayer {
  name: string;
  caption: string;
  entities: RawEntity[];
}

/**
 * Get all planning data for a parcel across 6 planning-related layers.
 *
 * 3-step exact pipeline:
 * 1. Exact parcel centroid via WFS (no fuzzy text search)
 * 2. entitiesByPoint across all planning layers using exact centroid
 * 3. taba/radius with geoJson for תכנית אב/מתאר data
 */
export async function getParcelPlanningData(
  gush: string,
  helka: string,
): Promise<ParcelPlanningData> {
  console.log(`[govmap-api] getParcelPlanningData: gush=${gush} helka=${helka}`);

  // Step 1: exact parcel centroid via WFS
  const { centroid: point, parcelLabel } = await getParcelCentroidWFS(Number(gush), Number(helka));

  // Step 2: query all planning layers at this exact point
  const layers = PLANNING_LAYERS.map((l) => ({ layerId: l.id }));

  const response = await fetch(`${API_BASE}/layers-catalog/entitiesByPoint`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({
      point,
      layers,
      tolerance: 10,
      calculateDistance: false,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap entitiesByPoint API returned ${response.status}`);
  }

  const json = await response.json();
  const rawLayers: RawLayer[] = json?.data ?? [];

  const layerResults = rawLayers.map((layer) => {
    const layerDef = PLANNING_LAYERS.find(
      (l) => l.serviceLayerId === layer.name || l.name === layer.caption,
    );
    return {
      layerId: layerDef?.id ?? layer.name,
      layerName: layerDef?.name ?? layer.caption,
      serviceLayerId: layer.name,
      entityCount: layer.entities.length,
      entities: layer.entities.map((e) => {
        const fields: Record<string, string | null> = {};
        for (const f of e.fields) {
          fields[f.fieldName] = f.fieldValue;
        }
        return { objectId: e.objectId, fields };
      }),
    };
  });

  // Step 3: taba/radius for תכנית אב/מתאר data
  let tabaPlans: TabaRadiusPlan[] = [];
  try {
    tabaPlans = await getTabaByRadiusGeoJson(point[0], point[1], 50);
  } catch {
    // taba/radius may fail — non-critical, continue with layer data
  }

  return {
    gush: Number(gush),
    helka: Number(helka),
    point,
    parcelLabel,
    layers: layerResults,
    tabaPlans,
  };
}

// ── Search Types ───────────────────────────────────────────────────────────

/**
 * Get available search result types/categories.
 */
export async function getSearchTypes(language: 'he' | 'en' | 'ar' = 'he'): Promise<unknown> {
  const response = await fetch(`${API_BASE}/search-service/getTypes`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ language }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GovMap search types API returned ${response.status}`);
  }

  return response.json();
}
