import Link from "next/link";
import { siteConfig } from "@/lib/config";

export default async function HomePage({ searchParams }) {
  const { ref } = await searchParams;
  const startHref = typeof ref === "string" && ref ? `/test?ref=${encodeURIComponent(ref)}` : "/test";

  return (
    <div className="page home">
      <header className="topbar">
        <a href={siteConfig.websiteUrl} target="_blank" rel="noopener">
          <img className="logo" src="/img/amend-logo.png" alt={siteConfig.clinicName} />
        </a>
        <div className="spacer" />
        <a className="btn btn-ghost btn-sm" href={siteConfig.websiteUrl} target="_blank" rel="noopener">
          Visit website
        </a>
      </header>

      <main style={{ flex: 1 }}>
        <section className="hero fade-up">
          <span className="eyebrow">Free · 2 minutes · Instant results</span>
          <h1>
            Your smile, analysed by <span>AI.</span>
          </h1>
          <p>
            Snap 3 photos, answer a few quick questions, and get a personal oral health report — plus a free
            consultation with Amend&apos;s dentists.
          </p>
          <Link href={startHref} className="btn btn-orange btn-lg">
            Start my free Smile Check →
          </Link>
          <div className="trust">
            <span>🔒 Private &amp; secure</span>
            <span>🦷 Aligner &amp; dental specialists</span>
            <span>📍 5 branches across Kerala</span>
          </div>
        </section>

        <section className="steps">
          {[
            ["Snap 3 photos", "Front smile, upper and lower teeth — right from your phone."],
            ["Answer a few questions", "Symptoms, habits and history help our AI understand you."],
            ["Get your report", "Scores, an alignment map, and a free consultation to go through it."],
          ].map(([title, text], i) => (
            <div className="card" key={title}>
              <div className="step-n">{i + 1}</div>
              <h3 style={{ margin: "12px 0 4px", fontSize: 17 }}>{title}</h3>
              <p className="text-sm muted" style={{ margin: 0 }}>
                {text}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="center text-xs muted" style={{ padding: "40px 20px 28px", maxWidth: 620, margin: "0 auto" }}>
        <p style={{ margin: "0 0 6px" }}>{siteConfig.branches}</p>
        AI-generated screening for guidance only — not a medical diagnosis. Always consult a qualified dentist.
      </footer>
    </div>
  );
}
