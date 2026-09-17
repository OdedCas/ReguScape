import type {
  MunicipalParcelPlan,
  MunicipalParcelPlansResponse,
  MunicipalPlanningInfo,
  MunicipalPlanningInfoField,
} from '@/types';
import { tlvGetFullBuildingRights } from '@/services/tlv-arcgis';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface MunicipalLookupInput {
  gush: string;
  helka: string;
  cityHint?: string;
  locationLabel?: string;
  addressHints?: string[];
}

interface MunicipalProvider {
  id: string;
  name: string;
  municipality: string;
  supports(input: MunicipalLookupInput): boolean;
  fetchPlans(input: MunicipalLookupInput): Promise<MunicipalParcelPlansResponse>;
}

type MunicipalPlatformKind = 'complot-classic' | 'complot-gisnet-v5' | 'gisnet-mg2' | 'arcgis-esri';

interface BaseMunicipalityConfig {
  providerId: string;
  providerName: string;
  municipality: string;
  platform: MunicipalPlatformKind;
  cityAliases: string[];
  portalUrl?: string;
}

interface ComplotMunicipalityConfig extends BaseMunicipalityConfig {
  platform: 'complot-classic';
  siteId: string;
  portalHost: string;
  buildParcelUrl?: (gush: string, helka: string) => string;
}

interface GisnetV5MunicipalityConfig extends BaseMunicipalityConfig {
  platform: 'complot-gisnet-v5';
  portalUrl: string;
}

interface Mg2MunicipalityConfig extends BaseMunicipalityConfig {
  platform: 'gisnet-mg2';
  portalUrl: string;
}

interface ArcgisMunicipalityConfig extends BaseMunicipalityConfig {
  platform: 'arcgis-esri';
  portalUrl: string;
  restServiceUrl?: string;
}

type MunicipalityPlatformConfig =
  | ComplotMunicipalityConfig
  | GisnetV5MunicipalityConfig
  | Mg2MunicipalityConfig
  | ArcgisMunicipalityConfig;

const COMPLOT_BASE_URL = 'https://handasi.complot.co.il';

interface GisnetApiEnvelope<T> {
  success?: boolean;
  message?: string | null;
  value?: T;
}

interface GisnetMapMetadata {
  name?: string;
  printUrl?: string | null;
}

interface GisnetLayerMetadata {
  layerCode?: number;
  layerName?: string;
  layerGroupName?: string;
  type?: string;
  isIdentify?: boolean;
}

interface Mg2AppConfig {
  projId?: number | string;
  appApiUrl?: string;
  mapApiUrl?: string;
}

interface Mg2ParcelTreeNode {
  id?: number | string;
  name?: string;
  children?: Mg2ParcelTreeNode[];
}

interface Mg2FlatNode {
  id: string;
  name: string;
  depth: number;
  isLeaf: boolean;
  parsedHelka?: string;
  parsedGush?: string;
}

interface Mg2MapSessionResponse {
  sessionId?: string;
  mapName?: string;
}

interface Mg2SearchField {
  name?: string;
  value?: unknown;
}

interface Mg2SearchRow {
  fields?: Mg2SearchField[];
}

interface Mg2SearchDefinition {
  searchId?: number;
  title?: string;
  dynamicForm?: {
    rows?: Mg2SearchRow[];
  };
  [key: string]: unknown;
}

interface Mg2MapSearchFieldItem {
  fieldName?: string;
  fieldValue?: string;
  isKeyField?: boolean;
}

interface Mg2MapSearchRowItem {
  fieldItems?: Mg2MapSearchFieldItem[];
}

interface Mg2MapSearchLayer {
  name?: string;
  objectId?: number;
  rowItems?: Mg2MapSearchRowItem[];
}

interface Mg2MapSearchResponse {
  layers?: Mg2MapSearchLayer[];
}

