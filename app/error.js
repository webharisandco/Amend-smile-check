"use client";

// Shown if a page fails on the server (e.g. the database is unreachable).
export default function ErrorPage({ reset }) {
  return (
    <div className="page">
      <main className="container center" style={{ paddingTop: 80 }}>
        <img src="/img/amend-logo.png" alt="" style={{ height: 38, margin: "0 auto 24px" }} />
        <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong</h1>
        <p className="muted">We couldn&apos;t load this page right now. Please try again in a moment.</p>
        <button className="btn btn-orange mt-16" onClick={() => reset()}>Try again</button>
      </main>
    </div>
  );
}
