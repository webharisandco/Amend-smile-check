"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client/api";
import { siteConfig } from "@/lib/config";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "◧", match: (p) => p === "/admin" || p.startsWith("/admin/leads") },
  { href: "/admin/questions", label: "Assessment Questions", icon: "☰" },
  { href: "/admin/links", label: "Share Links", icon: "⌁" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

export default function AdminShell({ children }) {
  const pathname = usePathname() || "";

  async function logout() {
    await api("/api/admin/logout", { method: "POST", body: {}, retries: 0 }).catch(() => {});
    window.location.href = "/admin/login";
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-head">
          <img src="/img/amend-logo.png" alt={siteConfig.clinicName} style={{ height: 30 }} />
          <div className="text-xs muted" style={{ marginTop: 6 }}>AI Smile Check · Admin</div>
        </div>
        <nav>
          {NAV.map((n) => {
            const active = n.match ? n.match(pathname) : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? "active" : ""}>
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
          <a href="/" target="_blank" rel="noopener">
            <span className="nav-icon">↗</span>Open public test
          </a>
        </nav>
        <div className="sidebar-foot">
          <button className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: "flex-start" }} onClick={logout}>
            ↩ Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
