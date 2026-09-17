import { NextRequest, NextResponse } from 'next/server';
import { buildRightsDocument } from '@/services/rights-document';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const city = (searchParams.get('city') || '').trim();
  const cityHint = (searchParams.get('city_hint') || '').trim();
  const gush = (searchParams.get('gush') || '').trim();
  const helka = (searchParams.get('helka') || '').trim();
  const format = (searchParams.get('format') || 'html').trim().toLowerCase();

  if (!gush || !helka) {
    return NextResponse.json(
      { error: 'Required query params: gush, helka (city is optional)' },
      { status: 400 },
    );
  }

  if (format !== 'html' && format !== 'json') {
    return NextResponse.json(
      { error: 'format must be html or json' },
      { status: 400 },
    );
  }

  try {
    const result = await buildRightsDocument({
      city: city || undefined,
      cityHint: cityHint || undefined,
      gush,
      helka,
    });
    if (format === 'json') {
      return NextResponse.json(result.document, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    return new NextResponse(result.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
