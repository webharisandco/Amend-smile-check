// Schematic upper/lower arch diagram highlighting which zones (left / front /
// right, per arch) the AI flagged for crowding or spacing. A clear visual aid,
// not a medical illustration.

const ZONES = [
  { key: "left", label: "Left" },
  { key: "front", label: "Front" },
  { key: "right", label: "Right" },
];

const ZONE_COLOR = { normal: "#eef0f4", crowding: "#f39322", spacing: "#1e3a6e", both: "#c0392b" };
const ZONE_LABEL = { normal: "", crowding: "Crowding", spacing: "Spacing", both: "Crowding + spacing" };

function zoneStatus(detail, arch, zoneKey) {
  const id = `${arch}-${zoneKey}`;
  const crowding = (detail.crowdingZones || []).includes(id);
  const spacing = (detail.spacingZones || []).includes(id);
  if (crowding && spacing) return "both";
  if (crowding) return "crowding";
  if (spacing) return "spacing";
  return "normal";
}

function ArchRow({ y, arch, detail, width }) {
  const segW = width / 3;
  return ZONES.map((zone, i) => {
    const status = zoneStatus(detail, arch, zone.key);
    const x = i * segW;
    const cx = x + (segW - 3) / 2;
    return (
      <g key={zone.key}>
        <rect x={x} y={y} width={segW - 3} height={46} rx={10} fill={ZONE_COLOR[status]} stroke="#e2e4ea" strokeWidth={1} />
        <text x={cx} y={y + 20} textAnchor="middle" fontSize={11} fontWeight={600} fill={status === "normal" ? "#64748b" : "#ffffff"}>
          {zone.label}
        </text>
        {ZONE_LABEL[status] && (
          <text x={cx} y={y + 34} textAnchor="middle" fontSize={9} fill="#ffffff">
            {ZONE_LABEL[status]}
          </text>
        )}
      </g>
    );
  });
}

export default function AlignmentDiagram({ detail }) {
  if (!detail) return null;
  const width = 320;
  const upperY = 12;
  const lowerY = 92;
  const legend = [
    ["normal", "No issue"],
    ["crowding", "Crowding"],
    ["spacing", "Spacing"],
  ];
  return (
    <>
      <svg viewBox={`0 0 ${width} 150`} width="100%" style={{ maxWidth: 340, display: "block", margin: "0 auto" }}>
        <text x={width / 2} y={upperY - 2} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
          UPPER ARCH
        </text>
        <ArchRow y={upperY + 6} arch="upper" detail={detail} width={width} />
        <text x={width / 2} y={lowerY - 2} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
          LOWER ARCH
        </text>
        <ArchRow y={lowerY + 6} arch="lower" detail={detail} width={width} />
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginTop: 10 }}>
        {legend.map(([k, label]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: ZONE_COLOR[k], display: "inline-block" }} /> {label}
          </span>
        ))}
      </div>
    </>
  );
}
