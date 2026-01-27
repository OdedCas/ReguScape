'use client';

export default function Home() {
  return (
    <div className="landing">
      <header className="hero">
        <span className="coming-soon-badge">Coming Soon</span>
        <h1>ReguScape</h1>
        <p className="tagline">
          Your future gateway to Israeli property planning information
        </p>
        <p className="subtitle">
          פלטפורמה למידע תכנוני על נכסים בישראל
        </p>
      </header>

      <section className="vision">
        <h2>What We&apos;re Building</h2>
        <p>
          ReguScape will provide instant access to planning regulations, building rights,
          and zoning information for any property in Israel. Our goal is to make
          complex regulatory data accessible and understandable.
        </p>
      </section>

      <main className="features">
        <h2>Planned Features</h2>
        <div className="features-grid">
          <div className="feature">
            <div className="feature-icon">📍</div>
            <h3>Address Search</h3>
            <p>Find any property by city, street, and number</p>
          </div>
          <div className="feature">
            <div className="feature-icon">🗺️</div>
            <h3>Parcel Lookup</h3>
            <p>Direct search by block and parcel numbers (גוש/חלקה)</p>
          </div>
          <div className="feature">
            <div className="feature-icon">📋</div>
            <h3>Planning Data</h3>
            <p>Access zoning plans, building rights, and setback requirements</p>
          </div>
          <div className="feature">
            <div className="feature-icon">🔍</div>
            <h3>GovMap Integration</h3>
            <p>Real-time data from official government sources</p>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p className="status">Development in progress</p>
        <p className="repo">
          <a href="https://github.com/OdedCas/ReguScape" target="_blank" rel="noopener noreferrer">
            View on GitHub
          </a>
        </p>
      </footer>

      <style jsx>{`
        .landing {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 3rem 2rem;
          background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
        }

        .hero {
          text-align: center;
          margin-bottom: 3rem;
        }

        .coming-soon-badge {
          display: inline-block;
          padding: 0.5rem 1.5rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 1.5rem;
        }

        .hero h1 {
          font-size: 3.5rem;
          color: #1a202c;
          margin: 0 0 1rem 0;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .tagline {
          font-size: 1.5rem;
          color: #4a5568;
          margin: 0 0 0.5rem 0;
          font-weight: 400;
        }

        .subtitle {
          font-size: 1.125rem;
          color: #718096;
          margin: 0;
        }

        .vision {
          max-width: 700px;
          text-align: center;
          margin-bottom: 3rem;
          padding: 2rem;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .vision h2 {
          font-size: 1.5rem;
          color: #2d3748;
          margin: 0 0 1rem 0;
        }

        .vision p {
          color: #4a5568;
          line-height: 1.7;
          margin: 0;
        }

        .features {
          max-width: 900px;
          width: 100%;
          margin-bottom: 3rem;
        }

        .features h2 {
          text-align: center;
          font-size: 1.5rem;
          color: #2d3748;
          margin: 0 0 2rem 0;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .feature {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .feature:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .feature-icon {
          font-size: 2rem;
          margin-bottom: 1rem;
        }

        .feature h3 {
          font-size: 1.125rem;
          color: #2d3748;
          margin: 0 0 0.5rem 0;
        }

        .feature p {
          font-size: 0.875rem;
          color: #718096;
          margin: 0;
          line-height: 1.5;
        }

        .footer {
          text-align: center;
          margin-top: auto;
        }

        .status {
          display: inline-block;
          padding: 0.5rem 1rem;
          background: #fef3c7;
          color: #92400e;
          border-radius: 9999px;
          font-size: 0.875rem;
          margin: 0 0 1rem 0;
        }

        .repo {
          margin: 0;
        }

        .repo a {
          color: #667eea;
          text-decoration: none;
          font-size: 0.875rem;
        }

        .repo a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
