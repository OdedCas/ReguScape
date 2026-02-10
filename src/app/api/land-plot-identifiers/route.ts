import { NextRequest, NextResponse } from 'next/server';
import type { LandPlotIdentifiers } from '@/types';
import {
  getAddressFromParcel,
  getLandPlotIdentifiers,
  getParcelFromAddress,
} from '@/services/scraper';

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
        result = await getLandPlotIdentifiers({ landPlotId: address });
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

    // When scraper isn't available, return empty identifiers
    if (isNotConfigured) {
      const fallback: LandPlotIdentifiers = {
        gush: hasGush ? gush : '',
        helka: hasHelka ? helka : '',
        addresses: hasAddress ? [address] : [],
      };
      return NextResponse.json(fallback);
    }

    return NextResponse.json({ error: msg }, { status: statusCodeForError(msg) });
  }
}
