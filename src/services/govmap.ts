import type {
  SearchParams,
  SearchResult,
  LocationInfo,
  PlanInfo,
  ExternalLinks,
} from '@/types';
import { getParcelByCoordinates } from '@/services/govmap-parcel';
import { getParcelFromAddressGovMap, searchGovMapApi } from '@/services/govmap-api';

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

function parseWktPoint(wkt: string): { x: number; y: number } | null {
  const m = wkt.match(/POINT\(([^ ]+) ([^ ]+)\)/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

async function searchByAddress(query: string): Promise<SearchResult> {
  const startTime = Date.now();

  // Use GovMap's autocomplete API — returns accurate EPSG:3857 coordinates
  const response = await searchGovMapApi(query, { maxResults: 5, isAccurate: true });

  if (response.results.length === 0) {
    throw new Error('לא נמצאו תוצאות עבור הכתובת שהוזנה');
  }

  const best = response.results[0];
  const coord = parseWktPoint(best.shape);

  const location: LocationInfo = {
    label: best.text,
    x: coord?.x ?? 0,
    y: coord?.y ?? 0,
  };

  const plans: PlanInfo[] = [];

  try {
    const parcelByAddress = await getParcelFromAddressGovMap(query);
    if (parcelByAddress.gush && parcelByAddress.helka) {
      location.gush = parcelByAddress.gush;
      location.helka = parcelByAddress.helka;
    }
  } catch {
    // Fallback to coordinate-based lookup below.
  }

  // Use the precise EPSG:3857 coordinates to find the parcel via WFS
  if (coord && (!location.gush || !location.helka)) {
    try {
      const parcel = await getParcelByCoordinates(coord.x, coord.y, true);
      if (parcel) {
        location.gush = parcel.gush;
        location.helka = parcel.helka;
      }
    } catch {
      // Parcel lookup is best-effort; continue without gush/helka.
    }
  }

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

  let label = `גוש ${gush}, חלקה ${helka}`;
  let x = 0;
  let y = 0;

  try {
    const response = await searchGovMapApi(`גוש ${gush} חלקה ${helka}`, {
      maxResults: 1,
      isAccurate: true,
    });
    if (response.results.length > 0) {
      const best = response.results[0];
      label = `${best.text} (גוש ${gush}, חלקה ${helka})`;
      const coord = parseWktPoint(best.shape);
      if (coord) {
        x = coord.x;
        y = coord.y;
      }
    }
  } catch {
    // Search didn't find results for gush/helka - expected
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
