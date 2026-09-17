import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { tlvGetFullBuildingRights } from '@/services/tlv-arcgis';
import { getTabaPlansByParcelGovMap } from '@/services/govmap-api';
import { queryXplan } from '@/services/xplan';

const execFileAsync = promisify(execFile);

export type SupportedRightsCity = string;

export interface RightsDocumentBuildInput {
  city?: string;
  cityHint?: string;
  gush: string;
  helka: string;
}

export interface RightsDocumentExtraRule {
  topic: string;
  value: string;
  plan?: string;
}

export interface RightsDocumentAlert {
  type: 'legal_disclaimer' | 'historical' | 'source_warning';
  text: string;
}

export interface RightsDocumentProvenance {
  field: string;
  source: string;
  locator: string;
  plan?: string;
}

export interface RightsDocumentModel {
  request: {
    city: SupportedRightsCity;
    cityLabel?: string;
    gush: string;
    helka: string;
    generatedAt: string;
  };
  parcel: {
    address: string | null;
    areaRegisteredSqm: number | null;
    mainPlan: string | null;
    landUse: string | null;
  };
  rights: {
    buildingPercent: string | null;
    maxFloors: number | null;
    maxBuildableAreaSqm: number | null;
    allowedUnits: number | null;
    maxHeightM: number | null;
    setbackFrontM: number | null;
    setbackSideM: number | null;
    setbackRearM: number | null;
  };
  extraRules: RightsDocumentExtraRule[];
  alerts: RightsDocumentAlert[];
  provenance: RightsDocumentProvenance[];
  source: {
    provider: string;
    reportUrl?: string;
  };
  crossSources?: {
    municipalPlans: string[];
    govMapPlans: string[];
    xplanPlans: string[];
    iplanLinks: {
      xplanSiteUrl: string;
      officialReferenceUrl: string;
    };
    warnings: string[];
  };
  quality?: {
    status: 'PUBLISHABLE' | 'PUBLISHABLE_WITH_WARNING' | 'NOT_PUBLISHABLE';
    reasons: string[];
    sourceCounts: {
      municipalPlans: number;
      govMapPlans: number;
      xplanPlans: number;
    };
  };
}

export interface RightsDocumentBuildResult {
  document: RightsDocumentModel;
  html: string;
}

type RightsQualityStatus = 'PUBLISHABLE' | 'PUBLISHABLE_WITH_WARNING' | 'NOT_PUBLISHABLE';

interface Mg2AppConfig {
  projId?: number | string;
  appApiUrl?: string;
  authApiUrl?: string;
  mapApiUrl?: string;
}

interface Mg2ParcelTreeNode {
  id?: number | string;
  name?: string;
  children?: Mg2ParcelTreeNode[];
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
    name?: string;
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
  parcel?: string;
}

type JsonObject = Record<string, unknown>;

interface Mg2CityRegistryEntry {
  cityKey: string;
  cityPath: string;
  cityLabel: string;
  aliases: string[];
}

interface Mg2CityRuntimeConfig {
  entry: Mg2CityRegistryEntry;
  portalUrl: string;
  projId: number;
  appApiUrl: string;
  authApiUrl: string;
  mapApiUrl: string;
}

interface FallbackRightsDocumentParams {
  city: string;
  cityLabel?: string;
  gush: string;
  helka: string;
  reason: string;
}

const MG2_CITY_REGISTRY: Mg2CityRegistryEntry[] = [
  {
    cityKey: 'ness-ziona',
    cityPath: 'NessZiona',
    cityLabel: 'נס ציונה',
    aliases: ['ness-ziona', 'ness ziona', 'נס ציונה', 'נס-ציונה'],
  },
  {
    cityKey: 'akko',
    cityPath: 'Akko',
    cityLabel: 'עכו',
    aliases: ['akko', 'acco', 'עכו'],
  },
  {
    cityKey: 'afula',
    cityPath: 'Afula',
    cityLabel: 'עפולה',
    aliases: ['afula', 'עפולה'],
  },
  {
    cityKey: 'petah-tikva',
    cityPath: 'PetahTikva',
    cityLabel: 'פתח תקווה',
    aliases: ['petah tikva', 'petah-tikva', 'פתח תקווה', 'פתח-תקווה'],
  },
  {
    cityKey: 'netivot',
    cityPath: 'Netivot',
    cityLabel: 'נתיבות',
    aliases: ['netivot', 'נתיבות'],
  },
  {
    cityKey: 'hof-ashkelon',
    cityPath: 'HofAshkelon',
    cityLabel: 'חוף אשקלון',
    aliases: ['hof ashkelon', 'hof-ashkelon', 'חוף אשקלון'],
  },
  {
    cityKey: 'hof-hasharon',
    cityPath: 'HofHasharon',
    cityLabel: 'חוף השרון',
    aliases: ['hof hasharon', 'hof-hasharon', 'חוף השרון'],
  },
  {
    cityKey: 'hevel-modiin',
    cityPath: 'HevelModiin',
    cityLabel: 'חבל מודיעין',
    aliases: ['hevel modiin', 'hevel-modiin', 'חבל מודיעין'],
  },
  {
    cityKey: 'even-yehuda',
    cityPath: 'EvenYehuda',
    cityLabel: 'אבן יהודה',
    aliases: ['even yehuda', 'even-yehuda', 'אבן יהודה'],
  },
];

function normalizeDigits(value: string): string {
  return value.replace(/[^\d]/g, '');
}

function normalizeText(value: string): string {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const code = Number(decimal);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
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
    // Continue.
  }
  return sanitized.replace(/^"+|"+$/g, '').trim();
}

function parseJsonText(value: string): unknown {
  const sanitized = value
    .replace(/^\uFEFF/, '')
    .trim();
  if (!sanitized) {
    return '';
  }
  try {
    return JSON.parse(sanitized);
  } catch {
    return sanitized;
  }
}

function isLikelyJwt(value: string): boolean {
  return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value);
}

