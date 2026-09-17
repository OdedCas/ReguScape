import type { LandPlotIdentifiers, TabaInfo } from '@/types';

const ARCGIS_BASE =
  'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer';
const STREETS_API =
  'https://www5.tel-aviv.gov.il/TlvForms/Controls/Tac/TlvCitiesStreetsNums.ashx';
const TLV_CITY_CODE = 5000;

export const TLV_LAYERS = {
  ADDRESSES: 527,
  PARCELS: 524,
  CITY_PLANS: 528,
  PERMITS: 772,
  LAND_USE: 514,
  LAND_USE_DETAIL: 837,
} as const;

interface ArcGISFeature<T = Record<string, unknown>> {
  attributes: T;
  geometry?: ArcGISPolygon;
}

interface ArcGISPolygon {
  rings: number[][][];
}

interface ArcGISQueryResponse<T = Record<string, unknown>> {
  features: ArcGISFeature<T>[];
  error?: { code: number; message: string };
}

interface Envelope {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: { wkid: number };
}

export interface TlvParcelInfo {
  gush: number;
  helka: number;
  registeredArea: number | null;
  graphicArea: number | null;
  shapeArea: number | null;
  ownership: number | null;
  lastUpdate: Date | null;
  note: string | null;
  gushHelkaCode: number | null;
}

export interface TlvAddressInfo {
  address: string;
  street: string;
  streetEng: string | null;
  house: number;
  entrance: string | null;
  gush: number;
  helka: number;
  x: number;
  y: number;
  lon: number;
  lat: number;
}

export interface TlvCityPlan {
  planNumber: string;
  planName: string;
  status: string;
  statusGeneral: string;
  validDate: Date | null;
  depositDate: Date | null;
  classification: string;
  area: number | null;
  residential: { units: number | null; area: number | null };
  commercial: { area: number | null };
  employment: { area: number | null };
  publicBuilding: { area: number | null };
}

export interface TlvBuildingPermit {
  requestNumber: number | null;
  permitNumber: number | null;
  permitDate: Date | null;
  expiryDate: Date | null;
  openDate: Date | null;
  requestType: string;
  description: string;
  housingUnits: number | null;
  tama38: string;
  buildingStage: string;
  addresses: string;
  progress: string;
  licensingTrack: string;
}

export interface TlvLandUse {
  gush: number | null;
  plotNumber: number | null;
  landUse: string;
  mainLandUse: string;
  definingPlan: string;
  area: number | null;
  registeredArea: number | null;
  rightsArea: number | null;
  buildingPercent: number | null;
  allowedFloors: number | null;
  allowedUnits: number | null;
}

export interface TlvFullBuildingRights {
  query: { gush: number; helka: number };
  address: TlvAddressInfo | null;
  parcel: TlvParcelInfo | null;
  cityPlans: { count: number; active: number; items: TlvCityPlan[] };
  permits: { count: number; items: TlvBuildingPermit[] };
  landUse: { count: number; items: TlvLandUse[] };
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function queryLayer<T = Record<string, unknown>>(
  layerId: number,
  params: Record<string, string>,
): Promise<T[]> {
  const url = new URL(`${ARCGIS_BASE}/${layerId}/query`);
  const defaults: Record<string, string> = {
    f: 'json',
    returnGeometry: 'false',
    outFields: '*',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...params })) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString(), { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`ArcGIS returned ${resp.status}`);
  }
  const data = (await resp.json()) as ArcGISQueryResponse<T>;
  if (data.error) {
    throw new Error(`ArcGIS ${data.error.code}: ${data.error.message}`);
  }
  return data.features.map((f) => f.attributes);
}

