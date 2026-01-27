/**
 * TypeScript types for ReguScape
 */

// Log entry
export interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  input: Record<string, unknown>;
  output: unknown;
  status: 'success' | 'error' | 'pending';
  error?: string;
  duration?: number;
}

// Log level
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
