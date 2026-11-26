"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client/api";
import { siteConfig } from "@/lib/config";
import { MeContext } from "./AdminContext";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "◧", match: (p) => p === "/admin" || p.startsWith("/admin/leads") },
  { href: "/admin/questions", label: "Assessment Questions", icon: "☰" },
  { href: "/admin/links", label: "Share Links", icon: "⌁" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

export default function AdminShell({ children }) {
  const pathname = usePathname() || "";
  const [me, setMe] = useState(null);

  useEffect(() => {
    api("/api/admin/me").then((d) => setMe(d.me)).catch(() => {}); // 401 → api() sends to login
  }, []);

  async function logout() {
    await api("/api/admin/logout", { method: "POST", body: {}, retries: 0 }).catch(() => {});
    window.location.href = "/admin/login";
  }

  const isSuper = me?.role === "super";

  return (
    <MeContext.Provider value={me}>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="sidebar-head">
            <img src="/img/amend-logo.png" alt={siteConfig.clinicName} style={{ height: 30 }} />
            <div className="text-xs muted" style={{ marginTop: 6 }}>AI Smile Check · Admin</div>
          </div>
          <nav>
            {NAV.filter((n) => !n.superOnly || isSuper).map((n) => {
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
            {me && (
              <div style={{ padding: "0 6px 10px" }}>
                <div className="text-sm" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{me.name}</div>
                <div className="text-xs muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.email}</div>
                <span className={"badge mt-8 " + (isSuper ? "badge-orange" : "badge-brand")}>{isSuper ? "Super Admin" : "Team user"}</span>
              </div>
            )}
            <button className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: "flex-start" }} onClick={logout}>
              ↩ Sign out
            </button>
          </div>
        </aside>
        <div className="admin-main">{children}</div>
      </div>
    </MeContext.Provider>
  );
}
