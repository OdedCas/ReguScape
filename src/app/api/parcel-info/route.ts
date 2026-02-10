import { NextRequest, NextResponse } from 'next/server';
import type { ParcelRegistrationInfo, ParcelUsageCode } from '@/types';
import { getParcelRegistrationInfo, getParcelUsageCode } from '@/services/mavat';

function statusCodeForError(message: string): number {
  if (message.includes('not configured')) {
    return 503;
  }
  if (message.includes('MAVAT API returned')) {
    return 502;
  }
  return 500;
}

interface ParcelInfoResponse {
  registration: ParcelRegistrationInfo | null;
  usageCode: ParcelUsageCode | null;
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

  const [registrationResult, usageCodeResult] = await Promise.allSettled([
    getParcelRegistrationInfo(gush, helka),
    getParcelUsageCode(gush, helka),
  ]);

  const registration = registrationResult.status === 'fulfilled'
    ? registrationResult.value
    : null;
  const usageCode = usageCodeResult.status === 'fulfilled'
    ? usageCodeResult.value
    : null;

  if (!registration && !usageCode) {
    const firstError = registrationResult.status === 'rejected'
      ? (registrationResult.reason instanceof Error ? registrationResult.reason.message : 'שגיאה לא צפויה')
      : 'שגיאה לא צפויה';

    if (firstError.includes('not configured')) {
      const result: ParcelInfoResponse = { registration: null, usageCode: null };
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: firstError },
      { status: statusCodeForError(firstError) },
    );
  }

  const result: ParcelInfoResponse = { registration, usageCode };
  return NextResponse.json(result);
}
