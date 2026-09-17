# ReguScape

מערכת לחיפוש מידע תכנוני על נכסים בישראל.

## מטרת המוצר

לאפשר למשתמש לחפש מידע תכנוני על נכס לפי:
- כתובת (עיר, רחוב, מספר בית)
- גוש וחלקה

## מידע שהמערכת מציגה

- **פרטי נכס** — גוש, חלקה, כתובת, קואורדינטות
- **שכבות תכנון** — נתונים מ-6 שכבות תכנון ב-GovMap (תב"ע, קווים כחולים, יעודי קרקע, תוכניות בהכנה, ועוד)
- **תכניות תב"א** — תכנית אב ומתאר שחלות על החלקה
- **תוכניות בניין עיר** (תב"ע) החלות על הנכס
- **זכויות בנייה** — שטח מותר, מספר קומות
- **מידע רישומי** (מבא"ת) — קוד שימוש ורישום
- **קישורים חיצוניים** — GovMap, iPlan, TabaSearch

## הרצה

```bash
pnpm install
pnpm dev
```

פתח [http://localhost:3000](http://localhost:3000).

## ארכיטקטורה

המערכת משתמשת ישירות ב-API הפנימי של GovMap:

1. **Geocoding** — `/api/search-service/autocomplete` לקואורדינטות מדויקות (EPSG:3857)
2. **זיהוי חלקה** — שאילתת WFS נקודתית על `layer_parcel_all`
3. **נתוני תכנון** — Pipeline מדויק: WFS centroid → 6 שכבות תכנון → taba/radius
4. **העשרה** — קריאות מקבילות ל-taba-info, building-regulations, parcel-info, planning-info

## API Endpoints

| Endpoint | Method | תיאור |
|----------|--------|-------|
| `/api/search` | POST | חיפוש כתובת או גוש/חלקה |
| `/api/planning-info?gush=X&helka=Y` | GET | 6 שכבות תכנון + תכניות תב"א |
| `/api/taba-info?gush=X&helka=Y` | GET | תוכניות תב"ע |
| `/api/building-regulations?gush=X&helka=Y` | GET | זכויות בנייה |
| `/api/land-plot-identifiers` | GET | כתובת ↔ חלקה |
| `/api/parcel-info?gush=X&helka=Y` | GET | מידע רישומי מבא"ת |
| `/api/xplan-query?...` | GET | שאילתת XPLAN לפי מספר תוכנית / נקודה / גוש-חלקה |

## תבניות XPLAN (קווים כחולים)

ReguScape מציג בתוצאות החיפוש כרטיס `תבניות שאילתא ל-XPLAN` עם קישורים מוכנים:

- שאילתא לפי מספר תוכנית (כולל 77/78)
- שאילתא מרחבית לפי נקודה (ITM X/Y)
- תבנית WFS לאיתור חלקה לפי גוש/חלקה

התבניות משתמשות בבסיסים הבאים:

- אתר: `https://ags.iplan.gov.il/xplan/`
- שירות תוכניות: `https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/xplan_without_77_78/MapServer/1/query`
- שירות 77/78: `https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan_77_78/MapServer/1/query`
- WFS חלקות: `https://open.govmap.gov.il/geoserver/opendata/wfs`

## XPLAN API פנימי

`/api/xplan-query` מחזיר JSON מנורמל מתוך XPLAN.

פרמטרים:

- `plan_number=...` לחיפוש לפי מספר תוכנית
- `x=...&y=...` לחיפוש מרחבי לפי נקודה (ITM / EPSG:2039)
- `gush=...&helka=...` לחיפוש לפי חלקה (המערכת פותרת נקודה דרך WFS)
- `include_77_78=true|false` (ברירת מחדל: `true`)
- `limit=1..200` (ברירת מחדל: `20`)

דוגמאות:

- `/api/xplan-query?plan_number=תתל/99`
- `/api/xplan-query?x=178337&y=663391&include_77_78=false`
- `/api/xplan-query?gush=6166&helka=35&limit=50`

## הגדרות סביבה (אופציונלי)

```bash
GOVMAP_TOKEN=...              # טוקן GovMap לשרת (רוב ה-APIs עובדים בלי)
NEXT_PUBLIC_GOVMAP_TOKEN=...  # טוקן GovMap ל-embed JS רשמי בצד לקוח
LOG_LEVEL=info                # debug|info|warn|error
TABANOW_MAX_BLOCK_PAGES=8
TABANOW_MAX_PLAN_DETAILS=80
```

אם מוגדר `NEXT_PUBLIC_GOVMAP_TOKEN`, ReguScape מציג כפתור `הצגת GovMap משובץ` בכרטיס התוצאה.
ה-embed משתמש ב-JS API הרשמי של GovMap ואינו מחליף את ה-pipeline השרת-צדדי הקיים.

## טכנולוגיות

- Next.js 16 (App Router)
- React 18
- TypeScript
- GovMap APIs (autocomplete, WFS, entitiesByPoint, taba)
- Styled JSX

## רישיון

MIT
