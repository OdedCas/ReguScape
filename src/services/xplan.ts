type XplanServiceName = 'xplan_without_77_78' | 'Xplan_77_78';
type XplanQueryMode = 'plan-number' | 'point' | 'gush-helka';

export interface XplanPlan {
  planNumber: string;
  planName: string;
  status: string;
  locality: string;
  planUrl: string;
  areaDunam?: number;
  planDate?: string;
}

export interface XplanServiceResult {
  service: XplanServiceName;
  planCount: number;
  exceededTransferLimit: boolean;
  plans: XplanPlan[];
}

interface XplanQueryContext {
  planNumber?: string;
  point?: { x: number; y: number };
  gush?: string;
  helka?: string;
}

export interface XplanQueryResult {
  mode: XplanQueryMode;
  include77_78: boolean;
  limit: number;
  query: XplanQueryContext;
  parcelPoint?: { x: number; y: number };
  services: XplanServiceResult[];
  totalPlans: number;
  xplanSiteUrl: string;
  officialReferenceUrl: string;
}

export type XplanQueryInput =
  | {
      mode: 'plan-number';
      planNumber: string;
      include77_78: boolean;
      limit: number;
    }
  | {
      mode: 'point';
      x: number;
      y: number;
      include77_78: boolean;
      limit: number;
    }
  | {
      mode: 'gush-helka';
      gush: string;
      helka: string;
      include77_78: boolean;
      limit: number;
    };

const XPLAN_SITE_URL = 'https://ags.iplan.gov.il/xplan/';
const OFFICIAL_REFERENCE_URL = 'https://mavat.iplan.gov.il/SV1';
const XPLAN_SERVICE_BASE =
  'https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic';
const XPLAN_LAYER_ID = 1;
const PARCEL_WFS_BASE = 'https://open.govmap.gov.il/geoserver/opendata/wfs';

const MAIN_SERVICE: XplanServiceName = 'xplan_without_77_78';
const SECTION_77_78_SERVICE: XplanServiceName = 'Xplan_77_78';

const DEFAULT_OUT_FIELDS = [
  'pl_number',
  'pl_name',
  'station_desc',
  'plan_county_name',
  'pl_url',
  'pl_area_dunam',
  'pl_date_8',
  'internet_short_status',
].join(',');

interface ArcGisQueryError {
  message?: string;
  details?: string[];
}

interface ArcGisGeometry {
  x?: number;
  y?: number;
  rings?: number[][][];
}

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
  geometry?: ArcGisGeometry;
}

interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: ArcGisQueryError;
}

type GeoJsonGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

interface GeoJsonFeature {
  geometry?: GeoJsonGeometry | null;
}

interface GeoJsonFeatureCollection {
  features?: GeoJsonFeature[];
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 20;
  }
  return Math.max(1, Math.min(200, Math.round(value)));
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function toNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function escapeArcGisLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function serviceUrl(service: XplanServiceName): string {
  return `${XPLAN_SERVICE_BASE}/${service}/MapServer/${XPLAN_LAYER_ID}/query`;
}

function normalizePlan(feature: ArcGisFeature): XplanPlan {
  const attrs = feature.attributes ?? {};
  const planNumber = toStringValue(attrs.pl_number) || toStringValue(attrs.pl_id);
  const planName = toStringValue(attrs.pl_name);
  const status = toStringValue(attrs.station_desc) || toStringValue(attrs.internet_short_status);
  const locality = toStringValue(attrs.plan_county_name);
  const planUrl = toStringValue(attrs.pl_url);
  const areaDunam = toNumberValue(attrs.pl_area_dunam);
  const planDate = toStringValue(attrs.pl_date_8);

  return {
    planNumber,
    planName,
    status,
    locality,
    planUrl,
    areaDunam,
    planDate,
  };
}

function makePointParams(x: number, y: number, limit: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set('geometry', `${x},${y}`);
  params.set('geometryType', 'esriGeometryPoint');
  params.set('inSR', '2039');
  params.set('spatialRel', 'esriSpatialRelIntersects');
  params.set('outFields', DEFAULT_OUT_FIELDS);
  params.set('orderByFields', 'pl_number');
  params.set('resultRecordCount', String(clampLimit(limit)));
  params.set('returnGeometry', 'false');
  params.set('f', 'pjson');
  return params;
}

function makePlanNumberParams(planNumber: string, limit: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set(
    'where',
    `UPPER(pl_number) LIKE UPPER('%${escapeArcGisLiteral(planNumber)}%')`,
  );
  params.set('outFields', DEFAULT_OUT_FIELDS);
  params.set('orderByFields', 'pl_number');
  params.set('resultRecordCount', String(clampLimit(limit)));
  params.set('returnGeometry', 'false');
  params.set('f', 'pjson');
  return params;
}

async function queryArcGisService(
  service: XplanServiceName,
  params: URLSearchParams,
): Promise<XplanServiceResult> {
  const url = `${serviceUrl(service)}?${params.toString()}`;
  console.log(`[xplan] query service=${service} url=${url}`);

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`XPLAN API returned ${response.status} for ${service}`);
  }

  const payload = (await response.json()) as ArcGisQueryResponse;
  if (payload.error) {
    const details = Array.isArray(payload.error.details) ? payload.error.details.join('; ') : '';
    const msg = payload.error.message || 'Unknown ArcGIS error';
    throw new Error(`XPLAN query error (${service}): ${msg}${details ? ` (${details})` : ''}`);
  }

  const features = Array.isArray(payload.features) ? payload.features : [];
  const plans = features.map(normalizePlan).filter((plan) => {
    return plan.planNumber || plan.planName || plan.planUrl;
  });

  return {
    service,
    planCount: plans.length,
    exceededTransferLimit: Boolean(payload.exceededTransferLimit),
    plans,
  };
}

