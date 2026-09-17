'use client';

import { useState } from 'react';
import SearchForm from '@/components/SearchForm';
import ResultsDisplay from '@/components/ResultsDisplay';
import type {
  BuildingRegulations,
  EnrichedSearchResult,
  ExternalLinks,
  LandPlotIdentifiers,
  MunicipalParcelPlan,
  MunicipalParcelPlansResponse,
  ParcelPlanningData,
  ParcelPlanComparison,
  ParcelRegistrationInfo,
  ParcelUsageCode,
  PlanInfo,
  SearchApiResponse,
  SearchParams,
  TabaInfo,
  TabaRadiusPlan,
  TabaPlansResponse,
} from '@/types';
import type { XplanQueryResult } from '@/services/xplan';

interface ParcelInfoResponse {
  registration: ParcelRegistrationInfo | null;
  usageCode: ParcelUsageCode | null;
}

type RouteError = {
  error?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'שגיאה לא צפויה';
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & RouteError;

  if (!response.ok) {
    const message = typeof payload.error === 'string' && payload.error.length > 0
      ? payload.error
      : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

function tabaPlansToPlanInfo(plans: TabaInfo[]): PlanInfo[] {
  return plans.map((plan) => ({
    planNumber: plan.taba_code || 'ללא קוד',
    planName: plan.taba_description || 'ללא תיאור',
    planStatus: plan.plan_status,
    planType: 'תב"ע',
    locality: plan.locality,
    place: plan.place,
    takanonUrl: plan.takanon_url,
    planPageUrl: plan.plan_page_url,
    lotSizeSqm: plan.lot_size_sqm,
    maxFloors: plan.max_floors,
    maxBuildableAreaSqm: plan.max_buildable_area_sqm,
    source: plan.source,
  }));
}

function mergePlans(existingPlans: PlanInfo[], incomingPlans: PlanInfo[]): PlanInfo[] {
  const merged = new Map<string, PlanInfo>();
  for (const plan of existingPlans) {
    merged.set(`${plan.planNumber}|${plan.planName}`, plan);
  }
  for (const plan of incomingPlans) {
    const key = `${plan.planNumber}|${plan.planName}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, plan);
    } else {
      merged.set(key, {
        ...current,
        ...plan,
        planStatus: plan.planStatus || current.planStatus,
        locality: plan.locality || current.locality,
        place: plan.place || current.place,
        takanonUrl: plan.takanonUrl || current.takanonUrl,
        planPageUrl: plan.planPageUrl || current.planPageUrl,
        lotSizeSqm: plan.lotSizeSqm || current.lotSizeSqm,
        maxFloors: plan.maxFloors || current.maxFloors,
        maxBuildableAreaSqm: plan.maxBuildableAreaSqm || current.maxBuildableAreaSqm,
        source: plan.source || current.source,
      });
    }
  }
  return Array.from(merged.values());
}

function mergeExternalLinks(
  existing: ExternalLinks | undefined,
  incoming: Partial<ExternalLinks>,
): ExternalLinks {
  return {
    govmapTabaUrl: incoming.govmapTabaUrl || existing?.govmapTabaUrl,
    govmapParcelUrl: incoming.govmapParcelUrl || existing?.govmapParcelUrl,
    iplanUrl: incoming.iplanUrl || existing?.iplanUrl,
  };
}

function normalizePlanNumber(value: string | undefined): string {
  return (value || '').replace(/\s+/g, '').toUpperCase();
}

function planKeyFromInfo(plan: PlanInfo): string {
  const normalizedNumber = normalizePlanNumber(plan.planNumber);
  if (normalizedNumber) {
    return normalizedNumber;
  }
  return `NAME:${(plan.planName || '').trim().toUpperCase()}`;
}

function mergePlanInfo(base: PlanInfo, incoming: PlanInfo): PlanInfo {
  const mergedSource = Array.from(
    new Set(
      [base.source, incoming.source]
        .flatMap((value) => (value || '').split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).join(', ');
  return {
    ...base,
    ...incoming,
    planNumber: incoming.planNumber || base.planNumber,
    planName: incoming.planName || base.planName,
    planStatus: incoming.planStatus || base.planStatus,
    planType: incoming.planType || base.planType,
    authority: incoming.authority || base.authority,
    locality: incoming.locality || base.locality,
    place: incoming.place || base.place,
    takanonUrl: incoming.takanonUrl || base.takanonUrl,
    planPageUrl: incoming.planPageUrl || base.planPageUrl,
    lotSizeSqm: incoming.lotSizeSqm || base.lotSizeSqm,
    maxFloors: incoming.maxFloors || base.maxFloors,
    maxBuildableAreaSqm: incoming.maxBuildableAreaSqm || base.maxBuildableAreaSqm,
    source: mergedSource || undefined,
  };
}

function municipalPlansToPlanInfo(plans: MunicipalParcelPlan[]): PlanInfo[] {
  return plans.map((plan) => ({
    planNumber: plan.planNumber || 'ללא קוד',
    planName: plan.planName || plan.planNumber || 'ללא תיאור',
    planStatus: plan.planStatus,
    planType: 'GIS עירוני',
    locality: plan.municipality,
    planPageUrl: plan.planPageUrl,
    source: plan.source || 'municipal-gis',
  }));
}

function planningRadiusPlansToPlanInfo(plans: TabaRadiusPlan[]): PlanInfo[] {
  return plans.map((plan) => {
    const planNumber = String(plan.tochnit ?? plan.taba_code ?? plan.PL_NUMBER ?? '').trim();
    const planName = String(plan.taba_description ?? plan.PL_NAME ?? plan.shemtochnit ?? '').trim();
    const locality = String(plan.yeshuvname ?? plan.locality ?? plan.PL_CITY ?? '').trim();
    const place = String(plan.place ?? plan.PL_PLACE ?? '').trim();
    const planStatus = String(plan.plan_status ?? plan.PL_STATUS ?? '').trim();
    const planPageUrl = String(plan.url ?? '').trim();
    return {
      planNumber: planNumber || 'ללא קוד',
      planName: planName || planNumber || 'ללא תיאור',
      planStatus: planStatus || undefined,
      planType: 'GovMap',
      locality: locality || undefined,
      place: place || undefined,
      planPageUrl: planPageUrl || undefined,
      source: 'govmap-planning',
    };
  }).filter((plan) => plan.planNumber !== 'ללא קוד' || plan.planName !== 'ללא תיאור');
}

function xplanResultToPlanInfo(result: XplanQueryResult): PlanInfo[] {
  return result.services.flatMap((service) => {
    return service.plans.map((plan) => ({
      planNumber: plan.planNumber || 'ללא קוד',
      planName: plan.planName || plan.planNumber || 'ללא תיאור',
      planStatus: plan.status || undefined,
      planType: service.service === 'Xplan_77_78' ? 'XPLAN 77/78' : 'XPLAN',
      locality: plan.locality || undefined,
      planPageUrl: plan.planUrl || undefined,
      source: service.service === 'Xplan_77_78' ? 'xplan-77-78' : 'xplan',
    }));
  });
}

function applyRegulationsToPlans(plans: PlanInfo[], regulations: BuildingRegulations): PlanInfo[] {
  if (!plans.length) {
    return plans;
  }
  return plans.map((plan) => ({
    ...plan,
    maxFloors: plan.maxFloors || (regulations.max_floors > 0 ? regulations.max_floors : undefined),
    maxBuildableAreaSqm: plan.maxBuildableAreaSqm
      || (regulations.max_buildable_area_sqm > 0 ? regulations.max_buildable_area_sqm : undefined),
  }));
}

function buildMunicipalApiUrl(
  gush: string,
  helka: string,
  locationLabel: string,
  addressHints: string[],
  cityHint?: string,
): string {
  const params = new URLSearchParams();
  params.set('gush', gush);
  params.set('helka', helka);
  const normalizedCityHint = cityHint?.trim() || '';
  if (normalizedCityHint.length > 0) {
    params.set('city_hint', normalizedCityHint);
  }
  if (locationLabel.trim().length > 0) {
    params.set('location_label', locationLabel);
  }
  for (const address of addressHints) {
    if (address.trim().length > 0) {
      params.append('address_hint', address);
    }
  }
  return `/api/municipal-gis-plans?${params.toString()}`;
}

function buildParcelPlanComparison(params: {
  currentPlans: PlanInfo[];
  tabaInfoPlans: PlanInfo[];
  govMapPlans: PlanInfo[];
  xplanPlans: PlanInfo[];
  municipalPlans: PlanInfo[];
  municipalMeta: MunicipalParcelPlansResponse | null;
}): { finalPlans: PlanInfo[]; comparison: ParcelPlanComparison } {
  type Presence = {
    plan: PlanInfo;
    inMunicipal: boolean;
    inGovMap: boolean;
    inXplan: boolean;
    inTabaInfo: boolean;
  };

  const byKey = new Map<string, Presence>();
  const ingest = (
    plans: PlanInfo[],
    flag: keyof Omit<Presence, 'plan'>,
  ) => {
    for (const plan of plans) {
      const key = planKeyFromInfo(plan);
      if (!key || key === 'NAME:') {
        continue;
      }
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          plan,
          inMunicipal: false,
          inGovMap: false,
          inXplan: false,
          inTabaInfo: false,
          [flag]: true,
        });
        continue;
      }

      byKey.set(key, {
        ...existing,
        plan: mergePlanInfo(existing.plan, plan),
        [flag]: true,
      });
    }
  };

  ingest(params.currentPlans, 'inTabaInfo');
  ingest(params.tabaInfoPlans, 'inTabaInfo');
  ingest(params.govMapPlans, 'inGovMap');
  ingest(params.xplanPlans, 'inXplan');
  ingest(params.municipalPlans, 'inMunicipal');

  const municipalKeys = new Set(
    params.municipalPlans
      .map(planKeyFromInfo)
      .filter((key) => key && key !== 'NAME:'),
  );
  const usedMunicipalFilter = Boolean(params.municipalMeta?.supported && municipalKeys.size > 0);

  const finalPlans = Array.from(byKey.entries())
    .filter(([key, presence]) => {
      if (usedMunicipalFilter) {
        return municipalKeys.has(key) || presence.inMunicipal;
      }
      return true;
    })
    .map(([, presence]) => presence.plan)
    .sort((a, b) => {
      const an = normalizePlanNumber(a.planNumber);
      const bn = normalizePlanNumber(b.planNumber);
      if (an && bn) {
        return an.localeCompare(bn, 'he');
      }
      if (an) return -1;
      if (bn) return 1;
      return (a.planName || '').localeCompare(b.planName || '', 'he');
    });

  const items = Array.from(byKey.entries())
    .map(([key, presence]) => ({
      key,
      planNumber: presence.plan.planNumber,
      planName: presence.plan.planName,
      inMunicipal: presence.inMunicipal,
      inGovMap: presence.inGovMap,
      inXplan: presence.inXplan,
      inTabaInfo: presence.inTabaInfo,
    }))
    .sort((a, b) => a.planNumber.localeCompare(b.planNumber, 'he'));

  const comparison: ParcelPlanComparison = {
    usedMunicipalFilter,
    counts: {
      municipal: params.municipalPlans.length,
      govMap: params.govMapPlans.length,
      xplan: params.xplanPlans.length,
      tabaInfo: params.tabaInfoPlans.length,
      final: finalPlans.length,
    },
    items,
  };

  return { finalPlans, comparison };
}

export default function Home() {
  const [result, setResult] = useState<EnrichedSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (params: SearchParams) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const searchData = await fetchJson<SearchApiResponse>('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!searchData.success || !searchData.data) {
        throw new Error(searchData.error || 'שגיאה בחיפוש');
      }

      const enriched: EnrichedSearchResult = {
        ...searchData.data,
        plans: searchData.data.plans || [],
        externalLinks: searchData.data.externalLinks,
      };
      let warning: string | null = null;

      let resolvedGush = enriched.location.gush?.trim() || '';
      let resolvedHelka = enriched.location.helka?.trim() || '';
      const shouldLookupLandPlot = params.mode === 'gush-helka'
        || !resolvedGush
        || !resolvedHelka;

      if (shouldLookupLandPlot) {
        try {
          let landPlotQuery: string;
          if (params.mode === 'address') {
            landPlotQuery = `address=${encodeURIComponent(params.query)}`;
            // Pass coordinates so the endpoint can try coordinate-based lookup
            // when the scraper is unavailable.
            const cx = enriched.location.x;
            const cy = enriched.location.y;
            if (cx && cy) {
              landPlotQuery += `&coordinate_x=${cx}&coordinate_y=${cy}`;
            }
          } else {
            landPlotQuery = `gush=${encodeURIComponent(resolvedGush || params.gush)}&helka=${encodeURIComponent(resolvedHelka || params.helka)}`;
          }

          const landPlot = await fetchJson<LandPlotIdentifiers>(
            `/api/land-plot-identifiers?${landPlotQuery}`,
          );
          enriched.landPlot = landPlot;

          if (landPlot.gush) {
            resolvedGush = landPlot.gush;
            enriched.location.gush = landPlot.gush;
          }
          if (landPlot.helka) {
            resolvedHelka = landPlot.helka;
            enriched.location.helka = landPlot.helka;
          }

          if (params.mode === 'gush-helka' && landPlot.addresses.length > 0) {
            const bestAddress = landPlot.addresses[0];
            const gushLabel = resolvedGush || params.gush;
            const helkaLabel = resolvedHelka || params.helka;
            enriched.location.label = `${bestAddress} (גוש ${gushLabel}, חלקה ${helkaLabel})`;
          }
        } catch (lookupError) {
          warning = getErrorMessage(lookupError);
        }
      }

      if (resolvedGush && resolvedHelka) {
        try {
          const municipalApiUrl = buildMunicipalApiUrl(
            resolvedGush,
            resolvedHelka,
            enriched.location.label || '',
            enriched.landPlot?.addresses ?? [],
            params.mode === 'address' ? params.query : (enriched.landPlot?.addresses?.[0] || enriched.location.label || ''),
          );

          const [tabaResponse, regulations, parcelInfo, planningData, xplanResult, municipalPlans] = await Promise.all([
            fetchJson<TabaPlansResponse>(
              `/api/taba-info?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`,
            ).catch(() => null),
            fetchJson<BuildingRegulations>(
              `/api/building-regulations?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`,
            ).catch(() => null),
            fetchJson<ParcelInfoResponse>(
              `/api/parcel-info?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`,
            ).catch(() => null),
            fetchJson<ParcelPlanningData>(
              `/api/planning-info?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`,
            ).catch(() => null),
            fetchJson<XplanQueryResult>(
              `/api/xplan-query?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}&include_77_78=true&limit=200`,
            ).catch(() => null),
            fetchJson<MunicipalParcelPlansResponse>(municipalApiUrl).catch(() => null),
          ]);

          // Store TABA plans
          let tabaPlanInfoList: PlanInfo[] = [];
          if (tabaResponse) {
            const tabaPlans = Array.isArray(tabaResponse.plans) ? tabaResponse.plans : [];
            enriched.tabaPlans = tabaPlans;
            tabaPlanInfoList = tabaPlansToPlanInfo(tabaPlans);
            if (tabaPlans.length > 0) {
              enriched.taba = tabaPlans[0];
              enriched.plans = mergePlans(enriched.plans, tabaPlanInfoList);
            }

            // Merge external links from taba response
            enriched.externalLinks = mergeExternalLinks(enriched.externalLinks, {
              govmapTabaUrl: tabaResponse.govmap_taba_url,
              iplanUrl: tabaResponse.iplan_url,
            });
          }

          // Store regulations and its GovMap URL
          if (regulations) {
            enriched.regulations = regulations;
            if (enriched.plans.length > 0) {
              enriched.plans = applyRegulationsToPlans(enriched.plans, regulations);
            }
          }

          // Store parcel registration & usage code
          if (parcelInfo) {
            if (parcelInfo.registration) {
              enriched.parcelRegistration = parcelInfo.registration;
            }
            if (parcelInfo.usageCode) {
              enriched.parcelUsageCode = parcelInfo.usageCode;
            }
          }

          // Store planning layer data
          if (planningData) {
            enriched.planningData = planningData;
          }

          if (municipalPlans) {
            enriched.municipalPlans = municipalPlans;
          }

          const govMapPlanningPlanInfo = planningData
            ? planningRadiusPlansToPlanInfo(planningData.tabaPlans)
            : [];
          const xplanPlanInfo = xplanResult ? xplanResultToPlanInfo(xplanResult) : [];
          const municipalPlanInfo = municipalPlans
            ? municipalPlansToPlanInfo(municipalPlans.plans)
            : [];

          const { finalPlans, comparison } = buildParcelPlanComparison({
            currentPlans: enriched.plans,
            tabaInfoPlans: tabaPlanInfoList,
            govMapPlans: govMapPlanningPlanInfo,
            xplanPlans: xplanPlanInfo,
            municipalPlans: municipalPlanInfo,
            municipalMeta: municipalPlans,
          });

          enriched.planComparison = comparison;
          enriched.plans = finalPlans;

          if (regulations) {
            enriched.plans = applyRegulationsToPlans(enriched.plans, regulations);
          }
        } catch (enrichmentError) {
          warning = warning || getErrorMessage(enrichmentError);
        }
      } else if (params.mode === 'address') {
        warning = warning || 'לא נמצא גוש/חלקה עבור הכתובת - ניתן לבדוק ב-GovMap';
      }

      setResult(enriched);
      setError(warning);
    } catch (searchError) {
      setError(getErrorMessage(searchError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Regu<span>Scape</span></h1>
        <p>חיפוש מידע תכנוני ותוכניות בניין על נכסים בישראל</p>
      </header>

      <SearchForm onSearch={handleSearch} isLoading={isLoading} />

      {error && (
        <div className="error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}

      <ResultsDisplay result={result} />
    </div>
  );
}
