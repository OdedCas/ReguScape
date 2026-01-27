export default function Home() {
  return (
    <div className="container">
      <header style={{ marginBottom: '2rem' }}>
        <h1>ReguScape</h1>
        <p>מערכת לחיפוש מידע תכנוני על נכסים בישראל</p>
      </header>

      <main>
        <div className="card">
          <h2>ברוכים הבאים</h2>
          <p style={{ marginTop: '1rem', color: '#666' }}>
            מערכת ReguScape מאפשרת לחפש מידע תכנוני על נכסים בישראל.
          </p>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>
            טופס החיפוש יתווסף בשלבים הבאים של הפיתוח.
          </p>
        </div>

        <div className="card">
          <h2>קישורים</h2>
          <ul style={{ marginTop: '1rem', paddingRight: '1.5rem' }}>
            <li><a href="/logs">צפייה בלוגים</a></li>
          </ul>
        </div>
      </main>
    </div>
  );
}
