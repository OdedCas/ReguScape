import { NextRequest, NextResponse } from 'next/server';
import type { TabaInfo, TabaPlansResponse } from '@/types';
import { getTabaPlans } from '@/services/scraper';
import { buildGovMapTabaUrl, buildIplanUrl } from '@/services/govmap';
import { enrichPlansFromTabanow, findPlansByParcelFromTabanow } from '@/services/tabanow';

function statusCodeForError(message: string): number {
  if (message.includes('not configured')) {
    return 503;
  }
  if (message.includes('Scraper API returned')) {
    return 502;
  }
  return 500;
}

function mergeSinglePlan(base: TabaInfo, incoming: TabaInfo): TabaInfo {
  return {
    taba_code: incoming.taba_code || base.taba_code,
    taba_description: incoming.taba_description || base.taba_description,
    plan_status: incoming.plan_status || base.plan_status,
    locality: incoming.locality || base.locality,
    place: incoming.place || base.place,
    takanon_url: incoming.takanon_url || base.takanon_url,
    plan_page_url: incoming.plan_page_url || base.plan_page_url,
    lot_size_sqm: incoming.lot_size_sqm || base.lot_size_sqm,
    max_floors: incoming.max_floors || base.max_floors,
    max_buildable_area_sqm: incoming.max_buildable_area_sqm || base.max_buildable_area_sqm,
    source: incoming.source || base.source,
  };
}

function sanitizePlan(plan: TabaInfo): TabaInfo {
  return {
    ...plan,
    lot_size_sqm: plan.lot_size_sqm && plan.lot_size_sqm > 0 ? plan.lot_size_sqm : undefined,
    max_floors: plan.max_floors && plan.max_floors > 0 ? plan.max_floors : undefined,
    max_buildable_area_sqm: plan.max_buildable_area_sqm && plan.max_buildable_area_sqm > 0
      ? plan.max_buildable_area_sqm
      : undefined,
  };
}

function mergePlanLists(primary: TabaInfo[], secondary: TabaInfo[]): TabaInfo[] {
  const merged = new Map<string, TabaInfo>();

  for (const plan of primary) {
    const key = (plan.taba_code || plan.taba_description || '').trim();
    if (!key) {
      continue;
    }
    merged.set(key, sanitizePlan(plan));
  }

  for (const plan of secondary) {
    const key = (plan.taba_code || plan.taba_description || '').trim();
    if (!key) {
      continue;
    }
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, sanitizePlan(plan));
    } else {
      merged.set(key, sanitizePlan(mergeSinglePlan(existing, plan)));
    }
  }

  return Array.from(merged.values());
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

  const govmapTabaUrl = buildGovMapTabaUrl(gush, helka);
  const iplanUrl = buildIplanUrl(gush, helka);

  let scraperPlans: TabaInfo[] = [];
  let scraperError: string | null = null;
  try {
    scraperPlans = await getTabaPlans(gush, helka);
  } catch (error) {
    scraperError = error instanceof Error ? error.message : 'שגיאה לא צפויה';
  }

  let tabanowPlans: TabaInfo[] = [];
  let tabanowError: string | null = null;
  try {
    if (scraperPlans.length > 0) {
      tabanowPlans = await enrichPlansFromTabanow(scraperPlans, gush, helka);
    } else {
      tabanowPlans = await findPlansByParcelFromTabanow(gush, helka);
    }
  } catch (error) {
    tabanowError = error instanceof Error ? error.message : 'שגיאה לא צפויה';
  }

  const plans = mergePlanLists(scraperPlans, tabanowPlans);
  if (plans.length > 0) {
    const result: TabaPlansResponse = {
      plans,
      govmap_taba_url: govmapTabaUrl,
      iplan_url: iplanUrl,
    };
    return NextResponse.json(result);
  }

  if (scraperError && tabanowError && !scraperError.includes('not configured')) {
    return NextResponse.json(
      { error: `${scraperError}; ${tabanowError}` },
      { status: statusCodeForError(scraperError) },
    );
  }

  // When all providers fail or are unavailable, return empty plans with helpful links.
  const result: TabaPlansResponse = {
    plans: [],
    govmap_taba_url: govmapTabaUrl,
    iplan_url: iplanUrl,
  };
  return NextResponse.json(result);
}