function parseFirstNumber(value: string): number | null {
  const match = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value: string): number | null {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAreaCapSqm(value: string): number | null {
  const match = value.match(/לא\s*יותר\s*מ-?\s*(\d+(?:[.,]\d+)?)\s*מ["״]?[ר׳']/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseHeightFromFloorsText(value: string): number | null {
  const match = value.match(/עד\s*(\d+(?:[.,]\d+)?)\s*מ/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractHelkaFromMixedValue(value: string, gush: string, fallbackHelka: string): string {
  const text = String(value || '').trim();
  if (!text) {
    return fallbackHelka;
  }

  const pairMatches = text.match(/(\d+)\D+(\d+)/);
  if (pairMatches) {
    const first = normalizeDigits(pairMatches[1] || '');
    const second = normalizeDigits(pairMatches[2] || '');
    if (first === gush && second) {
      return second;
    }
    if (second === gush && first) {
      return first;
    }
  }

  const direct = normalizeDigits(text);
  if (direct === fallbackHelka) {
    return direct;
  }
  return fallbackHelka;
}

function normalizeCity(cityRaw: string): SupportedRightsCity | null {
  const value = cityRaw.trim().toLowerCase();
  if (['tel-aviv', 'telaviv', 'tlv', 'תל אביב', 'תל אביב-יפו', 'תל-אביב', 'תל-אביב-יפו'].includes(value)) {
    return 'tel-aviv';
  }
  for (const entry of MG2_CITY_REGISTRY) {
    if (value === entry.cityKey || value === entry.cityPath.toLowerCase()) {
      return entry.cityKey;
    }
    if (entry.aliases.some((alias) => alias.toLowerCase() === value)) {
      return entry.cityKey;
    }
  }
  return null;
}

function getMg2RegistryEntry(city: string): Mg2CityRegistryEntry | null {
  return MG2_CITY_REGISTRY.find((entry) => entry.cityKey === city) || null;
}

function normalizePlanCode(value: string): string {
  return value
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

function uniquePlans(values: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const raw = value.trim();
    if (!raw) {
      continue;
    }
    const key = normalizePlanCode(raw);
    if (!key || !byKey.has(key)) {
      byKey.set(key, raw);
    }
  }
  return Array.from(byKey.values());
}

function collectMunicipalPlans(document: RightsDocumentModel): string[] {
  const plans: string[] = [];
  if (document.parcel.mainPlan) {
    plans.push(document.parcel.mainPlan);
  }
  for (const item of document.extraRules) {
    if (item.plan) {
      plans.push(item.plan);
    }
  }
  for (const item of document.provenance) {
    if (item.plan) {
      plans.push(item.plan);
    }
  }
  return uniquePlans(plans);
}

async function enrichCrossSources(document: RightsDocumentModel): Promise<RightsDocumentModel> {
  const municipalPlans = collectMunicipalPlans(document);
  const warnings: string[] = [];

  let govMapPlans: string[] = [];
  try {
    const plans = await getTabaPlansByParcelGovMap(document.request.gush, document.request.helka);
    govMapPlans = uniquePlans(plans.map((item) => item.taba_code).filter(Boolean));
  } catch (error) {
    warnings.push(`GovMap plans lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  let xplanPlans: string[] = [];
  let xplanSiteUrl = 'https://ags.iplan.gov.il/xplan/';
  let officialReferenceUrl = 'https://mavat.iplan.gov.il/SV1';
  try {
    const xplan = await queryXplan({
      mode: 'gush-helka',
      gush: document.request.gush,
      helka: document.request.helka,
      include77_78: true,
      limit: 200,
    });
    xplanPlans = uniquePlans(
      xplan.services.flatMap((service) => service.plans.map((plan) => plan.planNumber)).filter(Boolean),
    );
    xplanSiteUrl = xplan.xplanSiteUrl || xplanSiteUrl;
    officialReferenceUrl = xplan.officialReferenceUrl || officialReferenceUrl;
  } catch (error) {
    warnings.push(`XPlan lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  const hasCoreNumeric = Boolean(
    document.rights.buildingPercent
    || document.rights.maxFloors != null
    || document.rights.allowedUnits != null
    || document.rights.maxBuildableAreaSqm != null,
  );

  const reasons: string[] = [];
  if (!document.parcel.mainPlan) {
    reasons.push('missing main plan');
  }
  if (!document.parcel.landUse) {
    reasons.push('missing land use');
  }
  if (!hasCoreNumeric) {
    reasons.push('missing core numeric rights');
  }
  if (municipalPlans.length === 0) {
    reasons.push('no municipal controlling plans extracted');
  }
  if (warnings.length > 0) {
    reasons.push('cross-source lookup warnings');
  }

  const historical = document.alerts.some((item) => item.type === 'historical');
  if (historical) {
    reasons.push('source marked historical');
  }

  let status: RightsQualityStatus = 'PUBLISHABLE';
  if (!document.parcel.mainPlan || !document.parcel.landUse || !hasCoreNumeric) {
    status = 'NOT_PUBLISHABLE';
  } else if (historical || warnings.length > 0) {
    status = 'PUBLISHABLE_WITH_WARNING';
  }

  const enriched: RightsDocumentModel = {
    ...document,
    crossSources: {
      municipalPlans,
      govMapPlans,
      xplanPlans,
      iplanLinks: {
        xplanSiteUrl,
        officialReferenceUrl,
      },
      warnings,
    },
    quality: {
      status,
      reasons,
      sourceCounts: {
        municipalPlans: municipalPlans.length,
        govMapPlans: govMapPlans.length,
        xplanPlans: xplanPlans.length,
      },
    },
  };
  return enriched;
}

function extractTdPairValue(html: string, label: string): string | null {
  const labelPattern = escapeRegex(label.trim()).replace(/\s+/g, '\\s*');
  const regex = new RegExp(
    `<td[^>]*>\\s*${labelPattern}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    'gi',
  );
  let fallback: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const raw = match[1] || '';
    const text = normalizeText(raw);
    if (!fallback && text) {
      fallback = text;
    }
    if (text) {
      return text;
    }
  }
  return fallback;
}

function extractDetailRule(html: string, label: string): RightsDocumentExtraRule | null {
  const raw = extractTdPairValue(html, label);
  if (!raw) {
    return null;
  }
  const planMatch = raw.match(/^([^ ]+)\s+/);
  const plan = planMatch ? planMatch[1].trim() : undefined;
  return {
    topic: label,
    value: raw,
    plan,
  };
}

function extractAreaRegistered(html: string): number | null {
  const flat = normalizeText(html);
  const match = flat.match(/שטח\s*חלקה\s*רשום[^:]*:\s*([\d.,]+)/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractQidFromTree(nodes: Mg2ParcelTreeNode[], gush: string, helka: string): string {
  let exact = '';

  const walk = (items: Mg2ParcelTreeNode[]): void => {
    for (const item of items) {
      const children = Array.isArray(item.children) ? item.children : [];
      const name = String(item.name || '').trim();
      const pair = name.match(/(\d+)\D+(\d+)/);
      if (pair && children.length === 0) {
        const first = normalizeDigits(pair[1] || '');
        const second = normalizeDigits(pair[2] || '');
        const isExact = (
          (first === gush && second === helka)
          || (first === helka && second === gush)
        );
        if (isExact && item.id != null) {
          exact = String(item.id);
          return;
        }
      }
      if (children.length > 0) {
        walk(children);
      }
      if (exact) {
        return;
      }
    }
  };

  walk(nodes);
  return exact;
}

async function curlText(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('curl', args, {
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 10,
  });
  return String(stdout || '');
}

async function getMg2TokenWithCurl(params: {
  portalUrl: string;
  authApiUrl: string;
  projId: number;
  cookieFile?: string;
}): Promise<string | null> {
  const cookieFile = params.cookieFile || `/tmp/mg2-cookie-${Date.now()}-${Math.round(Math.random() * 100000)}.txt`;
  try {
    await curlText([
      '-sS',
      '--connect-timeout',
      '8',
      '--max-time',
      '20',
      '-c',
      cookieFile,
      '-b',
      cookieFile,
      params.portalUrl,
    ]).catch(() => '');

    const commonHeaders = [
      '-H', 'Accept: application/json, text/plain, */*',
      '-H', 'Accept-Language: he-IL,he;q=0.9,en;q=0.8',
      '-H', 'Origin: https://mg2.gis-net.co.il',
      '-H', `Referer: ${params.portalUrl.replace(/\/+$/, '')}/`,
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '-c', cookieFile,
      '-b', cookieFile,
      '--connect-timeout', '8',
      '--max-time', '20',
    ];

    const userLoginRaw = await curlText([
      '-sS',
      '-X',
      'POST',
      `${params.authApiUrl}UserLogin`,
      ...commonHeaders,
      '-H',
      'Content-Type: application/json',
      '--data',
      JSON.stringify({ userName: 'Anonymous', userPassword: '', projId: params.projId }),
    ]);
    const userLoginToken = decodeJsonWrappedString(userLoginRaw).replace(/"/g, '');
    if (isLikelyJwt(userLoginToken)) {
      return userLoginToken;
    }

    const anonRaw = await curlText([
      '-sS',
      `${params.authApiUrl}AnonymousLogin?projId=${params.projId}`,
      ...commonHeaders,
    ]);
    const anonToken = decodeJsonWrappedString(anonRaw).replace(/"/g, '');
    return isLikelyJwt(anonToken) ? anonToken : null;
  } catch {
    return null;
  }
}

async function getMg2Token(params: {
  authApiUrl: string;
  projId: number;
  portalUrl: string;
}): Promise<string | null> {
  const commonHeaders: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    Origin: 'https://mg2.gis-net.co.il',
    Referer: `${params.portalUrl.replace(/\/+$/, '')}/`,
    'User-Agent': 'Mozilla/5.0',
  };

  const userLoginResponse = await fetch(`${params.authApiUrl}UserLogin`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: 'Anonymous',
      userPassword: '',
      projId: params.projId,
    }),
  }).catch(() => null);

  if (userLoginResponse?.ok) {
    const token = decodeJsonWrappedString(await userLoginResponse.text()).replace(/"/g, '');
    if (isLikelyJwt(token)) {
      return token;
    }
  }

  const anonymousResponse = await fetch(`${params.authApiUrl}AnonymousLogin?projId=${params.projId}`, {
    method: 'GET',
    cache: 'no-store',
    headers: commonHeaders,
  }).catch(() => null);

  if (anonymousResponse?.ok) {
    const token = decodeJsonWrappedString(await anonymousResponse.text()).replace(/"/g, '');
    if (isLikelyJwt(token)) {
      return token;
    }
  }

  return null;
}

async function loadMg2RuntimeConfig(entry: Mg2CityRegistryEntry): Promise<Mg2CityRuntimeConfig> {
  const portalUrl = `https://mg2.gis-net.co.il/${entry.cityPath}Gis`;
  const appConfigResponse = await fetch(`${portalUrl}/assets/appConfig/app.config.json`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });
  if (!appConfigResponse.ok) {
    throw new Error(`MG2 config returned ${appConfigResponse.status}`);
  }

  const configText = await appConfigResponse.text();
  const appConfig = JSON.parse(configText.replace(/^\uFEFF/, '')) as Mg2AppConfig;
  const projId = Number(appConfig.projId);
  const appApiUrl = String(appConfig.appApiUrl || `https://mg2.gis-net.co.il/${entry.cityPath}Api/api/app/`).trim();
  const authApiUrl = String(appConfig.authApiUrl || `https://mg2.gis-net.co.il/${entry.cityPath}Api/api/auth/`).trim();
  const mapApiUrl = String(appConfig.mapApiUrl || `https://mg2.gis-net.co.il/${entry.cityPath}Api/api/map/`).trim();

  if (!Number.isFinite(projId) || !appApiUrl || !authApiUrl || !mapApiUrl) {
    throw new Error('Missing MG2 app config fields');
  }

  return {
    entry,
    portalUrl,
    projId,
    appApiUrl,
    authApiUrl,
    mapApiUrl,
  };
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

function pickMg2DirectSearch(searches: Mg2SearchDefinition[]): {
  searchId: number;
  formName: string;
  blockField: string;
  parcelField: string;
} | null {
  const candidates = searches.filter((item) => {
    const title = String(item.title || '');
    const fields = collectMg2SearchFields(item).map((field) => String(field.name || ''));
    const hasBlock = fields.some((name) => /block/i.test(name));
    const hasParcel = fields.some((name) => /parcel/i.test(name));
    return (/גוש/i.test(title) && /חלקה/i.test(title)) || (hasBlock && hasParcel);
  });

  for (const item of candidates) {
    const searchId = Number(item.searchId);
    if (!Number.isFinite(searchId)) {
      continue;
    }
    const formName = String(item.dynamicForm?.name || '').trim() || `searches${searchId}`;
    const fields = collectMg2SearchFields(item);
    const blockField = fields.find((field) => /block/i.test(String(field.name || '')))?.name;
    const parcelField = fields.find((field) => /parcel/i.test(String(field.name || '')))?.name;
    if (!blockField || !parcelField) {
      continue;
    }
    return {
      searchId,
      formName,
      blockField: String(blockField),
      parcelField: String(parcelField),
    };
  }
  return null;
}

function extractMg2QidAndQnum(params: {
  landUseRaw: unknown;
  sourceItem: JsonObject;
  gush: string;
  fallbackHelka: string;
}): { qId: string; qNum: string } | null {
  const { landUseRaw, sourceItem, gush, fallbackHelka } = params;

  const fromLandUse = (value: unknown): { qId: string; qNum: string } | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const record = value as JsonObject;
    const qId = normalizeDigits(String(record.qId ?? record.QId ?? record.id ?? record.parcelId ?? ''));
    if (!qId) {
      return null;
    }
    const qNum = extractHelkaFromMixedValue(
      String(record.parcel ?? record.qNum ?? fallbackHelka),
      gush,
      fallbackHelka,
    );
    return { qId, qNum };
  };

  if (Array.isArray(landUseRaw)) {
    for (const row of landUseRaw) {
      const parsed = fromLandUse(row);
      if (parsed) {
        return parsed;
      }
    }
  } else {
    const parsed = fromLandUse(landUseRaw);
    if (parsed) {
      return parsed;
    }
  }

  const qIdFromItem = normalizeDigits(
    String(
      sourceItem.qId
      ?? sourceItem.QId
      ?? sourceItem.id
      ?? sourceItem.Id
      ?? sourceItem.objectId
      ?? sourceItem.ObjectId
      ?? sourceItem.OBJECTID
      ?? '',
    ),
  );
  if (!qIdFromItem) {
    return null;
  }
  return {
    qId: qIdFromItem,
    qNum: fallbackHelka,
  };
}

async function resolveQidsViaDirectSearch(params: {
  portalUrl: string;
  mapApiUrl: string;
  appApiUrl: string;
  projId: number;
  token: string;
  gush: string;
  helka: string;
}): Promise<Array<{ qId: string; qNum: string }>> {
  const commonHeaders: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    Origin: 'https://mg2.gis-net.co.il',
    Referer: `${params.portalUrl.replace(/\/+$/, '')}/`,
    'User-Agent': 'Mozilla/5.0',
    Authorization: `Bearer ${params.token}`,
  };

  const searchesResponse = await fetch(`${params.appApiUrl}GetAllSearches?projId=${params.projId}`, {
    cache: 'no-store',
    headers: commonHeaders,
  }).catch(() => null);
  if (!searchesResponse?.ok) {
    return [];
  }

  const searchesRaw = await searchesResponse.text();
  const searchesData = parseJsonText(searchesRaw);
  if (!Array.isArray(searchesData)) {
    return [];
  }

  const directSearch = pickMg2DirectSearch(searchesData as Mg2SearchDefinition[]);
  if (!directSearch) {
    return [];
  }

  const payload: JsonObject = {
    searchId: directSearch.searchId,
    data: {
      [directSearch.formName]: {
        [directSearch.blockField]: params.gush,
        [directSearch.parcelField]: params.helka,
      },
    },
  };

  const searchResponse = await fetch(`${params.mapApiUrl}GetObjectsBySearch`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!searchResponse?.ok) {
    return [];
  }

  const rawSearch = await searchResponse.text();
  if (/doctype/i.test(rawSearch)) {
    return [];
  }
  const searchData = parseJsonText(rawSearch);
  const rows = Array.isArray(searchData) ? searchData : [searchData];
  const resolved = new Map<string, string>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const sourceItem = row as JsonObject;
    const landUseResponse = await fetch(`${params.appApiUrl}GetLandUseObj`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...commonHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sourceItem),
    }).catch(() => null);

    let landUseRaw: unknown = null;
    if (landUseResponse?.ok) {
      const landUseText = await landUseResponse.text();
      landUseRaw = parseJsonText(landUseText);
    }

    const parsed = extractMg2QidAndQnum({
      landUseRaw,
      sourceItem,
      gush: params.gush,
      fallbackHelka: params.helka,
    });
    if (parsed?.qId) {
      resolved.set(parsed.qId, parsed.qNum);
    }
  }

  return Array.from(resolved.entries()).map(([qId, qNum]) => ({ qId, qNum }));
}

function buildNessZiona2080SearchPayload(params: {
  mapSession: string;
  mapName: string;
  gush: string;
  helka: string;
}): JsonObject {
  const makeField = (
    fieldId: number,
    name: string,
    title: string,
    value: string,
    placeholder: string,
    required: boolean,
    lutConditionKey: string,
  ): JsonObject => ({
    fieldId,
    name,
    title,
    fieldType: 4,
    fieldUiType: 4,
    value,
    placeholder,
    required,
    readOnly: false,
    visible: true,
    forSave: false,
    isKey: false,
    minLength: 0,
    maxLength: 9999,
    url: '',
    minLengthAutocomplete: 0,
    onDependFieldId: 0,
    layerId: 124,
    layerName: 'parcels',
    lutKey: name,
    lutValue: name,
    lutConditionKey,
    lutConditionKeyType: 0,
    lutValueType: 4,
    isHorizontalField: true,
    action: 0,
    dataSourceName: 'LU_NESSZIONA',
    isAutoZoom: false,
    fieldLutSource: 'Lut_Parcels',
  });

  return {
    mapSession: params.mapSession,
    mapName: params.mapName,
    zoomWidth: 50,
    searchId: 2080,
    title: 'גוש חלקה',
    subjectId: 0,
    subjectName: '',
    isHasSubject: false,
    dynamicForm: {
      objectId: 0,
      layerName: null,
      layerLabel: null,
      filter: null,
      geometryType: 0,
      name: 'searches2080',
      readOnly: false,
      rows: [
        {
          title: '',
          fields: [
            makeField(3544, 'Block_No', 'גוש', params.gush, 'גוש', true, ''),
            makeField(3547, 'Parcel_no', 'חלקה', params.helka, 'חלקה', false, 'Block_No'),
          ],
        },
      ],
    },
  };
}

async function resolveQidViaSdfSearch(params: {
  portalUrl: string;
  mapApiUrl: string;
  appApiUrl: string;
  projId: number;
  token: string;
  gush: string;
  helka: string;
}): Promise<{ qId: string; qNum: string } | null> {
  const commonHeaders: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    Origin: 'https://mg2.gis-net.co.il',
    Referer: `${params.portalUrl.replace(/\/+$/, '')}/`,
    'User-Agent': 'Mozilla/5.0',
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
      projId: params.projId,
      mapSession: '',
      mapName: '',
    }),
  }).catch(() => null);
  if (!mapInitResponse?.ok) {
    return null;
  }

  const mapSessionData = (await mapInitResponse.json()) as Mg2MapSessionResponse;
  const mapSession = String(mapSessionData.sessionId || '').trim();
  const mapName = String(mapSessionData.mapName || '').trim();
  if (!mapSession || !mapName) {
    return null;
  }

  const searchPayload = buildNessZiona2080SearchPayload({
    mapSession,
    mapName,
    gush: params.gush,
    helka: params.helka,
  });

  const searchResponse = await fetch(`${params.mapApiUrl}GetObjectsBySearch`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(searchPayload),
  }).catch(() => null);
  if (!searchResponse?.ok) {
    return null;
  }

  const searchData = (await searchResponse.json()) as Mg2MapSearchResponse;
  const layer = (searchData.layers ?? [])[0];
  const row = (layer?.rowItems ?? [])[0];
  const objectId = Number(layer?.objectId);
  if (!Number.isFinite(objectId) || !row) {
    return null;
  }

  const fields = new Map<string, string>();
  for (const item of row.fieldItems ?? []) {
    const fieldName = String(item.fieldName || '').trim();
    if (!fieldName) {
      continue;
    }
    fields.set(fieldName, String(item.fieldValue || '').trim());
  }
  const sdfId = normalizeDigits(fields.get('Autogenerated_SDF_ID') || '');
  if (!sdfId) {
    return null;
  }

  const landUseResponse = await fetch(`${params.appApiUrl}GetLandUseObj`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify({
      projId: params.projId,
      mapName,
      mapSession,
      layerName: 'parcels',
      filter: `Autogenerated_SDF_ID=${sdfId}`,
      objectId,
    }),
  }).catch(() => null);
  if (!landUseResponse?.ok) {
    return null;
  }

  const landUseData = (await landUseResponse.json()) as Mg2LandUseObj;
  const qId = normalizeDigits(String(landUseData.parcelId ?? landUseData.qId ?? ''));
  if (!qId) {
    return null;
  }
  const qNum = extractHelkaFromMixedValue(String(landUseData.parcel || params.helka), params.gush, params.helka);
  return { qId, qNum };
}

