# Logging Requirements

Every function that performs API calls or scraping must log with this pattern:

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

## Log Entry Fields

- `action`: Name of the operation
- `input`: Input parameters
- `output`: Result or null on error
- `status`: 'success' | 'error'
- `duration`: Time in milliseconds
- `error`: Error message (only on failure)
