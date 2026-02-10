import type {
  SearchParams,
  SearchResult,
  LocationInfo,
  PlanInfo,
  ExternalLinks,
  GovMapSearchResponse,
  GovMapSearchResult,
} from '@/types';

const GOVMAP_SEARCH_URL = 'https://es.govmap.gov.il/TldSearch/api/DetailsByQuery';

function buildGovMapUrlByCoords(x: number, y: number): string {
  return `https://www.govmap.gov.il/?x=${Math.round(x)}&y=${Math.round(y)}&z=9&b=10&lay=TABA_MSBS_ITM`;
}

function buildGovMapUrlByGushHelka(gush: string, helka: string): string {
  return `https://www.govmap.gov.il/?lay=PARCEL_ALL&lot=${gush}&parcel=${helka}`;
}

export function buildGovMapTabaUrl(gush: string, helka: string): string {
  return `https://www.govmap.gov.il/?lay=TABA_MSBS_ITM&lot=${gush}&parcel=${helka}`;
}

export function buildGovMapParcelUrl(gush: string, helka: string): string {
  return `https://www.govmap.gov.il/?lay=PARCEL_ALL&lot=${gush}&parcel=${helka}`;
}

export function buildIplanUrl(gush: string, helka: string): string {
  return `https://iplan.gov.il/plansearch?gush=${encodeURIComponent(gush)}&helka=${encodeURIComponent(helka)}`;
}

export function buildExternalLinks(gush: string, helka: string): ExternalLinks {
  return {
    govmapTabaUrl: buildGovMapTabaUrl(gush, helka),
    govmapParcelUrl: buildGovMapParcelUrl(gush, helka),
    iplanUrl: buildIplanUrl(gush, helka),
  };
}

async function searchGovMap(query: string): Promise<GovMapSearchResponse> {
  const url = new URL(GOVMAP_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('lyrs', '1');
  url.searchParams.set('gid', 'govmap');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`GovMap API returned ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as GovMapSearchResponse;
  } catch {
    throw new Error('תשובה לא תקינה מ-GovMap');
  }
}

function extractBestResult(govResponse: GovMapSearchResponse): GovMapSearchResult | null {
  if (govResponse.Error !== 0 || !govResponse.data) {
    return null;
  }

  for (const key of govResponse.order) {
    const results = govResponse.data[key];
    if (results && results.length > 0) {
      return results[0];
    }
  }

  // Fallback: check all data keys
  for (const key of Object.keys(govResponse.data)) {
    const results = govResponse.data[key];
    if (results && results.length > 0) {
      return results[0];
    }
  }

  return null;
}

function resultToLocation(result: GovMapSearchResult): LocationInfo {
  return {
    label: result.ResultLable,
    x: result.X,
    y: result.Y,
    gush: result.Gush || result.AData?.GUSH || undefined,
    helka: result.Parcel || result.AData?.PARCEL || undefined,
    objectId: result.ObjectID,
  };
}

async function searchByAddress(query: string): Promise<SearchResult> {
  const startTime = Date.now();

  const govResponse = await searchGovMap(query);
  const bestResult = extractBestResult(govResponse);

  if (!bestResult) {
    throw new Error('לא נמצאו תוצאות עבור הכתובת שהוזנה');
  }

  const location = resultToLocation(bestResult);
  const plans: PlanInfo[] = [];

  // Generate external links if we have gush/helka
  let externalLinks: ExternalLinks | undefined;
  if (location.gush && location.helka) {
    externalLinks = buildExternalLinks(location.gush, location.helka);
  }

  return {
    location,
    plans,
    govmapUrl: buildGovMapUrlByCoords(location.x, location.y),
    searchTimestamp: new Date().toISOString(),
    searchDuration: Date.now() - startTime,
    externalLinks,
  };
}

async function searchByGushHelka(gush: string, helka: string): Promise<SearchResult> {
  const startTime = Date.now();

  // Try to find address via GovMap search with the parcel identifier
  let label = `גוש ${gush}, חלקה ${helka}`;
  let x = 0;
  let y = 0;

  try {
    // Try searching with the address format that GovMap might understand
    const govResponse = await searchGovMap(`${gush}/${helka}`);
    const result = extractBestResult(govResponse);
    if (result) {
      label = `${result.ResultLable} (גוש ${gush}, חלקה ${helka})`;
      x = result.X;
      y = result.Y;
    }
  } catch {
    // GovMap search didn't find results for gush/helka - expected
  }

  const location: LocationInfo = {
    label,
    x,
    y,
    gush,
    helka,
  };

  const plans: PlanInfo[] = [];
  const externalLinks = buildExternalLinks(gush, helka);

  return {
    location,
    plans,
    govmapUrl: buildGovMapUrlByGushHelka(gush, helka),
    searchTimestamp: new Date().toISOString(),
    searchDuration: Date.now() - startTime,
    externalLinks,
  };
}

export async function search(params: SearchParams): Promise<SearchResult> {
  if (params.mode === 'address') {
    return searchByAddress(params.query);
  } else {
    return searchByGushHelka(params.gush, params.helka);
  }
}
