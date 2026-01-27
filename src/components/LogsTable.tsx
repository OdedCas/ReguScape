'use client';

import { LogEntry } from '@/types';

interface LogsTableProps {
  logs: LogEntry[];
  isLoading: boolean;
}

export default function LogsTable({ logs, isLoading }: LogsTableProps) {
  if (isLoading) {
    return <div className="card">טוען לוגים...</div>;
  }

  if (logs.length === 0) {
    return <div className="card">אין לוגים להצגה</div>;
  }

  return (
    <div className="logs-table-container">
      <table className="logs-table">
        <thead>
          <tr>
            <th>זמן</th>
            <th>פעולה</th>
            <th>סטטוס</th>
            <th>קלט</th>
            <th>פלט</th>
            <th>משך (ms)</th>
            <th>שגיאה</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className={`log-row log-${log.status}`}>
              <td className="log-timestamp">
                {new Date(log.timestamp).toLocaleString('he-IL')}
              </td>
              <td className="log-action">{log.action}</td>
              <td className="log-status">
                <span className={`status-badge status-${log.status}`}>
                  {log.status === 'success' && 'הצלחה'}
                  {log.status === 'error' && 'שגיאה'}
                  {log.status === 'pending' && 'ממתין'}
                </span>
              </td>
              <td className="log-data">
                <pre>{JSON.stringify(log.input, null, 2)}</pre>
              </td>
              <td className="log-data">
                <pre>
                  {log.output != null
                    ? JSON.stringify(log.output, null, 2).substring(0, 200)
                    : '-'}
                  {log.output != null && JSON.stringify(log.output).length > 200 ? '...' : ''}
                </pre>
              </td>
              <td className="log-duration">
                {log.duration !== undefined ? log.duration : '-'}
              </td>
              <td className="log-error">
                {log.error || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .logs-table-container {
          overflow-x: auto;
        }

        .logs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .logs-table th,
        .logs-table td {
          padding: 0.75rem;
          text-align: right;
          border-bottom: 1px solid var(--border);
        }

        .logs-table th {
          background: #f9fafb;
          font-weight: 600;
        }

        .log-row.log-error {
          background: #fef2f2;
        }

        .log-row.log-success {
          background: #f0fdf4;
        }

        .log-timestamp {
          white-space: nowrap;
          font-family: monospace;
        }

        .log-action {
          font-weight: 500;
        }

        .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
        }

        .status-success {
          background: #dcfce7;
          color: #166534;
        }

        .status-error {
          background: #fee2e2;
          color: #991b1b;
        }

        .status-pending {
          background: #fef3c7;
          color: #92400e;
        }

        .log-data pre {
          margin: 0;
          font-size: 0.75rem;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .log-duration {
          font-family: monospace;
        }

        .log-error {
          color: var(--error);
          max-width: 200px;
        }
      `}</style>
    </div>
  );
}