interface Mg2LandUseObj {
  parcelId?: number | string;
  qId?: number | string;
  block?: string;
  parcel?: string;
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupText(value: string): string {
  return htmlDecode(value)
    .replace(/[()/\\]/g, ' ')
    .replace(/[-,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlanNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function normalizeDigits(value: string): string {
  return value.replace(/[^\d]/g, '');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildPlanningInfo(params: {
  title?: string;
  municipality: string;
  gush: string;
  helka: string;
  source?: string;
  provider?: string;
  parcelQueryUrl?: string;
  printServiceUrl?: string;
  notes?: string[];
  fields?: MunicipalPlanningInfoField[];
}): MunicipalPlanningInfo {
  return {
    title: params.title || 'מידע תיכנוני',
    municipality: params.municipality,
    gush: params.gush,
    helka: params.helka,
    source: params.source,
    provider: params.provider,
    parcelQueryUrl: params.parcelQueryUrl,
    printServiceUrl: params.printServiceUrl,
    notes: params.notes && params.notes.length > 0 ? params.notes : undefined,
    fields: params.fields ?? [],
  };
}

function htmlDecode(value: string): string {
  return normalizeText(value)
    .replace(/&#(\d+);/g, (_, decimal) => {
      const code = Number(decimal);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function collectCityHints(input: MunicipalLookupInput): string[] {
  const values = [
    input.cityHint || '',
    input.locationLabel || '',
    ...(input.addressHints ?? []),
  ];

  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeLookupText(value);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
}

function buildComplotProgramUrl(program: string, params: Record<string, string>): string {
  const url = new URL('/magicscripts/mgrqispi.dll', COMPLOT_BASE_URL);
  url.searchParams.set('appname', 'cixpa');
  url.searchParams.set('prgname', program);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildComplotUnifiedParcelUrl(config: ComplotMunicipalityConfig, gush: string, helka: string): string {
  if (config.buildParcelUrl) {
    return config.buildParcelUrl(gush, helka);
  }
  return `https://${config.portalHost}/gush2/#unified/${gush}/${helka}`;
}

function platformLabel(platform: MunicipalPlatformKind): string {
  switch (platform) {
    case 'complot-classic':
      return 'Complot (Classic)';
    case 'complot-gisnet-v5':
      return 'Complot GISNET V5';
    case 'gisnet-mg2':
      return 'GISNET (MG2)';
    case 'arcgis-esri':
      return 'ArcGIS / Esri';
    default:
      return platform;
  }
}

function decodeJsonWrappedString(value: string): string {
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
    // Continue to fallback.
  }
  return sanitized.replace(/^"+|"+$/g, '').trim();
}

function isLikelyJwtToken(value: string): boolean {
  return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value);
}

function getMg2AppConfigUrl(config: Mg2MunicipalityConfig): string {
  const portal = new URL(config.portalUrl);
  const path = portal.pathname.replace(/\/+$/, '');
  return `${portal.origin}${path}/assets/appConfig/app.config.json`;
}

function parseMg2NodeName(nodeName: string): { helka?: string; gush?: string } {
  const match = nodeName.trim().match(/^(\d+)\s*\((\d+)\)/);
  if (!match) {
    return {};
  }
  return {
    helka: normalizeDigits(match[1] || ''),
    gush: normalizeDigits(match[2] || ''),
  };
}

function flattenMg2ParcelTree(nodes: Mg2ParcelTreeNode[], depth = 0): Mg2FlatNode[] {
  const flat: Mg2FlatNode[] = [];
  for (const node of nodes) {
    const id = normalizeDigits(String(node.id ?? ''));
    if (!id) {
      continue;
    }
    const name = String(node.name ?? '').trim();
    const children = Array.isArray(node.children) ? node.children : [];
    const parsed = parseMg2NodeName(name);
    flat.push({
      id,
      name,
      depth,
      isLeaf: children.length === 0,
      parsedHelka: parsed.helka,
      parsedGush: parsed.gush,
    });
    if (children.length > 0) {
      flat.push(...flattenMg2ParcelTree(children, depth + 1));
    }
  }
  return flat;
}

function selectMg2ParcelNode(flatNodes: Mg2FlatNode[], gush: string, helka: string): Mg2FlatNode | null {
  const exact = flatNodes.find((node) => node.parsedGush === gush && node.parsedHelka === helka);
  if (exact) {
    return exact;
  }
  const leafNodes = flatNodes.filter((node) => node.isLeaf).sort((a, b) => b.depth - a.depth);
  if (leafNodes.length > 0) {
    return leafNodes[0];
  }
  return flatNodes.length > 0 ? flatNodes[0] : null;
}

function htmlToPlainText(html: string): string {
  return htmlDecode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function extractMg2ReportDate(reportText: string): string | undefined {
  const match = reportText.match(/תאריך:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/);
  return match?.[1]?.trim() || undefined;
}

function buildMg2PortalRefFromAppApi(appApiUrl: string): string {
  const appApi = new URL(appApiUrl);
  const portalRefGuess = appApiUrl.replace(/Api\/api\/app\/?$/i, 'Gis/');
  if (portalRefGuess.includes('/Gis')) {
    return portalRefGuess;
  }
  return `${appApi.origin}/`;
}

async function getMg2TokenWithCurl(appApiUrl: string, projId: number): Promise<string | null> {
  try {
    const appApi = new URL(appApiUrl);
    const portalRef = buildMg2PortalRefFromAppApi(appApiUrl);
    const payload = JSON.stringify({
      userName: 'Anonymous',
      userPassword: '',
      projId,
    });
    const args = [
      '-sS',
      '-X',
      'POST',
      `${appApiUrl}UserLogin`,
      '-H',
      'Content-Type: application/json',
      '-H',
      'Accept: application/json, text/plain, */*',
      '-H',
      'Accept-Language: he-IL,he;q=0.9,en;q=0.8',
      '-H',
      `Origin: ${appApi.origin}`,
      '-H',
      `Referer: ${portalRef}`,
      '-H',
      'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '--data',
      payload,
    ];
    const { stdout } = await execFileAsync('curl', args, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    const token = decodeJsonWrappedString(String(stdout || ''));
    return isLikelyJwtToken(token) ? token : null;
  } catch {
    return null;
  }
}

function collectMg2SearchFields(search: Mg2SearchDefinition): Mg2SearchField[] {
  return (search.dynamicForm?.rows ?? []).flatMap((row) => row.fields ?? []);
}

function pickMg2GushHelkaSearch(searches: Mg2SearchDefinition[]): Mg2SearchDefinition | null {
  const byId = searches.find((item) => item.searchId === 2080);
  if (byId) {
    return byId;
  }
  return searches.find((item) => {
    const title = String(item.title || '');
    const names = collectMg2SearchFields(item)
      .map((field) => String(field.name || ''))
      .join(' ');
    return /גוש\s*חלקה/i.test(title) || /Block_No/i.test(names) || /Parcel_no/i.test(names);
  }) ?? null;
}

async function resolveMg2ParcelViaMapSearch(params: {
  mapApiUrl: string;
  appApiUrl: string;
  projId: number;
  token: string;
  gush: string;
  helka: string;
}): Promise<{ qId: string; qNum: string; label?: string } | null> {
  const appApi = new URL(params.appApiUrl);
  const portalRef = buildMg2PortalRefFromAppApi(params.appApiUrl);
  const commonHeaders: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    Origin: appApi.origin,
    Referer: portalRef,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Authorization: `Bearer ${params.token}`,
  };

  const mapInitResponse = await fetch(`${params.mapApiUrl}FirstLoadingMap`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mapSession: '',
      mapName: '',
      mapStateId: 1,
      fLayers: '',
      projId: params.projId,
    }),
  });
  if (!mapInitResponse.ok) {
    return null;
  }
  const mapSession = (await mapInitResponse.json()) as Mg2MapSessionResponse;
  const mapSessionId = String(mapSession.sessionId || '').trim();
  const mapName = String(mapSession.mapName || '').trim();
  if (!mapSessionId || !mapName) {
    return null;
  }

  const searchesResponse = await fetch(`${params.appApiUrl}GetAllSearches?projId=${params.projId}`, {
    cache: 'no-store',
    headers: commonHeaders,
  });
  if (!searchesResponse.ok) {
    return null;
  }
  const searches = (await searchesResponse.json()) as Mg2SearchDefinition[];
  const baseSearch = pickMg2GushHelkaSearch(Array.isArray(searches) ? searches : []);
  if (!baseSearch) {
    return null;
  }

  const searchPayload = JSON.parse(JSON.stringify(baseSearch)) as Mg2SearchDefinition;
  const searchFields = collectMg2SearchFields(searchPayload);
  for (const field of searchFields) {
    const fieldName = String(field.name || '');
    if (/Block_No/i.test(fieldName)) {
      field.value = params.gush;
    } else if (/Parcel_no/i.test(fieldName)) {
      field.value = params.helka;
    }
  }
  searchPayload.mapSession = mapSessionId;
  searchPayload.mapName = mapName;
  searchPayload.zoomWidth = 50;
  searchPayload.projId = params.projId;

  const mapSearchResponse = await fetch(`${params.mapApiUrl}GetObjectsBySearch`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(searchPayload),
  });
  if (!mapSearchResponse.ok) {
    return null;
  }

  const mapSearchData = (await mapSearchResponse.json()) as Mg2MapSearchResponse;
  const layer = (mapSearchData.layers ?? [])[0];
  const row = (layer?.rowItems ?? [])[0];
  const keyField = (row?.fieldItems ?? []).find((item) => Boolean(item.isKeyField));
  const layerName = String(layer?.name || '').trim();
  const objectId = Number(layer?.objectId);
  const keyFieldName = String(keyField?.fieldName || '').trim();
  const keyFieldValue = String(keyField?.fieldValue || '').trim();
  if (!layerName || !Number.isFinite(objectId) || !keyFieldName || !keyFieldValue) {
    return null;
  }

  const mapObjectCard = {
    projId: params.projId,
    mapName,
    mapSession: mapSessionId,
    layerName,
    filter: `${keyFieldName}=${keyFieldValue}`,
    objectId,
  };
  const landUseResponse = await fetch(`${params.appApiUrl}GetLandUseObj`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(mapObjectCard),
  });
  if (!landUseResponse.ok) {
    return null;
  }

  const landUseData = (await landUseResponse.json()) as Mg2LandUseObj;
  const qId = normalizeDigits(String(landUseData.parcelId ?? landUseData.qId ?? ''));
  if (!qId) {
    return null;
  }
  const qNum = normalizeDigits(String(landUseData.parcel || params.helka)) || params.helka;
  const label = `חלקה ${qNum} (גוש ${params.gush})`;
  return { qId, qNum, label };
}

function parseTableCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;

  while ((match = cellRegex.exec(rowHtml)) !== null) {
    cells.push(match[1]);
  }

  return cells;
}

function parseComplotUnifiedPlans(
  html: string,
  config: ComplotMunicipalityConfig,
): MunicipalParcelPlan[] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const byKey = new Map<string, MunicipalParcelPlan>();

