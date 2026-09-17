import { NextRequest, NextResponse } from 'next/server';
import { getParcelPlanningData } from '@/services/govmap-api';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const gush = searchParams.get('gush')?.trim();
  const helka = searchParams.get('helka')?.trim();

  if (!gush || !helka) {
    return NextResponse.json(
      { error: 'יש לספק gush ו-helka' },
      { status: 400 },
    );
  }

  try {
    const data = await getParcelPlanningData(gush, helka);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