async function resolveQidViaMapSearch(params: {
  portalUrl: string;
  mapApiUrl: string;
  appApiUrl: string;
  projId: number;
  token: string;
  gush: string;
  helka: string;
}): Promise<{ qId: string; qNum: string } | null> {
  const commonHeaders: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    Origin: 'https://mg2.gis-net.co.il',
    Referer: `${params.portalUrl.replace(/\/+$/, '')}/`,
    'User-Agent': 'Mozilla/5.0',
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
  }).catch(() => null);
  if (!mapInitResponse?.ok) {
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
  }).catch(() => null);
  if (!searchesResponse?.ok) {
    return null;
  }

  const searches = (await searchesResponse.json()) as Mg2SearchDefinition[];
  const baseSearch = pickMg2GushHelkaSearch(Array.isArray(searches) ? searches : []);
  if (!baseSearch) {
    return null;
  }

  const payload = JSON.parse(JSON.stringify(baseSearch)) as Mg2SearchDefinition;
  const searchFields = collectMg2SearchFields(payload);
  for (const field of searchFields) {
    const fieldName = String(field.name || '');
    if (/Block_No/i.test(fieldName)) {
      field.value = params.gush;
    } else if (/Parcel_no/i.test(fieldName)) {
      field.value = params.helka;
    }
  }

  payload.mapSession = mapSessionId;
  payload.mapName = mapName;
  payload.zoomWidth = 50;
  payload.projId = params.projId;

  const mapSearchResponse = await fetch(`${params.mapApiUrl}GetObjectsBySearch`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!mapSearchResponse?.ok) {
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
  }).catch(() => null);
  if (!landUseResponse?.ok) {
    return null;
  }

  const landUseData = (await landUseResponse.json()) as Mg2LandUseObj;
  const qId = normalizeDigits(String(landUseData.parcelId ?? landUseData.qId ?? ''));
  if (!qId) {
    return null;
  }
  const qNum = extractHelkaFromMixedValue(String(landUseData.parcel || params.helka), params.gush, params.helka);
  return { qId, qNum };
}

