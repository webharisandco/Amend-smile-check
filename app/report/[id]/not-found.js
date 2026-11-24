import Link from "next/link";

export default function ReportNotFound() {
  return (
    <div className="page">
      <main className="container center" style={{ paddingTop: 80 }}>
        <img src="/img/amend-logo.png" alt="" style={{ height: 38, margin: "0 auto 24px" }} />
        <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Report not found</h1>
        <p className="muted">This report link may be incomplete, or the report has been removed.</p>
        <Link className="btn btn-orange mt-16" href="/">
          Take the Smile Check
        </Link>
      </main>
    </div>
  );
}
