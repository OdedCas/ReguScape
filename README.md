# ReguScape

מערכת לחיפוש מידע תכנוני על נכסים בישראל.

## מטרת המוצר

לאפשר למשתמש לחפש מידע תכנוני על נכס לפי:
- כתובת (עיר, רחוב, מספר בית)
- גוש וחלקה

## מידע שהמערכת מציגה

- פרטי נכס (גוש, חלקה, כתובת)
- תכניות בניין עיר (תב"ע) החלות על הנכס
- קישורי תקנון לכל תוכנית (כאשר זמין)
- זכויות בנייה: שטח מותר, מספר קומות, גובה מבנה, קווי בניין

## הרצה

```bash
pnpm install
pnpm dev
```

## הגדרת API לסקרייפר

צור קובץ `.env.local` לפי `.env.example` והגדר:

```bash
SCRAPER_API_BASE_URL=...
SCRAPER_API_KEY=...
```

אופציונלי (אם שמות הנתיבים שונים):

```bash
SCRAPER_PARCEL_FROM_ADDRESS_PATH=/get_parcel_from_address
SCRAPER_ADDRESS_FROM_PARCEL_PATH=/get_address_from_parcel
```

המערכת מבצעת גם העשרת תוכניות דרך `tabanow.co.il` (כולל קישורי תקנון ותוספת נתונים מתיאורי תוכניות) כאשר הנתונים אינם מלאים.

ניתן לכוון גבולות סריקה ב-`.env.local`:

```bash
TABANOW_MAX_BLOCK_PAGES=8
TABANOW_MAX_PLAN_DETAILS=80
TABANOW_REQUEST_TIMEOUT_MS=12000
```

## רישיון

MIT