function updateBounds(bounds: Bounds | null, x: number, y: number): Bounds {
  if (bounds === null) {
    return { minX: x, maxX: x, minY: y, maxY: y };
  }
  return {
    minX: Math.min(bounds.minX, x),
    maxX: Math.max(bounds.maxX, x),
    minY: Math.min(bounds.minY, y),
    maxY: Math.max(bounds.maxY, y),
  };
}

function boundsFromPolygonCoordinates(coordinates: number[][][]): Bounds | null {
  let bounds: Bounds | null = null;
  for (const ring of coordinates) {
    for (const point of ring) {
      if (point.length < 2) {
        continue;
      }
      const x = point[0];
      const y = point[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      bounds = updateBounds(bounds, x, y);
    }
  }
  return bounds;
}

function centerFromGeometry(geometry: GeoJsonGeometry): { x: number; y: number } | null {
  if (geometry.type === 'Point') {
    const [x, y] = geometry.coordinates;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
    return null;
  }

  if (geometry.type === 'Polygon') {
    const bounds = boundsFromPolygonCoordinates(geometry.coordinates);
    if (!bounds) {
      return null;
    }
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
  }

  let combinedBounds: Bounds | null = null;
  for (const polygon of geometry.coordinates) {
    const bounds = boundsFromPolygonCoordinates(polygon);
    if (!bounds) {
      continue;
    }
    combinedBounds = updateBounds(combinedBounds, bounds.minX, bounds.minY);
    combinedBounds = updateBounds(combinedBounds, bounds.maxX, bounds.maxY);
  }

  if (!combinedBounds) {
    return null;
  }

  return {
    x: (combinedBounds.minX + combinedBounds.maxX) / 2,
    y: (combinedBounds.minY + combinedBounds.maxY) / 2,
  };
}

function normalizeGushHelka(rawGush: string, rawHelka: string): { gush: string; helka: string } {
  const gush = rawGush.replace(/[^\d]/g, '');
  const helka = rawHelka.replace(/[^\d]/g, '');
  if (!gush || !helka) {
    throw new Error('gush ו-helka חייבים להיות מספרים תקינים');
  }
  return { gush, helka };
}

async function resolveParcelPointByGushHelka(gush: string, helka: string): Promise<{ x: number; y: number }> {
  const filter = `GUSH_NUM = ${gush} AND GUSH_SUFFI = 0 AND PARCEL = ${helka}`;
  const params = new URLSearchParams();
  params.set('SERVICE', 'WFS');
  params.set('REQUEST', 'GetFeature');
  params.set('typeName', 'Parcels_ITM');
  params.set('VERSION', '2.0.0');
  params.set('outputFormat', 'json');
  params.set('resultType', 'results');
  params.set('propertyName', 'GUSH_NUM,GUSH_SUFFI,PARCEL,the_geom');
  params.set('cql_filter', filter);

  const url = `${PARCEL_WFS_BASE}?${params.toString()}`;
  console.log(`[xplan] resolve parcel point gush=${gush} helka=${helka}`);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Parcel WFS returned ${response.status}`);
  }

  const payload = (await response.json()) as GeoJsonFeatureCollection;
  const features = Array.isArray(payload.features) ? payload.features : [];
  if (features.length === 0) {
    throw new Error(`לא נמצאה חלקה עבור גוש ${gush} חלקה ${helka}`);
  }

  const geometry = features[0].geometry;
  if (!geometry) {
    throw new Error('Parcel WFS returned feature without geometry');
  }

  const center = centerFromGeometry(geometry);
  if (!center) {
    throw new Error('Unable to resolve parcel geometry center');
  }

  return center;
}

function serviceList(include77_78: boolean): XplanServiceName[] {
  return include77_78 ? [MAIN_SERVICE, SECTION_77_78_SERVICE] : [MAIN_SERVICE];
}

export async function queryXplan(input: XplanQueryInput): Promise<XplanQueryResult> {
  const include77_78 = input.include77_78;
  const limit = clampLimit(input.limit);

  let queryMode: XplanQueryMode;
  let queryContext: XplanQueryContext;
  let point: { x: number; y: number } | null = null;
  let parcelPoint: { x: number; y: number } | undefined;

  if (input.mode === 'plan-number') {
    queryMode = 'plan-number';
    const planNumber = input.planNumber.trim();
    if (!planNumber) {
      throw new Error('plan_number לא יכול להיות ריק');
    }
    queryContext = { planNumber };
  } else if (input.mode === 'point') {
    queryMode = 'point';
    point = { x: input.x, y: input.y };
    queryContext = { point };
  } else {
    queryMode = 'gush-helka';
    const normalized = normalizeGushHelka(input.gush, input.helka);
    parcelPoint = await resolveParcelPointByGushHelka(normalized.gush, normalized.helka);
    point = parcelPoint;
    queryContext = { gush: normalized.gush, helka: normalized.helka };
  }

  const services = serviceList(include77_78);
  const queryPromises = services.map(async (service) => {
    if (queryMode === 'plan-number') {
      return queryArcGisService(service, makePlanNumberParams(queryContext.planNumber || '', limit));
    }
    if (!point) {
      throw new Error('Missing point for spatial query');
    }
    return queryArcGisService(service, makePointParams(point.x, point.y, limit));
  });

  const serviceResults = await Promise.all(queryPromises);
  const totalPlans = serviceResults.reduce((sum, s) => sum + s.planCount, 0);

  return {
    mode: queryMode,
    include77_78,
    limit,
    query: queryContext,
    parcelPoint,
    services: serviceResults,
    totalPlans,
    xplanSiteUrl: XPLAN_SITE_URL,
    officialReferenceUrl: OFFICIAL_REFERENCE_URL,
  };
}
