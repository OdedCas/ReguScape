# ReguScape

מערכת לחיפוש מידע תכנוני על נכסים בישראל.

## מטרת המוצר

לאפשר למשתמש לחפש מידע תכנוני על נכס לפי:
- כתובת (עיר, רחוב, מספר בית)
- גוש וחלקה

## מידע שהמערכת מציגה

- פרטי נכס (גוש, חלקה, כתובת)
- תכניות בניין עיר (תב"ע) החלות על הנכס
- זכויות בנייה:
  - שטח בנייה מותר (מ"ר)
  - מספר קומות מותר
  - גובה מבנה מותר
  - קווי בניין

## טכנולוגיות

- Next.js 16 (App Router)
- TypeScript
- Puppeteer (headless browsing)
- Jest (testing)
- pnpm (package manager)

## התקנה

```bash
pnpm install
```

## הרצה

```bash
# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

## טסטים

```bash
pnpm test
```

## למה pnpm?

הפרויקט משתמש ב-pnpm במקום npm בשל אבטחה משופרת. pnpm מציע הגנות טובות יותר נגד פגיעויות בשרשרת האספקה, כולל תיקון ל-[PackageGate vulnerabilities](https://www.koi.ai/blog/packagegate-6-zero-days-in-js-package-managers-but-npm-wont-act).
