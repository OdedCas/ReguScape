import { NextRequest, NextResponse } from 'next/server';
import { search } from '@/services/govmap';
import type { SearchParams, SearchApiResponse } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse<SearchApiResponse>> {
  try {
    const body: SearchParams = await request.json();

    if (body.mode === 'address') {
      if (!body.query || body.query.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'יש להזין כתובת לחיפוש' },
          { status: 400 },
        );
      }
    } else if (body.mode === 'gush-helka') {
      if (!body.gush || !body.helka) {
        return NextResponse.json(
          { success: false, error: 'יש להזין גוש וחלקה' },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'מצב חיפוש לא תקין' },
        { status: 400 },
      );
    }

    const result = await search(body);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