function hasMg2CoreRights(doc: RightsDocumentModel): boolean {
  return (
    Boolean(doc.parcel.mainPlan)
    && Boolean(doc.parcel.landUse)
    && Boolean(
      doc.rights.buildingPercent
      || doc.rights.maxFloors != null
      || doc.rights.allowedUnits != null
      || doc.rights.maxBuildableAreaSqm != null
    )
  );
}

function scoreMg2Candidate(doc: RightsDocumentModel): number {
  let points = 0;
  if (doc.parcel.mainPlan) points += 2;
  if (doc.parcel.landUse) points += 2;
  if (doc.parcel.areaRegisteredSqm != null) points += 1;
  if (doc.rights.buildingPercent) points += 2;
  if (doc.rights.maxFloors != null) points += 2;
  if (doc.rights.allowedUnits != null) points += 2;
  if (doc.rights.setbackFrontM != null) points += 1;
  if (doc.rights.setbackSideM != null) points += 1;
  if (doc.rights.setbackRearM != null) points += 1;
  if (!doc.alerts.some((item) => item.type === 'historical')) points += 1;
  return points;
}

function buildDoch33QueryVariants(params: {
  projId: number;
  gush: string;
  helka: string;
  qidCandidates: Map<string, string>;
}): string[] {
  const variants: string[] = [];
  for (const [qId, qNum] of params.qidCandidates.entries()) {
    const qNumVariants = Array.from(new Set([
      qNum,
      params.helka,
      `${params.gush}_${params.helka}`,
      `${params.gush}/${params.helka}`,
      '',
    ]));

    for (const searchBy of ['lot', 'parcel']) {
      for (const qNumVariant of qNumVariants) {
        variants.push(
          `projId=${params.projId}&qId=${encodeURIComponent(qId)}&qNum=${encodeURIComponent(qNumVariant)}&searchBy=${searchBy}&ApplicantName=&RequestNumber=&ApplicantAddress=&SumPaid=&OrderNumber=&PaymentDate=&Warning=0`,
        );
      }
    }
  }
  return variants;
}

