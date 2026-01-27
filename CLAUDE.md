# CLAUDE.md - הנחיות לפיתוח

## עקרונות פיתוח

1. **אין נתוני דמו** - אם אין מידע, מציגים "אין מידע"
2. **פיתוח אטומי** - כל פיצ'ר ב-branch נפרד עם טסטים
3. **לוגים בכל מקום** - כל פעולה נרשמת ללוג

## קונבנציות קוד

### TypeScript
- כל קובץ חייב להיות מוקלד (typed)
- לא להשתמש ב-`any`
- interfaces בתיקיית `src/types/`

### שמות קבצים
- קומפוננטות: PascalCase (SearchForm.tsx)
- שירותים: camelCase (logger.ts)
- טסטים: [name].test.ts

### לוגים
כל פונקציה שמבצעת קריאת API או scraping חייבת לרשום לוג:

```typescript
import { logger } from '@/services/logger';

async function searchAddress(address: string) {
  const startTime = Date.now();

  try {
    const result = await api.search(address);
    logger.log({
      action: 'search_address',
      input: { address },
      output: result,
      status: 'success',
      duration: Date.now() - startTime
    });
    return result;
  } catch (error) {
    logger.log({
      action: 'search_address',
      input: { address },
      output: null,
      status: 'error',
      error: error.message,
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

## מבנה תיקיות

```
src/
├── app/                 # Next.js App Router
│   ├── page.tsx        # דף ראשי
│   ├── layout.tsx      # Layout
│   ├── globals.css     # CSS גלובלי
│   ├── logs/           # דף לוגים
│   │   └── page.tsx
│   └── api/            # API routes
│       ├── search/
│       └── logs/
├── services/           # Business logic
│   ├── logger.ts       # מערכת לוגים
│   └── govmap.ts       # GovMap API
├── components/         # UI components
│   ├── SearchForm.tsx
│   └── LogsTable.tsx
├── types/              # TypeScript types
│   └── index.ts
└── tests/              # Jest tests
    └── logger.test.ts
```

## הרצת טסטים

```bash
npm test
```

## משתני סביבה

```bash
# .env.local
GOVMAP_TOKEN=           # Token ל-GovMap API (אופציונלי)
LOG_LEVEL=debug         # debug | info | warn | error
```
