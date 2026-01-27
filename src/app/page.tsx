export default function Home() {
  return (
    <div className="landing">
      <header className="hero">
        <h1>ReguScape</h1>
        <p className="tagline">מידע תכנוני על נכסים בישראל</p>
      </header>

      <main className="features">
        <div className="feature">
          <h2>חיפוש לפי כתובת</h2>
          <p>הזן עיר, רחוב ומספר בית</p>
        </div>
        <div className="feature">
          <h2>חיפוש לפי גוש/חלקה</h2>
          <p>חיפוש ישיר במרשם המקרקעין</p>
        </div>
        <div className="feature">
          <h2>מידע תכנוני</h2>
          <p>תב&quot;ע, זכויות בנייה, קווי בניין</p>
        </div>
      </main>

      <footer className="status">
        <p>בפיתוח</p>
      </footer>

      <style jsx>{`
        .landing {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          text-align: center;
        }

        .hero {
          margin-bottom: 3rem;
        }

        .hero h1 {
          font-size: 3rem;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .tagline {
          font-size: 1.25rem;
          color: #6b7280;
        }

        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          max-width: 800px;
          width: 100%;
        }

        .feature {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .feature h2 {
          font-size: 1rem;
          color: #2563eb;
          margin-bottom: 0.5rem;
        }

        .feature p {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .status {
          margin-top: 3rem;
        }

        .status p {
          display: inline-block;
          padding: 0.5rem 1rem;
          background: #fef3c7;
          color: #92400e;
          border-radius: 9999px;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
