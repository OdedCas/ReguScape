#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = 'https://mg2.gis-net.co.il';
const DEFAULT_SITE = 'NessZiona';

function usage() {
  console.log(`\nNess Ziona MG2 automatic Doch33 collector\n\nUsage:\n  node scripts/nessziona-auto.js --gush 3636 --helka 208\n  node scripts/nessziona-auto.js --input parcels.csv\n\nOptions:\n  --site <name>       Default: NessZiona\n  --gush <num>        Single parcel gush\n  --helka <num>       Single parcel helka\n  --input <path>      CSV/TXT file with rows: gush,helka\n  --output <dir>      Default: output/doch33\n  --profile <dir>     Default: .pw-nessziona-profile\n  --visible           Show browser window\n  --timeout <ms>      Default: 30000\n\nCSV format example:\n  gush,helka\n  3636,208\n  10780,1\n`);
}

function parseArgs(argv) {
  const out = {
    site: DEFAULT_SITE,
    output: path.resolve(process.cwd(), 'output', 'doch33'),
    profile: path.resolve(process.cwd(), '.pw-nessziona-profile'),
    visible: false,
    timeoutMs: 30000,
    gush: null,
    helka: null,
    input: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === '--help' || key === '-h') {
      out.help = true;
      continue;
    }
    if (key === '--visible') {
      out.visible = true;
      continue;
    }
    if (key === '--site' && next) {
      out.site = String(next).trim();
      i += 1;
      continue;
    }
    if (key === '--gush' && next) {
      out.gush = String(next).replace(/\D/g, '');
      i += 1;
      continue;
    }
    if (key === '--helka' && next) {
      out.helka = String(next).replace(/\D/g, '');
      i += 1;
      continue;
    }
    if (key === '--input' && next) {
      out.input = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (key === '--output' && next) {
      out.output = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (key === '--profile' && next) {
      out.profile = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (key === '--timeout' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        out.timeoutMs = Math.round(parsed);
      }
      i += 1;
      continue;
    }
  }

  return out;
}

function parseParcelFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));

  const parcels = [];
  for (const line of lines) {
    const parts = line.split(/[;,\t ]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) {
      continue;
    }
    const gush = parts[0].replace(/\D/g, '');
    const helka = parts[1].replace(/\D/g, '');

    if (gush.toLowerCase() === 'gush' || helka.toLowerCase() === 'helka') {
      continue;
    }
    if (!gush || !helka) {
      continue;
    }
    parcels.push({ gush, helka });
  }
  return parcels;
}

function buildParcels(args) {
  if (args.input) {
    return parseParcelFile(args.input);
  }
  if (args.gush && args.helka) {
    return [{ gush: args.gush, helka: args.helka }];
  }
  return [];
}

async function closeDialogs(page) {
  const labels = ['אישור', 'לא'];
  for (const label of labels) {
    const btn = page.locator(`button:has-text('${label}')`);
    try {
      if (await btn.count()) {
        await btn.first().click({ timeout: 500 });
      }
    } catch {
      // Ignore.
    }
  }
}

