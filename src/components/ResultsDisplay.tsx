'use client';

import { useEffect, useState } from 'react';
import GovMapEmbed from '@/components/GovMapEmbed';
import type { EnrichedSearchResult, MunicipalParcelPlansResponse, MunicipalPlanningInfo } from '@/types';

interface ResultsDisplayProps {
  result: EnrichedSearchResult | null;
}

const XPLAN_SITE_URL = 'https://ags.iplan.gov.il/xplan/';
const XPLAN_OUT_FIELDS = [
  'pl_number',
  'pl_name',
  'station_desc',
  'plan_county_name',
  'pl_url',
  'pl_area_dunam',
  'pl_date_8',
].join(',');
const GOVMAP_EMBED_TOKEN = process.env.NEXT_PUBLIC_GOVMAP_TOKEN || '';

function getXplanServiceName(isSection77_78: boolean): string {
  return isSection77_78 ? 'Xplan_77_78' : 'xplan_without_77_78';
}

function escapeArcGisLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function buildXplanPlanQueryUrl(planNumber: string, isSection77_78: boolean): string {
  const serviceName = getXplanServiceName(isSection77_78);
  const escapedPlan = escapeArcGisLiteral(planNumber.trim());
  const where = `UPPER(pl_number) LIKE UPPER('%${escapedPlan}%')`;

  return `https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/${serviceName}/MapServer/1/query`
    + `?where=${encodeURIComponent(where)}`
    + `&outFields=${encodeURIComponent(XPLAN_OUT_FIELDS)}`
    + '&orderByFields=pl_number'
    + '&returnGeometry=true'
    + '&f=pjson';
}

function buildXplanPointQueryUrl(x: number, y: number, isSection77_78: boolean): string {
  const serviceName = getXplanServiceName(isSection77_78);
  const geometry = `${Math.round(x)},${Math.round(y)}`;

  return `https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/${serviceName}/MapServer/1/query`
    + `?geometry=${encodeURIComponent(geometry)}`
    + '&geometryType=esriGeometryPoint'
    + '&inSR=2039'
    + '&spatialRel=esriSpatialRelIntersects'
    + `&outFields=${encodeURIComponent(XPLAN_OUT_FIELDS)}`
    + '&returnGeometry=true'
    + '&f=pjson';
}

function buildParcelWfsTemplateUrl(gush: string, helka: string): string | null {
  const gushDigits = gush.replace(/[^\d]/g, '');
  const helkaDigits = helka.replace(/[^\d]/g, '');
  if (!gushDigits || !helkaDigits) {
    return null;
  }
  const cql = `GUSH_NUM = ${gushDigits} AND GUSH_SUFFI = 0 AND PARCEL = ${helkaDigits}`;

  return 'https://open.govmap.gov.il/geoserver/opendata/wfs?'
    + 'SERVICE=WFS'
    + '&REQUEST=GetFeature'
    + '&typeName=Parcels_ITM'
    + '&VERSION=2.0.0'
    + '&outputFormat=json'
    + '&resultType=results'
    + '&propertyName=GUSH_NUM,GUSH_SUFFI,PARCEL,the_geom'
    + `&cql_filter=${encodeURIComponent(cql)}`;
}

function pickPlanNumberForTemplate(plans: EnrichedSearchResult['plans']): string | null {
  for (const plan of plans) {
    const number = plan.planNumber?.trim();
    if (number && number !== 'ללא קוד') {
      return number;
    }
  }
  return null;
}

function normalizePlanNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeJsonWrappedStringClient(value: string): string {
  const sanitized = value
    .replace(/^\uFEFF/, '')
    .replace(/^\u200B+/, '')
    .trim();
  if (!sanitized) {
    return '';
  }
  try {
    const parsed = JSON.parse(sanitized);
    if (typeof parsed === 'string') {
      return parsed.trim();
    }
  } catch {
    // Continue.
  }
  return sanitized.replace(/^"+|"+$/g, '').trim();
}

function isLikelyJwt(value: string): boolean {
  return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value);
}

function normalizeDigitsClient(value: string): string {
  return value.replace(/[^\d]/g, '');
}

function resolveRightsDocumentCity(municipalPlans?: MunicipalParcelPlansResponse | null): string | null {
  const providerId = String(municipalPlans?.providerId || '').trim().toLowerCase();
  const municipality = String(municipalPlans?.municipality || '').trim();

  if (providerId === 'tel-aviv-arcgis' || /תל\s*אביב/.test(municipality)) {
    return 'tel-aviv';
  }
  if (providerId.endsWith('-mg2')) {
    return providerId.replace(/-mg2$/, '');
  }

  const byMunicipality = new Map<string, string>([
    ['נס ציונה', 'ness-ziona'],
    ['עכו', 'akko'],
    ['עפולה', 'afula'],
    ['פתח תקווה', 'petah-tikva'],
    ['נתיבות', 'netivot'],
    ['חוף אשקלון', 'hof-ashkelon'],
    ['חוף השרון', 'hof-hasharon'],
    ['חבל מודיעין', 'hevel-modiin'],
    ['אבן יהודה', 'even-yehuda'],
  ]);
  return byMunicipality.get(municipality) || null;
}

function buildRightsDocumentUrl(params: {
  gush: string;
  helka: string;
  municipalPlans?: MunicipalParcelPlansResponse | null;
}): string | null {
  const gush = normalizeDigitsClient(params.gush);
  const helka = normalizeDigitsClient(params.helka);
  if (!gush || !helka) {
    return null;
  }
  const query = new URLSearchParams({
    gush,
    helka,
    format: 'html',
  });
  const cityHint = String(params.municipalPlans?.municipality || '').trim();
  if (cityHint) {
    query.set('city_hint', cityHint);
  }
  const city = resolveRightsDocumentCity(params.municipalPlans);
  if (city) {
    query.set('city', city);
  }
  return `/api/rights-document?${query.toString()}`;
}

