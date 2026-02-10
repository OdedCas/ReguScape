'use client';

import { useState } from 'react';
import SearchForm from '@/components/SearchForm';
import ResultsDisplay from '@/components/ResultsDisplay';
import type {
  BuildingRegulations,
  EnrichedSearchResult,
  ExternalLinks,
  LandPlotIdentifiers,
  ParcelRegistrationInfo,
  ParcelUsageCode,
  PlanInfo,
  SearchApiResponse,
  SearchParams,
  TabaInfo,
  TabaPlansResponse,
} from '@/types';

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
          const landPlotQuery = params.mode === 'address'
            ? `address=${encodeURIComponent(params.query)}`
            : `gush=${encodeURIComponent(resolvedGush || params.gush)}&helka=${encodeURIComponent(resolvedHelka || params.helka)}`;

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
          const [tabaResponse, regulations, parcelInfo] = await Promise.all([
            fetchJson<TabaPlansResponse>(
              `/api/taba-info?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`,
            ),
            fetchJson<BuildingRegulations>(
              `/api/building-regulations?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`,
            ),
            fetchJson<ParcelInfoResponse>(
              `/api/parcel-info?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`,
            ).catch(() => null),
          ]);

          // Store TABA plans
          const tabaPlans = Array.isArray(tabaResponse.plans) ? tabaResponse.plans : [];
          enriched.tabaPlans = tabaPlans;
          if (tabaPlans.length > 0) {
            enriched.taba = tabaPlans[0];
            enriched.plans = mergePlans(enriched.plans, tabaPlansToPlanInfo(tabaPlans));
          }

          // Merge external links from taba response
          enriched.externalLinks = mergeExternalLinks(enriched.externalLinks, {
            govmapTabaUrl: tabaResponse.govmap_taba_url,
            iplanUrl: tabaResponse.iplan_url,
          });

          // Store regulations and its GovMap URL
          enriched.regulations = regulations;
          if (enriched.plans.length > 0) {
            enriched.plans = enriched.plans.map((plan) => ({
              ...plan,
              maxFloors: plan.maxFloors || (regulations.max_floors > 0 ? regulations.max_floors : undefined),
              maxBuildableAreaSqm: plan.maxBuildableAreaSqm
                || (regulations.max_buildable_area_sqm > 0 ? regulations.max_buildable_area_sqm : undefined),
            }));
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
