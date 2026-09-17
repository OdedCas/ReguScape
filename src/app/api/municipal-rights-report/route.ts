import { NextRequest, NextResponse } from 'next/server';
import { tlvGetFullBuildingRights } from '@/services/tlv-arcgis';

function normalizeDigits(value: string): string {
  return value.replace(/[^\d]/g, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: Date | null): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

function pdfSafe(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[\\()]/g, '\\$&')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSimplePdf(lines: string[]): Buffer {
  const cleanLines = lines
    .map((line) => pdfSafe(line))
    .filter(Boolean)
    .slice(0, 80);
  const body = cleanLines.map((line) => `(${line}) Tj`).join(' T* ');
  const contentStream = `BT /F1 11 Tf 50 800 Td 14 TL ${body} ET`;

  const objects: string[] = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(contentStream, 'utf8')} >> stream\n${contentStream}\nendstream endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

type TlvRights = Awaited<ReturnType<typeof tlvGetFullBuildingRights>>;
type TlvPlan = TlvRights['cityPlans']['items'][number];

function cleanPlanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizePlanNumber(value: string): string {
  return cleanPlanText(value)
    .replace(/״|"/g, '"')
    .replace(/׳|'/g, "'")
    .replace(/\s+/g, '')
    .toUpperCase();
}

function dedupePlans(plans: TlvPlan[]): TlvPlan[] {
  const byKey = new Map<string, TlvPlan>();
  for (const plan of plans) {
    const num = normalizePlanNumber(plan.planNumber || '');
    const name = cleanPlanText(plan.planName || '');
    if (!num && !name) {
      continue;
    }
    const key = `${num}|${name}`;
    if (!byKey.has(key)) {
      byKey.set(key, plan);
    }
  }
  return Array.from(byKey.values());
}

function isInForce(plan: TlvPlan): boolean {
  return cleanPlanText(plan.statusGeneral || '') === 'בתוקף';
}

function isInPlanning(plan: TlvPlan): boolean {
  return cleanPlanText(plan.statusGeneral || '') === 'בתכנון';
}

function isNationalOrDistrict(plan: TlvPlan): boolean {
  const num = normalizePlanNumber(plan.planNumber || '');
  return /^תמ["']?א/.test(num) || /^תמ["']?מ/.test(num);
}

function isPolicyDoc(plan: TlvPlan): boolean {
  const num = normalizePlanNumber(plan.planNumber || '');
  const name = cleanPlanText(plan.planName || '');
  return /^9\d{2,4}$/.test(num)
    || /מדיניות|נוהל|הנחיות|עקרונות|תקנון|מסמך/.test(name);
}

function classifyPlans(plans: TlvPlan[]): {
  all: TlvPlan[];
  localInForce: TlvPlan[];
  nationalInForce: TlvPlan[];
  planning: TlvPlan[];
  policy: TlvPlan[];
} {
  const all = dedupePlans(plans);
  const localInForce = all.filter((p) => isInForce(p) && !isNationalOrDistrict(p) && !isPolicyDoc(p));
  const nationalInForce = all.filter((p) => isInForce(p) && isNationalOrDistrict(p));
  const planning = all.filter((p) => isInPlanning(p) && !isPolicyDoc(p));
  const policy = all.filter((p) => isPolicyDoc(p));
  return { all, localInForce, nationalInForce, planning, policy };
}

function renderPlansRows(plans: TlvPlan[]): string {
  return plans
    .map((plan, idx) => {
      const planNumber = cleanPlanText(plan.planNumber || '');
      const planName = cleanPlanText(plan.planName || '');
      const status = cleanPlanText(plan.statusGeneral || plan.status || '');
      const validDate = formatDate(plan.validDate);
      const depositDate = formatDate(plan.depositDate);
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(planNumber)}</td>
        <td>${escapeHtml(planName)}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(validDate)}</td>
        <td>${escapeHtml(depositDate)}</td>
      </tr>`;
    })
    .join('');
}

function renderPlansSection(title: string, plans: TlvPlan[], emptyText: string): string {
  const rows = renderPlansRows(plans);
  return `<h2>${escapeHtml(title)}</h2>
  <table>
    <thead>
      <tr><th>#</th><th>מספר תוכנית</th><th>שם תוכנית</th><th>סטטוס</th><th>תוקף</th><th>הפקדה</th></tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6">${escapeHtml(emptyText)}</td></tr>`}</tbody>
  </table>`;
}

function buildHtmlReport(params: {
  gush: string;
  helka: string;
  generatedAt: string;
  rights: TlvRights;
}): string {
  const { gush, helka, generatedAt, rights } = params;
  const classified = classifyPlans(rights.cityPlans.items);
  const landUseRows = rights.landUse.items
    .slice(0, 60)
    .map((item, idx) => (
      `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.mainLandUse || '')}</td>
        <td>${escapeHtml(item.landUse || '')}</td>
        <td>${item.rightsArea ?? ''}</td>
        <td>${item.buildingPercent ?? ''}</td>
        <td>${item.allowedFloors ?? ''}</td>
        <td>${item.allowedUnits ?? ''}</td>
        <td>${escapeHtml(item.definingPlan || '')}</td>
      </tr>`
    )).join('');

  const permitRows = rights.permits.items
    .slice(0, 120)
    .map((item, idx) => (
      `<tr>
        <td>${idx + 1}</td>
        <td>${item.permitNumber ?? ''}</td>
        <td>${item.requestNumber ?? ''}</td>
        <td>${escapeHtml(item.requestType || '')}</td>
        <td>${escapeHtml(item.addresses || '')}</td>
        <td>${escapeHtml(formatDate(item.permitDate))}</td>
      </tr>`
    )).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>זכויות בנייה - גוש ${escapeHtml(gush)} חלקה ${escapeHtml(helka)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    h2 { margin: 22px 0 8px; font-size: 18px; border-top: 2px solid #9ca3af; padding-top: 10px; }
    .meta { color: #4b5563; margin-bottom: 14px; }
    .actions { margin: 10px 0 16px; }
    .actions button { background: #0f766e; color: #fff; border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: right; vertical-align: top; }
    th { background: #f9fafb; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(140px, 1fr)); gap: 10px; margin: 10px 0 16px; }
    .chip { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; background: #fff; }
    .chip .label { display: block; color: #6b7280; font-size: 12px; margin-bottom: 4px; }
    .chip .value { display: block; font-size: 16px; font-weight: 700; }
    @media print { .actions { display: none; } }
  </style>
</head>
<body>
  <h1>מידע תכנוני וזכויות בנייה</h1>
  <div class="meta">
    רשות: תל אביב-יפו | גוש: ${escapeHtml(gush)} | חלקה: ${escapeHtml(helka)}<br/>
    הופק: ${escapeHtml(generatedAt)} | מקור: ArcGIS עירוני (IView2) | דוח הנדסי (ללא נוסח משפטי)
  </div>
  <div class="actions"><button onclick="window.print()">הדפסה / שמירה ל-PDF</button></div>
  <div class="grid">
    <div class="chip"><span class="label">תוכניות חופפות (סה"כ)</span><span class="value">${classified.all.length}</span></div>
    <div class="chip"><span class="label">תוכניות מקומיות בתוקף</span><span class="value">${classified.localInForce.length}</span></div>
    <div class="chip"><span class="label">תוכניות ארציות/מחוזיות בתוקף</span><span class="value">${classified.nationalInForce.length}</span></div>
    <div class="chip"><span class="label">תוכניות בתכנון</span><span class="value">${classified.planning.length}</span></div>
    <div class="chip"><span class="label">מסמכי מדיניות</span><span class="value">${classified.policy.length}</span></div>
    <div class="chip"><span class="label">היתרים/בקשות</span><span class="value">${rights.permits.count}</span></div>
    <div class="chip"><span class="label">רשומות ייעוד</span><span class="value">${rights.landUse.count}</span></div>
    <div class="chip"><span class="label">שטח רשום (מ"ר)</span><span class="value">${rights.parcel?.registeredArea ?? ''}</span></div>
    <div class="chip"><span class="label">שטח גרפי (מ"ר)</span><span class="value">${rights.parcel?.graphicArea ?? ''}</span></div>
  </div>

  ${renderPlansSection('תוכניות מקומיות בתוקף', classified.localInForce, 'לא נמצאו תוכניות מקומיות בתוקף')}
  ${renderPlansSection('תוכניות ארציות/מחוזיות בתוקף', classified.nationalInForce, 'לא נמצאו תוכניות ארציות/מחוזיות בתוקף')}
  ${renderPlansSection('תוכניות בתכנון', classified.planning, 'לא נמצאו תוכניות בתכנון')}
  ${renderPlansSection('מסמכי מדיניות', classified.policy, 'לא נמצאו מסמכי מדיניות')}

  <h2>ייעודי קרקע וזכויות</h2>
  <table>
    <thead>
      <tr><th>#</th><th>ייעוד עיקרי</th><th>ייעוד</th><th>שטח זכויות</th><th>% בניה</th><th>קומות</th><th>יח"ד</th><th>תב"ע מגדירה</th></tr>
    </thead>
    <tbody>${landUseRows || '<tr><td colspan="8">לא נמצאו רשומות</td></tr>'}</tbody>
  </table>

  <h2>היתרי בנייה / בקשות</h2>
  <table>
    <thead>
      <tr><th>#</th><th>מספר היתר</th><th>מספר בקשה</th><th>סוג בקשה</th><th>כתובת</th><th>תאריך היתר</th></tr>
    </thead>
    <tbody>${permitRows || '<tr><td colspan="6">לא נמצאו היתרים</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const city = (searchParams.get('city') || '').trim().toLowerCase();
  const gush = normalizeDigits(searchParams.get('gush') || '');
  const helka = normalizeDigits(searchParams.get('helka') || '');
  const format = (searchParams.get('format') || 'html').trim().toLowerCase();
  const download = searchParams.get('download') === '1';

  if (!gush || !helka) {
    return NextResponse.json({ error: 'יש לספק gush ו-helka' }, { status: 400 });
  }
  if (city !== 'tel-aviv' && city !== 'telaviv' && city !== 'tlv') {
    return NextResponse.json({ error: 'נתמך כרגע רק city=tel-aviv' }, { status: 400 });
  }

  try {
    const rights = await tlvGetFullBuildingRights({ gush: Number(gush), helka: Number(helka) });
    const generatedAt = formatDate(new Date());
    const classified = classifyPlans(rights.cityPlans.items);
    const baseName = `${new Date().getFullYear()}${new Date().getMonth() + 1}${new Date().getDate()}${gush}${helka}_zchuyot`;

    if (format === 'pdf') {
      const leadLandUse = rights.landUse.items[0];
      const lines = [
        'Building Rights Report - Tel Aviv-Yafo',
        `Parcel: Gush ${gush}, Helka ${helka}`,
        `Generated: ${generatedAt}`,
        '',
        `Total plans: ${classified.all.length}`,
        `Local in force: ${classified.localInForce.length}`,
        `National/District in force: ${classified.nationalInForce.length}`,
        `Plans in planning: ${classified.planning.length}`,
        `Policy docs: ${classified.policy.length}`,
        `Permits / requests: ${rights.permits.count}`,
        `Land-use records: ${rights.landUse.count}`,
        '',
        `Registered area sqm: ${rights.parcel?.registeredArea ?? ''}`,
        `Graphic area sqm: ${rights.parcel?.graphicArea ?? ''}`,
        '',
        `Main land use: ${leadLandUse?.mainLandUse || ''}`,
        `Rights area: ${leadLandUse?.rightsArea ?? ''}`,
        `Building percent: ${leadLandUse?.buildingPercent ?? ''}`,
        `Allowed floors: ${leadLandUse?.allowedFloors ?? ''}`,
        `Allowed units: ${leadLandUse?.allowedUnits ?? ''}`,
      ];
      const pdf = buildSimplePdf(lines);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
        },
      });
    }

    const html = buildHtmlReport({ gush, helka, generatedAt, rights });
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(download ? { 'Content-Disposition': `attachment; filename="${baseName}.html"` } : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא צפויה';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
