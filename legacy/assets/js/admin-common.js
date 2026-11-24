const ADMIN_NAV = [
  { id: "dashboard", href: "admin-dashboard.html", label: "Dashboard", icon: "◧" },
  { id: "questions", href: "admin-questions.html", label: "Assessment Questions", icon: "☰" },
  { id: "links", href: "admin-links.html", label: "Share Links", icon: "⌁" },
  { id: "settings", href: "admin-settings.html", label: "Settings", icon: "⚙" },
];

const STATUSES = [
  { key: "new", label: "New", cls: "badge-brand" },
  { key: "contacted", label: "Contacted", cls: "badge-neutral" },
  { key: "booked", label: "Booked", cls: "badge-orange" },
  { key: "converted", label: "Converted", cls: "badge-success" },
  { key: "dismissed", label: "Dismissed", cls: "badge-danger" },
];
const TEMP_META = {
  hot: { cls: "badge-danger", icon: "🔥", label: "Hot" },
  warm: { cls: "badge-warning", icon: "◐", label: "Warm" },
  cold: { cls: "badge-neutral", icon: "○", label: "Cold" },
};
function statusMeta(k) { return STATUSES.find((s) => s.key === k) || STATUSES[0]; }

function requireAdminAuth() {
  if (!getAdminToken()) {
    window.location.href = "admin-login.html";
    throw new Error("redirecting");
  }
}

function renderSidebar(activeId) {
  const el = document.getElementById("adminSidebar");
  if (!el) return;
  el.innerHTML = `
    <div class="sidebar-head">
      <img src="assets/img/amend-logo.png" alt="Amend Dental Centre" style="height:30px;">
      <div class="text-xs muted" style="margin-top:6px;">AI Smile Check · Admin</div>
    </div>
    <nav>
      ${ADMIN_NAV.map((n) => `<a href="${n.href}" class="${n.id === activeId ? "active" : ""}"><span style="width:18px; text-align:center;">${n.icon}</span>${n.label}</a>`).join("")}
      <a href="index.html" target="_blank" rel="noopener"><span style="width:18px; text-align:center;">↗</span>Open public test</a>
    </nav>
    <div class="sidebar-foot">
      <button class="btn btn-ghost btn-sm btn-block" id="logoutBtn" style="justify-content:flex-start;">↩ Sign out</button>
    </div>`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearAdminToken();
    window.location.href = "admin-login.html";
  });
}

function escapeHtml(str) { return esc(str); }

function siteBase() {
  return window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
}
function reportLink(lead) { return siteBase() + "report.html?id=" + encodeURIComponent(lead.leadId); }

/** Normalises Indian numbers (10 digits → 91XXXXXXXXXX); leaves other country codes alone. */
function waNumber(phone) {
  let d = String(phone || "").replace(/[^0-9]/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d;
}
function waLink(lead) {
  const first = (lead.name || "").trim().split(" ")[0] || "there";
  const clinic = cfg("CLINIC_NAME", "Amend Dental Centre");
  const msg = `Hi ${first}, this is ${clinic} 👋 Thank you for taking our AI Smile Check! ` +
    `Here's your personal report: ${reportLink(lead)}\n\n` +
    `Our dentists would love to walk you through it in a free consultation. When would suit you?`;
  return `https://wa.me/${waNumber(lead.phone)}?text=${encodeURIComponent(msg)}`;
}

/** Best one-line "why call" reason for a lead. */
function leadHook(lead) {
  const a = lead.analysis || {};
  if (a.alignmentDetail && a.alignmentDetail.alignerCandidate) return "Aligner candidate";
  if (a.rootCanalRiskFlag) return "Tooth worth checking soon";
  const att = (a.attentionAreas || [])[0];
  if (att) return att.title;
  return (a.detectedIssues || [])[0] || "General check-up";
}

async function setLeadStatus(leadId, status) {
  return callAdminApi("updateLead", { leadId, updates: { status } });
}
