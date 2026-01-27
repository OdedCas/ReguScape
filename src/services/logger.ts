/**
 * Logging service for ReguScape
 * Logs all API calls and scraping operations for PM tracking
 */

import { LogEntry, LogLevel } from '@/types';
import * as fs from 'fs';
import * as path from 'path';

// In-memory log storage (for API access)
let logEntries: LogEntry[] = [];

// File path for persistent storage
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'reguscape.log');

// Current log level from environment
const currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';

// Log level priority
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Generate unique ID for log entries
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format timestamp for log display
 */
function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Ensure log directory exists
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Write log entry to file
 */
function writeToFile(entry: LogEntry): void {
  try {
    ensureLogDir();
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(LOG_FILE, logLine, 'utf-8');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

/**
 * Check if a log level should be logged based on current level
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * Main log function
 */
export interface LogParams {
  action: string;
  input: Record<string, unknown>;
  output: unknown;
  status: 'success' | 'error' | 'pending';
  error?: string;
  duration?: number;
  level?: LogLevel;
}

export function log(params: LogParams): LogEntry {
  const level = params.level || 'info';

  const entry: LogEntry = {
    id: generateId(),
    timestamp: formatTimestamp(new Date()),
    action: params.action,
    input: params.input,
    output: params.output,
    status: params.status,
    error: params.error,
    duration: params.duration,
  };

  // Add to in-memory storage
  logEntries.push(entry);

  // Keep only last 1000 entries in memory
  if (logEntries.length > 1000) {
    logEntries = logEntries.slice(-1000);
  }

  // Write to file if level is high enough
  if (shouldLog(level)) {
    writeToFile(entry);

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = params.status === 'error' ? console.error : console.log;
      consoleMethod(`[${entry.timestamp}] ${entry.action} - ${entry.status}`, {
        input: entry.input,
        output: entry.output,
        duration: entry.duration ? `${entry.duration}ms` : undefined,
        error: entry.error,
      });
    }
  }

  return entry;
}

/**
 * Get all logs from memory
 */
export function getLogs(): LogEntry[] {
  return [...logEntries];
}

/**
 * Get logs filtered by action
 */
export function getLogsByAction(action: string): LogEntry[] {
  return logEntries.filter((entry) => entry.action === action);
}

/**
 * Get logs filtered by status
 */
export function getLogsByStatus(status: 'success' | 'error' | 'pending'): LogEntry[] {
  return logEntries.filter((entry) => entry.status === status);
}

/**
 * Get logs from a specific time range
 */
export function getLogsByTimeRange(startTime: Date, endTime: Date): LogEntry[] {
  const start = startTime.toISOString();
  const end = endTime.toISOString();
  return logEntries.filter(
    (entry) => entry.timestamp >= start && entry.timestamp <= end
  );
}

/**
 * Clear all logs from memory (useful for testing)
 */
export function clearLogs(): void {
  logEntries = [];
}

/**
 * Read logs from file
 */
export function readLogsFromFile(): LogEntry[] {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    return lines.map((line) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    }).filter((entry): entry is LogEntry => entry !== null);
  } catch (error) {
    console.error('Failed to read log file:', error);
    return [];
  }
}

/**
 * Export logger object for convenience
 */
export const logger = {
  log,
  getLogs,
  getLogsByAction,
  getLogsByStatus,
  getLogsByTimeRange,
  clearLogs,
  readLogsFromFile,
};

export default logger;
