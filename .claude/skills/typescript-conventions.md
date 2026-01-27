# TypeScript Conventions

## File Naming

- Components: PascalCase (`SearchForm.tsx`)
- Services: camelCase (`logger.ts`)
- Tests: `[name].test.ts`

## Type Requirements

- Every file must be fully typed
- Never use `any` - use `unknown` or proper types
- All interfaces belong in `src/types/`
- Export types that are used across modules

## Import Structure

```typescript
// External dependencies first
import { useState } from 'react';

// Internal services
import { logger } from '@/services/logger';

// Types
import type { SearchResult } from '@/types';
```
