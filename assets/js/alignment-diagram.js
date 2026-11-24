// ─────────────────────────────────────────────────────────────────────────
// Renders a simple schematic upper/lower arch diagram, highlighting which
// zones (left / front / right, for each arch) the AI flagged for crowding
// or spacing. Not anatomically literal — a clear, honest visual aid, not a
// medical illustration.
// ─────────────────────────────────────────────────────────────────────────

const ZONE_LAYOUT = [
  { key: "left", label: "Left" },
  { key: "front", label: "Front" },
  { key: "right", label: "Right" },
];

function zoneStatus(detail, arch, zoneKey) {
  const zoneId = `${arch}-${zoneKey}`;
  const crowding = (detail.crowdingZones || []).includes(zoneId);
  const spacing = (detail.spacingZones || []).includes(zoneId);
  if (crowding && spacing) return "both";
  if (crowding) return "crowding";
  if (spacing) return "spacing";
  return "normal";
}

const ZONE_COLOR = {
  normal: "#eef0f4",
  crowding: "#f39322",
  spacing: "#1e3a6e",
  both: "#c0392b",
};
const ZONE_LABEL = {
  normal: "",
  crowding: "Crowding",
  spacing: "Spacing",
  both: "Crowding + spacing",
};

function archRowSvg(y, arch, detail, width) {
  const segW = width / 3;
  let cells = "";
  ZONE_LAYOUT.forEach((zone, i) => {
    const status = zoneStatus(detail, arch, zone.key);
    const x = i * segW;
    const color = ZONE_COLOR[status];
    const rx = i === 0 ? 14 : 0;
    cells += `
      <rect x="${x}" y="${y}" width="${segW - 3}" height="46" rx="10"
            fill="${color}" stroke="#e2e4ea" stroke-width="1" />
      <text x="${x + (segW - 3) / 2}" y="${y + 20}" text-anchor="middle"
            font-size="11" font-weight="600" fill="${status === "normal" ? "#64748b" : "#ffffff"}">${zone.label}</text>
      ${
        ZONE_LABEL[status]
          ? `<text x="${x + (segW - 3) / 2}" y="${y + 34}" text-anchor="middle" font-size="9" fill="#ffffff">${ZONE_LABEL[status]}</text>`
          : ""
      }
    `;
  });
  return cells;
}

/** Returns an <svg>...</svg> string. detail = analysis.alignmentDetail */
function buildAlignmentDiagramSvg(detail) {
  const width = 320;
  const height = 150;
  const upperY = 12;
  const lowerY = 92;
  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:340px; display:block; margin:0 auto;">
      <text x="${width / 2}" y="${upperY - 2}" text-anchor="middle" font-size="10" fill="#94a3b8" font-weight="600">UPPER ARCH</text>
      ${archRowSvg(upperY + 6, "upper", detail, width)}
      <text x="${width / 2}" y="${lowerY - 2}" text-anchor="middle" font-size="10" fill="#94a3b8" font-weight="600">LOWER ARCH</text>
      ${archRowSvg(lowerY + 6, "lower", detail, width)}
    </svg>
  `;
}

function alignmentDiagramLegendHtml() {
  return `
    <div style="display:flex; gap:14px; flex-wrap:wrap; justify-content:center; margin-top:10px;">
      <span style="display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b;">
        <span style="width:10px; height:10px; border-radius:3px; background:${ZONE_COLOR.normal}; display:inline-block;"></span> No issue
      </span>
      <span style="display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b;">
        <span style="width:10px; height:10px; border-radius:3px; background:${ZONE_COLOR.crowding}; display:inline-block;"></span> Crowding
      </span>
      <span style="display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b;">
        <span style="width:10px; height:10px; border-radius:3px; background:${ZONE_COLOR.spacing}; display:inline-block;"></span> Spacing
      </span>
    </div>
  `;
}

function hasAnyAlignmentZoneIssue(detail) {
  return Boolean(detail && ((detail.crowdingZones || []).length || (detail.spacingZones || []).length));
}
