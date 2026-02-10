'use client';

import { useState, FormEvent } from 'react';
import type { SearchMode, SearchParams } from '@/types';

interface SearchFormProps {
  onSearch: (params: SearchParams) => void;
  isLoading: boolean;
}

export default function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [mode, setMode] = useState<SearchMode>('address');
  const [addressQuery, setAddressQuery] = useState('');
  const [gush, setGush] = useState('');
  const [helka, setHelka] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'address') {
      onSearch({ mode: 'address', query: addressQuery.trim() });
    } else {
      onSearch({ mode: 'gush-helka', gush: gush.trim(), helka: helka.trim() });
    }
  };

  const isValid = mode === 'address'
    ? addressQuery.trim().length >= 2
    : gush.trim().length > 0 && helka.trim().length > 0;
  const submitLabel = mode === 'address' ? 'חיפוש כתובת' : 'חיפוש גוש/חלקה';

  return (
    <div className="card search-card">
      <div className="search-tabs">
        <button
          type="button"
          className={`search-tab ${mode === 'address' ? 'active' : ''}`}
          onClick={() => setMode('address')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          חיפוש לפי כתובת
        </button>
        <button
          type="button"
          className={`search-tab ${mode === 'gush-helka' ? 'active' : ''}`}
          onClick={() => setMode('gush-helka')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
          חיפוש לפי גוש/חלקה
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'address' ? (
          <div className="form-group">
            <label htmlFor="address">כתובת מלאה</label>
            <input
              id="address"
              className="input"
              type="text"
              placeholder="למשל: רוטשילד 1 תל אביב"
              value={addressQuery}
              onChange={e => setAddressQuery(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
          </div>
        ) : (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="gush">מספר גוש</label>
              <input
                id="gush"
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="למשל: 6166"
                value={gush}
                onChange={e => setGush(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="helka">מספר חלקה</label>
              <input
                id="helka"
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="למשל: 35"
                value={helka}
                onChange={e => setHelka(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn search-btn"
          disabled={!isValid || isLoading}
        >
          {isLoading && <span className="spinner" />}
          {isLoading ? 'מחפש...' : submitLabel}
        </button>
      </form>

      <style jsx>{`
        .search-card {
          padding: 0;
          overflow: hidden;
        }
        .search-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
          padding: 0.9rem;
        }
        .search-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.85rem 0.75rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface);
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 600;
          color: #334155;
          transition: transform 0.15s, background 0.2s, color 0.2s, border-color 0.2s;
        }
        .search-tab.active {
          color: #ffffff;
          border-color: transparent;
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.22);
        }
        .search-tab:hover:not(.active) {
          transform: translateY(-1px);
          border-color: #cbd5e1;
          background: #ffffff;
        }
        form {
          padding: 1.75rem;
        }
        .form-group {
          margin-bottom: 0.5rem;
        }
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text);
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .search-btn {
          width: 100%;
          margin-top: 1.25rem;
          padding: 0.9rem;
          font-size: 1.05rem;
        }
      `}</style>
    </div>
  );
}
