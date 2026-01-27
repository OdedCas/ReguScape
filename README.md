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

- Next.js 14 (App Router)
- TypeScript
- Puppeteer (headless browsing)
- Jest (testing)

## התקנה

```bash
npm install
```

## הרצה

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

## טסטים

```bash
npm test
```

## מבנה Branches

- `claude/setup-init-RnKeh` - מבנה בסיסי
- `claude/feature-logging-RnKeh` - מערכת לוגים
- `claude/feature-govmap-api-RnKeh` - חיבור ל-GovMap API
- `claude/feature-plan-list-RnKeh` - הצגת תכניות
- `claude/feature-building-data-RnKeh` - נתוני זכויות בנייה
