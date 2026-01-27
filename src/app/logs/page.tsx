'use client';

import { useState, useEffect, useCallback } from 'react';
import LogsTable from '@/components/LogsTable';
import { LogEntry } from '@/types';

interface LogsResponse {
  success: boolean;
  count: number;
  logs: LogEntry[];
  error?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/logs?${params.toString()}`);
      const data: LogsResponse = await response.json();

      if (data.success) {
        setLogs(data.logs);
      } else {
        setError(data.error || 'Failed to fetch logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setIsLoading(false);
    }
  }, [actionFilter, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchLogs]);

  const handleClearLogs = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את כל הלוגים?')) {
      return;
    }

    try {
      const response = await fetch('/api/logs', { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        setLogs([]);
      } else {
        setError(data.error || 'Failed to clear logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear logs');
    }
  };

  // Get unique actions for filter dropdown
  const uniqueActions = Array.from(new Set(logs.map((log) => log.action)));

  return (
    <div className="container">
      <header style={{ marginBottom: '2rem' }}>
        <h1>לוגים</h1>
        <p>מעקב אחרי פעולות המערכת</p>
        <a href="/" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
          חזרה לדף הראשי
        </a>
      </header>

      <div className="card">
        <div className="filters" style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <div>
            <label htmlFor="action-filter" style={{ marginLeft: '0.5rem' }}>
              פעולה:
            </label>
            <select
              id="action-filter"
              className="input"
              style={{ width: 'auto', minWidth: '150px' }}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">הכל</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="status-filter" style={{ marginLeft: '0.5rem' }}>
              סטטוס:
            </label>
            <select
              id="status-filter"
              className="input"
              style={{ width: 'auto', minWidth: '120px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">הכל</option>
              <option value="success">הצלחה</option>
              <option value="error">שגיאה</option>
              <option value="pending">ממתין</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <label htmlFor="auto-refresh">רענון אוטומטי (5 שניות)</label>
          </div>

          <button className="btn" onClick={fetchLogs} disabled={isLoading}>
            {isLoading ? 'טוען...' : 'רענן'}
          </button>

          <button
            className="btn"
            onClick={handleClearLogs}
            style={{ background: 'var(--error)' }}
          >
            נקה לוגים
          </button>
        </div>

        {error && (
          <div className="error" style={{ marginBottom: '1rem' }}>
            שגיאה: {error}
          </div>
        )}

        <div style={{ marginBottom: '1rem', color: '#666' }}>
          סה&quot;כ {logs.length} רשומות
        </div>

        <LogsTable logs={logs} isLoading={isLoading} />
      </div>
    </div>
  );
}