async function queryLayerWithGeometry<T = Record<string, unknown>>(
  layerId: number,
  params: Record<string, string>,
): Promise<ArcGISFeature<T>[]> {
  const url = new URL(`${ARCGIS_BASE}/${layerId}/query`);
  const defaults: Record<string, string> = {
    f: 'json',
    returnGeometry: 'true',
    outFields: '*',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...params })) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString(), { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`ArcGIS returned ${resp.status}`);
  }
  const data = (await resp.json()) as ArcGISQueryResponse<T>;
  if (data.error) {
    throw new Error(`ArcGIS ${data.error.code}: ${data.error.message}`);
  }
  return data.features;
}

async function spatialQuery<T = Record<string, unknown>>(
  layerId: number,
  envelope: Envelope,
  outFields = '*',
): Promise<T[]> {
  return queryLayer<T>(layerId, {
    geometry: JSON.stringify(envelope),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
  });
}

function getEnvelope(geometry: ArcGISPolygon): Envelope {
  const rings = Array.isArray(geometry.rings) ? geometry.rings : [];
  const points = rings.flat();
  if (points.length === 0) {
    return {
      xmin: 0,
      ymin: 0,
      xmax: 0,
      ymax: 0,
      spatialReference: { wkid: 2039 },
    };
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    xmin: Math.min(...xs),
    ymin: Math.min(...ys),
    xmax: Math.max(...xs),
    ymax: Math.max(...ys),
    spatialReference: { wkid: 2039 },
  };
}

export async function tlvAddressToGushHelka(
  streetName: string,
  houseNumber: number,
): Promise<TlvAddressInfo | null> {
  const safeStreet = escapeSqlLiteral(streetName.trim());
  const results = await queryLayer<Record<string, unknown>>(TLV_LAYERS.ADDRESSES, {
    where: `t_rechov LIKE '%${safeStreet}%' AND ms_bayit=${houseNumber}`,
    outFields:
      't_ktovet_melea,t_rechov,t_rechov_eng,ms_bayit,knisa,ms_gush,ms_chelka,x,y,lon,lat',
    resultRecordCount: '1',
  });
  if (results.length === 0) {
    return null;
  }

  const r = results[0];
  return {
    address: String(r.t_ktovet_melea ?? '').trim(),
    street: String(r.t_rechov ?? '').trim(),
    streetEng: r.t_rechov_eng ? String(r.t_rechov_eng).trim() : null,
    house: Number(r.ms_bayit),
    entrance: r.knisa ? String(r.knisa).trim() : null,
    gush: Number(r.ms_gush),
    helka: Number(r.ms_chelka),
    x: Number(r.x),
    y: Number(r.y),
    lon: Number(r.lon),
    lat: Number(r.lat),
  };
}

export async function tlvGetParcelInfo(
  gush: number,
  helka: number,
): Promise<{ info: TlvParcelInfo; geometry: ArcGISPolygon } | null> {
  const features = await queryLayerWithGeometry(TLV_LAYERS.PARCELS, {
    where: `ms_gush=${gush} AND ms_chelka=${helka}`,
    resultRecordCount: '1',
  });
  if (features.length === 0 || !features[0]?.geometry) {
    return null;
  }

  const a = features[0].attributes as Record<string, unknown>;
  return {
    info: {
      gush: Number(a.ms_gush),
      helka: Number(a.ms_chelka),
      registeredArea: a.ms_shetach_rashum != null ? Number(a.ms_shetach_rashum) : null,
      graphicArea: a.ms_shetach != null ? Number(a.ms_shetach) : null,
      shapeArea: a.Shape_Area != null ? Number(a.Shape_Area) : null,
      ownership: a.sw_baalut != null ? Number(a.sw_baalut) : null,
      lastUpdate: a.tr_idkun_acharon ? new Date(Number(a.tr_idkun_acharon)) : null,
      note: a.heara ? String(a.heara) : null,
      gushHelkaCode: a.ms_gush_vechelka != null ? Number(a.ms_gush_vechelka) : null,
    },
    geometry: features[0].geometry,
  };
}

