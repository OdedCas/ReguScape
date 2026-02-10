import { NextRequest, NextResponse } from 'next/server';
import type { BuildingRegulations } from '@/types';
import { getBuildingRegulations } from '@/services/scraper';
import { buildGovMapTabaUrl } from '@/services/govmap';

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
  const gush = searchParams.get('gush');
  const helka = searchParams.get('helka');

  if (!gush || !helka) {
    return NextResponse.json(
      { error: 'יש לספק gush ו-helka' },
      { status: 400 },
    );
  }

  const govmapUrl = buildGovMapTabaUrl(gush, helka);

  try {
    const regs = await getBuildingRegulations(gush, helka);
    const result: BuildingRegulations = {
      ...regs,
      govmap_url: govmapUrl,
    };

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    const isNotConfigured = msg.includes('not configured');

    // When scraper isn't available, return zeroes with GovMap link
    if (isNotConfigured) {
      const result: BuildingRegulations = {
        max_floors: 0,
        max_buildable_area_sqm: 0,
        govmap_url: govmapUrl,
      };
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: msg }, { status: statusCodeForError(msg) });
  }
}
