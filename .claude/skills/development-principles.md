# Development Principles / עקרונות פיתוח

## Core Rules

1. **No mock data** - If there's no data, display "אין מידע" (no information)
2. **Atomic development** - Each feature in a separate branch with tests
3. **Logging everywhere** - Every action must be logged

## Code Quality

- All TypeScript files must be fully typed
- Never use `any` type
- Interfaces go in `src/types/`
- Follow the logging pattern for all API calls
