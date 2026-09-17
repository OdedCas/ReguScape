import { NextRequest, NextResponse } from 'next/server';
import { lookupMunicipalParcelPlans } from '@/services/municipal-gis';

function statusCodeForError(message: string): number {
  if (message.includes('חייבים להיות מספרים')) {
    return 400;
  }
  if (message.includes('returned')) {
    return 502;
  }
  return 500;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const gush = searchParams.get('gush')?.trim() || '';
  const helka = searchParams.get('helka')?.trim() || '';
  const cityHint = searchParams.get('city_hint')?.trim() || '';
  const locationLabel = searchParams.get('location_label')?.trim() || '';
  const addressHints = searchParams.getAll('address_hint').map((value) => value.trim()).filter(Boolean);

  if (!gush || !helka) {
    return NextResponse.json(
      { error: 'יש לספק gush ו-helka' },
      { status: 400 },
    );
  }

  try {
    const result = await lookupMunicipalParcelPlans({
      gush,
      helka,
      cityHint: cityHint || undefined,
      locationLabel: locationLabel || undefined,
      addressHints,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return NextResponse.json({ error: message }, { status: statusCodeForError(message) });
  }
}
