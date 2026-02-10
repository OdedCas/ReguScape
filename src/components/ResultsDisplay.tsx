'use client';

import type { EnrichedSearchResult } from '@/types';

interface ResultsDisplayProps {
  result: EnrichedSearchResult | null;
}

export default function ResultsDisplay({ result }: ResultsDisplayProps) {
  if (!result) return null;

  const { location, govmapUrl, searchDuration, landPlot, plans, regulations, parcelRegistration, parcelUsageCode, externalLinks } = result;

  return (
    <div className="results">
      {/* Location Card */}
      <div className="card result-card">
        <div className="result-header">
          <div className="result-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div>
            <h2>{location.label}</h2>
            <span className="meta">חיפוש הושלם ב-{searchDuration}ms</span>
          </div>
        </div>

        <div className="info-grid">
          {location.gush && (
            <div className="info-chip">
              <span className="chip-label">גוש</span>
              <span className="chip-value">{location.gush}</span>
            </div>
          )}
          {location.helka && (
            <div className="info-chip">
              <span className="chip-label">חלקה</span>
              <span className="chip-value">{location.helka}</span>
            </div>
          )}
          {location.x !== 0 && location.y !== 0 && (
            <>
              <div className="info-chip">
                <span className="chip-label">X (ITM)</span>
                <span className="chip-value">{Math.round(location.x)}</span>
              </div>
              <div className="info-chip">
                <span className="chip-label">Y (ITM)</span>
                <span className="chip-value">{Math.round(location.y)}</span>
              </div>
            </>
          )}
        </div>

        {/* Additional addresses from land plot */}
        {landPlot && landPlot.addresses.length > 1 && (
          <div className="addresses-section">
            <span className="section-label">כתובות נוספות</span>
            <div className="addresses-list">
              {landPlot.addresses.slice(1).map((addr, i) => (
                <span key={i} className="address-tag">{addr}</span>
              ))}
            </div>
          </div>
        )}

        <a href={govmapUrl} target="_blank" rel="noopener noreferrer" className="govmap-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          {`פתח ב-GovMap עם שכבת תב"ע`}
        </a>

        {!location.gush && location.x !== 0 && (
          <p className="gush-note">מידע על גוש וחלקה זמין דרך הקישור ל-GovMap</p>
        )}
      </div>

      {/* TABA Plans Card */}
      {plans.length > 0 && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon taba-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h2>{`תוכניות תב"ע קשורות (${plans.length})`}</h2>
            </div>
          </div>

          <div className="plans-list">
            {plans.map((plan, index) => (
              <div key={`${plan.planNumber}-${index}`} className="plan-item">
                <div className="plan-header">
                  <span className="plan-number">{plan.planNumber}</span>
                  {plan.planType && <span className="plan-type">{plan.planType}</span>}
                </div>
                <div className="plan-name">{plan.planName}</div>
                {plan.planStatus && <div className="plan-meta">סטטוס: {plan.planStatus}</div>}
                {plan.authority && <div className="plan-meta">רשות: {plan.authority}</div>}
                {plan.locality && <div className="plan-meta">יישוב: {plan.locality}</div>}
                {plan.place && <div className="plan-meta">מיקום: {plan.place}</div>}
                {(plan.lotSizeSqm || plan.maxFloors || plan.maxBuildableAreaSqm) && (
                  <div className="plan-values">
                    {plan.lotSizeSqm && plan.lotSizeSqm > 0 && (
                      <span className="plan-value">{`שטח: ${plan.lotSizeSqm} מ"ר`}</span>
                    )}
                    {plan.maxFloors && plan.maxFloors > 0 && (
                      <span className="plan-value">{`קומות: ${plan.maxFloors}`}</span>
                    )}
                    {plan.maxBuildableAreaSqm && plan.maxBuildableAreaSqm > 0 && (
                      <span className="plan-value">{`בנייה מותרת: ${plan.maxBuildableAreaSqm} מ"ר`}</span>
                    )}
                  </div>
                )}
                {(plan.takanonUrl || plan.planPageUrl) && (
                  <div className="plan-actions">
                    {plan.takanonUrl && (
                      <a
                        href={plan.takanonUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="plan-link"
                      >
                        תקנון
                      </a>
                    )}
                    {plan.planPageUrl && (
                      <a
                        href={plan.planPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="plan-link plan-link-secondary"
                      >
                        עמוד תוכנית
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {(externalLinks?.govmapTabaUrl || externalLinks?.iplanUrl) && (
            <div className="external-links">
              {externalLinks.govmapTabaUrl && (
                <a href={externalLinks.govmapTabaUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn taba-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  {`צפייה בתב"ע ב-GovMap`}
                </a>
              )}
              {externalLinks.iplanUrl && (
                <a href={externalLinks.iplanUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn iplan-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  חיפוש תוכניות ב-iPlan
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {plans.length === 0 && (location.gush || location.helka) && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon taba-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h2>{`תוכניות תב"ע`}</h2>
            </div>
          </div>
          <div className="no-plans-message">
            {`ניתן לצפות בתוכניות תב"ע דרך הקישורים הבאים`}
          </div>
          {(externalLinks?.govmapTabaUrl || externalLinks?.iplanUrl) && (
            <div className="external-links">
              {externalLinks.govmapTabaUrl && (
                <a href={externalLinks.govmapTabaUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn taba-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  {`צפייה בתב"ע ב-GovMap`}
                </a>
              )}
              {externalLinks.iplanUrl && (
                <a href={externalLinks.iplanUrl} target="_blank" rel="noopener noreferrer" className="external-link-btn iplan-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  חיפוש תוכניות ב-iPlan
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Building Regulations Card */}
      {regulations && (regulations.max_floors > 0 || regulations.max_buildable_area_sqm > 0) && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon regs-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                <line x1="9" y1="6" x2="9" y2="6.01"/>
                <line x1="15" y1="6" x2="15" y2="6.01"/>
                <line x1="9" y1="10" x2="9" y2="10.01"/>
                <line x1="15" y1="10" x2="15" y2="10.01"/>
                <line x1="9" y1="14" x2="9" y2="14.01"/>
                <line x1="15" y1="14" x2="15" y2="14.01"/>
                <line x1="9" y1="18" x2="15" y2="18"/>
              </svg>
            </div>
            <div>
              <h2>זכויות בנייה</h2>
            </div>
          </div>

          <div className="regs-grid">
            {regulations.max_floors > 0 && (
              <div className="reg-card">
                <span className="reg-number">{regulations.max_floors}</span>
                <span className="reg-label">קומות מקסימום</span>
              </div>
            )}
            {regulations.max_buildable_area_sqm > 0 && (
              <div className="reg-card">
                <span className="reg-number">{regulations.max_buildable_area_sqm}</span>
                <span className="reg-label">{`מ"ר שטח בנייה`}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parcel Registration & Usage Code Card */}
      {(parcelRegistration || parcelUsageCode) && (
        <div className="card result-card">
          <div className="result-header">
            <div className="result-icon mavat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <div>
              <h2>מידע רישומי (מבא&quot;ת)</h2>
            </div>
          </div>

          <div className="mavat-content">
            {parcelRegistration?.taba_info && (
              <div className="data-row">
                <span className="data-label">מידע תב&quot;ע</span>
                <span className="data-value">{parcelRegistration.taba_info}</span>
              </div>
            )}
            {parcelRegistration?.mavat_info && (
              <div className="data-row">
                <span className="data-label">מידע מבא&quot;ת</span>
                <span className="data-value">{parcelRegistration.mavat_info}</span>
              </div>
            )}
            {parcelUsageCode?.usage_code && (
              <div className="data-row">
                <span className="data-label">קוד שימוש</span>
                <span className="data-value">{parcelUsageCode.usage_code}</span>
              </div>
            )}
            {parcelUsageCode?.description && (
              <div className="data-row">
                <span className="data-label">תיאור שימוש</span>
                <span className="data-value">{parcelUsageCode.description}</span>
              </div>
            )}
            {!parcelRegistration?.taba_info && !parcelRegistration?.mavat_info
              && !parcelUsageCode?.usage_code && !parcelUsageCode?.description && (
              <div className="no-plans-message">אין מידע</div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .results {
          margin-top: 1rem;
        }
        .result-card {
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .result-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .result-icon {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--primary-light);
          color: var(--primary);
          border-radius: 10px;
        }
        .taba-icon {
          background: #fef3c7;
          color: #d97706;
        }
        .regs-icon {
          background: #d1fae5;
          color: #059669;
        }
        .mavat-icon {
          background: #ede9fe;
          color: #7c3aed;
        }
        .result-header h2 {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--text);
          margin: 0;
          line-height: 1.3;
        }
        .meta {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .info-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }
        .info-chip {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.85rem;
          background: var(--background);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .chip-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .chip-value {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text);
        }
        .addresses-section {
          margin-bottom: 1.25rem;
        }
        .section-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
        }
        .addresses-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .address-tag {
          padding: 0.35rem 0.75rem;
          background: var(--background);
          border-radius: 6px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          border: 1px solid var(--border);
        }
        .govmap-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.85rem;
          background: var(--primary);
          color: white;
          border-radius: var(--radius);
          font-weight: 600;
          font-size: 0.95rem;
          text-decoration: none;
          transition: background 0.2s, box-shadow 0.2s;
          box-shadow: var(--shadow-sm);
        }
        .govmap-btn:hover {
          background: var(--primary-dark);
          box-shadow: var(--shadow);
          text-decoration: none;
        }
        .gush-note {
          text-align: center;
          margin-top: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .plans-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .plan-item {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--background);
          padding: 0.75rem 0.9rem;
        }
        .plan-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }
        .plan-number {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--primary-dark);
        }
        .plan-type {
          font-size: 0.75rem;
          font-weight: 600;
          color: #92400e;
          background: #fef3c7;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
        }
        .plan-name {
          font-size: 0.95rem;
          color: var(--text);
          margin-bottom: 0.2rem;
        }
        .plan-meta {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .plan-values {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-top: 0.45rem;
        }
        .plan-value {
          font-size: 0.75rem;
          font-weight: 600;
          color: #065f46;
          background: #d1fae5;
          border: 1px solid #6ee7b7;
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
        }
        .plan-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.55rem;
        }
        .plan-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.3rem 0.65rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 600;
          text-decoration: none;
          background: #fef3c7;
          border: 1px solid #fcd34d;
          color: #92400e;
        }
        .plan-link:hover {
          text-decoration: none;
          background: #fde68a;
        }
        .plan-link-secondary {
          background: #e0f2fe;
          border-color: #7dd3fc;
          color: #075985;
        }
        .plan-link-secondary:hover {
          background: #bae6fd;
        }
        .no-plans-message {
          font-size: 0.92rem;
          color: var(--text-secondary);
          background: var(--background);
          border: 1px dashed var(--border);
          border-radius: 10px;
          padding: 0.9rem;
          text-align: center;
          margin-bottom: 0.75rem;
        }
        .external-links {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        .external-link-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.7rem;
          border-radius: var(--radius);
          font-weight: 600;
          font-size: 0.85rem;
          text-decoration: none;
          transition: background 0.2s;
          border: 1px solid;
        }
        .taba-link {
          background: #fef3c7;
          color: #92400e;
          border-color: #fcd34d;
        }
        .taba-link:hover {
          background: #fde68a;
          text-decoration: none;
        }
        .iplan-link {
          background: #ede9fe;
          color: #5b21b6;
          border-color: #c4b5fd;
        }
        .iplan-link:hover {
          background: #ddd6fe;
          text-decoration: none;
        }
        .data-row {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .data-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
        }
        .data-value {
          font-size: 0.95rem;
          color: var(--text);
        }
        .mavat-content {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .regs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        .reg-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.25rem 1rem;
          background: var(--background);
          border-radius: 10px;
          border: 1px solid var(--border);
          text-align: center;
        }
        .reg-number {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
          margin-bottom: 0.35rem;
        }
        .reg-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