async function collectMg2CandidatesViaCurl(params: {
  cityKey: string;
  cityLabel: string;
  portalUrl: string;
  appApiUrl: string;
  authApiUrl: string;
  mapApiUrl: string;
  projId: number;
  gush: string;
  helka: string;
}): Promise<Array<{ document: RightsDocumentModel; html: string }>> {
  const cookieFile = `/tmp/mg2-cookie-${Date.now()}-${Math.round(Math.random() * 100000)}.txt`;
  const baseCurlArgs = [
    '-sS',
    '-L',
    '-c',
    cookieFile,
    '-b',
    cookieFile,
    '--connect-timeout',
    '8',
    '--max-time',
    '25',
  ];

  const callCurl = async (args: string[]): Promise<string> => {
    try {
      return await curlText([...baseCurlArgs, ...args]);
    } catch {
      return '';
    }
  };

  await callCurl([params.portalUrl]);
  const token = await getMg2TokenWithCurl({
    portalUrl: params.portalUrl,
    authApiUrl: params.authApiUrl,
    projId: params.projId,
    cookieFile,
  });
  if (!token) {
    return [];
  }

  const commonHeaders = [
    '-H', 'Accept: application/json, text/plain, */*',
    '-H', 'Accept-Language: he-IL,he;q=0.9,en;q=0.8',
    '-H', 'Origin: https://mg2.gis-net.co.il',
    '-H', `Referer: ${params.portalUrl.replace(/\/+$/, '')}/`,
    '-H', 'User-Agent: Mozilla/5.0',
    '-H', `Authorization: Bearer ${token}`,
  ];

  const qidCandidates = new Map<string, string>();

  const mapInitText = await callCurl([
    '-X', 'POST',
    ...commonHeaders,
    '-H', 'Content-Type: application/json',
    '--data', JSON.stringify({
      projId: params.projId,
      mapSession: '',
      mapName: '',
    }),
    `${params.mapApiUrl}FirstLoadingMap`,
  ]);
  const mapInitRaw = parseJsonText(mapInitText);
  const mapInitObj = (mapInitRaw && typeof mapInitRaw === 'object') ? (mapInitRaw as JsonObject) : null;
  const mapSession = String(mapInitObj?.sessionId || '').trim();
  const mapName = String(mapInitObj?.mapName || '').trim();

  if (mapSession && mapName) {
    const searchPayload = buildNessZiona2080SearchPayload({
      mapSession,
      mapName,
      gush: params.gush,
      helka: params.helka,
    });
    const searchBySdfText = await callCurl([
      '-X', 'POST',
      ...commonHeaders,
      '-H', 'Content-Type: application/json;charset=UTF-8',
      '--data', JSON.stringify(searchPayload),
      `${params.mapApiUrl}GetObjectsBySearch`,
    ]);
    const searchBySdfRaw = parseJsonText(searchBySdfText);
    if (searchBySdfRaw && typeof searchBySdfRaw === 'object' && !Array.isArray(searchBySdfRaw)) {
      const searchBySdf = searchBySdfRaw as Mg2MapSearchResponse;
      const layer = (searchBySdf.layers ?? [])[0];
      const row = (layer?.rowItems ?? [])[0];
      const objectId = Number(layer?.objectId);
      if (Number.isFinite(objectId) && row) {
        const fieldMap = new Map<string, string>();
        for (const item of row.fieldItems ?? []) {
          const fieldName = String(item.fieldName || '').trim();
          if (!fieldName) {
            continue;
          }
          fieldMap.set(fieldName, String(item.fieldValue || '').trim());
        }
        const sdfId = normalizeDigits(fieldMap.get('Autogenerated_SDF_ID') || '');
        if (sdfId) {
          const landUseBySdfText = await callCurl([
            '-X', 'POST',
            ...commonHeaders,
            '-H', 'Content-Type: application/json;charset=UTF-8',
            '--data', JSON.stringify({
              projId: params.projId,
              mapName,
              mapSession,
              layerName: 'parcels',
              filter: `Autogenerated_SDF_ID=${sdfId}`,
              objectId,
            }),
            `${params.appApiUrl}GetLandUseObj`,
          ]);
          const landUseBySdfRaw = parseJsonText(landUseBySdfText);
          const parsedSdf = extractMg2QidAndQnum({
            landUseRaw: landUseBySdfRaw,
            sourceItem: {},
            gush: params.gush,
            fallbackHelka: params.helka,
          });
          if (parsedSdf?.qId) {
            qidCandidates.set(parsedSdf.qId, parsedSdf.qNum || params.helka);
          }
        }
      }
    }
  }

  const searchesText = await callCurl([
    ...commonHeaders,
    `${params.appApiUrl}GetAllSearches?projId=${params.projId}`,
  ]);
  const searchesRaw = parseJsonText(searchesText);
  const searches = Array.isArray(searchesRaw) ? (searchesRaw as Mg2SearchDefinition[]) : [];

  const directSearch = pickMg2DirectSearch(searches);
  if (directSearch) {
    const payload = {
      searchId: directSearch.searchId,
      data: {
        [directSearch.formName]: {
          [directSearch.blockField]: params.gush,
          [directSearch.parcelField]: params.helka,
        },
      },
    };
    const searchResultText = await callCurl([
      '-X', 'POST',
      ...commonHeaders,
      '-H', 'Content-Type: application/json',
      '--data', JSON.stringify(payload),
      `${params.mapApiUrl}GetObjectsBySearch`,
    ]);
    if (searchResultText && !/doctype/i.test(searchResultText)) {
      const searchRaw = parseJsonText(searchResultText);
      const rows = Array.isArray(searchRaw) ? searchRaw : [searchRaw];
      for (const row of rows) {
        if (!row || typeof row !== 'object') {
          continue;
        }
        const sourceItem = row as JsonObject;
        const landUseText = await callCurl([
          '-X', 'POST',
          ...commonHeaders,
          '-H', 'Content-Type: application/json',
          '--data', JSON.stringify(sourceItem),
          `${params.appApiUrl}GetLandUseObj`,
        ]);
        const landUseRaw = parseJsonText(landUseText);
        const parsed = extractMg2QidAndQnum({
          landUseRaw,
          sourceItem,
          gush: params.gush,
          fallbackHelka: params.helka,
        });
        if (parsed?.qId) {
          qidCandidates.set(parsed.qId, parsed.qNum || params.helka);
        }
      }
    }
  }

  const treeText = await callCurl([
    ...commonHeaders,
    `${params.appApiUrl}GetParcelsTree?block=${encodeURIComponent(params.gush)}&parcel=${encodeURIComponent(params.helka)}&projId=${params.projId}`,
  ]);
  const treeRaw = parseJsonText(treeText);
  const treeQid = extractQidFromTree(Array.isArray(treeRaw) ? (treeRaw as Mg2ParcelTreeNode[]) : [], params.gush, params.helka);
  if (treeQid) {
    qidCandidates.set(treeQid, params.helka);
  }

  if (qidCandidates.size === 0) {
    return [];
  }

  const reportQueryVariants = buildDoch33QueryVariants({
    projId: params.projId,
    gush: params.gush,
    helka: params.helka,
    qidCandidates,
  });
  const apiRoot = params.appApiUrl.replace(/\/api\/app\/?$/i, '');

  const candidates: Array<{ document: RightsDocumentModel; html: string }> = [];
  for (const query of reportQueryVariants) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reportFileRaw = decodeJsonWrappedString(await callCurl([
        ...commonHeaders,
        `${params.appApiUrl}GetDoch33Report?${query}`,
      ]));
      if (!reportFileRaw.endsWith('.html')) {
        continue;
      }
      const reportUrl = `${apiRoot}/TempFiles/${reportFileRaw}`;
      const reportHtml = await callCurl([
        '-H', 'Accept: text/html,application/xhtml+xml',
        '-H', `Referer: ${params.portalUrl.replace(/\/+$/, '')}/`,
        reportUrl,
      ]);
      if (!reportHtml || /waf_reject/i.test(reportHtml)) {
        continue;
      }
      candidates.push({
        document: buildMg2DocumentFromHtml({
          cityKey: params.cityKey,
          cityLabel: params.cityLabel,
          gush: params.gush,
          helka: params.helka,
          reportUrl,
          html: reportHtml,
        }),
        html: reportHtml,
      });
    }
  }

  return candidates;
}

async function collectMg2CandidateViaUi(params: {
  cityKey: string;
  cityLabel: string;
  portalUrl: string;
  gush: string;
  helka: string;
}): Promise<{ document: RightsDocumentModel; html: string } | null> {
  try {
    const playwright = await import('playwright');
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const waitOverlay = async (): Promise<void> => {
      await page.locator('.loading').first().waitFor({ state: 'hidden', timeout: 12000 }).catch(() => {});
    };

    const pickAutocomplete = async (value: string): Promise<void> => {
      const optionByText = page.locator('.ui-autocomplete-list-item').filter({ hasText: value }).first();
      if (await optionByText.count()) {
        await optionByText.click({ timeout: 3000 }).catch(() => {});
      }
    };

    const safeClick = async (fn: () => Promise<void>): Promise<boolean> => {
      try {
        await fn();
        return true;
      } catch {
        return false;
      }
    };

    await page.goto(`${params.portalUrl.replace(/\/+$/, '')}/#/`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.waitForTimeout(1500);
    await waitOverlay();
    await safeClick(() => page.getByText('אישור').first().click({ timeout: 3000 }));
    await safeClick(() => page.getByText('לא').first().click({ timeout: 2000 }));

    await safeClick(() => page.getByRole('banner').getByText('חיפושים').click({ timeout: 10000 }));
    await waitOverlay();

    const openedSearch = await safeClick(() => page.getByText('גוש חלקה').first().click({ timeout: 10000 }))
      || await safeClick(() => page.getByText('ג גוש חלקה').first().click({ timeout: 10000 }));
    if (!openedSearch) {
      await context.close();
      await browser.close();
      return null;
    }

    const gushInput = page.getByRole('textbox', { name: 'גוש' });
    const helkaInput = page.getByRole('textbox', { name: 'חלקה' });
    await gushInput.click({ timeout: 10000 });
    await gushInput.fill(params.gush);
    await page.waitForTimeout(350);
    await pickAutocomplete(params.gush);
    await gushInput.press('Tab').catch(() => {});
    await helkaInput.click({ timeout: 10000 });
    await helkaInput.fill(params.helka);
    await page.waitForTimeout(350);
    await pickAutocomplete(params.helka);
    await helkaInput.press('Tab').catch(() => {});

    const searched = await safeClick(() => page.getByRole('button', { name: 'חיפוש' }).click({ timeout: 15000, force: true }));
    if (!searched) {
      await context.close();
      await browser.close();
      return null;
    }

    await page.waitForTimeout(2500);
    await waitOverlay();
    await safeClick(() => page.getByText('מידע תכנוני').first().click({ timeout: 8000 }));

    const popupPromise = page.waitForEvent('popup', { timeout: 20000 }).catch(() => null);
    const openedReport = await safeClick(() => page.getByText('דף מידע', { exact: true }).first().click({ timeout: 12000, force: true }))
      || await safeClick(() => page.getByText('ז דף מידע', { exact: true }).first().click({ timeout: 12000, force: true }));
    if (!openedReport) {
      await context.close();
      await browser.close();
      return null;
    }

    let rawHtml = '';
    let reportUrl = '';
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      rawHtml = await popup.content().catch(() => '');
      reportUrl = popup.url();
      await popup.close().catch(() => {});
    } else {
      await page.waitForTimeout(1200);
      reportUrl = page.url();
      rawHtml = await page.content().catch(() => '');
    }

    await context.close();
    await browser.close();

    if (!rawHtml || /waf_reject/i.test(rawHtml)) {
      return null;
    }

    return {
      document: buildMg2DocumentFromHtml({
        cityKey: params.cityKey,
        cityLabel: params.cityLabel,
        gush: params.gush,
        helka: params.helka,
        reportUrl,
        html: rawHtml,
      }),
      html: rawHtml,
    };
  } catch {
    return null;
  }
}