function scoreCandidate(candidate) {
  let score = 0;
  if (candidate.mainPlan) score += 2;
  if (candidate.landUse) score += 2;
  if (candidate.address) score += 1;
  if (candidate.area) score += 1;
  if (candidate.percentRule) score += 2;
  if (candidate.floorsRule) score += 2;
  if (candidate.unitsRule) score += 2;
  return score;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, decimal) => {
      const code = Number(decimal);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function normalizeText(value) {
  return decodeHtml(String(value || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTdValue(html, label) {
  const escaped = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const re = new RegExp(`<td[^>]*>\\s*${escaped}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
  const match = String(html || '').match(re);
  return match ? normalizeText(match[1]) : '';
}

function summarizeDoch33Html(html) {
  return {
    mainPlan: extractTdValue(html, "מס' תוכנית :") || null,
    landUse: extractTdValue(html, 'ייעוד :') || null,
    address: extractTdValue(html, 'כתובת :') || null,
    area: extractTdValue(html, 'שטח מגרש  כולל במ"ר :') || null,
    percentRule: extractTdValue(html, 'סה"כ שטחים למטרות עיקריות (אחוזים)') || null,
    floorsRule: extractTdValue(html, "מס' קומות") || null,
    unitsRule: extractTdValue(html, "מס' יחידות דיור מקסימלי") || null,
  };
}

async function tryClick(locator) {
  try {
    if (await locator.count()) {
      await locator.first().click({ timeout: 2500 });
      return true;
    }
  } catch {
    // Ignore.
  }
  return false;
}

async function getDoch33ViaUiFlow(page, gush, helka, timeoutMs) {
  await closeDialogs(page);

  let ok = await tryClick(page.getByRole('banner').getByText('חיפושים'));
  if (!ok) {
    ok = await tryClick(page.getByText('חיפושים'));
  }
  if (!ok) {
    return { ok: false, error: 'ui: could not open searches panel' };
  }

  await page.waitForTimeout(500);

  let openedSearch = await tryClick(page.getByText('ג גוש חלקה').first());
  if (!openedSearch) {
    openedSearch = await tryClick(page.getByText('גוש חלקה').first());
  }
  if (!openedSearch) {
    return { ok: false, error: 'ui: could not open gush/helka search' };
  }

  await page.waitForTimeout(500);

  const gushInput = page.getByRole('textbox', { name: 'גוש' });
  const helkaInput = page.getByRole('textbox', { name: 'חלקה' });
  if ((await gushInput.count()) === 0 || (await helkaInput.count()) === 0) {
    return { ok: false, error: 'ui: gush/helka inputs not found' };
  }

  await gushInput.first().click();
  await gushInput.first().fill(String(gush));
  await page.waitForTimeout(300);

  // Mimic recorded behavior: select gush suggestion to enable search form.
  for (let i = 0; i < 2; i += 1) {
    try {
      await page.getByText(String(gush), { exact: true }).first().click({ timeout: 1200 });
      await page.waitForTimeout(150);
    } catch {
      break;
    }
  }

  await helkaInput.first().click();
  await helkaInput.first().fill(String(helka));
  await page.waitForTimeout(250);
  try {
    await page.getByText(String(helka), { exact: true }).first().click({ timeout: 1200 });
  } catch {
    // Ignore if no dropdown item.
  }
  await helkaInput.first().click();
  await helkaInput.first().press('Tab').catch(() => {});
  await page.waitForTimeout(250);

  const searchBtn = page.getByRole('button', { name: 'חיפוש' });
  if ((await searchBtn.count()) === 0) {
    return { ok: false, error: 'ui: search button not found' };
  }

  let enabled = false;
  for (let i = 0; i < 10; i += 1) {
    try {
      enabled = await searchBtn.first().isEnabled();
    } catch {
      enabled = false;
    }
    if (enabled) {
      break;
    }
    await page.waitForTimeout(300);
  }
  if (!enabled) {
    return { ok: false, error: 'ui: search button stayed disabled' };
  }

  await searchBtn.first().click({ timeout: 5000 }).catch(() => null);
  await page.waitForTimeout(1800);

  const planningLocators = [
    page.getByText('מ מידע תכנוני'),
    page.getByText('מידע תכנוני'),
    page.locator('text=מידע תכנוני'),
  ];
  let planningClicked = false;
  for (const locator of planningLocators) {
    try {
      if (await locator.count()) {
        await locator.first().dblclick({ timeout: 3500 });
        planningClicked = true;
        break;
      }
    } catch {
      try {
        if (await locator.count()) {
          await locator.first().click({ timeout: 2500 });
          planningClicked = true;
          break;
        }
      } catch {
        // Try next selector.
      }
    }
  }
  if (!planningClicked) {
    return { ok: false, error: 'ui: could not open מידע תכנוני' };
  }

  await page.waitForTimeout(1200);

  const infoLocators = [
    page.getByText('ז דף מידע', { exact: true }),
    page.getByText('דף מידע', { exact: true }),
    page.locator('text=דף מידע'),
  ];

  let popup = null;
  for (const locator of infoLocators) {
    try {
      if ((await locator.count()) === 0) {
        continue;
      }
      const popupPromise = page.waitForEvent('popup', { timeout: 6000 }).catch(() => null);
      await locator.first().click({ timeout: 3000 });
      popup = await popupPromise;
      if (popup) {
        break;
      }
    } catch {
      // Try next selector.
    }
  }

  if (!popup) {
    return { ok: false, error: 'ui: could not click דף מידע / popup did not open' };
  }

  try {
    await popup.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  } catch {
    // Continue; content may still be accessible.
  }
  await popup.waitForTimeout(1200);
  const html = await popup.content();
  const reportUrl = popup.url();
  await popup.close().catch(() => {});

  const summary = summarizeDoch33Html(html);
  const isBlank = !summary.mainPlan && !summary.landUse && !summary.percentRule && !summary.floorsRule && !summary.unitsRule;
  if (isBlank) {
    return {
      ok: false,
      error: 'ui: doch33 html is blank template',
      debug: { reportUrl },
    };
  }

  return {
    ok: true,
    html,
    reportUrl,
    summary,
  };
}

async function getDoch33FromPage(page, siteName, gush, helka, timeoutMs) {
  const portalUrl = `${BASE_URL}/${siteName}Gis/`;
  const result = await page.evaluate(async ({ portalUrl, siteName, gush, helka }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const decodeJsonString = (value) => {
      const raw = String(value || '').replace(/^\uFEFF/, '').trim();
      if (!raw) return '';
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed.trim();
      } catch {
        // ignore
      }
      return raw.replace(/^"+|"+$/g, '').trim();
    };

    const normalizeText = (value) => String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const extractTd = (html, label) => {
      const labelPattern = escapeRegex(String(label).trim()).replace(/\s+/g, '\\s*');
      const re = new RegExp(`<td[^>]*>\\s*${labelPattern}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
      const match = html.match(re);
      return match ? normalizeText(match[1]) : '';
    };

    const getToken = async (authApi, projId) => {
      const fromStorage = localStorage.getItem(`${projId}_access_token`);
      if (fromStorage) return fromStorage;

      const userLoginResponse = await fetch(`${authApi}UserLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: 'Anonymous', userPassword: '', projId }),
      }).catch(() => null);
      if (userLoginResponse?.ok) {
        const token = decodeJsonString(await userLoginResponse.text());
        if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token)) {
          localStorage.setItem(`${projId}_access_token`, token);
          return token;
        }
      }

      const anonResponse = await fetch(`${authApi}AnonymousLogin?projId=${projId}`).catch(() => null);
      if (anonResponse?.ok) {
        const token = decodeJsonString(await anonResponse.text());
        if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token)) {
          localStorage.setItem(`${projId}_access_token`, token);
          return token;
        }
      }

      await sleep(1000);
      return localStorage.getItem(`${projId}_access_token`) || '';
    };

    const appConfigResponse = await fetch(`${portalUrl}assets/appConfig/app.config.json`).catch(() => null);
    if (!appConfigResponse?.ok) {
      return { ok: false, error: `app config failed: ${appConfigResponse?.status || 'no response'}` };
    }

    const appConfig = await appConfigResponse.json();
    const projId = Number(appConfig.projId);
    const appApi = String(appConfig.appApiUrl || '').trim();
    const mapApi = String(appConfig.mapApiUrl || '').trim();
    const authApi = String(appConfig.authApiUrl || '').trim();
    const apiRoot = appApi.replace(/\/api\/app\/?$/i, '');

    if (!projId || !appApi || !mapApi || !authApi) {
      return { ok: false, error: 'missing app config fields' };
    }

    const token = await getToken(authApi, projId);
    if (!token) {
      return { ok: false, error: 'token missing' };
    }

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json;charset=UTF-8',
    };

    const mapInit = await fetch(`${mapApi}FirstLoadingMap`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ projId, mapSession: '', mapName: '' }),
    }).catch(() => null);
    if (!mapInit?.ok) {
      return { ok: false, error: `FirstLoadingMap failed: ${mapInit?.status || 'no response'}` };
    }

    const mapInitData = await mapInit.json();
    const mapSession = String(mapInitData.sessionId || '').trim();
    const mapName = String(mapInitData.mapName || '').trim();
    if (!mapSession || !mapName) {
      return { ok: false, error: 'map session missing' };
    }

    const searchPayload = {
      mapSession,
      mapName,
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
        rows: [{
          title: '',
          fields: [
            {
              fieldId: 3544,
              name: 'Block_No',
              title: 'גוש',
              fieldType: 4,
              fieldUiType: 4,
              value: gush,
              placeholder: 'גוש',
              required: true,
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
              lutKey: 'Block_No',
              lutValue: 'Block_No',
              lutConditionKey: '',
              lutConditionKeyType: 0,
              lutValueType: 4,
              isHorizontalField: true,
              action: 0,
              dataSourceName: 'LU_NESSZIONA',
              isAutoZoom: false,
              fieldLutSource: 'Lut_Parcels',
            },
            {
              fieldId: 3547,
              name: 'Parcel_no',
              title: 'חלקה',
              fieldType: 4,
              fieldUiType: 4,
              value: helka,
              placeholder: 'חלקה',
              required: false,
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
              lutKey: 'Parcel_no',
              lutValue: 'Parcel_no',
              lutConditionKey: 'Block_No',
              lutConditionKeyType: 0,
              lutValueType: 4,
              isHorizontalField: true,
              action: 0,
              dataSourceName: 'LU_NESSZIONA',
              isAutoZoom: false,
              fieldLutSource: 'Lut_Parcels',
            },
          ],
        }],
      },
    };

    const searchResponse = await fetch(`${mapApi}GetObjectsBySearch`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(searchPayload),
    }).catch(() => null);

    let objectId = '';
    let sdfId = '';

    if (searchResponse?.ok) {
      const searchData = await searchResponse.json().catch(() => null);
      const layer = searchData?.layers?.[0];
      const row = layer?.rowItems?.[0];
      objectId = String(layer?.objectId || '');
      const fieldItems = Array.isArray(row?.fieldItems) ? row.fieldItems : [];
      const sdf = fieldItems.find((item) => String(item?.fieldName || '').trim() === 'Autogenerated_SDF_ID');
      sdfId = String(sdf?.fieldValue || '').replace(/\D/g, '');
    }

    const qidCandidates = new Map();

    if (objectId && sdfId) {
      const landUseResponse = await fetch(`${appApi}GetLandUseObj`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          projId,
          mapName,
          mapSession,
          layerName: 'parcels',
          filter: `Autogenerated_SDF_ID=${sdfId}`,
          objectId: Number(objectId),
        }),
      }).catch(() => null);

      if (landUseResponse?.ok) {
        const luData = await landUseResponse.json().catch(() => null);
        const qId = String(luData?.parcelId || luData?.qId || '').replace(/\D/g, '');
        const qNumRaw = String(luData?.parcel || helka);
        const qNum = qNumRaw.replace(/\D/g, '') || helka;
        if (qId) {
          qidCandidates.set(qId, qNum);
        }
      }
    }

    if (qidCandidates.size === 0) {
      return {
        ok: false,
        error: 'no qId candidates from search flow',
        debug: { objectId, sdfId },
      };
    }

    const variants = [];
    for (const [qId, qNum] of qidCandidates.entries()) {
      const qNums = Array.from(new Set([qNum, helka, `${gush}_${helka}`, `${gush}/${helka}`, '']));
      for (const searchBy of ['parcel', 'lot']) {
        for (const qNumVariant of qNums) {
          variants.push({
            qId,
            qNum: qNumVariant,
            searchBy,
          });
        }
      }
    }

    const candidates = [];
    for (const variant of variants) {
      const params = new URLSearchParams({
        qId: String(variant.qId),
        qNum: String(variant.qNum),
        searchBy: String(variant.searchBy),
        ApplicantName: '',
        RequestNumber: '',
        ApplicantAddress: '',
        SumPaid: '',
        OrderNumber: '',
        PaymentDate: '',
        Warning: '0',
        projId: String(projId),
      });

      const reportResponse = await fetch(`${appApi}GetDoch33Report?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/plain, */*',
        },
      }).catch(() => null);

      if (!reportResponse?.ok) {
        continue;
      }

      const reportFile = decodeJsonString(await reportResponse.text());
      if (!reportFile || !reportFile.endsWith('.html')) {
        continue;
      }

      const reportUrl = `${apiRoot}/TempFiles/${reportFile}`;
      const htmlResponse = await fetch(reportUrl).catch(() => null);
      if (!htmlResponse?.ok) {
        continue;
      }

      const html = await htmlResponse.text();
      if (!html || /waf_reject/i.test(html)) {
        continue;
      }

      candidates.push({
        html,
        reportUrl,
        mainPlan: extractTd(html, "מס' תוכנית :"),
        landUse: extractTd(html, 'ייעוד :'),
        address: extractTd(html, 'כתובת :'),
        area: extractTd(html, 'שטח מגרש  כולל במ"ר :'),
        percentRule: extractTd(html, 'סה"כ שטחים למטרות עיקריות (אחוזים)'),
        floorsRule: extractTd(html, "מס' קומות"),
        unitsRule: extractTd(html, "מס' יחידות דיור מקסימלי"),
      });
    }

    if (!candidates.length) {
      return { ok: false, error: 'no doch33 html candidates' };
    }

    return {
      ok: true,
      candidates,
      debug: { qidCandidates: Array.from(qidCandidates.entries()) },
    };
  }, { portalUrl, siteName, gush, helka });

  if (!result || !result.ok) {
    return {
      ok: false,
      error: result?.error || 'unknown error',
      debug: result?.debug || null,
    };
  }

  const best = result.candidates
    .slice()
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];

  if (!best || !best.html) {
    return {
      ok: false,
      error: 'no valid candidate after scoring',
      debug: result.debug || null,
    };
  }

  const isBlank = !best.mainPlan && !best.landUse && !best.percentRule && !best.floorsRule && !best.unitsRule;
  if (isBlank) {
    return {
      ok: false,
      error: 'doch33 html is blank template for this session',
      debug: {
        ...result.debug,
        reportUrl: best.reportUrl,
      },
    };
  }

  return {
    ok: true,
    html: best.html,
    reportUrl: best.reportUrl,
    summary: {
      mainPlan: best.mainPlan || null,
      landUse: best.landUse || null,
      address: best.address || null,
      area: best.area || null,
      percentRule: best.percentRule || null,
      floorsRule: best.floorsRule || null,
      unitsRule: best.unitsRule || null,
    },
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const parcels = buildParcels(args);
  if (!parcels.length) {
    usage();
    process.exit(1);
  }

  fs.mkdirSync(args.output, { recursive: true });
  fs.mkdirSync(args.profile, { recursive: true });

  const context = await chromium.launchPersistentContext(args.profile, {
    headless: !args.visible,
    locale: 'he-IL',
    viewport: { width: 1400, height: 900 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(args.timeoutMs);

    const siteUrl = `${BASE_URL}/${args.site}Gis/`;
    await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
    await page.waitForTimeout(1500);
    await closeDialogs(page);

    const results = [];

    for (let i = 0; i < parcels.length; i += 1) {
      const item = parcels[i];
      const label = `[${i + 1}/${parcels.length}] ${item.gush}/${item.helka}`;
      console.log(`\\n${label}`);

      await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
      await page.waitForTimeout(1200);
      await closeDialogs(page);

      let result = await getDoch33FromPage(page, args.site, item.gush, item.helka, args.timeoutMs);
      if (!result.ok) {
        console.log(`  API FAIL: ${result.error}`);
        if (result.debug) {
          console.log(`  API DEBUG: ${JSON.stringify(result.debug)}`);
        }
        console.log('  trying UI fallback...');
        result = await getDoch33ViaUiFlow(page, item.gush, item.helka, args.timeoutMs);
      }

      if (!result.ok) {
        console.log(`  FAIL: ${result.error}`);
        if (result.debug) {
          console.log(`  DEBUG: ${JSON.stringify(result.debug)}`);
        }
        results.push({ ...item, ok: false, error: result.error, debug: result.debug || null });
        continue;
      }

      const fileName = `Doch33_${args.site}_${item.gush}_${item.helka}.html`;
      const filePath = path.join(args.output, fileName);
      fs.writeFileSync(filePath, result.html, 'utf8');
      console.log(`  OK: ${filePath}`);
      console.log(`  URL: ${result.reportUrl}`);
      console.log(`  mainPlan=${result.summary.mainPlan || '-'} | landUse=${result.summary.landUse || '-'}`);

      results.push({
        ...item,
        ok: true,
        filePath,
        reportUrl: result.reportUrl,
        summary: result.summary,
      });
    }

    const summaryPath = path.join(args.output, `summary_${Date.now()}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf8');

    const successCount = results.filter((r) => r.ok).length;
    console.log(`\\nDone. Success ${successCount}/${results.length}`);
    console.log(`Summary: ${summaryPath}`);
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  const message = String(error?.message || error || '');
  console.error('Fatal error:', message);
  if (message.includes('libnspr4.so')) {
    console.error('');
    console.error('Missing Linux browser libraries for Playwright.');
    console.error('Run one of these and try again:');
    console.error('  sudo npx playwright install-deps chromium');
    console.error('  sudo apt-get install -y libnspr4 libnss3');
  }
  process.exit(1);
});
