/**
 * iplan.gov.il ArcGIS REST service client.
 *
 * Queries the Israeli Planning Administration's XPlan ArcGIS MapServer
 * to find zoning plans (תב"ע) that spatially cover a given ITM point.
 *
 * Coordinate system: EPSG:2039 (ITM — Israeli Transverse Mercator)
 * Service: https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan_2039/MapServer
 */

import type { ZoningPlan } from '@/types';

const IPLAN_AGS_BASE =
  'https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan_2039/MapServer';
const PLANS_LAYER_ID = 0;
const REQUEST_TIMEOUT_MS = 10000;

interface AgsFeature {
  attributes: Record<string, unknown>;
}

interface AgsQueryResponse {
  features?: AgsFeature[];
  error?: { code: number; message: string };
}

function toStr(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function toDate(v: unknown): string | undefined {
  if (typeof v !== 'number' || !v) return undefined;
  try {
    return new Date(v).toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

function buildIplanPlanUrl(planNumber: string): string {
  return `https://mavat.iplan.gov.il/SV3?PL_NUMBER=${encodeURIComponent(planNumber)}`;
}

function normalizeFeature(attrs: Record<string, unknown>): ZoningPlan | null {
  const planNumber = toStr(attrs.PL_NUMBER ?? attrs.PLAN_NUMBER ?? attrs.PLAN_NUM);
  const planName = toStr(attrs.PL_NAME ?? attrs.PLAN_NAME);
  if (!planNumber && !planName) return null;

  return {
    planNumber: planNumber || planName,
    planName: planName || planNumber,
    planStatus: toStr(attrs.PL_STATUS_NAME ?? attrs.PL_STATUS) || undefined,
    planType: toStr(attrs.PL_TYPE_NAME ?? attrs.PL_TYPE) || undefined,
    depositDate: toDate(attrs.PL_DATE_DEPOSIT),
    approvalDate: toDate(attrs.PL_DATE_APPROVAL),
    iplanUrl: planNumber ? buildIplanPlanUrl(planNumber) : undefined,
    source: 'iplan',
  };
}

/**
 * Find zoning plans whose polygons contain the given ITM point.
 * Returns [] on any error — caller should treat this as "no iplan data available".
 */
export async function getZoningPlansByPoint(itmX: number, itmY: number): Promise<ZoningPlan[]> {
  console.log(`[iplan-api] getZoningPlansByPoint: (${itmX}, ${itmY})`);

  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      geometry: JSON.stringify({ x: itmX, y: itmY, spatialReference: { wkid: 2039 } }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '2039',
      outFields: [
        'PL_NUMBER',
        'PL_NAME',
        'PL_STATUS',
        'PL_STATUS_NAME',
        'PL_TYPE',
        'PL_TYPE_NAME',
        'PL_DATE_DEPOSIT',
        'PL_DATE_APPROVAL',
        'ENTITY_TYPE',
      ].join(','),
      returnGeometry: 'false',
      f: 'json',
    });

    const url = `${IPLAN_AGS_BASE}/${PLANS_LAYER_ID}/query?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Origin: 'https://www.iplan.gov.il',
        Referer: 'https://www.iplan.gov.il/',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.log(`[iplan-api] ArcGIS returned ${response.status}`);
      return [];
    }

    const data = (await response.json()) as AgsQueryResponse;
    if (!data.features?.length) return [];

    return data.features
      .map((f) => normalizeFeature(f.attributes))
      .filter((p): p is ZoningPlan => p !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(handle);
  }
}
