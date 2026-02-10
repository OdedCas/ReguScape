import type { ParcelRegistrationInfo, ParcelUsageCode } from '@/types';

type QueryValue = string | number | undefined;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
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

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function extractErrorText(status: number, responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return `MAVAT API returned ${status}`;
  }
  return `MAVAT API returned ${status}: ${trimmed.slice(0, 200)}`;
}

async function requestMavat(
  endpointPath: string,
  query: Record<string, QueryValue>,
): Promise<unknown> {
  const apiBaseUrl = readRequiredEnv('MAVAT_API_BASE_URL');
  const apiKey = readRequiredEnv('SCRAPER_API_KEY');
  const url = buildUrl(apiBaseUrl, endpointPath, query);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': apiKey,
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

export async function getParcelRegistrationInfo(
  gush: string,
  helka: string,
): Promise<ParcelRegistrationInfo> {
  const payload = await requestMavat('/get_parcel_registration_info', {
    region_code: gush,
    parcel_number: helka,
  });
  const record = toRecord(payload);

  return {
    taba_info: toStringValue(record.taba_info ?? record.tabaInfo),
    mavat_info: toStringValue(record.mavat_info ?? record.mavatInfo),
    region_code: toStringValue(record.region_code ?? record.regionCode) || gush,
    parcel_number: toStringValue(record.parcel_number ?? record.parcelNumber) || helka,
  };
}

export async function getParcelUsageCode(
  gush: string,
  helka: string,
): Promise<ParcelUsageCode> {
  const payload = await requestMavat('/get_parcel_usage_code', {
    region_code: gush,
    parcel_number: helka,
  });
  const record = toRecord(payload);

  return {
    usage_code: toStringValue(record.usage_code ?? record.usageCode),
    description: toStringValue(record.description),
    region_code: toStringValue(record.region_code ?? record.regionCode) || gush,
    parcel_number: toStringValue(record.parcel_number ?? record.parcelNumber) || helka,
  };
}
