# Project Structure

```
src/
├── app/                 # Next.js App Router
│   ├── page.tsx        # Landing page
│   ├── layout.tsx      # Root layout
│   ├── globals.css     # Global styles
│   ├── logs/           # Logs viewer page
│   │   └── page.tsx
│   └── api/            # API routes
│       ├── search/
│       └── logs/
├── services/           # Business logic
│   ├── logger.ts       # Logging system
│   └── govmap.ts       # GovMap API integration
├── components/         # React components
│   ├── SearchForm.tsx
│   └── LogsTable.tsx
├── types/              # TypeScript types
│   └── index.ts
└── tests/              # Jest tests
    └── logger.test.ts
```

## Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm test` - Run Jest tests
- `pnpm lint` - Run linting

## Environment Variables

```bash
# .env.local
GOVMAP_TOKEN=           # GovMap API token (optional)
LOG_LEVEL=debug         # debug | info | warn | error
```