export async function tlvGetCityPlans(
  gush: number,
  helka: number,
): Promise<TlvCityPlan[]> {
  const parcel = await tlvGetParcelInfo(gush, helka);
  if (!parcel?.geometry) {
    return [];
  }
  const envelope = getEnvelope(parcel.geometry);
  const results = await spatialQuery<Record<string, unknown>>(
    TLV_LAYERS.CITY_PLANS,
    envelope,
    'taba,shem_taba,t_status,t_status_klali,tr_matan_tokef,tr_hafkada,t_sivug,ms_shetach,megurim_yechidot,megurim_shetach,mischar_shetach,taasuka_shetach,mivney_tzibur_shetach',
  );

  return results.map((r) => ({
    planNumber: String(r.taba ?? '').trim(),
    planName: String(r.shem_taba ?? '').trim(),
    status: String(r.t_status ?? '').trim(),
    statusGeneral: String(r.t_status_klali ?? '').trim(),
    validDate: r.tr_matan_tokef ? new Date(Number(r.tr_matan_tokef)) : null,
    depositDate: r.tr_hafkada ? new Date(Number(r.tr_hafkada)) : null,
    classification: String(r.t_sivug ?? '').trim(),
    area: r.ms_shetach != null ? Number(r.ms_shetach) : null,
    residential: {
      units: r.megurim_yechidot != null ? Number(r.megurim_yechidot) : null,
      area: r.megurim_shetach != null ? Number(r.megurim_shetach) : null,
    },
    commercial: { area: r.mischar_shetach != null ? Number(r.mischar_shetach) : null },
    employment: { area: r.taasuka_shetach != null ? Number(r.taasuka_shetach) : null },
    publicBuilding: { area: r.mivney_tzibur_shetach != null ? Number(r.mivney_tzibur_shetach) : null },
  }));
}

export async function tlvGetBuildingPermits(
  gush: number,
  helka: number,
): Promise<TlvBuildingPermit[]> {
  const parcel = await tlvGetParcelInfo(gush, helka);
  if (!parcel?.geometry) {
    return [];
  }
  const envelope = getEnvelope(parcel.geometry);
  const results = await spatialQuery<Record<string, unknown>>(
    TLV_LAYERS.PERMITS,
    envelope,
    'request_num,permission_num,permission_date,expiry_date,open_request,sug_bakasha,tochen_bakasha,yechidot_diyur,sw_tama_38,building_stage,addresses,progress,maslul_rishuy',
  );

  return results.map((r) => ({
    requestNumber: r.request_num != null ? Number(r.request_num) : null,
    permitNumber: r.permission_num != null ? Number(r.permission_num) : null,
    permitDate: r.permission_date ? new Date(Number(r.permission_date)) : null,
    expiryDate: r.expiry_date ? new Date(Number(r.expiry_date)) : null,
    openDate: r.open_request ? new Date(Number(r.open_request)) : null,
    requestType: String(r.sug_bakasha ?? '').trim(),
    description: String(r.tochen_bakasha ?? '').trim(),
    housingUnits: r.yechidot_diyur != null ? Number(r.yechidot_diyur) : null,
    tama38: String(r.sw_tama_38 ?? '').trim(),
    buildingStage: String(r.building_stage ?? '').trim(),
    addresses: String(r.addresses ?? '').trim(),
    progress: String(r.progress ?? '').trim(),
    licensingTrack: String(r.maslul_rishuy ?? '').trim(),
  }));
}

