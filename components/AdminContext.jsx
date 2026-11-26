"use client";

import { createContext, useContext } from "react";

/** The signed-in person: { role: "super" | "user", name, email, userId } — or null while loading. */
export const MeContext = createContext(null);
export const useMe = () => useContext(MeContext);

/** Shown to team users who open a Super-Admin-only page. */
export function SuperOnly({ me, children }) {
  if (!me) return <p className="muted">Loading…</p>;
  if (me.role !== "super") {
    return (
      <div className="card center" style={{ padding: 50, maxWidth: 560 }}>
        <h2 style={{ margin: "0 0 6px" }}>Super Admin only</h2>
        <p className="muted" style={{ margin: 0 }}>Only the Super Admin can open this page.</p>
      </div>
    );
  }
  return children;
}
