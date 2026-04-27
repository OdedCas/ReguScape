import { NextRequest, NextResponse } from 'next/server';
import type { ZoningPlan, ZoningPlansResponse, TabaInfo } from '@/types';
import { search } from '@/services/govmap';
import { getParcelByCoordinates } from '@/services/govmap-parcel';
import { getTabaPlansByParcelGovMap } from '@/services/govmap-api';
import { getZoningPlansByPoint } from '@/services/iplan-api';
import { buildGovMapTabaUrl, buildIplanUrl } from '@/services/govmap';

function tabaPlanToZoning(p: TabaInfo): ZoningPlan {
  return {
    planNumber: p.taba_code || 'ללא קוד',
    planName: p.taba_description || 'ללא שם',
    planStatus: p.plan_status,
    takanonUrl: p.takanon_url,
    source: p.source || 'govmap',
  };
}

function normKey(planNumber: string): string {
  return planNumber.replace(/\s+/g, '').toUpperCase();
}

function mergePlans(primary: ZoningPlan[], secondary: ZoningPlan[]): ZoningPlan[] {
  const byKey = new Map<string, ZoningPlan>();

  for (const p of primary) {
    byKey.set(normKey(p.planNumber), p);
  }

  for (const p of secondary) {
    const key = normKey(p.planNumber);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
    } else {
      byKey.set(key, {
        ...existing,
        planStatus: p.planStatus || existing.planStatus,
        planType: p.planType || existing.planType,
        depositDate: p.depositDate || existing.depositDate,
        approvalDate: p.approvalDate || existing.approvalDate,
        iplanUrl: p.iplanUrl || existing.iplanUrl,
        takanonUrl: existing.takanonUrl || p.takanonUrl,
      });
    }
  }

  return Array.from(byKey.values());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const address = searchParams.get('address')?.trim() ?? '';
  let gush = searchParams.get('gush')?.trim() ?? '';
  let helka = searchParams.get('helka')?.trim() ?? '';

  if (!address && (!gush || !helka)) {
    return NextResponse.json(
      { error: 'יש לספק כתובת (address) או גוש וחלקה (gush + helka)' },
      { status: 400 },
    );
  }

  console.log(`[zoning-plans] address="${address}" gush="${gush}" helka="${helka}"`);

  let resolvedAddress = '';
  let itmX = 0;
  let itmY = 0;

  // Step 1: Geocode — resolve address or gush/helka to ITM coordinates
  const geocodeQuery = address || `גוש ${gush} חלקה ${helka}`;
  try {
    const searchResult = await search({ mode: 'address', query: geocodeQuery });
    itmX = searchResult.location.x;
    itmY = searchResult.location.y;
    resolvedAddress = searchResult.location.label;

    if (!gush && searchResult.location.gush) gush = searchResult.location.gush;
    if (!helka && searchResult.location.helka) helka = searchResult.location.helka;
  } catch {
    // non-fatal: we may still have gush/helka from params
  }

  // Step 2: If gush/helka still missing, try WFS parcel lookup by coordinates
  if ((!gush || !helka) && itmX && itmY) {
    const parcel = await getParcelByCoordinates(itmX, itmY).catch(() => null);
    if (parcel) {
      gush = gush || parcel.gush;
      helka = helka || parcel.helka;
    }
  }

  if (!gush || !helka) {
    return NextResponse.json(
      { error: 'לא נמצא גוש/חלקה עבור הכתובת שהוזנה' },
      { status: 404 },
    );
  }

  if (!resolvedAddress) {
    resolvedAddress = `גוש ${gush}, חלקה ${helka}`;
  }

  // Step 3: Query both data sources in parallel
  const [govmapPlans, iplanPlans] = await Promise.all([
    getTabaPlansByParcelGovMap(gush, helka).catch((): TabaInfo[] => []),
    itmX && itmY
      ? getZoningPlansByPoint(itmX, itmY).catch((): ZoningPlan[] => [])
      : Promise.resolve<ZoningPlan[]>([]),
  ]);

  const plans = mergePlans(govmapPlans.map(tabaPlanToZoning), iplanPlans);

  const result: ZoningPlansResponse = {
    gush,
    helka,
    address: resolvedAddress,
    plans,
    iplanUrl: buildIplanUrl(gush, helka),
    govmapTabaUrl: buildGovMapTabaUrl(gush, helka),
  };

  return NextResponse.json(result);
}
