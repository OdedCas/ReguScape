import type { TabaInfo } from '@/types';

const TABANOW_BASE_URL = 'https://www.tabanow.co.il';
const TABANOW_SEARCH_PATH = '/%D7%AA%D7%91%D7%A2/%D7%97%D7%99%D7%A4%D7%95%D7%A9';

const DEFAULT_MAX_BLOCK_PAGES = 8;
const DEFAULT_MAX_PLAN_DETAILS = 80;
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

interface TabanowSearchRow {
  locality: string;
  planNumber: string;
  status: string;
  description: string;
  place: string;
  href: string;
}

interface ParcelRow {
  gush: string;
  helkaTokens: string[];
}

interface TabanowPlanDetails {
  takanonUrl?: string;
  lotSizeSqm?: number;
  maxFloors?: number;
  parcelRows: ParcelRow[];
}

function toPositiveInt(raw: string | undefined, fallbackValue: number, maxValue: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return Math.min(Math.floor(parsed), maxValue);
}

function maxBlockPages(): number {
  return toPositiveInt(process.env.TABANOW_MAX_BLOCK_PAGES, DEFAULT_MAX_BLOCK_PAGES, 20);
}

function maxPlanDetails(): number {
  return toPositiveInt(process.env.TABANOW_MAX_PLAN_DETAILS, DEFAULT_MAX_PLAN_DETAILS, 200);
}

function requestTimeoutMs(): number {
  return toPositiveInt(process.env.TABANOW_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, 60000);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&#x27;': "'",
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
  };

  let decoded = value;
  for (const [entity, replacement] of Object.entries(named)) {
    decoded = decoded.split(entity).join(replacement);
  }

  decoded = decoded.replace(/&#(\d+);/g, (_, decimalCode) => {
    const codePoint = Number(decimalCode);
    if (!Number.isFinite(codePoint)) {
      return '';
    }
    return String.fromCodePoint(codePoint);
  });

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hexCode) => {
    const codePoint = Number.parseInt(hexCode, 16);
    if (!Number.isFinite(codePoint)) {
      return '';
    }
    return String.fromCodePoint(codePoint);
  });

  return decoded;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function htmlToText(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(stripTags(value)));
}

function normalizePlanCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function normalizeNumericToken(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  return String(Number(trimmed));
}

function parseTableRows(tableHtml: string): string[] {
  const rows: string[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    rows.push(rowMatch[1]);
  }

  return rows;
}

function parseTableCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let cellMatch: RegExpExecArray | null;

  while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
    cells.push(cellMatch[1]);
  }

  return cells;
}

function extractTableBody(html: string): string {
  const match = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  return match ? match[1] : '';
}

