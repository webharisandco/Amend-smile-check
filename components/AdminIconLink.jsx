import Link from "next/link";

/** Round "admin" icon for the top bar (person at a laptop with </>) — opens the admin area. */
export default function AdminIconLink() {
  return (
    <Link href="/admin" className="admin-icon-btn" title="Admin" aria-label="Admin login" prefetch={false}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        {/* head + body */}
        <circle cx="12" cy="6.6" r="4.4" fill="currentColor" />
        <path d="M2.8 22.5V18a6.2 6.2 0 0 1 6.2-6.2h6A6.2 6.2 0 0 1 21.2 18v4.5Z" fill="currentColor" />
        {/* laptop: white outline gap, dark screen, base */}
        <rect x="4.6" y="12.9" width="14.8" height="9" rx="1.4" fill="#fff" />
        <rect x="5.6" y="13.9" width="12.8" height="7" rx="0.8" fill="currentColor" />
        <rect x="1.6" y="21.4" width="20.8" height="1.7" rx="0.6" fill="#fff" />
        <rect x="2.2" y="21.9" width="19.6" height="1.2" rx="0.5" fill="currentColor" />
        {/* </> */}
        <g fill="none" stroke="#fff" strokeWidth="0.95" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9.9,15.5 8.3,17.4 9.9,19.3" />
          <polyline points="14.1,15.5 15.7,17.4 14.1,19.3" />
          <line x1="12.75" y1="15.2" x2="11.25" y2="19.6" />
        </g>
      </svg>
    </Link>
  );
}