  for (const rowHtml of rows) {
    const cells = parseTableCells(rowHtml);
    if (cells.length < 2) {
      continue;
    }

    const tabaAnchors = Array.from(
      rowHtml.matchAll(/<a[^>]+href="javascript:getTaba\((\d+)\)"[^>]*>([\s\S]*?)<\/a>/gi),
    );
    if (tabaAnchors.length === 0) {
      continue;
    }

    const planId = (tabaAnchors[0]?.[1] || '').trim();
    const planNumber = htmlDecode(cells[1] || '');
    const planName = htmlDecode(cells[2] || '') || planNumber;
    if (!planNumber || !planId) {
      continue;
    }

    const planStatus = htmlDecode(cells[3] || '') || undefined;

    const key = normalizePlanNumber(planNumber) || `${planId}|${planName}`;
    const planPageUrl = buildComplotProgramUrl('GetTabaFile', {
      siteid: config.siteId,
      n: planId,
      arguments: 'siteid,n',
    });

    const plan: MunicipalParcelPlan = {
      planNumber,
      planName,
      planStatus,
      municipality: config.municipality,
      providerPlanId: planId,
      planPageUrl,
      source: `municipal-gis:${config.providerId}`,
    };

    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, plan);
      continue;
    }

    byKey.set(key, {
      ...current,
      ...plan,
      planName: plan.planName || current.planName,
      planStatus: plan.planStatus || current.planStatus,
      planPageUrl: plan.planPageUrl || current.planPageUrl,
    });
  }

  return Array.from(byKey.values());
}