function extractSectionTableByHeading(html: string, headingText: string): string {
  const escapedHeading = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<h3[^>]*>[\\s\\S]*?${escapedHeading}[\\s\\S]*?<\\/h3>\\s*<table[^>]*>([\\s\\S]*?)<\\/table>`,
    'i',
  );
  const match = html.match(regex);
  return match ? match[1] : '';
}

function parseSearchRows(html: string): TabanowSearchRow[] {
  const tableBody = extractTableBody(html);
  if (!tableBody) {
    return [];
  }

  const rows: TabanowSearchRow[] = [];
  for (const rowHtml of parseTableRows(tableBody)) {
    const cells = parseTableCells(rowHtml);
    if (cells.length < 5) {
      continue;
    }

    const linkMatch = cells[1].match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) {
      continue;
    }

    const href = linkMatch[1].trim();
    const planNumber = htmlToText(linkMatch[2]);
    if (!href || !planNumber) {
      continue;
    }

    rows.push({
      locality: htmlToText(cells[0]),
      planNumber,
      status: htmlToText(cells[2]),
      description: htmlToText(cells[3]),
      place: htmlToText(cells[4]),
      href,
    });
  }

  return rows;
}

function parsePaginationMaxPage(html: string): number {
  let maxPage = 1;
  const pageRegex = /[?&]page=(\d+)/g;
  let pageMatch: RegExpExecArray | null;

  while ((pageMatch = pageRegex.exec(html)) !== null) {
    const page = Number(pageMatch[1]);
    if (Number.isFinite(page)) {
      maxPage = Math.max(maxPage, page);
    }
  }

  return maxPage;
}

function buildSearchUrl(params: { number?: string; block?: string; page?: number }): string {
  const url = new URL(TABANOW_SEARCH_PATH, TABANOW_BASE_URL);

  if (params.number) {
    url.searchParams.set('number', params.number);
  }
  if (params.block) {
    url.searchParams.set('block', params.block);
  }
  if (params.page && params.page > 1) {
    url.searchParams.set('page', String(params.page));
  }

  return url.toString();
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs());

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Tabanow returned ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function absoluteUrl(href: string): string {
  return new URL(href, TABANOW_BASE_URL).toString();
}

async function searchRowsByNumber(planNumber: string): Promise<TabanowSearchRow[]> {
  const html = await fetchHtml(buildSearchUrl({ number: planNumber }));
  const rows = parseSearchRows(html);
  if (rows.length === 0) {
    return [];
  }

  const normalizedInput = normalizePlanCode(planNumber);
  const exact = rows.filter((row) => normalizePlanCode(row.planNumber) === normalizedInput);
  return exact.length > 0 ? exact : rows;
}

async function searchRowsByBlock(gush: string): Promise<TabanowSearchRow[]> {
  const firstPageHtml = await fetchHtml(buildSearchUrl({ block: gush }));
  const rows = [...parseSearchRows(firstPageHtml)];

  const totalPages = Math.min(parsePaginationMaxPage(firstPageHtml), maxBlockPages());
  if (totalPages <= 1) {
    return rows;
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const pageHtml = await fetchHtml(buildSearchUrl({ block: gush, page }));
    rows.push(...parseSearchRows(pageHtml));
  }

  return rows;
}

function parseTakanonUrl(html: string): string | undefined {
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*(?:title="([^"]*)")?[^>]*>/g;
  const links: Array<{ href: string; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const title = decodeHtmlEntities(match[2] || '');
    const isTakanon = href.includes('takanon') || title.includes('תקנון');
    if (!isTakanon) {
      continue;
    }
    links.push({ href: absoluteUrl(href), title });
  }

  if (links.length === 0) {
    return undefined;
  }

  const approved = links.find((link) => !link.href.includes('takanonim-h') && !link.title.includes('לא מאושר'));
  return (approved || links[0]).href;
}

function parseHelkaTokens(helkaCellHtml: string): string[] {
  const tokens: string[] = [];
  const spanRegex = /<span([^>]*)>([\s\S]*?)<\/span>/g;
  let match: RegExpExecArray | null;

  while ((match = spanRegex.exec(helkaCellHtml)) !== null) {
    const attr = match[1] || '';
    if (/\bcancelled\b/i.test(attr)) {
      continue;
    }
    const token = htmlToText(match[2]);
    if (token) {
      tokens.push(token);
    }
  }

  if (tokens.length > 0) {
    return tokens;
  }

  const plain = htmlToText(helkaCellHtml);
  if (!plain) {
    return [];
  }

  return plain
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function parseParcelRows(html: string): ParcelRow[] {
  const tableHtml = extractSectionTableByHeading(html, 'גושים וחלקות');
  if (!tableHtml) {
    return [];
  }

  const rows: ParcelRow[] = [];
  for (const rowHtml of parseTableRows(tableHtml)) {
    const cells = parseTableCells(rowHtml);
    if (cells.length < 2) {
      continue;
    }

    const gush = normalizeNumericToken(htmlToText(cells[0]));
    if (!gush) {
      continue;
    }

    const helkaTokens = parseHelkaTokens(cells[1]);
    rows.push({ gush, helkaTokens });
  }

  return rows;
}

function tokenMatchesHelka(token: string, targetHelka: string): boolean {
  const normalizedTarget = normalizeNumericToken(targetHelka);
  const normalizedToken = normalizeWhitespace(token);

  if (normalizedToken.includes('-')) {
    const [startRaw, endRaw] = normalizedToken.split('-').map((value) => value.trim());
    if (!/^\d+$/.test(startRaw) || !/^\d+$/.test(endRaw) || !/^\d+$/.test(normalizedTarget)) {
      return false;
    }
    const start = Number(startRaw);
    const end = Number(endRaw);
    const target = Number(normalizedTarget);
    return target >= Math.min(start, end) && target <= Math.max(start, end);
  }

  return normalizeNumericToken(normalizedToken) === normalizedTarget;
}

function planContainsParcel(details: TabanowPlanDetails, gush: string, helka: string): boolean {
  const normalizedGush = normalizeNumericToken(gush);
  if (!normalizedGush || !helka) {
    return false;
  }

  for (const row of details.parcelRows) {
    if (normalizeNumericToken(row.gush) !== normalizedGush) {
      continue;
    }
    if (row.helkaTokens.some((token) => tokenMatchesHelka(token, helka))) {
      return true;
    }
  }

  return false;
}

function extractMaxFloorsFromText(text: string): number | undefined {
  const values: number[] = [];

  const directionalPattern = /(?:עד|ל-?|ל)\s*(\d{1,2})\s*קומ(?:ה|ות)/g;
  let directionalMatch: RegExpExecArray | null;
  while ((directionalMatch = directionalPattern.exec(text)) !== null) {
    values.push(Number(directionalMatch[1]));
  }

  const genericPattern = /(\d{1,2})\s*קומ(?:ה|ות)/g;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericPattern.exec(text)) !== null) {
    values.push(Number(genericMatch[1]));
  }

  const validValues = values.filter((value) => Number.isFinite(value) && value > 0 && value <= 80);
  if (validValues.length === 0) {
    return undefined;
  }

  return Math.max(...validValues);
}

function extractLotSizeFromText(text: string): number | undefined {
  const values: number[] = [];
  const areaPattern = /(\d{2,7}(?:[.,]\d+)?)\s*מ["״']?ר/g;
  let match: RegExpExecArray | null;

  while ((match = areaPattern.exec(text)) !== null) {
    const normalized = match[1].replace(/,/g, '');
    const value = Number(normalized);
    if (Number.isFinite(value) && value > 0 && value <= 1_000_000) {
      values.push(value);
    }
  }

  if (values.length === 0) {
    return undefined;
  }

  // In most pages the largest sqm number is the most informative summary value.
  return Math.max(...values);
}

function parsePlanDetails(html: string): TabanowPlanDetails {
  const text = htmlToText(html);
  return {
    takanonUrl: parseTakanonUrl(html),
    lotSizeSqm: extractLotSizeFromText(text),
    maxFloors: extractMaxFloorsFromText(text),
    parcelRows: parseParcelRows(html),
  };
}

async function fetchPlanDetails(href: string): Promise<TabanowPlanDetails> {
  const html = await fetchHtml(absoluteUrl(href));
  return parsePlanDetails(html);
}

function buildPlanFromRow(row: TabanowSearchRow, details?: TabanowPlanDetails): TabaInfo {
  return {
    taba_code: row.planNumber,
    taba_description: row.description || row.place || row.planNumber,
    plan_status: row.status || undefined,
    locality: row.locality || undefined,
    place: row.place || undefined,
    takanon_url: details?.takanonUrl,
    plan_page_url: absoluteUrl(row.href),
    lot_size_sqm: details?.lotSizeSqm,
    max_floors: details?.maxFloors,
    source: 'tabanow',
  };
}

function mergePlan(base: TabaInfo, incoming: TabaInfo): TabaInfo {
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

function dedupePlans(plans: TabaInfo[]): TabaInfo[] {
  const byKey = new Map<string, TabaInfo>();
  for (const plan of plans) {
    const keyBase = plan.taba_code || plan.taba_description;
    const key = normalizePlanCode(keyBase || '');
    if (!key) {
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, plan);
    } else {
      byKey.set(key, mergePlan(existing, plan));
    }
  }

  return Array.from(byKey.values());
}

function toSearchFallbackRowsFromPlans(plans: TabaInfo[]): TabanowSearchRow[] {
  return plans
    .filter((plan) => plan.taba_code)
    .map((plan) => ({
      locality: plan.locality || '',
      planNumber: plan.taba_code,
      status: plan.plan_status || '',
      description: plan.taba_description || '',
      place: plan.place || '',
      href: plan.plan_page_url || '',
    }));
}

export async function enrichPlansFromTabanow(
  plans: TabaInfo[],
  gush: string,
  helka: string,
): Promise<TabaInfo[]> {
  const enriched: TabaInfo[] = [];
  const fallbackRows = toSearchFallbackRowsFromPlans(plans);

  for (const plan of plans.slice(0, maxPlanDetails())) {
    const planCode = plan.taba_code?.trim();
    if (!planCode) {
      enriched.push(plan);
      continue;
    }

    try {
      const rows = await searchRowsByNumber(planCode);
      const candidates = rows.length > 0 ? rows : fallbackRows.filter(
        (row) => normalizePlanCode(row.planNumber) === normalizePlanCode(planCode),
      );

      let mergedPlan: TabaInfo = { ...plan };
      let fallbackCandidatePlan: TabaInfo | null = null;
      for (const candidate of candidates) {
        if (!candidate.href) {
          continue;
        }
        const details = await fetchPlanDetails(candidate.href);
        const candidatePlan = buildPlanFromRow(candidate, details);
        if (!fallbackCandidatePlan) {
          fallbackCandidatePlan = candidatePlan;
        }

        // Keep the first matching parcel detail when available.
        if (details.parcelRows.length > 0 && !planContainsParcel(details, gush, helka)) {
          continue;
        }

        mergedPlan = mergePlan(mergedPlan, candidatePlan);
        fallbackCandidatePlan = null;
        break;
      }

      if (fallbackCandidatePlan) {
        mergedPlan = mergePlan(mergedPlan, fallbackCandidatePlan);
      }

      enriched.push(mergedPlan);
    } catch {
      enriched.push(plan);
    }
  }

  return dedupePlans(enriched);
}

export async function findPlansByParcelFromTabanow(gush: string, helka: string): Promise<TabaInfo[]> {
  const rows = await searchRowsByBlock(gush);
  const candidates = rows.slice(0, maxPlanDetails());
  const matchedPlans: TabaInfo[] = [];
  const detailedPlans: TabaInfo[] = [];

  for (const row of candidates) {
    try {
      const details = await fetchPlanDetails(row.href);
      const detailedPlan = buildPlanFromRow(row, details);
      detailedPlans.push(detailedPlan);

      if (!planContainsParcel(details, gush, helka)) {
        continue;
      }
      matchedPlans.push(detailedPlan);
    } catch {
      // Keep collecting from other plans.
    }
  }

  if (matchedPlans.length > 0) {
    return dedupePlans(matchedPlans);
  }

  if (detailedPlans.length > 0) {
    return dedupePlans(detailedPlans);
  }

  // Fallback: if parcel tables were missing, still return the first search rows.
  return dedupePlans(candidates.map((row) => buildPlanFromRow(row)));
}
