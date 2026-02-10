import type {
  BuildingRegulations,
  LandPlotIdentifiers,
  TabaInfo,
} from '@/types';

interface ScraperConfig {
  apiBaseUrl: string;
  apiKey: string;
  landPlotPath: string;
  parcelFromAddressPath: string;
  addressFromParcelPath: string;
  tabaPath: string;
  regulationsPath: string;
}

type QueryValue = string | number | undefined;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function readOptionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function getConfig(): ScraperConfig {
  return {
    apiBaseUrl: readRequiredEnv('SCRAPER_API_BASE_URL'),
    apiKey: readRequiredEnv('SCRAPER_API_KEY'),
    landPlotPath: readOptionalEnv('SCRAPER_LAND_PLOT_PATH', '/get_land_plot_identifiers'),
    parcelFromAddressPath: readOptionalEnv('SCRAPER_PARCEL_FROM_ADDRESS_PATH', '/get_parcel_from_address'),
    addressFromParcelPath: readOptionalEnv('SCRAPER_ADDRESS_FROM_PARCEL_PATH', '/get_address_from_parcel'),
    tabaPath: readOptionalEnv('SCRAPER_TABA_PATH', '/get_taba_info'),
    regulationsPath: readOptionalEnv('SCRAPER_REGULATIONS_PATH', '/get_building_regulations'),
  };
}

function buildUrl(baseUrl: string, endpointPath: string, query: Record<string, QueryValue>): URL {
  const normalizedEndpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const url = new URL(baseUrl);
  const normalizedBasePath = url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1)
    : url.pathname;
  url.pathname = `${normalizedBasePath}${normalizedEndpointPath}`.replace(/\/{2,}/g, '/');

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function unwrapPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  if (record.data !== undefined) {
    return record.data;
  }
  if (record.result !== undefined) {
    return record.result;
  }

  return payload;
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

function toNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const str = toStringValue(item);
    if (str.length > 0) {
      unique.add(str);
    }
  }

  return Array.from(unique);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function extractErrorText(status: number, responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return `Scraper API returned ${status}`;
  }
  return `Scraper API returned ${status}: ${trimmed.slice(0, 200)}`;
}

async function requestScraper(
  endpointPath: string,
  query: Record<string, QueryValue>,
): Promise<unknown> {
  const config = getConfig();
  const url = buildUrl(config.apiBaseUrl, endpointPath, query);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': config.apiKey,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(extractErrorText(response.status, responseText));
  }

  const payload = (await response.json()) as unknown;
  return unwrapPayload(payload);
}

export async function getLandPlotIdentifiers(params: {
  coordinateX?: number;
  coordinateY?: number;
  landPlotId?: string;
}): Promise<LandPlotIdentifiers> {
  const config = getConfig();
  const payload = await requestScraper(config.landPlotPath, {
    coordinate_x: params.coordinateX,
    coordinate_y: params.coordinateY,
    land_plot_id: params.landPlotId,
  });
  const record = toRecord(payload);

  const addresses = toStringArray(record.addresses);
  const singleAddress = toStringValue(record.address);
  if (singleAddress && !addresses.includes(singleAddress)) {
    addresses.unshift(singleAddress);
  }

  return {
    gush: toStringValue(record.gush),
    helka: toStringValue(record.helka),
    addresses,
  };
}

export async function getParcelFromAddress(address: string): Promise<LandPlotIdentifiers> {
  const normalizedAddress = address.trim();
  if (!normalizedAddress) {
    return { gush: '', helka: '', addresses: [] };
  }

  const config = getConfig();
  const payload = await requestScraper(config.parcelFromAddressPath, {
    address: normalizedAddress,
  });
  const record = toRecord(payload);

  const addresses = toStringArray(record.addresses);
  const returnedAddress = toStringValue(record.address);
  if (returnedAddress && !addresses.includes(returnedAddress)) {
    addresses.unshift(returnedAddress);
  }
  const description = toStringValue(record.description);
  if (description && !addresses.includes(description)) {
    addresses.push(description);
  }

  // When scraper only returns identifiers and description, keep the original query as a useful label.
  if (addresses.length === 0) {
    addresses.push(normalizedAddress);
  }

  return {
    gush: toStringValue(record.gush),
    helka: toStringValue(record.helka),
    addresses,
  };
}

