import { NextRequest, NextResponse } from 'next/server';
import type { LandPlotIdentifiers } from '@/types';
import {
  getAddressFromParcel,
  getLandPlotIdentifiers,
  getParcelFromAddress,
} from '@/services/scraper';
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
      try {
        result = await getParcelFromAddress(address);
      } catch {
        try {
          result = await getLandPlotIdentifiers({ landPlotId: address });
        } catch {
          // Scraper entirely unavailable — try coordinate-based GovMap lookup.
          if (coordinateX !== null && coordinateY !== null) {
            const parcel = await getParcelByCoordinates(coordinateX, coordinateY);
            result = {
              gush: parcel?.gush || '',
              helka: parcel?.helka || '',
              addresses: [address],
            };
          } else {
            result = { gush: '', helka: '', addresses: [address] };
          }
        }
      }
      return NextResponse.json(result);
    }

    if (hasGush && hasHelka) {
      try {
        result = await getAddressFromParcel(gush, helka);
      } catch {
        result = await getLandPlotIdentifiers({ landPlotId: `${gush}/${helka}` });
        result.gush = result.gush || gush;
        result.helka = result.helka || helka;
      }
      return NextResponse.json(result);
    }

    result = await getLandPlotIdentifiers({
      coordinateX: coordinateX ?? undefined,
      coordinateY: coordinateY ?? undefined,
      landPlotId: hasLandPlotId ? landPlotId : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    const isNotConfigured = msg.includes('not configured');

    // When scraper isn't available, try coordinate-based GovMap lookup as last resort.
    if (isNotConfigured) {
      let fallbackGush = hasGush ? gush : '';
      let fallbackHelka = hasHelka ? helka : '';

      if (!fallbackGush && !fallbackHelka && coordinateX !== null && coordinateY !== null) {
        try {
          const parcel = await getParcelByCoordinates(coordinateX, coordinateY);
          if (parcel) {
            fallbackGush = parcel.gush;
            fallbackHelka = parcel.helka;
          }
        } catch {
          // Best-effort; continue with empty identifiers.
        }
      }

      const fallback: LandPlotIdentifiers = {
        gush: fallbackGush,
        helka: fallbackHelka,
        addresses: hasAddress ? [address] : [],
      };
      return NextResponse.json(fallback);
    }

    return NextResponse.json({ error: msg }, { status: statusCodeForError(msg) });
  }
}
