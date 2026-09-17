import { NextRequest, NextResponse } from 'next/server';
import type { LandPlotIdentifiers } from '@/types';
import {
  getAddressFromParcel,
  getLandPlotIdentifiers,
  getParcelFromAddress,
} from '@/services/scraper';
import {
  getAddressFromParcelGovMap,
  getLandPlotIdentifiersGovMap,
  getParcelFromAddressGovMap,
} from '@/services/govmap-api';
import { getParcelByCoordinates } from '@/services/govmap-parcel';

function parseCoordinate(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

function statusCodeForError(message: string): number {
  if (message.includes('not configured')) {
    return 503;
  }
  if (message.includes('Scraper API returned')) {
    return 502;
  }
  return 500;
}

function isScraperUnavailable(message: string): boolean {
  return message.includes('not configured')
    || message.includes('Scraper API returned 402')
    || message.includes('Usage limit exceeded')
    || message.includes('API call limit');
}

function hasParcelIdentifiers(value: LandPlotIdentifiers): boolean {
  return value.gush.trim().length > 0 && value.helka.trim().length > 0;
}

function mergeAddressLists(...lists: string[][]): string[] {
  const unique = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const value = raw.trim();
      if (value) {
        unique.add(value);
      }
    }
  }
  return Array.from(unique);
}