async function fetchNessZionaPlanningInfoClient(gush: string, helka: string): Promise<MunicipalPlanningInfo | null> {
  const portalUrl = 'https://mg2.gis-net.co.il/NessZionaGis';
  const appConfigRes = await fetch(`${portalUrl}/assets/appConfig/app.config.json`, {
    cache: 'no-store',
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  if (!appConfigRes.ok) {
    return null;
  }
  const appConfig = await appConfigRes.json() as { projId?: number | string; appApiUrl?: string; mapApiUrl?: string; zoomWidth?: number };
  const projId = Number(appConfig?.projId);
  const appApiUrl = String(appConfig?.appApiUrl || '').trim();
  const mapApiUrl = String(appConfig?.mapApiUrl || '').trim();
  if (!Number.isFinite(projId) || !appApiUrl || !mapApiUrl) {
    return null;
  }

  const loginRes = await fetch(`${appApiUrl}UserLogin`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: 'Anonymous',
      userPassword: '',
      projId,
    }),
  });
  if (!loginRes.ok) {
    return null;
  }
  const token = decodeJsonWrappedStringClient(await loginRes.text());
  if (!isLikelyJwt(token)) {
    return null;
  }

  const authHeaders: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    Authorization: `Bearer ${token}`,
  };

  let qId = '';
  let qNum = helka;
  let parcelLabel = '';
  let lookupSource = 'GetParcelsTree';

  const treeRes = await fetch(`${appApiUrl}GetParcelsTree?block=${encodeURIComponent(gush)}&parcel=${encodeURIComponent(helka)}&projId=${projId}`, {
    cache: 'no-store',
    headers: authHeaders,
  });
  if (treeRes.ok) {
    const tree = await treeRes.json() as Array<{ id?: number | string; name?: string; children?: unknown[] }>;
    const flat: Array<{ id: string; depth: number; isLeaf: boolean; h?: string; g?: string; name: string }> = [];
    const walk = (nodes: Array<{ id?: number | string; name?: string; children?: unknown[] }>, depth = 0): void => {
      for (const node of nodes) {
        const id = normalizeDigitsClient(String(node.id ?? ''));
        if (!id) {
          continue;
        }
        const name = String(node.name ?? '');
        const match = name.match(/^(\d+)\s*\((\d+)\)/);
        const children = Array.isArray(node.children) ? node.children as Array<{ id?: number | string; name?: string; children?: unknown[] }> : [];
        flat.push({
          id,
          depth,
          isLeaf: children.length === 0,
          h: match?.[1],
          g: match?.[2],
          name,
        });
        if (children.length > 0) {
          walk(children, depth + 1);
        }
      }
    };
    walk(Array.isArray(tree) ? tree : []);
    const pick = flat.find((item) => item.g === gush && item.h === helka)
      || flat.filter((item) => item.isLeaf).sort((a, b) => b.depth - a.depth)[0];
    if (pick) {
      qId = pick.id;
      qNum = pick.h || helka;
      parcelLabel = pick.name || '';
    }
  }

  if (!qId) {
    lookupSource = 'MapSearch + GetLandUseObj';
    const mapInitRes = await fetch(`${mapApiUrl}FirstLoadingMap`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mapSession: '',
        mapName: '',
        mapStateId: 1,
        fLayers: '',
        projId,
      }),
    });
    if (!mapInitRes.ok) {
      return null;
    }
    const mapInit = await mapInitRes.json() as { sessionId?: string; mapName?: string };
    const mapSession = String(mapInit.sessionId || '');
    const mapName = String(mapInit.mapName || '');
    if (!mapSession || !mapName) {
      return null;
    }

    const searchesRes = await fetch(`${appApiUrl}GetAllSearches?projId=${projId}`, {
      cache: 'no-store',
      headers: authHeaders,
    });
    if (!searchesRes.ok) {
      return null;
    }
    const searches = await searchesRes.json() as Array<{ searchId?: number; dynamicForm?: { rows?: Array<{ fields?: Array<{ name?: string; value?: unknown }> }> } }>;
    const search = searches.find((item) => item.searchId === 2080);
    if (!search?.dynamicForm?.rows) {
      return null;
    }
    for (const row of search.dynamicForm.rows) {
      for (const field of row.fields ?? []) {
        const fieldName = String(field.name || '');
        if (/Block_No/i.test(fieldName)) {
          field.value = gush;
        } else if (/Parcel_no/i.test(fieldName)) {
          field.value = helka;
        }
      }
    }
    const payload: Record<string, unknown> = {
      ...search,
      mapSession,
      mapName,
      zoomWidth: appConfig.zoomWidth || 50,
      projId,
    };
    const mapSearchRes = await fetch(`${mapApiUrl}GetObjectsBySearch`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(payload),
    });
    if (!mapSearchRes.ok) {
      return null;
    }
    const mapSearch = await mapSearchRes.json() as {
      layers?: Array<{
        name?: string;
        objectId?: number;
        rowItems?: Array<{
          fieldItems?: Array<{ fieldName?: string; fieldValue?: string; isKeyField?: boolean }>;
        }>;
      }>;
    };
    const layer = mapSearch.layers?.[0];
    const row = layer?.rowItems?.[0];
    const keyField = row?.fieldItems?.find((item) => Boolean(item.isKeyField));
    if (!layer?.name || !Number.isFinite(layer.objectId) || !keyField?.fieldName || !keyField.fieldValue) {
      return null;
    }

    const landUseRes = await fetch(`${appApiUrl}GetLandUseObj`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify({
        projId,
        mapName,
        mapSession,
        layerName: layer.name,
        filter: `${keyField.fieldName}=${keyField.fieldValue}`,
        objectId: layer.objectId,
      }),
    });
    if (!landUseRes.ok) {
      return null;
    }
    const landUse = await landUseRes.json() as { parcelId?: number | string; parcel?: string };
    qId = normalizeDigitsClient(String(landUse.parcelId ?? ''));
    qNum = normalizeDigitsClient(String(landUse.parcel || helka)) || helka;
    parcelLabel = `חלקה ${qNum} (גוש ${gush})`;
    if (!qId) {
      return null;
    }
  }

  const reportQs = new URLSearchParams({
    projId: String(projId),
    qId,
    qNum,
    searchBy: 'parcel',
    ApplicantName: '',
    RequestNumber: '',
    ApplicantAddress: '',
    SumPaid: '',
    OrderNumber: '',
    PaymentDate: '',
    Warning: '0',
  });
  const reportRes = await fetch(`${appApiUrl}GetDoch33Report?${reportQs.toString()}`, {
    cache: 'no-store',
    headers: authHeaders,
  });
  if (!reportRes.ok) {
    return null;
  }
  const reportFile = decodeJsonWrappedStringClient(await reportRes.text());
  if (!reportFile) {
    return null;
  }
  const reportUrl = `${mapApiUrl.replace(/\/api\/map\/?$/i, '')}/TempFiles/${reportFile}`;

  return {
    title: 'מידע תיכנוני',
    municipality: 'נס ציונה',
    gush,
    helka,
    provider: 'נס ציונה - GISNET (MG2)',
    source: 'municipal-gis:ness-ziona-mg2:client',
    parcelQueryUrl: reportUrl,
    printServiceUrl: reportUrl,
    notes: [
      'הופק דוח "מידע תיכנוני" ממערכת ה-GIS העירונית (חילוץ ישיר מהדפדפן).',
      'הקישור פותח את דוח המקור המלא וניתן להדפיס/לשמור ממנו PDF.',
    ],
    fields: [
      { label: 'ספק', value: 'נס ציונה - GISNET (MG2)' },
      { label: 'פלטפורמה', value: 'GISNET (MG2)' },
      { label: 'מזהה דוח (qId)', value: qId },
      { label: 'מספר בדוח (qNum)', value: qNum },
      { label: 'מקור זיהוי חלקה', value: lookupSource },
      ...(parcelLabel ? [{ label: 'זיהוי חלקה במערכת', value: parcelLabel }] : []),
    ],
  };
}