export async function tlvGetLandUse(
  gush: number,
  helka: number,
): Promise<TlvLandUse[]> {
  const parcel = await tlvGetParcelInfo(gush, helka);
  if (!parcel?.geometry) {
    return [];
  }
  const envelope = getEnvelope(parcel.geometry);
  const results = await spatialQuery<Record<string, unknown>>(
    TLV_LAYERS.LAND_USE,
    envelope,
    'ms_gush,ms_migrash,t_yeud_karka,t_yeud_rashi,st_taba,ms_shetach,ms_shetach_rashum,ms_shetach_lechishuv_zchuyot',
  );

  return results.map((r) => ({
    gush: r.ms_gush != null ? Number(r.ms_gush) : null,
    plotNumber: r.ms_migrash != null ? Number(r.ms_migrash) : null,
    landUse: String(r.t_yeud_karka ?? '').trim(),
    mainLandUse: String(r.t_yeud_rashi ?? '').trim(),
    definingPlan: String(r.st_taba ?? '').trim(),
    area: r.ms_shetach != null ? Number(r.ms_shetach) : null,
    registeredArea: r.ms_shetach_rashum != null ? Number(r.ms_shetach_rashum) : null,
    rightsArea: r.ms_shetach_lechishuv_zchuyot != null ? Number(r.ms_shetach_lechishuv_zchuyot) : null,
    buildingPercent: null,
    allowedFloors: null,
    allowedUnits: null,
  }));
}

export async function tlvGetCityPlansAsTabaInfo(
  gush: string,
  helka: string,
): Promise<TabaInfo[]> {
  const plans = await tlvGetCityPlans(Number(gush), Number(helka));
  return plans.map((p) => ({
    taba_code: p.planNumber,
    taba_description: p.planName,
    plan_status: p.status || undefined,
    lot_size_sqm: p.area ?? undefined,
    max_buildable_area_sqm: p.residential.area ?? undefined,
    source: 'tlv-arcgis',
  }));
}

export async function tlvGetLandPlotIdentifiers(
  streetName: string,
  houseNumber: number,
): Promise<LandPlotIdentifiers> {
  const info = await tlvAddressToGushHelka(streetName, houseNumber);
  if (!info) {
    return { gush: '', helka: '', addresses: [] };
  }
  return {
    gush: String(info.gush),
    helka: String(info.helka),
    addresses: [info.address].filter(Boolean),
  };
}

export async function tlvGetFullBuildingRights(
  input: { street: string; house: number } | { gush: number; helka: number },
): Promise<TlvFullBuildingRights> {
  let gush: number;
  let helka: number;
  let addressInfo: TlvAddressInfo | null = null;

  if ('street' in input) {
    const addr = await tlvAddressToGushHelka(input.street, input.house);
    if (!addr) {
      return {
        query: { gush: 0, helka: 0 },
        address: null,
        parcel: null,
        cityPlans: { count: 0, active: 0, items: [] },
        permits: { count: 0, items: [] },
        landUse: { count: 0, items: [] },
      };
    }
    addressInfo = addr;
    gush = addr.gush;
    helka = addr.helka;
  } else {
    gush = input.gush;
    helka = input.helka;
  }

  const [parcelResult, plans, permits, landUse] = await Promise.all([
    tlvGetParcelInfo(gush, helka),
    tlvGetCityPlans(gush, helka),
    tlvGetBuildingPermits(gush, helka),
    tlvGetLandUse(gush, helka),
  ]);

  return {
    query: { gush, helka },
    address: addressInfo,
    parcel: parcelResult?.info ?? null,
    cityPlans: {
      count: plans.length,
      active: plans.filter((p) => p.statusGeneral === 'בתוקף').length,
      items: plans,
    },
    permits: {
      count: permits.length,
      items: permits,
    },
    landUse: {
      count: landUse.length,
      items: landUse,
    },
  };
}

interface TlvStreet {
  code: number;
  name: string;
}

export async function tlvGetStreets(): Promise<TlvStreet[]> {
  const resp = await fetch(`${STREETS_API}?CityCode=${TLV_CITY_CODE}`, {
    cache: 'no-store',
  });
  if (!resp.ok) {
    throw new Error(`Streets API returned ${resp.status}`);
  }
  const data = (await resp.json()) as Array<{ Id: number; Caption: string }>;
  return data.map((s) => ({ code: s.Id, name: s.Caption }));
}
