import { NextResponse } from 'next/server';
import { logger } from '@/services/logger';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const status = searchParams.get('status') as 'success' | 'error' | 'pending' | null;

  let logs = logger.getLogs();

  if (action) {
    logs = logs.filter((log) => log.action === action);
  }

  if (status) {
    logs = logs.filter((log) => log.status === status);
  }

  // Return newest first
  logs = logs.reverse();

  return NextResponse.json({
    success: true,
    count: logs.length,
    logs,
  });
}

export async function DELETE() {
  logger.clearLogs();

  return NextResponse.json({
    success: true,
    message: 'Logs cleared',
  });
}