export default function ResultsDisplay({ result }: ResultsDisplayProps) {
  const [clientMunicipalPlanningInfo, setClientMunicipalPlanningInfo] = useState<MunicipalPlanningInfo | null>(null);
  const [clientMunicipalLoading, setClientMunicipalLoading] = useState(false);
  const [rightsDocumentLoading, setRightsDocumentLoading] = useState(false);
  const [showEmbeddedGovMap, setShowEmbeddedGovMap] = useState(false);

  const hookMunicipalPlans = result?.municipalPlans;
  const hookLandPlot = result?.landPlot;
  const hookResolvedGush = (result?.location.gush || hookLandPlot?.gush || '').trim();
  const hookResolvedHelka = (result?.location.helka || hookLandPlot?.helka || '').trim();
  const hookMunicipalApiError = hookMunicipalPlans?.error || '';
  const shouldTryClientMg2Fallback = hookMunicipalPlans?.providerId === 'ness-ziona-mg2'
    && Boolean(hookResolvedGush && hookResolvedHelka);

  useEffect(() => {
    let isCancelled = false;
    if (!shouldTryClientMg2Fallback) {
      setClientMunicipalPlanningInfo(null);
      setClientMunicipalLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    setClientMunicipalLoading(true);
    fetchNessZionaPlanningInfoClient(hookResolvedGush, hookResolvedHelka)
      .then((info) => {
        if (!isCancelled) {
          setClientMunicipalPlanningInfo(info);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setClientMunicipalPlanningInfo(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setClientMunicipalLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [shouldTryClientMg2Fallback, hookResolvedGush, hookResolvedHelka]);

  if (!result) return null;

  const {
    location,
    govmapUrl,
    searchDuration,
    landPlot,
    plans,
    regulations,
    parcelRegistration,
    parcelUsageCode,
    planningData,
    municipalPlans,
    planComparison,
    externalLinks,
  } = result;

  const resolvedGush = (location.gush || landPlot?.gush || '').trim();
  const resolvedHelka = (location.helka || landPlot?.helka || '').trim();
  const hasPoint = Number.isFinite(location.x)
    && Number.isFinite(location.y)
    && location.x !== 0
    && location.y !== 0;

  const templatePlanNumber = pickPlanNumberForTemplate(plans);
  const isMunicipalFilteredFinalList = Boolean(planComparison?.usedMunicipalFilter);
  const municipalProviderLabel = municipalPlans?.providerName || municipalPlans?.municipality || null;
  const municipalPlanningInfo = municipalPlans?.planningInfo || null;
  const isMg2Provider = String(municipalPlans?.providerId || '').toLowerCase().endsWith('-mg2');

  const effectiveMunicipalPlanningInfo = clientMunicipalPlanningInfo || municipalPlanningInfo;
  const municipalPlanningUrl = effectiveMunicipalPlanningInfo?.parcelQueryUrl || municipalPlans?.parcelUrl || null;
  const comparisonItems = planComparison?.items ?? [];
  const municipalOnlyMissingFromTaba = comparisonItems.filter(
    (item) => item.inMunicipal && !item.inTabaInfo,
  );
  const xplanOnlyNotMunicipal = comparisonItems.filter(
    (item) => item.inXplan && !item.inMunicipal,
  );
  const xplanPlanQueryUrl = templatePlanNumber
    ? buildXplanPlanQueryUrl(templatePlanNumber, false)
    : null;
  const xplanPlanQuery77_78Url = templatePlanNumber
    ? buildXplanPlanQueryUrl(templatePlanNumber, true)
    : null;
  const xplanPointQueryUrl = hasPoint
    ? buildXplanPointQueryUrl(location.x, location.y, false)
    : null;
  const xplanPointQuery77_78Url = hasPoint
    ? buildXplanPointQueryUrl(location.x, location.y, true)
    : null;
  const parcelWfsTemplateUrl = resolvedGush && resolvedHelka
    ? buildParcelWfsTemplateUrl(resolvedGush, resolvedHelka)
    : null;
  const internalXplanPlanApiUrl = templatePlanNumber
    ? `/api/xplan-query?plan_number=${encodeURIComponent(templatePlanNumber)}`
    : null;
  const internalXplanPointApiUrl = hasPoint
    ? `/api/xplan-query?x=${Math.round(location.x)}&y=${Math.round(location.y)}`
    : null;
  const internalXplanParcelApiUrl = resolvedGush && resolvedHelka
    ? `/api/xplan-query?gush=${encodeURIComponent(resolvedGush)}&helka=${encodeURIComponent(resolvedHelka)}`
    : null;
  const rightsDocumentUrl = buildRightsDocumentUrl({
    gush: resolvedGush,
    helka: resolvedHelka,
    municipalPlans,
  });
  const effectiveRightsDocumentUrl = (isMg2Provider && clientMunicipalPlanningInfo?.printServiceUrl)
    || rightsDocumentUrl;
  const handleOpenRightsDocument = async (): Promise<void> => {
    if (!effectiveRightsDocumentUrl || typeof window === 'undefined') {
      return;
    }

    let targetUrl = effectiveRightsDocumentUrl;

    const isNessZionaMg2 = String(municipalPlans?.providerId || '').toLowerCase() === 'ness-ziona-mg2';
    if (isNessZionaMg2) {
      setRightsDocumentLoading(true);
      try {
        const clientInfo = await fetchNessZionaPlanningInfoClient(resolvedGush, resolvedHelka);
        if (clientInfo?.printServiceUrl) {
          targetUrl = clientInfo.printServiceUrl;
          setClientMunicipalPlanningInfo(clientInfo);
        }
      } catch {
        // Keep fallback target URL.
      } finally {
        setRightsDocumentLoading(false);
      }
    }

    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.location.href = targetUrl;
    } else {
      window.location.href = targetUrl;
    }
  };
  const handlePrintMunicipalPlanningInfo = (): void => {
    if (!effectiveMunicipalPlanningInfo || typeof window === 'undefined') {
      return;
    }
    const printUrl = effectiveMunicipalPlanningInfo.printServiceUrl || '';
    if (printUrl.includes('/api/municipal-rights-report')) {
      window.open(printUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const fieldsHtml = effectiveMunicipalPlanningInfo.fields
      .map((field) => `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(field.value)}</td></tr>`)
      .join('');
    const notesHtml = (effectiveMunicipalPlanningInfo.notes ?? [])
      .map((note) => `<li>${escapeHtml(note)}</li>`)
      .join('');
    const municipality = effectiveMunicipalPlanningInfo.municipality || municipalPlans?.municipality || '';
    const provider = effectiveMunicipalPlanningInfo.provider || municipalPlans?.providerName || '';

    const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>מידע תיכנוני - גוש ${escapeHtml(effectiveMunicipalPlanningInfo.gush)} חלקה ${escapeHtml(effectiveMunicipalPlanningInfo.helka)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { font-size: 22px; margin: 0 0 10px; }
    .meta { color: #4b5563; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: right; vertical-align: top; }
    th { width: 28%; background: #f9fafb; }
    ul { margin-top: 14px; }
    a { color: #075985; }
  </style>
</head>
<body>
  <h1>${escapeHtml(effectiveMunicipalPlanningInfo.title || 'מידע תיכנוני')}</h1>
  <div class="meta">
    ${municipality ? `רשות: ${escapeHtml(municipality)} | ` : ''}גוש: ${escapeHtml(effectiveMunicipalPlanningInfo.gush)} | חלקה: ${escapeHtml(effectiveMunicipalPlanningInfo.helka)}
    ${provider ? `<br/>ספק GIS: ${escapeHtml(provider)}` : ''}
  </div>
  <table><tbody>${fieldsHtml}</tbody></table>
  ${notesHtml ? `<ul>${notesHtml}</ul>` : ''}
  ${municipalPlanningUrl ? `<p><a href="${escapeHtml(municipalPlanningUrl)}" target="_blank" rel="noopener noreferrer">פתיחה ב-GIS עירוני</a></p>` : ''}
</body>
</html>`;

    let popupPrinted = false;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      popupPrinted = true;
      window.setTimeout(() => {
        try {
          printWindow.print();
        } catch {
          // Continue; file download fallback is still executed below.
        }
      }, 250);
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `municipal-planning-${effectiveMunicipalPlanningInfo.gush}-${effectiveMunicipalPlanningInfo.helka}.html`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);

    if (!popupPrinted) {
      // Keep feedback minimal and local when popup is blocked by browser policy.
      window.alert('הדפסת חלון נחסמה בדפדפן. נשמר קובץ HTML להדפסה בתיקיית ההורדות.');
    }
  };

  return (
    <div className="results">
      {/* Location Card */}
      <div className="card result-card">
        <div className="result-header">
          <div className="result-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div>
            <h2>{location.label}</h2>
            <span className="meta">חיפוש הושלם ב-{searchDuration}ms</span>
          </div>
        </div>

        <div className="info-grid">
          {location.gush && (
            <div className="info-chip">
              <span className="chip-label">גוש</span>
              <span className="chip-value">{location.gush}</span>
            </div>
          )}
          {location.helka && (
            <div className="info-chip">
              <span className="chip-label">חלקה</span>
              <span className="chip-value">{location.helka}</span>
            </div>
          )}
          {location.x !== 0 && location.y !== 0 && (
            <>
              <div className="info-chip">
                <span className="chip-label">X (ITM)</span>
                <span className="chip-value">{Math.round(location.x)}</span>
              </div>
              <div className="info-chip">
                <span className="chip-label">Y (ITM)</span>
                <span className="chip-value">{Math.round(location.y)}</span>
              </div>
            </>
          )}
        </div>

        {/* Additional addresses from land plot */}
        {landPlot && landPlot.addresses.length > 1 && (
          <div className="addresses-section">
            <span className="section-label">כתובות נוספות</span>
            <div className="addresses-list">
              {landPlot.addresses.slice(1).map((addr, i) => (
                <span key={i} className="address-tag">{addr}</span>
              ))}
            </div>
          </div>
        )}

        <a href={govmapUrl} target="_blank" rel="noopener noreferrer" className="govmap-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          {`פתח ב-GovMap עם שכבת תב"ע`}
        </a>
        {location.gush && location.helka && (
          <>
            <button
              type="button"
              className="govmap-secondary-btn"
              onClick={() => setShowEmbeddedGovMap((current) => !current)}
            >
              {showEmbeddedGovMap ? 'הסתרת GovMap משובץ' : 'הצגת GovMap משובץ'}
            </button>
            {!GOVMAP_EMBED_TOKEN && (
              <p className="govmap-note">
                להגדרת מפה משובצת: הוסף `NEXT_PUBLIC_GOVMAP_TOKEN` ל-`.env.local`.
              </p>
            )}
            {showEmbeddedGovMap && GOVMAP_EMBED_TOKEN && (
              <GovMapEmbed
                token={GOVMAP_EMBED_TOKEN}
                gush={location.gush}
                helka={location.helka}
                address={location.label}
              />
            )}
          </>
        )}
        {effectiveRightsDocumentUrl && (
          <button type="button" className="govmap-btn" onClick={() => { void handleOpenRightsDocument(); }} disabled={rightsDocumentLoading}>
            {rightsDocumentLoading ? 'מפיק דוח זכויות...' : (isMg2Provider ? 'דוח זכויות (MG2 ישיר)' : 'הפקת דוח זכויות ReguScape')}
          </button>
        )}

        {!location.gush && location.x !== 0 && (
          <p className="gush-note">מידע על גוש וחלקה זמין דרך הקישור ל-GovMap</p>
        )}
      </div>

      {/* XPLAN Query Templates Card */}
      <div className="card result-card">
        <div className="result-header">
          <div className="result-icon xplan-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l9-4 9 4-9 4-9-4z"/>
              <path d="M3 12l9 4 9-4"/>
              <path d="M3 18l9 4 9-4"/>
            </svg>
          </div>
          <div>
            <h2>תבניות שאילתא ל-XPLAN</h2>
            {templatePlanNumber && (
              <span className="meta">{`מספר תוכנית מזוהה: ${templatePlanNumber}`}</span>
            )}
          </div>
        </div>

        <div className="external-links">
          <a href={XPLAN_SITE_URL} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
            פתיחת אתר קווים כחולים (XPLAN)
          </a>
          {xplanPlanQueryUrl && (
            <a href={xplanPlanQueryUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              שאילתא לפי מספר תוכנית
            </a>
          )}
          {xplanPlanQuery77_78Url && (
            <a href={xplanPlanQuery77_78Url} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              שאילתא לפי מספר תוכנית (77/78)
            </a>
          )}
          {xplanPointQueryUrl && (
            <a href={xplanPointQueryUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              שאילתא מרחבית לפי נקודה (ITM X/Y)
            </a>
          )}
          {xplanPointQuery77_78Url && (
            <a href={xplanPointQuery77_78Url} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              שאילתא מרחבית לפי נקודה (77/78)
            </a>
          )}
          {parcelWfsTemplateUrl && (
            <a href={parcelWfsTemplateUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              תבנית WFS לאיתור חלקה לפי גוש/חלקה
            </a>
          )}
          {internalXplanPlanApiUrl && (
            <a href={internalXplanPlanApiUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              JSON פנימי לפי מספר תוכנית
            </a>
          )}
          {internalXplanPointApiUrl && (
            <a href={internalXplanPointApiUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              JSON פנימי לפי נקודה
            </a>
          )}
          {internalXplanParcelApiUrl && (
            <a href={internalXplanParcelApiUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn xplan-link">
              JSON פנימי לפי גוש/חלקה
            </a>
          )}
        </div>

      <p className="templates-note">
          אתר XPLAN הוא כלי עזר; לאימות סטטוטורי רשמי יש לבדוק גם ב-MAVAT.
        </p>
      </div>

      {effectiveMunicipalPlanningInfo && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon planning-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h2>{effectiveMunicipalPlanningInfo.title || 'מידע תיכנוני'}</h2>
              {municipalProviderLabel && <span className="meta">{`GIS עירוני: ${municipalProviderLabel}`}</span>}
            </div>
          </div>

          <div className="mavat-content">
            {effectiveMunicipalPlanningInfo.fields.map((field) => (
              <div key={`${field.label}-${field.value}`} className="data-row">
                <span className="data-label">{field.label}</span>
                <span className="data-value">{field.value}</span>
              </div>
            ))}
          </div>

          {(effectiveMunicipalPlanningInfo.notes?.length ?? 0) > 0 && (
            <div className="planning-notes">
              {(effectiveMunicipalPlanningInfo.notes ?? []).map((note, index) => (
                <div key={`planning-note-${index}`} className="plan-meta">{note}</div>
              ))}
            </div>
          )}
          {clientMunicipalLoading && (
            <div className="planning-notes">
              <div className="plan-meta">מנסה למשוך דוח מידע תיכנוני ישירות מה-GIS...</div>
            </div>
          )}

          <div className="external-links">
            {municipalPlanningUrl && (
              <a href={municipalPlanningUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn taba-link">
                פתיחת מידע תיכנוני ב-GIS העירוני
              </a>
            )}
            {effectiveRightsDocumentUrl && (
              <button type="button" className="external-link-btn xplan-link" onClick={() => { void handleOpenRightsDocument(); }} disabled={rightsDocumentLoading}>
                {rightsDocumentLoading ? 'מפיק דוח זכויות...' : (isMg2Provider ? 'דוח זכויות (MG2 ישיר)' : 'דוח זכויות ReguScape')}
              </button>
            )}
            {!isMg2Provider && effectiveMunicipalPlanningInfo.printServiceUrl && (
              <a href={effectiveMunicipalPlanningInfo.printServiceUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn iplan-link">
                שירות הדפסה GIS (מתקדם)
              </a>
            )}
            <button type="button" className="external-link-btn xplan-link planning-print-btn" onClick={handlePrintMunicipalPlanningInfo}>
              הפקת קובץ להדפסה
            </button>
          </div>
        </div>
      )}

      {planComparison && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon planning-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4" />
                <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9" />
              </svg>
            </div>
            <div>
              <h2>השוואת מקורות (GovMap / XPLAN / GIS עירוני)</h2>
              {municipalProviderLabel && (
                <span className="meta">{`GIS עירוני: ${municipalProviderLabel}`}</span>
              )}
            </div>
          </div>

          <div className="comparison-grid">
            <div className="info-chip">
              <span className="chip-label">GIS עירוני</span>
              <span className="chip-value">{planComparison.counts.municipal}</span>
            </div>
            <div className="info-chip">
              <span className="chip-label">GovMap</span>
              <span className="chip-value">{planComparison.counts.govMap}</span>
            </div>
            <div className="info-chip">
              <span className="chip-label">XPLAN</span>
              <span className="chip-value">{planComparison.counts.xplan}</span>
            </div>
            <div className="info-chip">
              <span className="chip-label">ReguScape/TABA</span>
              <span className="chip-value">{planComparison.counts.tabaInfo}</span>
            </div>
            <div className="info-chip">
              <span className="chip-label">רשימה סופית</span>
              <span className="chip-value">{planComparison.counts.final}</span>
            </div>
          </div>

          {isMunicipalFilteredFinalList && (
            <p className="templates-note">
              הרשימה הסופית מסוננת לפי התאמה לחלקה מתוך ה-GIS העירוני.
            </p>
          )}

          {!isMunicipalFilteredFinalList && (
            <p className="templates-note">
              לא הופעל סינון עירוני (אין תמיכה/לא נמצאו תוצאות עירוניות), לכן הרשימה הסופית מבוססת על איחוד מקורות.
            </p>
          )}

          {municipalPlans?.parcelUrl && (
            <div className="external-links">
              <a href={municipalPlans.parcelUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn taba-link">
                פתיחת דף חלקה ב-GIS העירוני
              </a>
            </div>
          )}

          {municipalOnlyMissingFromTaba.length > 0 && (
            <div className="comparison-list">
              <div className="planning-taba-header">{`נמצאו בעירייה אך לא ב-ReguScape/TABA (${municipalOnlyMissingFromTaba.length})`}</div>
              <div className="planning-taba-list">
                {municipalOnlyMissingFromTaba.slice(0, 12).map((item) => (
                  <div key={`cmp-muni-${item.key}`} className="planning-taba-item">
                    <div className="planning-taba-info">
                      <span className="plan-number">{item.planNumber || 'ללא קוד'}</span>
                      <span className="planning-taba-city">{item.planName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {xplanOnlyNotMunicipal.length > 0 && (
            <div className="comparison-list">
              <div className="planning-taba-header">{`XPLAN בלבד (לא אומת ב-GIS העירוני) (${xplanOnlyNotMunicipal.length})`}</div>
              <div className="planning-taba-list">
                {xplanOnlyNotMunicipal.slice(0, 12).map((item) => (
                  <div key={`cmp-xplan-${item.key}`} className="planning-taba-item">
                    <div className="planning-taba-info">
                      <span className="plan-number">{item.planNumber || 'ללא קוד'}</span>
                      <span className="planning-taba-city">{item.planName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TABA Plans Card */}
      {plans.length > 0 && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon taba-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h2>{isMunicipalFilteredFinalList
                ? `רשימת תוכניות סופית (רלוונטיות לחלקה) (${plans.length})`
                : `תוכניות תב"ע קשורות (${plans.length})`}</h2>
            </div>
          </div>

          <div className="plans-list">
            {plans.map((plan, index) => (
              <div key={`${plan.planNumber}-${index}`} className="plan-item">
                <div className="plan-header">
                  <span className="plan-number">{plan.planNumber}</span>
                  {plan.planType && <span className="plan-type">{plan.planType}</span>}
                </div>
                <div className="plan-name">{plan.planName}</div>
                {plan.source && (
                  <div className="plan-meta">{`מקור: ${plan.source}`}</div>
                )}
                {plan.planStatus && <div className="plan-meta">סטטוס: {plan.planStatus}</div>}
                {plan.authority && <div className="plan-meta">רשות: {plan.authority}</div>}
                {plan.locality && <div className="plan-meta">יישוב: {plan.locality}</div>}
                {plan.place && <div className="plan-meta">מיקום: {plan.place}</div>}
                {(plan.lotSizeSqm || plan.maxFloors || plan.maxBuildableAreaSqm) && (
                  <div className="plan-values">
                    {plan.lotSizeSqm && plan.lotSizeSqm > 0 && (
                      <span className="plan-value">{`שטח: ${plan.lotSizeSqm} מ"ר`}</span>
                    )}
                    {plan.maxFloors && plan.maxFloors > 0 && (
                      <span className="plan-value">{`קומות: ${plan.maxFloors}`}</span>
                    )}
                    {plan.maxBuildableAreaSqm && plan.maxBuildableAreaSqm > 0 && (
                      <span className="plan-value">{`בנייה מותרת: ${plan.maxBuildableAreaSqm} מ"ר`}</span>
                    )}
                  </div>
                )}
                {(plan.takanonUrl || plan.planPageUrl) && (
                  <div className="plan-actions">
                    {plan.takanonUrl && (
                      <a
                        href={plan.takanonUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="plan-link"
                      >
                        תקנון
                      </a>
                    )}
                    {plan.planPageUrl && (
                      <a
                        href={plan.planPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="plan-link plan-link-secondary"
                      >
                        עמוד תוכנית
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {(externalLinks?.govmapTabaUrl || externalLinks?.iplanUrl) && (
            <div className="external-links">
              {externalLinks.govmapTabaUrl && (
                <a href={externalLinks.govmapTabaUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn taba-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  {`צפייה בתב"ע ב-GovMap`}
                </a>
              )}
              {externalLinks.iplanUrl && (
                <a href={externalLinks.iplanUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn iplan-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  חיפוש תוכניות ב-iPlan
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {plans.length === 0 && (location.gush || location.helka) && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon taba-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h2>{`תוכניות תב"ע`}</h2>
            </div>
          </div>
          <div className="no-plans-message">
            {`ניתן לצפות בתוכניות תב"ע דרך הקישורים הבאים`}
          </div>
          {(externalLinks?.govmapTabaUrl || externalLinks?.iplanUrl) && (
            <div className="external-links">
              {externalLinks.govmapTabaUrl && (
                <a href={externalLinks.govmapTabaUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn taba-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  {`צפייה בתב"ע ב-GovMap`}
                </a>
              )}
              {externalLinks.iplanUrl && (
                <a href={externalLinks.iplanUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn iplan-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  חיפוש תוכניות ב-iPlan
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Building Regulations Card */}
      {regulations && (regulations.max_floors > 0 || regulations.max_buildable_area_sqm > 0) && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon regs-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                <line x1="9" y1="6" x2="9" y2="6.01"/>
                <line x1="15" y1="6" x2="15" y2="6.01"/>
                <line x1="9" y1="10" x2="9" y2="10.01"/>
                <line x1="15" y1="10" x2="15" y2="10.01"/>
                <line x1="9" y1="14" x2="9" y2="14.01"/>
                <line x1="15" y1="14" x2="15" y2="14.01"/>
                <line x1="9" y1="18" x2="15" y2="18"/>
              </svg>
            </div>
            <div>
              <h2>זכויות בנייה</h2>
            </div>
          </div>

          <div className="regs-grid">
            {regulations.max_floors > 0 && (
              <div className="reg-card">
                <span className="reg-number">{regulations.max_floors}</span>
                <span className="reg-label">קומות מקסימום</span>
              </div>
            )}
            {regulations.max_buildable_area_sqm > 0 && (
              <div className="reg-card">
                <span className="reg-number">{regulations.max_buildable_area_sqm}</span>
                <span className="reg-label">{`מ"ר שטח בנייה`}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parcel Registration & Usage Code Card */}
      {(parcelRegistration || parcelUsageCode) && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon mavat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <div>
              <h2>מידע רישומי (מבא&quot;ת)</h2>
            </div>
          </div>

          <div className="mavat-content">
            {parcelRegistration?.taba_info && (
              <div className="data-row">
                <span className="data-label">מידע תב&quot;ע</span>
                <span className="data-value">{parcelRegistration.taba_info}</span>
              </div>
            )}
            {parcelRegistration?.mavat_info && (
              <div className="data-row">
                <span className="data-label">מידע מבא&quot;ת</span>
                <span className="data-value">{parcelRegistration.mavat_info}</span>
              </div>
            )}
            {parcelUsageCode?.usage_code && (
              <div className="data-row">
                <span className="data-label">קוד שימוש</span>
                <span className="data-value">{parcelUsageCode.usage_code}</span>
              </div>
            )}
            {parcelUsageCode?.description && (
              <div className="data-row">
                <span className="data-label">תיאור שימוש</span>
                <span className="data-value">{parcelUsageCode.description}</span>
              </div>
            )}
            {!parcelRegistration?.taba_info && !parcelRegistration?.mavat_info
              && !parcelUsageCode?.usage_code && !parcelUsageCode?.description && (
              <div className="no-plans-message">אין מידע</div>
            )}
          </div>
        </div>
      )}

      {/* Planning Layers Card */}
      {planningData && (planningData.layers.some(l => l.entityCount > 0) || planningData.tabaPlans.length > 0) && (() => {
        const totalEntities = planningData.layers.reduce((sum, l) => sum + l.entityCount, 0);
        const activeLayers = planningData.layers.filter(l => l.entityCount > 0);
        return (
          <div className="card result-card">
            <div className="result-header">
              <div className="result-icon planning-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                  <line x1="8" y1="2" x2="8" y2="18"/>
                  <line x1="16" y1="6" x2="16" y2="22"/>
                </svg>
              </div>
              <div>
                <h2>{`שכבות תכנון (${totalEntities} רשומות)`}</h2>
                <span className="meta">{`${activeLayers.length} שכבות פעילות`}</span>
              </div>
            </div>

            <div className="planning-layers-list">
              {activeLayers.map((layer) => (
                <details key={layer.layerId} className="planning-layer-item">
                  <summary className="planning-layer-summary">
                    <span className="planning-layer-name">{layer.layerName}</span>
                    <span className="planning-entity-count">{layer.entityCount}</span>
                  </summary>
                  <div className="planning-entities">
                    {layer.entities.map((entity) => {
                      const fields = Object.entries(entity.fields).filter(([, v]) => v !== null && v !== '');
                      return (
                        <div key={entity.objectId} className="planning-entity">
                          {fields.map(([key, value]) => (
                            <div key={key} className="planning-field">
                              <span className="planning-field-label">{key}</span>
                              <span className="planning-field-value">{value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>

            {planningData.tabaPlans.length > 0 && (
              <div className="planning-taba-section">
                <div className="planning-taba-header">{`תכניות תב"א (${planningData.tabaPlans.length})`}</div>
                <div className="planning-taba-list">
                  {planningData.tabaPlans.map((plan, i) => {
                    const code = (plan.tochnit ?? plan.taba_code ?? plan.PL_NUMBER ?? '') as string;
                    const city = (plan.yeshuvname ?? plan.locality ?? plan.PL_CITY ?? '') as string;
                    const url = (plan.url ?? '') as string;
                    return (
                      <div key={`taba-${i}`} className="planning-taba-item">
                        <div className="planning-taba-info">
                          <span className="plan-number">{code}</span>
                          {city && <span className="planning-taba-city">{city}</span>}
                        </div>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="plan-link plan-link-secondary">
                            צפייה
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <style jsx>{`
        .results {
          margin-top: 1rem;
        }
        .result-card {
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .result-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .result-icon {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--primary-light);
          color: var(--primary);
          border-radius: 10px;
        }
        .taba-icon {
          background: #fef3c7;
          color: #d97706;
        }
        .regs-icon {
          background: #d1fae5;
          color: #059669;
        }
        .mavat-icon {
          background: #ede9fe;
          color: #7c3aed;
        }
        .xplan-icon {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .result-header h2 {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--text);
          margin: 0;
          line-height: 1.3;
        }
        .meta {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .info-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }
        .info-chip {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.85rem;
          background: var(--background);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .chip-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .chip-value {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text);
        }
        .addresses-section {
          margin-bottom: 1.25rem;
        }
        .section-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
        }
        .addresses-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .address-tag {
          padding: 0.35rem 0.75rem;
          background: var(--background);
          border-radius: 6px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          border: 1px solid var(--border);
        }
        .govmap-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.85rem;
          background: var(--primary);
          color: white;
          border-radius: var(--radius);
          font-weight: 600;
          font-size: 0.95rem;
          text-decoration: none;
          transition: background 0.2s, box-shadow 0.2s;
          box-shadow: var(--shadow-sm);
        }
        .govmap-btn:hover {
          background: var(--primary-dark);
          box-shadow: var(--shadow);
          text-decoration: none;
        }
        .govmap-secondary-btn {
          width: 100%;
          margin-top: 0.75rem;
          padding: 0.85rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--text);
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .govmap-secondary-btn:hover {
          background: #f8fafc;
          border-color: var(--primary);
        }
        .govmap-note {
          margin-top: 0.65rem;
          font-size: 0.84rem;
          color: var(--text-muted);
          text-align: center;
        }
        .gush-note {
          text-align: center;
          margin-top: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .plans-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .plan-item {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--background);
          padding: 0.75rem 0.9rem;
        }
        .plan-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }
        .plan-number {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--primary-dark);
        }
        .plan-type {
          font-size: 0.75rem;
          font-weight: 600;
          color: #92400e;
          background: #fef3c7;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
        }
        .plan-name {
          font-size: 0.95rem;
          color: var(--text);
          margin-bottom: 0.2rem;
        }
        .plan-meta {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .plan-values {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-top: 0.45rem;
        }
        .plan-value {
          font-size: 0.75rem;
          font-weight: 600;
          color: #065f46;
          background: #d1fae5;
          border: 1px solid #6ee7b7;
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
        }
        .plan-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.55rem;
        }
        .plan-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.3rem 0.65rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 600;
          text-decoration: none;
          background: #fef3c7;
          border: 1px solid #fcd34d;
          color: #92400e;
        }
        .plan-link:hover {
          text-decoration: none;
          background: #fde68a;
        }
        .plan-link-secondary {
          background: #e0f2fe;
          border-color: #7dd3fc;
          color: #075985;
        }
        .plan-link-secondary:hover {
          background: #bae6fd;
        }
        .no-plans-message {
          font-size: 0.92rem;
          color: var(--text-secondary);
          background: var(--background);
          border: 1px dashed var(--border);
          border-radius: 10px;
          padding: 0.9rem;
          text-align: center;
          margin-bottom: 0.75rem;
        }
        .external-links {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        .external-link-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.7rem;
          border-radius: var(--radius);
          font-weight: 600;
          font-size: 0.85rem;
          text-decoration: none;
          transition: background 0.2s;
          border: 1px solid;
        }
        .taba-link {
          background: #fef3c7;
          color: #92400e;
          border-color: #fcd34d;
        }
        .taba-link:hover {
          background: #fde68a;
          text-decoration: none;
        }
        .iplan-link {
          background: #ede9fe;
          color: #5b21b6;
          border-color: #c4b5fd;
        }
        .iplan-link:hover {
          background: #ddd6fe;
          text-decoration: none;
        }
        .xplan-link {
          background: #e0f2fe;
          color: #075985;
          border-color: #7dd3fc;
        }
        .xplan-link:hover {
          background: #bae6fd;
          text-decoration: none;
        }
        .templates-note {
          margin-top: 0.75rem;
          font-size: 0.8rem;
          color: var(--text-muted);
          text-align: center;
        }
        .planning-print-btn {
          cursor: pointer;
          width: 100%;
        }
        .planning-notes {
          margin-top: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .data-row {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .data-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
        }
        .data-value {
          font-size: 0.95rem;
          color: var(--text);
        }
        .mavat-content {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .planning-icon {
          background: #e0e7ff;
          color: #4f46e5;
        }
        .planning-layers-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .planning-layer-item {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--background);
          overflow: hidden;
        }
        .planning-layer-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.7rem 0.9rem;
          cursor: pointer;
          user-select: none;
        }
        .planning-layer-summary:hover {
          background: var(--border);
        }
        .planning-layer-name {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
        }
        .planning-entity-count {
          font-size: 0.75rem;
          font-weight: 600;
          background: #e0e7ff;
          color: #4f46e5;
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
        }
        .planning-entities {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0 0.9rem 0.75rem;
          max-height: 300px;
          overflow-y: auto;
        }
        .planning-entity {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem 0.75rem;
          padding: 0.5rem 0.65rem;
          background: var(--surface);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .planning-field {
          display: flex;
          gap: 0.3rem;
          font-size: 0.78rem;
        }
        .planning-field-label {
          color: var(--text-muted);
          font-weight: 600;
          white-space: nowrap;
        }
        .planning-field-label::after {
          content: ':';
        }
        .planning-field-value {
          color: var(--text);
        }
        .planning-taba-section {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border);
        }
        .planning-taba-header {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }
        .planning-taba-list {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .planning-taba-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .planning-taba-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .planning-taba-city {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .regs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        .reg-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.25rem 1rem;
          background: var(--background);
          border-radius: 10px;
          border: 1px solid var(--border);
          text-align: center;
        }
        .reg-number {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
          margin-bottom: 0.35rem;
        }
        .reg-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
