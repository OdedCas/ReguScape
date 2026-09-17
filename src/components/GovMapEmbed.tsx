'use client';

import { useEffect, useId, useState } from 'react';

const GOVMAP_SCRIPT_URL = 'https://www.govmap.gov.il/govmap/api/govmap.api.js';

declare global {
  interface Window {
    govmap?: {
      createMap: (elementId: string, options: Record<string, unknown>) => unknown;
      searchAndLocate?: (params: Record<string, unknown>) => Promise<unknown>;
      locateType?: Record<string, unknown>;
    };
    __govMapScriptPromise?: Promise<void>;
  }
}

interface GovMapEmbedProps {
  token: string;
  gush?: string;
  helka?: string;
  address?: string;
}

function loadGovMapScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('GovMap can only load in the browser'));
  }

  if (window.__govMapScriptPromise) {
    return window.__govMapScriptPromise;
  }

  window.__govMapScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOVMAP_SCRIPT_URL}"]`);
    if (existing) {
      if (window.govmap) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load GovMap script')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOVMAP_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load GovMap script'));
    document.head.appendChild(script);
  });

  return window.__govMapScriptPromise;
}

async function locateParcelOnMap(params: {
  gush?: string;
  helka?: string;
  address?: string;
}): Promise<void> {
  if (typeof window === 'undefined' || !window.govmap?.searchAndLocate) {
    return;
  }

  const gush = String(params.gush || '').trim();
  const helka = String(params.helka || '').trim();
  const address = String(params.address || '').trim();
  const locateTypes = window.govmap.locateType || {};

  if (gush && helka) {
    const candidates = [
      locateTypes.lotParcelToAddress,
      locateTypes.addressToLotParcel,
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        await window.govmap.searchAndLocate({
          type: candidate,
          lot: Number(gush),
          parcel: Number(helka),
        });
        return;
      } catch {
        // Try the next enum value. GovMap docs/examples are inconsistent here.
      }
    }
  }

  if (address && locateTypes.addressToLotParcel) {
    await window.govmap.searchAndLocate({
      type: locateTypes.addressToLotParcel,
      address,
    });
  }
}

export default function GovMapEmbed({
  token,
  gush,
  helka,
  address,
}: GovMapEmbedProps) {
  const mapId = useId().replace(/:/g, '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      setStatus('loading');
      setError(null);

      try {
        await loadGovMapScript();
        if (cancelled) {
          return;
        }

        if (!window.govmap?.createMap) {
          throw new Error('GovMap API loaded without createMap');
        }

        const createMapResult = window.govmap.createMap(mapId, {
          token,
          layers: ['PARCEL_ALL', 'TABA_MSBS_ITM'],
          showXY: true,
          identifyOnClick: true,
          isEmbeddedToggle: false,
          background: '1',
          layersMode: 1,
        });

        await Promise.resolve(createMapResult);
        if (cancelled) {
          return;
        }

        await locateParcelOnMap({ gush, helka, address });
        if (cancelled) {
          return;
        }

        setStatus('ready');
      } catch (initError) {
        if (cancelled) {
          return;
        }
        setStatus('error');
        setError(initError instanceof Error ? initError.message : 'GovMap embed failed');
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [address, gush, helka, mapId, token]);

  return (
    <div className="govmap-embed">
      <div id={mapId} className="govmap-canvas" />
      {status === 'loading' && (
        <div className="govmap-status">טוען GovMap משובץ...</div>
      )}
      {status === 'error' && (
        <div className="govmap-status govmap-status-error">
          {`GovMap embed failed: ${error || 'unknown error'}`}
        </div>
      )}
      <style jsx>{`
        .govmap-embed {
          margin-top: 0.9rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          background: #f8fafc;
        }
        .govmap-canvas {
          width: 100%;
          min-height: 420px;
        }
        .govmap-status {
          padding: 0.85rem 1rem;
          font-size: 0.88rem;
          color: var(--text-muted);
          border-top: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.92);
        }
        .govmap-status-error {
          color: #b91c1c;
        }
        @media (max-width: 640px) {
          .govmap-canvas {
            min-height: 320px;
          }
        }
      `}</style>
    </div>
  );
}
