import { NextRequest, NextResponse } from 'next/server';
import { queryXplan, type XplanQueryInput } from '@/services/xplan';

function parseNumberParam(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseBooleanParam(raw: string | null, fallback: boolean): boolean {
  if (raw === null) {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no') {
    return false;
  }
  return fallback;
}

function parseLimit(raw: string | null): number {
  if (raw === null || raw.trim().length === 0) {
    return 20;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return 20;
  }
  return Math.max(1, Math.min(200, Math.round(value)));
}

function statusCodeForError(message: string): number {
  if (message.includes('returned')) {
    return 502;
  }
  if (message.includes('לא נמצאה חלקה')) {
    return 404;
  }
  if (message.includes('חייבים להיות מספרים')) {
    return 400;
  }
  return 500;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  const planNumber = searchParams.get('plan_number')?.trim() || '';
  const gush = searchParams.get('gush')?.trim() || '';
  const helka = searchParams.get('helka')?.trim() || '';
  const xRaw = searchParams.get('x');
  const yRaw = searchParams.get('y');
  const include77_78 = parseBooleanParam(searchParams.get('include_77_78'), true);
  const limit = parseLimit(searchParams.get('limit'));

  const hasPlanNumber = planNumber.length > 0;
  const hasGush = gush.length > 0;
  const hasHelka = helka.length > 0;
  const hasX = xRaw !== null;
  const hasY = yRaw !== null;
  const hasPoint = hasX && hasY;

  if ((hasX && !hasY) || (!hasX && hasY)) {
    return NextResponse.json(
      { error: 'יש לספק את שני השדות x ו-y יחד' },
      { status: 400 },
    );
  }

  if ((hasGush && !hasHelka) || (!hasGush && hasHelka)) {
    return NextResponse.json(
      { error: 'יש לספק את שני השדות gush ו-helka יחד' },
      { status: 400 },
    );
  }

  const modeCount = Number(hasPlanNumber) + Number(hasPoint) + Number(hasGush && hasHelka);
  if (modeCount === 0) {
    return NextResponse.json(
      {
        error:
          'יש לספק אחת מהאפשרויות: plan_number או x+y או gush+helka',
      },
      { status: 400 },
    );
  }

  if (modeCount > 1) {
    return NextResponse.json(
      {
        error:
          'יש לבחור מצב שאילתא אחד בלבד: plan_number או x+y או gush+helka',
      },
      { status: 400 },
    );
  }

  try {
    let input: XplanQueryInput;

    if (hasPlanNumber) {
      input = {
        mode: 'plan-number',
        planNumber,
        include77_78,
        limit,
      };
    } else if (hasPoint) {
      const x = parseNumberParam(xRaw);
      const y = parseNumberParam(yRaw);
      if (x === null || y === null) {
        return NextResponse.json(
          { error: 'השדות x ו-y חייבים להיות מספרים תקינים' },
          { status: 400 },
        );
      }
      input = {
        mode: 'point',
        x,
        y,
        include77_78,
        limit,
      };
    } else {
      input = {
        mode: 'gush-helka',
        gush,
        helka,
        include77_78,
        limit,
      };
    }

    const result = await queryXplan(input);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return NextResponse.json(
      { error: message },
      { status: statusCodeForError(message) },
    );
  }
}