function renderCanonicalHtml(document: RightsDocumentModel): string {
  const cityLabel = document.request.cityLabel
    || (document.request.city === 'tel-aviv' ? 'תל אביב-יפו' : getMg2RegistryEntry(document.request.city)?.cityLabel)
    || document.request.city;
  const rows: Array<[string, string]> = [
    ['עיר', cityLabel],
    ['גוש', document.request.gush],
    ['חלקה', document.request.helka],
    ['כתובת', document.parcel.address || ''],
    ['תוכנית עיקרית', document.parcel.mainPlan || ''],
    ['ייעוד', document.parcel.landUse || ''],
    ['שטח רשום (מ"ר)', document.parcel.areaRegisteredSqm != null ? String(document.parcel.areaRegisteredSqm) : ''],
    ['אחוזי בנייה', document.rights.buildingPercent || ''],
    ['קומות מרביות', document.rights.maxFloors != null ? String(document.rights.maxFloors) : ''],
    ['יח"ד מרביות', document.rights.allowedUnits != null ? String(document.rights.allowedUnits) : ''],
    ['שטח בנייה מרבי (מ"ר)', document.rights.maxBuildableAreaSqm != null ? String(document.rights.maxBuildableAreaSqm) : ''],
    ['גובה מרבי (מ\')', document.rights.maxHeightM != null ? String(document.rights.maxHeightM) : ''],
    ['קו בניין קדמי (מ\')', document.rights.setbackFrontM != null ? String(document.rights.setbackFrontM) : ''],
    ['קו בניין צידי (מ\')', document.rights.setbackSideM != null ? String(document.rights.setbackSideM) : ''],
    ['קו בניין אחורי (מ\')', document.rights.setbackRearM != null ? String(document.rights.setbackRearM) : ''],
  ];

  const alerts = document.alerts
    .map((item) => `<li>${escapeHtml(item.text)}</li>`)
    .join('');
  const rules = document.extraRules
    .map((item) => `<tr><td>${escapeHtml(item.topic)}</td><td>${escapeHtml(item.value)}</td><td>${escapeHtml(item.plan || '')}</td></tr>`)
    .join('');
  const qualityStatus = document.quality?.status || 'UNKNOWN';
  const qualityReasons = (document.quality?.reasons || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const sourceCounts = document.quality
    ? `${document.quality.sourceCounts.municipalPlans}/${document.quality.sourceCounts.govMapPlans}/${document.quality.sourceCounts.xplanPlans}`
    : '';
  const tableRows = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>דוח זכויות - גוש ${escapeHtml(document.request.gush)} חלקה ${escapeHtml(document.request.helka)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .meta { color: #4b5563; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 14px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: right; vertical-align: top; }
    th { background: #f9fafb; width: 26%; }
    h2 { margin: 18px 0 8px; font-size: 17px; }
  </style>
</head>
<body>
  <h1>דוח מידע תכנוני וזכויות</h1>
  <div class="meta">הופק: ${escapeHtml(document.request.generatedAt)} | מקור: ${escapeHtml(document.source.provider)}</div>
  <div class="meta">אמינות: ${escapeHtml(qualityStatus)} | מוני מקורות (municipal/govmap/xplan): ${escapeHtml(sourceCounts)}</div>

  <h2>סיכום חלקה</h2>
  <table><tbody>${tableRows}</tbody></table>

  <h2>כללים נוספים</h2>
  <table>
    <thead><tr><th>נושא</th><th>ערך</th><th>תוכנית</th></tr></thead>
    <tbody>${rules || '<tr><td colspan="3">אין נתונים</td></tr>'}</tbody>
  </table>

  <h2>התראות</h2>
  <ul>${alerts || '<li>אין</li>'}</ul>

  <h2>אבחון אמינות</h2>
  <ul>${qualityReasons || '<li>ללא</li>'}</ul>
</body>
</html>`;
}

function buildMg2DocumentFromHtml(params: {
  cityKey: string;
  cityLabel: string;
  gush: string;
  helka: string;
  reportUrl: string;
  html: string;
}): RightsDocumentModel {
  const { cityKey, cityLabel, gush, helka, reportUrl, html } = params;
  const address = extractTdPairValue(html, 'כתובת :');
  const mainPlan = extractTdPairValue(html, "מס' תוכנית :");
  const landUse = extractTdPairValue(html, 'ייעוד :');
  const areaFromHeader = extractTdPairValue(html, 'שטח מגרש  כולל במ"ר :');
  const areaRegisteredSqm = extractAreaRegistered(html) || parseFirstNumber(areaFromHeader || '');

  const buildingPercentRule = extractDetailRule(html, 'סה"כ שטחים למטרות עיקריות (אחוזים)');
  const floorsRule = extractDetailRule(html, "מס' קומות");
  const unitsRule = extractDetailRule(html, "מס' יחידות דיור מקסימלי");
  const frontSetbackRule = extractDetailRule(html, 'מירווח - קדמי (מטר)');
  const sideSetbackRule = extractDetailRule(html, 'מירווח -צידי (מטר)');
  const rearSetbackRule = extractDetailRule(html, 'מירווח - אחורי (מטר)');
  const basementRule = extractDetailRule(html, 'שימושים מותרים במרתף');
  const poolRule = extractDetailRule(html, 'בריכת שחיה');

  const percent = buildingPercentRule ? parsePercent(buildingPercentRule.value) : null;
  const areaCapSqm = buildingPercentRule ? parseAreaCapSqm(buildingPercentRule.value) : null;
  const maxFloors = floorsRule ? parseFirstNumber(floorsRule.value) : null;
  const allowedUnits = unitsRule ? parseFirstNumber(unitsRule.value) : null;
  const maxHeightM = floorsRule ? parseHeightFromFloorsText(floorsRule.value) : null;
  const setbackFrontM = frontSetbackRule ? parseFirstNumber(frontSetbackRule.value) : null;
  const setbackSideM = sideSetbackRule ? parseFirstNumber(sideSetbackRule.value) : null;
  const setbackRearM = rearSetbackRule ? parseFirstNumber(rearSetbackRule.value) : null;

  const alerts: RightsDocumentAlert[] = [
    {
      type: 'legal_disclaimer',
      text: 'הנתונים בדוח מידע זה אינפורמטיביים ואינם מחליפים מסמך סטטוטורי מחייב.',
    },
  ];
  if (/מידע היסטורי בלבד|אינו עדכני/i.test(html)) {
    alerts.push({
      type: 'historical',
      text: 'בדוח המקור סומנה הערה שמדובר במידע היסטורי או שאינו עדכני.',
    });
  }

  const provenance: RightsDocumentProvenance[] = [];
  const maybePush = (
    field: string,
    value: unknown,
    locator: string,
    plan?: string,
  ): void => {
    if (value == null || value === '') {
      return;
    }
    provenance.push({
      field,
      source: 'mg2-doch33',
      locator,
      plan,
    });
  };

  maybePush('parcel.mainPlan', mainPlan, "3. מס' תוכנית", mainPlan || undefined);
  maybePush('parcel.landUse', landUse, '3. ייעוד', mainPlan || undefined);
  maybePush('rights.buildingPercent', percent, 'שטחים > סה"כ שטחים למטרות עיקריות', buildingPercentRule?.plan);
  maybePush('rights.maxBuildableAreaSqm', areaCapSqm, 'שטחים > סה"כ שטחים למטרות עיקריות', buildingPercentRule?.plan);
  maybePush("rights.maxFloors", maxFloors, "בינוי > מס' קומות", floorsRule?.plan);
  maybePush('rights.allowedUnits', allowedUnits, "צפיפות בניה > מס' יחידות דיור מקסימלי", unitsRule?.plan);
  maybePush('rights.maxHeightM', maxHeightM, "בינוי > מס' קומות", floorsRule?.plan);
  maybePush('rights.setbackFrontM', setbackFrontM, 'קווי בנין > מירווח קדמי', frontSetbackRule?.plan);
  maybePush('rights.setbackSideM', setbackSideM, 'קווי בנין > מירווח צידי', sideSetbackRule?.plan);
  maybePush('rights.setbackRearM', setbackRearM, 'קווי בנין > מירווח אחורי', rearSetbackRule?.plan);

  const buildingPercentText = percent != null
    ? `${percent}%${areaCapSqm != null ? ` (max ${areaCapSqm} sqm)` : ''}`
    : null;

  return {
    request: {
      city: cityKey,
      cityLabel,
      gush,
      helka,
      generatedAt: new Date().toISOString(),
    },
    parcel: {
      address,
      areaRegisteredSqm,
      mainPlan,
      landUse,
    },
    rights: {
      buildingPercent: buildingPercentText,
      maxFloors,
      maxBuildableAreaSqm: areaCapSqm,
      allowedUnits,
      maxHeightM,
      setbackFrontM,
      setbackSideM,
      setbackRearM,
    },
    extraRules: [basementRule, poolRule].filter((value): value is RightsDocumentExtraRule => Boolean(value)),
    alerts,
    provenance,
    source: {
      provider: `${cityLabel} MG2 / Doch33`,
      reportUrl,
    },
  };
}

async function resolveMg2CityByParcel(gush: string, helka: string): Promise<{
  runtime: Mg2CityRuntimeConfig;
  seedQid?: string;
} | null> {
  for (const entry of MG2_CITY_REGISTRY) {
    let runtime: Mg2CityRuntimeConfig;
    try {
      runtime = await loadMg2RuntimeConfig(entry);
    } catch {
      continue;
    }

    let token = await getMg2Token({
      authApiUrl: runtime.authApiUrl,
      projId: runtime.projId,
      portalUrl: runtime.portalUrl,
    });
    if (!token) {
      token = await getMg2TokenWithCurl({
        portalUrl: runtime.portalUrl,
        authApiUrl: runtime.authApiUrl,
        projId: runtime.projId,
      });
    }
    if (!token) {
      continue;
    }

    const commonHeaders: HeadersInit = {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://mg2.gis-net.co.il',
      Referer: `${runtime.portalUrl}/`,
      'User-Agent': 'Mozilla/5.0',
      Authorization: `Bearer ${token}`,
    };

    const treeResponse = await fetch(
      `${runtime.appApiUrl}GetParcelsTree?block=${encodeURIComponent(gush)}&parcel=${encodeURIComponent(helka)}&projId=${runtime.projId}`,
      {
        cache: 'no-store',
        headers: commonHeaders,
      },
    ).catch(() => null);
    if (treeResponse?.ok) {
      const treeData = (await treeResponse.json()) as Mg2ParcelTreeNode[];
      const treeQid = extractQidFromTree(Array.isArray(treeData) ? treeData : [], gush, helka);
      if (treeQid) {
        return { runtime, seedQid: treeQid };
      }
    }

    const directQids = await resolveQidsViaDirectSearch({
      portalUrl: runtime.portalUrl,
      mapApiUrl: runtime.mapApiUrl,
      appApiUrl: runtime.appApiUrl,
      projId: runtime.projId,
      token,
      gush,
      helka,
    });
    if (directQids.length > 0) {
      return { runtime, seedQid: directQids[0].qId };
    }
  }
  return null;
}

async function buildMg2Document(params: {
  runtime: Mg2CityRuntimeConfig;
  gush: string;
  helka: string;
  seedQid?: string;
}): Promise<RightsDocumentBuildResult> {
  const { runtime, gush, helka, seedQid } = params;

  let token = await getMg2Token({
    authApiUrl: runtime.authApiUrl,
    projId: runtime.projId,
    portalUrl: runtime.portalUrl,
  });
  if (!token) {
    token = await getMg2TokenWithCurl({
      portalUrl: runtime.portalUrl,
      authApiUrl: runtime.authApiUrl,
      projId: runtime.projId,
    });
  }
  if (!token) {
    throw new Error(`Failed to obtain MG2 access token (${runtime.entry.cityPath})`);
  }

  const commonHeaders: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://mg2.gis-net.co.il',
    Referer: `${runtime.portalUrl}/`,
    'User-Agent': 'Mozilla/5.0',
    Authorization: `Bearer ${token}`,
  };

  const treeResponse = await fetch(
    `${runtime.appApiUrl}GetParcelsTree?block=${encodeURIComponent(gush)}&parcel=${encodeURIComponent(helka)}&projId=${runtime.projId}`,
    {
      cache: 'no-store',
      headers: commonHeaders,
    },
  ).catch(() => null);
  const treeData = treeResponse?.ok ? ((await treeResponse.json()) as Mg2ParcelTreeNode[]) : [];
  const treeQid = extractQidFromTree(Array.isArray(treeData) ? treeData : [], gush, helka);

  const sdfQid = await resolveQidViaSdfSearch({
    portalUrl: runtime.portalUrl,
    mapApiUrl: runtime.mapApiUrl,
    appApiUrl: runtime.appApiUrl,
    projId: runtime.projId,
    token,
    gush,
    helka,
  });
  const directQids = await resolveQidsViaDirectSearch({
    portalUrl: runtime.portalUrl,
    mapApiUrl: runtime.mapApiUrl,
    appApiUrl: runtime.appApiUrl,
    projId: runtime.projId,
    token,
    gush,
    helka,
  });
  const mapQid = await resolveQidViaMapSearch({
    portalUrl: runtime.portalUrl,
    mapApiUrl: runtime.mapApiUrl,
    appApiUrl: runtime.appApiUrl,
    projId: runtime.projId,
    token,
    gush,
    helka,
  });

  const qidCandidates = new Map<string, string>();
  if (seedQid) {
    qidCandidates.set(seedQid, helka);
  }
  if (sdfQid?.qId) {
    qidCandidates.set(sdfQid.qId, sdfQid.qNum || helka);
  }
  for (const item of directQids) {
    qidCandidates.set(item.qId, item.qNum || helka);
  }
  if (treeQid) {
    qidCandidates.set(treeQid, helka);
  }
  if (mapQid?.qId) {
    qidCandidates.set(mapQid.qId, mapQid.qNum || helka);
  }
  if (qidCandidates.size === 0) {
    throw new Error(`Could not resolve MG2 qId (${runtime.entry.cityPath})`);
  }

  const reportQueryVariants = buildDoch33QueryVariants({
    projId: runtime.projId,
    gush,
    helka,
    qidCandidates,
  });
  const apiRoot = runtime.appApiUrl.replace(/\/api\/app\/?$/i, '');

  const candidates: Array<{ document: RightsDocumentModel; html: string }> = [];
  for (const query of reportQueryVariants) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reportResponse = await fetch(`${runtime.appApiUrl}GetDoch33Report?${query}`, {
        cache: 'no-store',
        headers: commonHeaders,
      }).catch(() => null);
      if (!reportResponse?.ok) {
        continue;
      }
      const reportFileName = decodeJsonWrappedString(await reportResponse.text());
      if (!reportFileName.endsWith('.html')) {
        continue;
      }
      const reportUrl = `${apiRoot}/TempFiles/${reportFileName}`;
      const reportHtmlResponse = await fetch(reportUrl, {
        cache: 'no-store',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          Referer: `${runtime.portalUrl}/`,
        },
      }).catch(() => null);
      if (!reportHtmlResponse?.ok) {
        continue;
      }
      const rawHtml = await reportHtmlResponse.text();
      if (/waf_reject/i.test(rawHtml)) {
        continue;
      }
      candidates.push({
        document: buildMg2DocumentFromHtml({
          cityKey: runtime.entry.cityKey,
          cityLabel: runtime.entry.cityLabel,
          gush,
          helka,
          reportUrl,
          html: rawHtml,
        }),
        html: rawHtml,
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Failed to download valid MG2 Doch33 HTML report (${runtime.entry.cityPath})`);
  }

  const sorted = candidates
    .slice()
    .sort((a, b) => scoreMg2Candidate(b.document) - scoreMg2Candidate(a.document));
  let richCandidate = sorted.find((item) => hasMg2CoreRights(item.document));
  let best = richCandidate || sorted[0];

  if (!richCandidate) {
    const curlCandidates = await collectMg2CandidatesViaCurl({
      cityKey: runtime.entry.cityKey,
      cityLabel: runtime.entry.cityLabel,
      portalUrl: runtime.portalUrl,
      appApiUrl: runtime.appApiUrl,
      authApiUrl: runtime.authApiUrl,
      mapApiUrl: runtime.mapApiUrl,
      projId: runtime.projId,
      gush,
      helka,
    });
    if (curlCandidates.length > 0) {
      const curlSorted = curlCandidates
        .slice()
        .sort((a, b) => scoreMg2Candidate(b.document) - scoreMg2Candidate(a.document));
      const curlRich = curlSorted.find((item) => hasMg2CoreRights(item.document));
      if (curlRich) {
        richCandidate = curlRich;
        best = curlRich;
      } else if (scoreMg2Candidate(curlSorted[0].document) > scoreMg2Candidate(best.document)) {
        best = curlSorted[0];
      }
    }
  }

  if (!richCandidate) {
    const uiCandidate = await collectMg2CandidateViaUi({
      cityKey: runtime.entry.cityKey,
      cityLabel: runtime.entry.cityLabel,
      portalUrl: runtime.portalUrl,
      gush,
      helka,
    });
    if (uiCandidate) {
      if (hasMg2CoreRights(uiCandidate.document)) {
        richCandidate = uiCandidate;
        best = uiCandidate;
      } else if (scoreMg2Candidate(uiCandidate.document) > scoreMg2Candidate(best.document)) {
        best = uiCandidate;
      }
    }
  }

  if (!richCandidate) {
    best.document.alerts.push({
      type: 'source_warning',
      text: 'MG2 returned partial parcel values; report is generated with limited rights fields.',
    });
  }

  const enriched = await enrichCrossSources(best.document);
  await storeMg2Cache(runtime.entry, gush, helka, best.html);
  return {
    document: enriched,
    html: best.html,
  };
}

async function buildMg2DocumentViaUiOnly(params: {
  entry: Mg2CityRegistryEntry;
  gush: string;
  helka: string;
}): Promise<RightsDocumentBuildResult | null> {
  const candidate = await collectMg2CandidateViaUi({
    cityKey: params.entry.cityKey,
    cityLabel: params.entry.cityLabel,
    portalUrl: `https://mg2.gis-net.co.il/${params.entry.cityPath}Gis`,
    gush: params.gush,
    helka: params.helka,
  });
  if (!candidate) {
    return null;
  }

  const enriched = await enrichCrossSources(candidate.document);
  return {
    document: enriched,
    html: candidate.html,
  };
}

async function buildFallbackRightsDocument(params: FallbackRightsDocumentParams): Promise<RightsDocumentBuildResult> {
  const alerts: RightsDocumentAlert[] = [
    {
      type: 'legal_disclaimer',
      text: 'הנתונים בדוח מידע זה אינפורמטיביים ואינם מחליפים מסמך סטטוטורי מחייב.',
    },
    {
      type: 'source_warning',
      text: params.reason,
    },
  ];

  let mainPlan: string | null = null;
  try {
    const plans = await getTabaPlansByParcelGovMap(params.gush, params.helka);
    const firstPlan = plans.find((item) => String(item.taba_code || '').trim())
      || plans.find((item) => String(item.taba_description || '').trim())
      || null;
    mainPlan = firstPlan ? (String(firstPlan.taba_code || '').trim() || null) : null;
  } catch {
    // Continue with empty fallback.
  }

  const fallbackDoc: RightsDocumentModel = {
    request: {
      city: params.city,
      cityLabel: params.cityLabel,
      gush: params.gush,
      helka: params.helka,
      generatedAt: new Date().toISOString(),
    },
    parcel: {
      address: null,
      areaRegisteredSqm: null,
      mainPlan,
      landUse: null,
    },
    rights: {
      buildingPercent: null,
      maxFloors: null,
      maxBuildableAreaSqm: null,
      allowedUnits: null,
      maxHeightM: null,
      setbackFrontM: null,
      setbackSideM: null,
      setbackRearM: null,
    },
    extraRules: [],
    alerts,
    provenance: [],
    source: {
      provider: 'Fallback parcel report (GovMap/XPlan)',
    },
  };

  const enriched = await enrichCrossSources(fallbackDoc);
  return {
    document: enriched,
    html: renderCanonicalHtml(enriched),
  };
}

function buildMg2CachePath(entry: Mg2CityRegistryEntry, gush: string, helka: string): string {
  return join(process.cwd(), 'output', 'doch33', `Doch33_${entry.cityPath}_${gush}_${helka}.html`);
}

async function loadCachedMg2Document(params: {
  entry: Mg2CityRegistryEntry;
  gush: string;
  helka: string;
}): Promise<RightsDocumentBuildResult | null> {
  const cachePath = buildMg2CachePath(params.entry, params.gush, params.helka);
  try {
    const html = await readFile(cachePath, 'utf-8');
    if (!html || html.length < 500) {
      return null;
    }
    const document = buildMg2DocumentFromHtml({
      cityKey: params.entry.cityKey,
      cityLabel: params.entry.cityLabel,
      gush: params.gush,
      helka: params.helka,
      reportUrl: cachePath,
      html,
    });
    const enriched = await enrichCrossSources(document);
    enriched.alerts.push({
      type: 'source_warning',
      text: 'Using cached MG2 report because live MG2 endpoint is currently unavailable.',
    });
    return { document: enriched, html };
  } catch {
    return null;
  }
}

async function storeMg2Cache(entry: Mg2CityRegistryEntry, gush: string, helka: string, html: string): Promise<void> {
  try {
    const cachePath = buildMg2CachePath(entry, gush, helka);
    await mkdir(join(process.cwd(), 'output', 'doch33'), { recursive: true });
    await writeFile(cachePath, html, 'utf-8');
  } catch {
    // Ignore cache write errors.
  }
}

async function buildTelAvivDocument(gush: string, helka: string): Promise<RightsDocumentBuildResult> {
  const rights = await tlvGetFullBuildingRights({
    gush: Number(gush),
    helka: Number(helka),
  });
  const leadLandUse = rights.landUse.items.find(
    (item) => item.mainLandUse
      || item.buildingPercent != null
      || item.allowedFloors != null
      || item.allowedUnits != null
      || item.rightsArea != null,
  ) || rights.landUse.items[0] || null;

  const newestInForcePlan = rights.cityPlans.items.find((item) => item.statusGeneral === 'בתוקף')
    || rights.cityPlans.items[0]
    || null;

  const document: RightsDocumentModel = {
    request: {
      city: 'tel-aviv',
      cityLabel: 'תל אביב-יפו',
      gush,
      helka,
      generatedAt: new Date().toISOString(),
    },
    parcel: {
      address: rights.address?.address || null,
      areaRegisteredSqm: rights.parcel?.registeredArea ?? null,
      mainPlan: leadLandUse?.definingPlan || newestInForcePlan?.planNumber || null,
      landUse: leadLandUse?.mainLandUse || leadLandUse?.landUse || null,
    },
    rights: {
      buildingPercent: leadLandUse?.buildingPercent != null ? `${leadLandUse.buildingPercent}%` : null,
      maxFloors: leadLandUse?.allowedFloors ?? null,
      maxBuildableAreaSqm: leadLandUse?.rightsArea ?? null,
      allowedUnits: leadLandUse?.allowedUnits ?? null,
      maxHeightM: null,
      setbackFrontM: null,
      setbackSideM: null,
      setbackRearM: null,
    },
    extraRules: [],
    alerts: [
      {
        type: 'legal_disclaimer',
        text: 'הדוח מבוסס על שכבות GIS עירוניות ואינו מחליף מסמך סטטוטורי מחייב.',
      },
    ],
    provenance: [
      {
        field: 'rights.maxFloors',
        source: 'tlv-arcgis',
        locator: 'Layer 514 (LAND_USE)',
        plan: leadLandUse?.definingPlan || undefined,
      },
      {
        field: 'rights.maxBuildableAreaSqm',
        source: 'tlv-arcgis',
        locator: 'Layer 514 (LAND_USE)',
        plan: leadLandUse?.definingPlan || undefined,
      },
    ],
    source: {
      provider: 'Tel Aviv ArcGIS',
      reportUrl: `/api/municipal-rights-report?city=tel-aviv&gush=${encodeURIComponent(gush)}&helka=${encodeURIComponent(helka)}`,
    },
  };

  const enriched = await enrichCrossSources(document);
  return {
    html: renderCanonicalHtml(enriched),
    document: enriched,
  };
}

export async function buildRightsDocument(input: RightsDocumentBuildInput): Promise<RightsDocumentBuildResult> {
  const gush = normalizeDigits(input.gush);
  const helka = normalizeDigits(input.helka);
  if (!gush || !helka) {
    throw new Error('gush and helka must be valid numeric values');
  }

  const cityRaw = String(input.city || '').trim();
  const cityHintRaw = String(input.cityHint || '').trim();
  const normalizedCity = cityRaw
    ? normalizeCity(cityRaw)
    : (cityHintRaw ? normalizeCity(cityHintRaw) : null);

  if (normalizedCity === 'tel-aviv') {
    return buildTelAvivDocument(gush, helka);
  }

  if (normalizedCity) {
    const mg2Entry = getMg2RegistryEntry(normalizedCity);
    if (!mg2Entry) {
      throw new Error(`Unsupported city: ${cityRaw}`);
    }
    try {
      const runtime = await loadMg2RuntimeConfig(mg2Entry);
      return await buildMg2Document({
        runtime,
        gush,
        helka,
      });
    } catch {
      const viaUi = await buildMg2DocumentViaUiOnly({
        entry: mg2Entry,
        gush,
        helka,
      });
      if (viaUi) {
        return viaUi;
      }
      const cached = await loadCachedMg2Document({
        entry: mg2Entry,
        gush,
        helka,
      });
      if (cached) {
        return cached;
      }
      return buildFallbackRightsDocument({
        city: mg2Entry.cityKey,
        cityLabel: mg2Entry.cityLabel,
        gush,
        helka,
        reason: `Live MG2 report is currently unavailable for ${mg2Entry.cityLabel}. Showing fallback data from cross sources.`,
      });
    }
  }

  if (cityRaw) {
    throw new Error(`Unsupported city: ${cityRaw}`);
  }

  const autoResolved = await resolveMg2CityByParcel(gush, helka);
  if (autoResolved) {
    return buildMg2Document({
      runtime: autoResolved.runtime,
      gush,
      helka,
      seedQid: autoResolved.seedQid,
    });
  }

  return buildFallbackRightsDocument({
    city: 'unknown',
    cityLabel: cityHintRaw || 'לא זוהה',
    gush,
    helka,
    reason: cityHintRaw
      ? `Could not auto-detect municipality from MG2 for "${cityHintRaw}" at this time. Showing fallback data from cross sources.`
      : 'Could not auto-detect municipality from MG2 at this time. Showing fallback data from cross sources.',
  });
}