export async function getAddressFromParcel(gush: string, helka: string): Promise<LandPlotIdentifiers> {
  const normalizedGush = gush.trim();
  const normalizedHelka = helka.trim();
  if (!normalizedGush || !normalizedHelka) {
    return { gush: '', helka: '', addresses: [] };
  }

  const config = getConfig();
  const payload = await requestScraper(config.addressFromParcelPath, {
    gush: normalizedGush,
    helka: normalizedHelka,
  });
  const record = toRecord(payload);

  const addresses = toStringArray(record.addresses);
  const singleAddress = toStringValue(record.address);
  if (singleAddress && !addresses.includes(singleAddress)) {
    addresses.unshift(singleAddress);
  }

  const description = toStringValue(record.description);
  if (description && !addresses.includes(description)) {
    addresses.push(description);
  }

  return {
    gush: normalizedGush,
    helka: normalizedHelka,
    addresses,
  };
}

function normalizeSingleTabaPlan(value: unknown): TabaInfo | null {
  const record = toRecord(value);
  const tabaCode = toStringValue(
    record.taba_code ?? record.tabaCode ?? record.plan_number ?? record.planNumber ?? record.code,
  );
  const tabaDescription = toStringValue(
    record.taba_description ?? record.tabaDescription ?? record.plan_name ?? record.planName ?? record.description,
  );

  if (!tabaCode && !tabaDescription) {
    return null;
  }

  return {
    taba_code: tabaCode,
    taba_description: tabaDescription,
    plan_status: toStringValue(record.plan_status ?? record.planStatus ?? record.status),
    locality: toStringValue(record.locality ?? record.city),
    place: toStringValue(record.place ?? record.plan_place ?? record.planPlace),
    takanon_url: toStringValue(record.takanon_url ?? record.takanonUrl),
    plan_page_url: toStringValue(record.plan_page_url ?? record.planPageUrl),
    lot_size_sqm: toNumberValue(record.lot_size_sqm ?? record.lotSizeSqm),
    max_floors: toNumberValue(record.max_floors ?? record.maxFloors),
    max_buildable_area_sqm: toNumberValue(
      record.max_buildable_area_sqm ?? record.maxBuildableAreaSqm,
    ),
    source: toStringValue(record.source) || 'scraper',
  };
}

export async function getTabaPlans(gush: string, helka: string): Promise<TabaInfo[]> {
  const config = getConfig();
  const payload = await requestScraper(config.tabaPath, { gush, helka });

  const candidates: unknown[] = (() => {
    if (Array.isArray(payload)) {
      return payload;
    }
    const record = toRecord(payload);
    if (Array.isArray(record.plans)) {
      return record.plans;
    }
    if (Object.keys(record).length > 0) {
      return [record];
    }
    return [];
  })();

  const unique = new Map<string, TabaInfo>();
  for (const candidate of candidates) {
    const plan = normalizeSingleTabaPlan(candidate);
    if (!plan) {
      continue;
    }
    const dedupeKey = `${plan.taba_code}|${plan.taba_description}`;
    unique.set(dedupeKey, plan);
  }

  return Array.from(unique.values());
}

export async function getBuildingRegulations(
  gush: string,
  helka: string,
): Promise<BuildingRegulations> {
  const config = getConfig();
  const payload = await requestScraper(config.regulationsPath, { gush, helka });
  const record = toRecord(payload);

  return {
    max_floors: toNumberValue(record.max_floors ?? record.maxFloors),
    max_buildable_area_sqm: toNumberValue(
      record.max_buildable_area_sqm ?? record.maxBuildableAreaSqm,
    ),
  };
}