async function fetchComplotPlans(
  config: ComplotMunicipalityConfig,
  input: MunicipalLookupInput,
): Promise<MunicipalParcelPlansResponse> {
  const gush = normalizeDigits(input.gush);
  const helka = normalizeDigits(input.helka);
  if (!gush || !helka) {
    throw new Error('gush ו-helka חייבים להיות מספרים תקינים');
  }

  const sourceUrl = buildComplotProgramUrl('GetUnifiedFile', {
    siteid: config.siteId,
    g: gush,
    h: helka,
    arguments: 'siteid,g,h',
  });

  const response = await fetch(sourceUrl, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Municipal GIS (${config.providerName}) returned ${response.status}`);
  }

  const html = await response.text();
  const plans = parseComplotUnifiedPlans(html, config);
  const parcelUrl = buildComplotUnifiedParcelUrl(config, gush, helka);

  return {
    supported: true,
    providerId: config.providerId,
    providerName: config.providerName,
    municipality: config.municipality,
    gush,
    helka,
    parcelUrl,
    sourceUrl,
    plans,
    planningInfo: buildPlanningInfo({
      municipality: config.municipality,
      gush,
      helka,
      source: `municipal-gis:${config.providerId}`,
      provider: config.providerName,
      parcelQueryUrl: parcelUrl,
      notes: [
        'המידע התיכנוני המלא זמין בדף החלקה העירוני.',
      ],
      fields: [
        { label: 'ספק', value: config.providerName },
        { label: 'פלטפורמה', value: platformLabel(config.platform) },
      ],
    }),
  };
}

function buildGisnetV5ParcelUrl(config: GisnetV5MunicipalityConfig, gush: string, helka: string): string {
  const url = new URL(config.portalUrl);
  url.searchParams.set('gush', gush);
  url.searchParams.set('helka', helka);
  return url.toString();
}

function buildGisnetDataEndpoint(config: GisnetV5MunicipalityConfig, endpoint: string): string {
  const url = new URL(config.portalUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${basePath}/Data/${endpoint}`;
}

function isPlanningLayerName(value: string): boolean {
  return /(תכנ|תיכנ|תב"ע|תב״ע|ייעוד|יעוד|קוים כחולים|קווים כחולים|מידע הנדסי|מגרש|חלקות|גושים)/i.test(value);
}

function collectGisnetPlanningLayerNames(layers: GisnetLayerMetadata[]): string[] {
  const names: string[] = [];
  for (const layer of layers) {
    const layerName = String(layer.layerName || '').trim();
    const groupName = String(layer.layerGroupName || '').trim();
    const text = `${layerName} ${groupName}`.trim();
    if (!text || !isPlanningLayerName(text)) {
      continue;
    }
    if (layer.type && layer.type.toLowerCase().includes('group')) {
      continue;
    }
    names.push(layerName || groupName);
  }
  return uniqueStrings(names);
}

function getCookieHeaderFromSetCookie(response: Response): string | undefined {
  const cookieAccessor = response.headers as unknown as { getSetCookie?: () => string[] };
  const rawCookies = cookieAccessor.getSetCookie ? cookieAccessor.getSetCookie() : [];
  const cookies = rawCookies
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean);
  return cookies.length > 0 ? cookies.join('; ') : undefined;
}

async function fetchGisnetV5PlanningInfo(
  config: GisnetV5MunicipalityConfig,
  input: MunicipalLookupInput,
): Promise<MunicipalParcelPlansResponse> {
  const gush = normalizeDigits(input.gush);
  const helka = normalizeDigits(input.helka);
  if (!gush || !helka) {
    throw new Error('gush ו-helka חייבים להיות מספרים תקינים');
  }

  const parcelUrl = buildGisnetV5ParcelUrl(config, gush, helka);
  const sourceUrl = buildGisnetDataEndpoint(config, 'GetMap');
  const layersSourceUrl = buildGisnetDataEndpoint(config, 'GetJson');

  const baseFields: MunicipalPlanningInfoField[] = [
    { label: 'ספק', value: config.providerName },
    { label: 'פלטפורמה', value: platformLabel(config.platform) },
  ];

  try {
    // GISNET endpoints often require an initial request to establish session cookies.
    const landingResponse = await fetch(config.portalUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const cookieHeader = getCookieHeaderFromSetCookie(landingResponse);
    const commonHeaders: HeadersInit = {
      Accept: 'application/json, text/plain, */*',
      Referer: config.portalUrl,
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const [mapResponse, layersResponse] = await Promise.all([
      fetch(sourceUrl, {
        cache: 'no-store',
        headers: commonHeaders,
      }),
      fetch(layersSourceUrl, {
        cache: 'no-store',
        headers: commonHeaders,
      }),
    ]);

    if (!mapResponse.ok) {
      throw new Error(`Municipal GIS (${config.providerName}) returned ${mapResponse.status} for GetMap`);
    }
    if (!layersResponse.ok) {
      throw new Error(`Municipal GIS (${config.providerName}) returned ${layersResponse.status} for GetJson`);
    }

    const mapPayload = (await mapResponse.json()) as GisnetApiEnvelope<GisnetMapMetadata>;
    const layersPayload = (await layersResponse.json()) as GisnetApiEnvelope<GisnetLayerMetadata[]>;
    const printServiceUrl = String(mapPayload?.value?.printUrl || '').trim() || undefined;
    const planningLayers = collectGisnetPlanningLayerNames(layersPayload?.value ?? []);
    const fields = [...baseFields];
    if (planningLayers.length > 0) {
      fields.push({
        label: 'שכבות תכנון זמינות',
        value: planningLayers.slice(0, 10).join(', '),
      });
    }

    return {
      supported: true,
      providerId: config.providerId,
      providerName: config.providerName,
      municipality: config.municipality,
      gush,
      helka,
      parcelUrl,
      sourceUrl,
      plans: [],
      planningInfo: buildPlanningInfo({
        municipality: config.municipality,
        gush,
        helka,
        source: `municipal-gis:${config.providerId}`,
        provider: config.providerName,
        parcelQueryUrl: parcelUrl,
        printServiceUrl,
        notes: [
          'החלקה נפתחת ב-GIS העירוני עם גוש/חלקה.',
          'להפקת PDF ניתן להשתמש בכפתור ההדפסה במפה העירונית או באפשרות ההדפסה ב-ReguScape.',
        ],
        fields,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return {
      supported: true,
      providerId: config.providerId,
      providerName: config.providerName,
      municipality: config.municipality,
      gush,
      helka,
      parcelUrl,
      sourceUrl,
      plans: [],
      planningInfo: buildPlanningInfo({
        municipality: config.municipality,
        gush,
        helka,
        source: `municipal-gis:${config.providerId}`,
        provider: config.providerName,
        parcelQueryUrl: parcelUrl,
        notes: [
          'לא ניתן היה למשוך כרגע שכבות "מידע תיכנוני" באופן אוטומטי.',
          'ניתן לפתוח את החלקה ב-GIS העירוני ולהפיק הדפסה.',
        ],
        fields: baseFields,
      }),
      error: message,
    };
  }
}

async function fetchMg2PlanningInfo(
  config: Mg2MunicipalityConfig,
  input: MunicipalLookupInput,
): Promise<MunicipalParcelPlansResponse> {
  const gush = normalizeDigits(input.gush);
  const helka = normalizeDigits(input.helka);
  if (!gush || !helka) {
    throw new Error('gush ו-helka חייבים להיות מספרים תקינים');
  }

  const baseFields: MunicipalPlanningInfoField[] = [
    { label: 'ספק', value: config.providerName },
    { label: 'פלטפורמה', value: platformLabel(config.platform) },
  ];

  try {
    const portalUrl = new URL(config.portalUrl);
    const mg2CommonHeaders: HeadersInit = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      Origin: portalUrl.origin,
      Referer: `${portalUrl.origin}${portalUrl.pathname.replace(/\/+$/, '')}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    const appConfigResponse = await fetch(getMg2AppConfigUrl(config), {
      cache: 'no-store',
      headers: {
        ...mg2CommonHeaders,
      },
    });
    if (!appConfigResponse.ok) {
      throw new Error(`Municipal GIS (${config.providerName}) returned ${appConfigResponse.status} for app config`);
    }

    const appConfig = (await appConfigResponse.json()) as Mg2AppConfig;
    const projId = Number(appConfig?.projId);
    const appApiUrl = String(appConfig?.appApiUrl || '').trim();
    const mapApiUrl = String(appConfig?.mapApiUrl || '').trim();
    if (!Number.isFinite(projId) || !appApiUrl || !mapApiUrl) {
      throw new Error('חסרים appApiUrl/mapApiUrl/projId בקונפיגורציית MG2');
    }

    const authResponse = await fetch(`${appApiUrl}UserLogin`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...mg2CommonHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userName: 'Anonymous',
        userPassword: '',
        projId,
      }),
    });
    if (!authResponse.ok) {
      throw new Error(`Municipal GIS (${config.providerName}) returned ${authResponse.status} for UserLogin`);
    }

    const rawAuthResponse = await authResponse.text();
    let token = decodeJsonWrappedString(rawAuthResponse);
    let curlFallbackUsed = false;
    let curlFallbackSucceeded = false;
    if (!token || !isLikelyJwtToken(token)) {
      curlFallbackUsed = true;
      const curlToken = await getMg2TokenWithCurl(appApiUrl, projId);
      if (curlToken) {
        token = curlToken;
        curlFallbackSucceeded = true;
      }
    }
    if (!token || !isLikelyJwtToken(token)) {
      const snippet = rawAuthResponse
        .replace(/\s+/g, ' ')
        .slice(0, 140);
      throw new Error(`לא התקבל טוקן גישה מ-MG2 (response: ${snippet}; curl_used=${curlFallbackUsed}; curl_ok=${curlFallbackSucceeded})`);
    }

    const treeUrl = new URL(`${appApiUrl}GetParcelsTree`);
    treeUrl.searchParams.set('block', gush);
    treeUrl.searchParams.set('parcel', helka);
    treeUrl.searchParams.set('projId', String(projId));
    const treeResponse = await fetch(treeUrl.toString(), {
      cache: 'no-store',
      headers: {
        ...mg2CommonHeaders,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!treeResponse.ok) {
      throw new Error(`Municipal GIS (${config.providerName}) returned ${treeResponse.status} for GetParcelsTree`);
    }

    const treeData = (await treeResponse.json()) as Mg2ParcelTreeNode[] | null;
    const selectedNode = selectMg2ParcelNode(
      flattenMg2ParcelTree(Array.isArray(treeData) ? treeData : []),
      gush,
      helka,
    );
    let qId = selectedNode?.id || '';
    let qNum = selectedNode?.parsedHelka || helka;
    let parcelLabel = selectedNode?.name || '';
    let lookupSource = 'GetParcelsTree';

    if (!qId) {
      const mapSearchFallback = await resolveMg2ParcelViaMapSearch({
        mapApiUrl,
        appApiUrl,
        projId,
        token,
        gush,
        helka,
      });
      if (!mapSearchFallback) {
        throw new Error('לא אותר qId לחלקה במערכת MG2');
      }
      qId = mapSearchFallback.qId;
      qNum = mapSearchFallback.qNum;
      parcelLabel = mapSearchFallback.label || parcelLabel;
      lookupSource = 'MapSearch + GetLandUseObj';
    }

    const reportApiUrl = new URL(`${appApiUrl}GetDoch33Report`);
    reportApiUrl.searchParams.set('projId', String(projId));
    reportApiUrl.searchParams.set('qId', qId);
    reportApiUrl.searchParams.set('qNum', qNum);
    reportApiUrl.searchParams.set('searchBy', 'parcel');
    reportApiUrl.searchParams.set('ApplicantName', '');
    reportApiUrl.searchParams.set('RequestNumber', '');
    reportApiUrl.searchParams.set('ApplicantAddress', '');
    reportApiUrl.searchParams.set('SumPaid', '');
    reportApiUrl.searchParams.set('OrderNumber', '');
    reportApiUrl.searchParams.set('PaymentDate', '');
    reportApiUrl.searchParams.set('Warning', '0');

    const reportResponse = await fetch(reportApiUrl.toString(), {
      cache: 'no-store',
      headers: {
        ...mg2CommonHeaders,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!reportResponse.ok) {
      throw new Error(`Municipal GIS (${config.providerName}) returned ${reportResponse.status} for GetDoch33Report`);
    }

    const reportFileName = decodeJsonWrappedString(await reportResponse.text());
    if (!reportFileName) {
      throw new Error('לא התקבל שם קובץ דוח תכנוני מ-MG2');
    }

    const mapRoot = mapApiUrl.replace(/\/api\/map\/?$/i, '');
    const reportUrl = `${mapRoot}/TempFiles/${reportFileName}`;

    let reportDate: string | undefined;
    let historicalNotice = false;
    try {
      const reportHtmlResponse = await fetch(reportUrl, {
        cache: 'no-store',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (reportHtmlResponse.ok) {
        const reportText = htmlToPlainText(await reportHtmlResponse.text());
        reportDate = extractMg2ReportDate(reportText);
        historicalNotice = reportText.includes('דף מידע זה אינו עדכני') || reportText.includes('מידע היסטורי');
      }
    } catch {
      // Continue without parsed metadata.
    }

    const fields = [...baseFields];
    fields.push({ label: 'מזהה דוח (qId)', value: qId });
    fields.push({ label: 'מספר בדוח (qNum)', value: qNum });
    fields.push({ label: 'מקור זיהוי חלקה', value: lookupSource });
    if (parcelLabel) {
      fields.push({ label: 'זיהוי חלקה במערכת', value: parcelLabel });
    }
    if (reportDate) {
      fields.push({ label: 'תאריך דוח', value: reportDate });
    }

    const notes = [
      'הופק דוח "מידע תיכנוני" ממערכת ה-GIS העירונית.',
      'הקישור פותח את דוח המקור המלא (HTML) וניתן להדפיס/לשמור ממנו PDF.',
    ];
    if (historicalNotice) {
      notes.push('בדוח זוהתה הערה שמדובר במידע היסטורי בלבד.');
    }

    return {
      supported: true,
      providerId: config.providerId,
      providerName: config.providerName,
      municipality: config.municipality,
      gush,
      helka,
      parcelUrl: reportUrl,
      sourceUrl: reportApiUrl.toString(),
      plans: [],
      planningInfo: buildPlanningInfo({
        municipality: config.municipality,
        gush,
        helka,
        source: `municipal-gis:${config.providerId}`,
        provider: config.providerName,
        parcelQueryUrl: reportUrl,
        printServiceUrl: reportUrl,
        notes,
        fields,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return {
      supported: true,
      providerId: config.providerId,
      providerName: config.providerName,
      municipality: config.municipality,
      gush,
      helka,
      parcelUrl: config.portalUrl,
      sourceUrl: config.portalUrl,
      plans: [],
      planningInfo: buildPlanningInfo({
        municipality: config.municipality,
        gush,
        helka,
        source: `municipal-gis:${config.providerId}`,
        provider: config.providerName,
        parcelQueryUrl: config.portalUrl,
        notes: [
          'זוהתה פלטפורמת GISNET (MG2), אך לא ניתן היה כרגע להפיק אוטומטית את דוח "מידע תיכנוני".',
          'ניתן לפתוח את המערכת העירונית ולהפיק דוח באופן ידני.',
        ],
        fields: baseFields,
      }),
      error: message,
    };
  }
}

function formatShortDate(value: Date | null): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

function uniquePlansByNumber(plans: MunicipalParcelPlan[]): MunicipalParcelPlan[] {
  const byKey = new Map<string, MunicipalParcelPlan>();
  for (const plan of plans) {
    const key = normalizePlanNumber(plan.planNumber || '') || `${plan.planName}|${plan.planStatus || ''}`;
    if (!key) {
      continue;
    }
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, plan);
      continue;
    }
    byKey.set(key, {
      ...current,
      ...plan,
      planName: plan.planName || current.planName,
      planStatus: plan.planStatus || current.planStatus,
      planPageUrl: plan.planPageUrl || current.planPageUrl,
    });
  }
  return Array.from(byKey.values());
}

async function fetchTelAvivArcgisPlanningInfo(
  config: ArcgisMunicipalityConfig,
  input: MunicipalLookupInput,
): Promise<MunicipalParcelPlansResponse> {
  const gush = normalizeDigits(input.gush);
  const helka = normalizeDigits(input.helka);
  if (!gush || !helka) {
    throw new Error('gush ו-helka חייבים להיות מספרים תקינים');
  }

  try {
    const rights = await tlvGetFullBuildingRights({
      gush: Number(gush),
      helka: Number(helka),
    });

    const municipalPlansRaw: MunicipalParcelPlan[] = rights.cityPlans.items.map((plan) => ({
      planNumber: plan.planNumber || 'ללא קוד',
      planName: plan.planName || plan.planNumber || 'ללא תיאור',
      planStatus: plan.statusGeneral || plan.status || undefined,
      municipality: config.municipality,
      source: `municipal-gis:${config.providerId}`,
      planPageUrl: undefined,
    }));
    const municipalPlans = uniquePlansByNumber(municipalPlansRaw);
    const totalPlans = municipalPlans.length;
    const localInForceCount = rights.cityPlans.items.filter((plan) => {
      const num = normalizePlanNumber(plan.planNumber || '');
      const isNational = /^תמ["״']?א/.test(num) || /^תמ["״']?מ/.test(num);
      const isPolicy = /^9\d{2,4}$/.test(num)
        || /מדיניות|נוהל|הנחיות|עקרונות|תקנון|מסמך/.test(plan.planName || '');
      return plan.statusGeneral === 'בתוקף' && !isNational && !isPolicy;
    }).length;
    const nationalInForceCount = rights.cityPlans.items.filter((plan) => {
      const num = normalizePlanNumber(plan.planNumber || '');
      return plan.statusGeneral === 'בתוקף' && (/^תמ["״']?א/.test(num) || /^תמ["״']?מ/.test(num));
    }).length;
    const planningCount = rights.cityPlans.items.filter((plan) => plan.statusGeneral === 'בתכנון').length;
    const policyCount = rights.cityPlans.items.filter((plan) => {
      const num = normalizePlanNumber(plan.planNumber || '');
      return /^9\d{2,4}$/.test(num)
        || /מדיניות|נוהל|הנחיות|עקרונות|תקנון|מסמך/.test(plan.planName || '');
    }).length;

    const firstLandUseWithRights = rights.landUse.items.find(
      (item) => item.allowedFloors != null
        || item.buildingPercent != null
        || item.allowedUnits != null
        || item.rightsArea != null,
    );
    const mainLandUse = rights.landUse.items.find((item) => item.mainLandUse)?.mainLandUse || '';
    const reportUrl = `/api/municipal-rights-report?city=tel-aviv&gush=${encodeURIComponent(gush)}&helka=${encodeURIComponent(helka)}`;
    const fields: MunicipalPlanningInfoField[] = [
      { label: 'ספק', value: config.providerName },
      { label: 'פלטפורמה', value: platformLabel(config.platform) },
      { label: 'תוכניות חופפות (סה"כ)', value: String(totalPlans) },
      { label: 'תוכניות מקומיות בתוקף', value: String(localInForceCount) },
      { label: 'תוכניות ארציות/מחוזיות בתוקף', value: String(nationalInForceCount) },
      { label: 'תוכניות בתכנון', value: String(planningCount) },
      { label: 'מסמכי מדיניות', value: String(policyCount) },
      { label: 'בקשות/היתרים חופפים', value: String(rights.permits.count) },
      { label: 'רשומות ייעוד קרקע', value: String(rights.landUse.count) },
    ];

    if (mainLandUse) {
      fields.push({ label: 'ייעוד עיקרי', value: mainLandUse });
    }
    if (firstLandUseWithRights?.buildingPercent != null) {
      fields.push({ label: 'אחוזי בניה כלליים', value: String(firstLandUseWithRights.buildingPercent) });
    }
    if (firstLandUseWithRights?.allowedFloors != null) {
      fields.push({ label: 'קומות מותרות', value: String(firstLandUseWithRights.allowedFloors) });
    }
    if (firstLandUseWithRights?.allowedUnits != null) {
      fields.push({ label: 'יח"ד מותרות', value: String(firstLandUseWithRights.allowedUnits) });
    }
    if (firstLandUseWithRights?.rightsArea != null) {
      fields.push({ label: 'שטח לחישוב זכויות', value: String(firstLandUseWithRights.rightsArea) });
    }

    const newestPlanDate = rights.cityPlans.items
      .map((item) => item.validDate)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const newestPlanDateText = formatShortDate(newestPlanDate);
    if (newestPlanDateText) {
      fields.push({ label: 'תאריך תוקף אחרון (תב"ע)', value: newestPlanDateText });
    }

    return {
      supported: true,
      providerId: config.providerId,
      providerName: config.providerName,
      municipality: config.municipality,
      gush,
      helka,
      parcelUrl: config.portalUrl,
      sourceUrl: config.restServiceUrl || config.portalUrl,
      plans: municipalPlans,
      planningInfo: buildPlanningInfo({
        title: 'מידע תיכנוני וזכויות בנייה',
        municipality: config.municipality,
        gush,
        helka,
        source: `municipal-gis:${config.providerId}`,
        provider: config.providerName,
        parcelQueryUrl: config.portalUrl,
        printServiceUrl: reportUrl,
        notes: [
          'המידע מבוסס על שכבות ArcGIS עירוניות (תב"עות, ייעודי קרקע והיתרים).',
          'כפתור ההדפסה פותח דוח מובנה להדפסה/שמירה כ-PDF.',
        ],
        fields,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return {
      supported: true,
      providerId: config.providerId,
      providerName: config.providerName,
      municipality: config.municipality,
      gush,
      helka,
      parcelUrl: config.portalUrl,
      sourceUrl: config.restServiceUrl || config.portalUrl,
      plans: [],
      planningInfo: buildPlanningInfo({
        title: 'מידע תיכנוני וזכויות בנייה',
        municipality: config.municipality,
        gush,
        helka,
        source: `municipal-gis:${config.providerId}`,
        provider: config.providerName,
        parcelQueryUrl: config.portalUrl,
        notes: [
          'זוהתה פלטפורמת ArcGIS עירונית אך החילוץ נכשל עבור החלקה.',
          'ניתן לפתוח את GIS תל אביב ידנית ולבדוק את החלקה.',
        ],
        fields: [
          { label: 'ספק', value: config.providerName },
          { label: 'פלטפורמה', value: platformLabel(config.platform) },
        ],
      }),
      error: message,
    };
  }
}

function buildRecognizedUnsupportedResponse(
  config: GisnetV5MunicipalityConfig | Mg2MunicipalityConfig | ArcgisMunicipalityConfig,
  input: MunicipalLookupInput,
): MunicipalParcelPlansResponse {
  const gush = normalizeDigits(input.gush);
  const helka = normalizeDigits(input.helka);
  const restServiceUrl = 'restServiceUrl' in config ? config.restServiceUrl : undefined;
  return {
    supported: false,
    providerId: config.providerId,
    providerName: config.providerName,
    municipality: config.municipality,
    gush,
    helka,
    sourceUrl: restServiceUrl || config.portalUrl,
    plans: [],
    planningInfo: buildPlanningInfo({
      municipality: config.municipality,
      gush,
      helka,
      source: `municipal-gis:${config.providerId}`,
      provider: config.providerName,
      parcelQueryUrl: config.portalUrl,
      notes: [
        `זוהתה פלטפורמת ${platformLabel(config.platform)} אך המתאם המלא לחילוץ "מידע תיכנוני" טרם מומש.`,
      ],
      fields: [
        { label: 'ספק', value: config.providerName },
        { label: 'פלטפורמה', value: platformLabel(config.platform) },
      ],
    }),
    error: `זוהתה פלטפורמת ${platformLabel(config.platform)} עבור ${config.municipality}, אך המתאם לחיפוש לפי גוש/חלקה טרם מומש`,
  };
}

function hintsMatchCityAliases(hints: string[], aliases: string[]): boolean {
  const normalizedAliases = aliases
    .map((alias) => normalizeLookupText(alias))
    .filter(Boolean);

  for (const hint of hints) {
    for (const alias of normalizedAliases) {
      if (hint.includes(alias)) {
        return true;
      }
    }
  }
  return false;
}

function createComplotProvider(config: ComplotMunicipalityConfig): MunicipalProvider {
  return {
    id: config.providerId,
    name: config.providerName,
    municipality: config.municipality,
    supports(input: MunicipalLookupInput): boolean {
      const hints = collectCityHints(input);
      return hintsMatchCityAliases(hints, config.cityAliases);
    },
    fetchPlans(input: MunicipalLookupInput): Promise<MunicipalParcelPlansResponse> {
      return fetchComplotPlans(config, input);
    },
  };
}

function createUnsupportedRecognizedProvider(
  config: Mg2MunicipalityConfig | ArcgisMunicipalityConfig,
): MunicipalProvider {
  return {
    id: config.providerId,
    name: config.providerName,
    municipality: config.municipality,
    supports(input: MunicipalLookupInput): boolean {
      const hints = collectCityHints(input);
      return hintsMatchCityAliases(hints, config.cityAliases);
    },
    fetchPlans(input: MunicipalLookupInput): Promise<MunicipalParcelPlansResponse> {
      return Promise.resolve(buildRecognizedUnsupportedResponse(config, input));
    },
  };
}

function createArcgisProvider(
  config: ArcgisMunicipalityConfig,
): MunicipalProvider {
  return {
    id: config.providerId,
    name: config.providerName,
    municipality: config.municipality,
    supports(input: MunicipalLookupInput): boolean {
      const hints = collectCityHints(input);
      return hintsMatchCityAliases(hints, config.cityAliases);
    },
    fetchPlans(input: MunicipalLookupInput): Promise<MunicipalParcelPlansResponse> {
      if (config.providerId === 'tel-aviv-arcgis') {
        return fetchTelAvivArcgisPlanningInfo(config, input);
      }
      return Promise.resolve(buildRecognizedUnsupportedResponse(config, input));
    },
  };
}

function createMg2Provider(
  config: Mg2MunicipalityConfig,
): MunicipalProvider {
  return {
    id: config.providerId,
    name: config.providerName,
    municipality: config.municipality,
    supports(input: MunicipalLookupInput): boolean {
      const hints = collectCityHints(input);
      return hintsMatchCityAliases(hints, config.cityAliases);
    },
    fetchPlans(input: MunicipalLookupInput): Promise<MunicipalParcelPlansResponse> {
      return fetchMg2PlanningInfo(config, input);
    },
  };
}

function createGisnetV5Provider(
  config: GisnetV5MunicipalityConfig,
): MunicipalProvider {
  return {
    id: config.providerId,
    name: config.providerName,
    municipality: config.municipality,
    supports(input: MunicipalLookupInput): boolean {
      const hints = collectCityHints(input);
      return hintsMatchCityAliases(hints, config.cityAliases);
    },
    fetchPlans(input: MunicipalLookupInput): Promise<MunicipalParcelPlansResponse> {
      return fetchGisnetV5PlanningInfo(config, input);
    },
  };
}

function createProviderFromConfig(config: MunicipalityPlatformConfig): MunicipalProvider {
  switch (config.platform) {
    case 'complot-classic':
      return createComplotProvider(config);
    case 'complot-gisnet-v5':
      return createGisnetV5Provider(config);
    case 'gisnet-mg2':
      return createMg2Provider(config);
    case 'arcgis-esri':
      return createArcgisProvider(config);
    default:
      return createUnsupportedRecognizedProvider(config as Mg2MunicipalityConfig | ArcgisMunicipalityConfig);
  }
}

// Municipal GIS provider matrix.
// Add cities here and choose the platform adapter. Only `complot-classic` is currently implemented.
const MUNICIPALITY_PROVIDER_MATRIX: MunicipalityPlatformConfig[] = [
  {
    providerId: 'modiin-complot',
    providerName: 'מודיעין - הנדסה (Complot)',
    municipality: 'מודיעין-מכבים-רעות',
    platform: 'complot-classic',
    siteId: '82',
    portalHost: 'modiin.complot.co.il',
    cityAliases: [
      'מודיעין',
      'מודיעין מכבים רעות',
      'מודיעין-מכבים-רעות',
      'מודיעין מכבים-רעות',
    ],
  },
  {
    providerId: 'haifa-complot',
    providerName: 'חיפה - הנדסה (Complot)',
    municipality: 'חיפה',
    platform: 'complot-classic',
    siteId: '16',
    portalHost: 'haifa.complot.co.il',
    cityAliases: [
      'חיפה',
      'haifa',
    ],
  },
  {
    providerId: 'netanya-gisnet-v5',
    providerName: 'נתניה - GISNET V5 (Complot)',
    municipality: 'נתניה',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/netanya',
    cityAliases: [
      'נתניה',
      'netanya',
    ],
  },
  {
    providerId: 'ashdod-gisnet-v5',
    providerName: 'אשדוד - GISNET V5 (Complot)',
    municipality: 'אשדוד',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/ashdod',
    cityAliases: [
      'אשדוד',
      'ashdod',
    ],
  },
  {
    providerId: 'eilat-gisnet-v5',
    providerName: 'אילת - GISNET V5 (Complot)',
    municipality: 'אילת',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/eilat',
    cityAliases: [
      'אילת',
      'eilat',
    ],
  },
  {
    providerId: 'omer-gisnet-v5',
    providerName: 'עומר - GISNET V5 (Complot)',
    municipality: 'עומר',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/omer',
    cityAliases: [
      'עומר',
      'omer',
    ],
  },
  {
    providerId: 'bait-dagan-gisnet-v5',
    providerName: 'בית דגן - GISNET V5 (Complot)',
    municipality: 'בית דגן',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/Bait_Dagan',
    cityAliases: [
      'בית דגן',
      'bait dagan',
      'beit dagan',
    ],
  },
  {
    providerId: 'kiryat-ata-gisnet-v5',
    providerName: 'קריית אתא - GISNET V5 (Complot)',
    municipality: 'קריית אתא',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/K_Ata',
    cityAliases: [
      'קריית אתא',
      'קרית אתא',
      'kiryat ata',
      'kiryat-ata',
    ],
  },
  {
    providerId: 'kiryat-malakhi-gisnet-v5',
    providerName: 'קריית מלאכי - GISNET V5 (Complot)',
    municipality: 'קריית מלאכי',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/K_Malachi',
    cityAliases: [
      'קריית מלאכי',
      'קרית מלאכי',
      'kiryat malakhi',
      'kiryat malachi',
      'kiryat-malachi',
    ],
  },
  {
    providerId: 'yokneam-gisnet-v5',
    providerName: 'יקנעם - GISNET V5 (Complot)',
    municipality: 'יקנעם',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/Yokneam',
    cityAliases: [
      'יקנעם',
      'יוקנעם',
      'yokneam',
    ],
  },
  {
    providerId: 'tzor-hadassa-gisnet-v5',
    providerName: 'צור הדסה - GISNET V5 (Complot)',
    municipality: 'צור הדסה',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/V5/TzorHadasa',
    cityAliases: [
      'צור הדסה',
      'tzor hadasa',
      'tzor hadassa',
    ],
  },
  {
    providerId: 'lev-hagalil-gisnet-v5',
    providerName: 'לב הגליל - GISNET V5 (Complot)',
    municipality: 'לב הגליל',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/lev_hagalil',
    cityAliases: [
      'לב הגליל',
      'lev hagalil',
      'lev_hagalil',
    ],
  },
  {
    providerId: 'bbk-gisnet-v5',
    providerName: 'בקעת בית הכרם - GISNET V5 (Complot)',
    municipality: 'בקעת בית הכרם',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/Bbk',
    cityAliases: [
      'בקעת בית הכרם',
      'bbk',
    ],
  },
  {
    providerId: 'wadi-ara-gisnet-v5',
    providerName: 'ועדה עירון - GISNET V5 (Complot)',
    municipality: 'ועדה עירון',
    platform: 'complot-gisnet-v5',
    portalUrl: 'https://v5.gis-net.co.il/v5/wadi_ara',
    cityAliases: [
      'ועדה עירון',
      'עירון',
      'ואדי ערה',
      'wadi ara',
      'wadi_ara',
    ],
  },
  {
    providerId: 'ness-ziona-mg2',
    providerName: 'נס ציונה - GISNET (MG2)',
    municipality: 'נס ציונה',
    platform: 'gisnet-mg2',
    portalUrl: 'https://mg2.gis-net.co.il/NessZionaGis',
    cityAliases: [
      'נס ציונה',
      'נס-ציונה',
      'ness ziona',
      'ness-ziona',
    ],
  },
  {
    providerId: 'tel-aviv-arcgis',
    providerName: 'תל אביב-יפו - GIS (ArcGIS)',
    municipality: 'תל אביב-יפו',
    platform: 'arcgis-esri',
    portalUrl: 'https://gisn.tel-aviv.gov.il/',
    restServiceUrl: 'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer',
    cityAliases: [
      'תל אביב',
      'תל אביב יפו',
      'תל-אביב',
      'תל-אביב-יפו',
      'תל אביב-יפו',
      'tel aviv',
      'tel-aviv',
      'tel aviv yafo',
    ],
  },
  {
    providerId: 'jerusalem-arcgis',
    providerName: 'ירושלים - GIS (ArcGIS)',
    municipality: 'ירושלים',
    platform: 'arcgis-esri',
    portalUrl: 'https://gis.jerusalem.muni.il/',
    cityAliases: [
      'ירושלים',
      'jerusalem',
    ],
  },
];

const MUNICIPAL_PROVIDERS: MunicipalProvider[] = [
  ...MUNICIPALITY_PROVIDER_MATRIX.map(createProviderFromConfig),
];

function getProvider(input: MunicipalLookupInput): MunicipalProvider | null {
  for (const provider of MUNICIPAL_PROVIDERS) {
    if (provider.supports(input)) {
      return provider;
    }
  }
  return null;
}

export async function lookupMunicipalParcelPlans(
  input: MunicipalLookupInput,
): Promise<MunicipalParcelPlansResponse> {
  const gush = normalizeDigits(input.gush);
  const helka = normalizeDigits(input.helka);
  if (!gush || !helka) {
    throw new Error('gush ו-helka חייבים להיות מספרים תקינים');
  }

  const provider = getProvider({ ...input, gush, helka });
  if (!provider) {
    return {
      supported: false,
      gush,
      helka,
      plans: [],
      error: 'לא נמצאה תמיכה ב-GIS עירוני עבור היישוב שזוהה',
    };
  }

  try {
    return await provider.fetchPlans({ ...input, gush, helka });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return {
      supported: true,
      providerId: provider.id,
      providerName: provider.name,
      municipality: provider.municipality,
      gush,
      helka,
      plans: [],
      error: message,
    };
  }
}