async function resolveParcelByCoordinatesWithFallback(
  coordinateX: number,
  coordinateY: number,
  preferWebMercator = false,
): Promise<{ gush: string; helka: string } | null> {
  if (preferWebMercator) {
    const webMercator = await getParcelByCoordinates(coordinateX, coordinateY, true);
    if (webMercator) {
      return webMercator;
    }
    return getParcelByCoordinates(coordinateX, coordinateY, false);
  }

  const itm = await getParcelByCoordinates(coordinateX, coordinateY, false);
  if (itm) {
    return itm;
  }
  return getParcelByCoordinates(coordinateX, coordinateY, true);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const addressRaw = searchParams.get('address');
  const address = addressRaw?.trim() || '';
  const gushRaw = searchParams.get('gush');
  const helkaRaw = searchParams.get('helka');
  const gush = gushRaw?.trim() || '';
  const helka = helkaRaw?.trim() || '';
  const coordinateXRaw = searchParams.get('coordinate_x');
  const coordinateYRaw = searchParams.get('coordinate_y');
  const landPlotIdRaw = searchParams.get('land_plot_id');
  const landPlotId = landPlotIdRaw?.trim() || '';

  const hasAddress = address.length > 0;
  const hasGush = gush.length > 0;
  const hasHelka = helka.length > 0;
  const hasCoordinateX = coordinateXRaw !== null;
  const hasCoordinateY = coordinateYRaw !== null;
  const hasLandPlotId = landPlotId.length > 0;

  if (hasGush !== hasHelka) {
    return NextResponse.json(
      { error: 'יש לספק את שני השדות gush ו-helka יחד' },
      { status: 400 },
    );
  }

  if (!hasAddress && !hasGush && !hasLandPlotId && !hasCoordinateX && !hasCoordinateY) {
    return NextResponse.json(
      { error: 'יש לספק address או gush/helka או coordinate_x+coordinate_y או land_plot_id' },
      { status: 400 },
    );
  }

  if (hasCoordinateX !== hasCoordinateY) {
    return NextResponse.json(
      { error: 'יש לספק את שני השדות coordinate_x ו-coordinate_y יחד' },
      { status: 400 },
    );
  }

  const coordinateX = parseCoordinate(coordinateXRaw);
  const coordinateY = parseCoordinate(coordinateYRaw);
  if ((hasCoordinateX && coordinateX === null) || (hasCoordinateY && coordinateY === null)) {
    return NextResponse.json(
      { error: 'coordinate_x ו-coordinate_y חייבים להיות מספרים תקינים' },
      { status: 400 },
    );
  }

  try {
    let result: LandPlotIdentifiers;

    if (hasAddress) {
      result = { gush: '', helka: '', addresses: [address] };

      try {
        const scraperResult = await getParcelFromAddress(address);
        result = {
          gush: scraperResult.gush,
          helka: scraperResult.helka,
          addresses: mergeAddressLists(result.addresses, scraperResult.addresses),
        };
      } catch {
        // Continue with GovMap fallbacks below.
      }

      if (!hasParcelIdentifiers(result)) {
        try {
          const govMapResult = await getParcelFromAddressGovMap(address);
          result = {
            gush: govMapResult.gush || result.gush,
            helka: govMapResult.helka || result.helka,
            addresses: mergeAddressLists(result.addresses, govMapResult.addresses),
          };
        } catch {
          // Continue with additional fallback paths.
        }
      }

      if (!hasParcelIdentifiers(result)) {
        try {
          const govMapLandPlot = await getLandPlotIdentifiersGovMap({ landPlotId: address });
          result = {
            gush: govMapLandPlot.gush || result.gush,
            helka: govMapLandPlot.helka || result.helka,
            addresses: mergeAddressLists(result.addresses, govMapLandPlot.addresses),
          };
        } catch {
          // Continue to coordinate fallback.
        }
      }

      if (!hasParcelIdentifiers(result) && coordinateX !== null && coordinateY !== null) {
        try {
          const parcel = await resolveParcelByCoordinatesWithFallback(
            coordinateX,
            coordinateY,
            true,
          );
          result = {
            gush: parcel?.gush || result.gush,
            helka: parcel?.helka || result.helka,
            addresses: result.addresses,
          };
        } catch {
          // Best effort only.
        }
      }

      return NextResponse.json(result);
    }

    if (hasGush && hasHelka) {
      try {
        result = await getAddressFromParcel(gush, helka);
      } catch {
        result = { gush, helka, addresses: [] };
      }

      if (result.addresses.length === 0) {
        try {
          const govMapAddress = await getAddressFromParcelGovMap(gush, helka);
          result.addresses = mergeAddressLists(result.addresses, govMapAddress.addresses);
        } catch {
          // Continue with additional fallback.
        }
      }

      if (result.addresses.length === 0) {
        try {
          const fallback = await getLandPlotIdentifiersGovMap({ landPlotId: `${gush}/${helka}` });
          result.addresses = mergeAddressLists(result.addresses, fallback.addresses);
        } catch {
          // Best effort only.
        }
      }

      result.gush = result.gush || gush;
      result.helka = result.helka || helka;
      return NextResponse.json(result);
    }

    result = { gush: '', helka: '', addresses: [] };
    try {
      result = await getLandPlotIdentifiers({
        coordinateX: coordinateX ?? undefined,
        coordinateY: coordinateY ?? undefined,
        landPlotId: hasLandPlotId ? landPlotId : undefined,
      });
    } catch {
      // Continue with GovMap fallback.
    }

    if (!hasParcelIdentifiers(result)) {
      try {
        const govMapResult = await getLandPlotIdentifiersGovMap({
          coordinateX: coordinateX ?? undefined,
          coordinateY: coordinateY ?? undefined,
          landPlotId: hasLandPlotId ? landPlotId : undefined,
        });
        result = {
          gush: govMapResult.gush || result.gush,
          helka: govMapResult.helka || result.helka,
          addresses: mergeAddressLists(result.addresses, govMapResult.addresses),
        };
      } catch {
        // Keep best-effort value.
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    const unavailable = isScraperUnavailable(msg);

    // When scraper is unavailable (not configured/quota exceeded), try coordinate-based GovMap lookup as last resort.
    if (unavailable) {
      let fallbackGush = hasGush ? gush : '';
      let fallbackHelka = hasHelka ? helka : '';
      const fallbackAddresses: string[] = hasAddress ? [address] : [];

      if (!fallbackGush || !fallbackHelka) {
        try {
          if (hasAddress) {
            const byAddress = await getParcelFromAddressGovMap(address);
            fallbackGush = fallbackGush || byAddress.gush;
            fallbackHelka = fallbackHelka || byAddress.helka;
          } else {
            const generic = await getLandPlotIdentifiersGovMap({
              coordinateX: coordinateX ?? undefined,
              coordinateY: coordinateY ?? undefined,
              landPlotId: hasLandPlotId ? landPlotId : undefined,
            });
            fallbackGush = fallbackGush || generic.gush;
            fallbackHelka = fallbackHelka || generic.helka;
          }
        } catch {
          // Continue with coordinate fallback.
        }
      }

      if ((!fallbackGush || !fallbackHelka) && coordinateX !== null && coordinateY !== null) {
        try {
          const parcel = await resolveParcelByCoordinatesWithFallback(
            coordinateX,
            coordinateY,
            hasAddress,
          );
          if (parcel) {
            fallbackGush = fallbackGush || parcel.gush;
            fallbackHelka = fallbackHelka || parcel.helka;
          }
        } catch {
          // Best-effort; continue with empty identifiers.
        }
      }

      const fallback: LandPlotIdentifiers = {
        gush: fallbackGush,
        helka: fallbackHelka,
        addresses: fallbackAddresses,
      };
      return NextResponse.json(fallback);
    }

    return NextResponse.json({ error: msg }, { status: statusCodeForError(msg) });
  }
}
