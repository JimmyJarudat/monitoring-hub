import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

// ─── font registration (Thai support) ───────────────────────────────────────
Font.register({
  family: "Sarabun",
  fonts: [
    { src: "/fonts/Sarabun-Regular.ttf", fontWeight: "normal", fontStyle: "normal" },
    { src: "/fonts/Sarabun-Bold.ttf", fontWeight: "bold", fontStyle: "normal" },
    { src: "/fonts/Sarabun-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
  ],
});

// Disable font hyphenation for Thai text
Font.registerHyphenationCallback((word) => [word]);

// ─── types ───────────────────────────────────────────────────────────────────
type MonitorStatus = "UP" | "DOWN" | "DEGRADED";
type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
type MonitorType = string;

export type PdfReportPayload = {
  generatedAt: string;
  range: { label: string; from: string; to: string };
  summary: {
    reportUptime: number | null;
    checks: number;
    up: number;
    degraded: number;
    down: number;
    incidents: number;
    openIncidents: number;
    resolvedIncidents: number;
    avgResponseMs: number | null;
    fleetUptime24h: number | null;
    fleetAvgResponseMs: number | null;
  };
  monitorRanking: Array<{
    id: string;
    monitor: string;
    type: MonitorType;
    checks: number;
    uptime: number | null;
    down: number;
    degraded: number;
    avgResponse: number | null;
    lastStatus: MonitorStatus | null;
  }>;
  groupSummary: Array<{
    id: string;
    name: string;
    monitorCount: number;
    checks: number;
    up: number;
    down: number;
    degraded: number;
    incidents: number;
    uptime: number | null;
    avgResponse: number | null;
  }>;
  incidents: Array<{
    id: string;
    monitor: string;
    type: MonitorType;
    status: IncidentStatus;
    startedAt: string;
    resolvedAt: string | null;
    duration: string;
    severity: string | null;
    message: string | null;
  }>;
  branding: {
    companyName: string;
    systemName: string;
    logoUrl: string | null;
    footerText: string;
  };
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = {
  pct: (v: number | null) => (v != null ? `${v.toFixed(2)}%` : "N/A"),
  ms: (v: number | null) => (v != null ? `${v} ms` : "N/A"),
  dt: (iso: string | null | undefined) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  },
  uptimeColor: (v: number | null): string => {
    if (v == null) return "#94A3B8";
    if (v >= 99) return "#059669";
    if (v >= 95) return "#D97706";
    return "#E11D48";
  },
  statusFg: (s: MonitorStatus | IncidentStatus | null): string => {
    if (s === "UP" || s === "RESOLVED") return "#065F46";
    if (s === "DOWN" || s === "OPEN") return "#9F1239";
    if (s === "DEGRADED" || s === "ACKNOWLEDGED") return "#92400E";
    return "#475569";
  },
  statusBg: (s: MonitorStatus | IncidentStatus | null): string => {
    if (s === "UP" || s === "RESOLVED") return "#D1FAE5";
    if (s === "DOWN" || s === "OPEN") return "#FFE4E6";
    if (s === "DEGRADED" || s === "ACKNOWLEDGED") return "#FEF3C7";
    return "#F1F5F9";
  },
};

// ─── colour palette (white + cyan theme) ────────────────────────────────────
const C = {
  primary: "#0891B2",       // cyan-600
  primaryLight: "#CFFAFE",  // cyan-100
  primaryDark: "#164E63",   // cyan-900
  accent: "#06B6D4",        // cyan-500
  white: "#FFFFFF",
  bg: "#F0F9FF",            // cyan-50
  border: "#BAE6FD",        // cyan-200
  text: "#0F172A",          // slate-950
  textMuted: "#64748B",     // slate-500
  textLight: "#94A3B8",     // slate-400
  rowAlt: "#F0F9FF",        // cyan-50
};

// ─── styles ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "Sarabun",
    fontSize: 9,
    backgroundColor: "#FFFFFF",
    paddingBottom: 44,
    color: C.text,
  },
  coverPage: {
    fontFamily: "Sarabun",
    backgroundColor: "#FFFFFF",
  },
  // footer (sticky)
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: C.white, fontFamily: "Sarabun" },
  // cover
  coverTop: {
    backgroundColor: C.primary,
    paddingHorizontal: 48,
    paddingTop: 72,
    paddingBottom: 48,
    alignItems: "center",
  },
  coverLogoBox: {
    width: 80,
    height: 80,
    backgroundColor: C.white,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  coverLogoImg: { width: 70, height: 70, objectFit: "contain" },
  coverLogoFallback: { fontSize: 28, fontFamily: "Sarabun", fontWeight: "bold", color: C.primary },
  coverCompany: { fontSize: 26, fontFamily: "Sarabun", fontWeight: "bold", color: C.white, textAlign: "center", marginBottom: 4 },
  coverSystem: { fontSize: 11, color: C.primaryLight, textAlign: "center" },
  coverBottom: { padding: 48, alignItems: "center" },
  coverDivider: { width: 48, height: 3, backgroundColor: C.accent, borderRadius: 2, marginBottom: 32 },
  coverReportTitle: { fontSize: 20, fontFamily: "Sarabun", fontWeight: "bold", color: C.text, textAlign: "center", marginBottom: 10 },
  coverRange: { fontSize: 10, color: C.textMuted, textAlign: "center", marginBottom: 4 },
  coverGenerated: { fontSize: 8.5, color: C.textLight, textAlign: "center", marginTop: 8 },
  coverFooterNote: { fontSize: 8, color: C.textLight, fontStyle: "italic", marginTop: 32, textAlign: "center" },
  // page header
  pageHeader: {
    backgroundColor: C.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  pageHeaderTitle: { fontSize: 15, fontFamily: "Sarabun", fontWeight: "bold", color: C.white },
  pageHeaderSub: { fontSize: 8, color: C.primaryLight, marginTop: 2 },
  // content
  content: { paddingHorizontal: 24, paddingTop: 16 },
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: "Sarabun",
    fontWeight: "bold",
    color: C.primary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  // stat cards
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    minWidth: "28%",
    backgroundColor: C.white,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  statLabel: { fontSize: 7, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, fontFamily: "Sarabun" },
  statValue: { fontSize: 20, fontFamily: "Sarabun", fontWeight: "bold", color: C.text },
  statUnit: { fontSize: 7.5, color: C.textMuted, marginTop: 2 },
  // uptime banner
  uptimeBanner: { borderRadius: 8, padding: 14, marginBottom: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 12 },
  uptimeValue: { fontSize: 34, fontFamily: "Sarabun", fontWeight: "bold", color: C.white },
  uptimeLabel: { fontSize: 9, color: C.white, opacity: 0.9, marginTop: 2, fontFamily: "Sarabun" },
  // table
  table: { marginBottom: 14 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.primary,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  thCell: { fontSize: 7.5, fontFamily: "Sarabun", fontWeight: "bold", color: C.white, textAlign: "center" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowAlt: { backgroundColor: C.rowAlt },
  tdCell: { fontSize: 8, color: C.text, textAlign: "center", fontFamily: "Sarabun" },
  tdCellLeft: { fontSize: 8, color: C.text, textAlign: "left", fontFamily: "Sarabun" },
  // badge
  badge: { borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5, alignSelf: "center" },
  badgeText: { fontSize: 6.5, fontFamily: "Sarabun", fontWeight: "bold" },
  // uptime mini bar
  barBg: { backgroundColor: C.border, borderRadius: 2, height: 5, marginTop: 2 },
  barFill: { borderRadius: 2, height: 5 },
});

// ─── shared components ────────────────────────────────────────────────────────
const Footer = ({ company, system, footer }: { company: string; system: string; footer: string }) => (
  <View style={S.footer} fixed>
    <Text style={S.footerText}>{company || system}</Text>
    <Text style={S.footerText}>{footer || "Availability Report"}</Text>
    <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>
);

const PageHeader = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={S.pageHeader}>
    <View>
      <Text style={S.pageHeaderTitle}>{title}</Text>
      {sub ? <Text style={S.pageHeaderSub}>{sub}</Text> : null}
    </View>
  </View>
);

const UptimeBar = ({ value }: { value: number | null }) => (
  <View style={S.barBg}>
    <View style={[S.barFill, { width: `${Math.max(value ?? 0, 0)}%`, backgroundColor: fmt.uptimeColor(value) }]} />
  </View>
);

const Badge = ({ status }: { status: MonitorStatus | IncidentStatus | null }) => (
  <View style={[S.badge, { backgroundColor: fmt.statusBg(status) }]}>
    <Text style={[S.badgeText, { color: fmt.statusFg(status) }]}>{status ?? "N/A"}</Text>
  </View>
);

// ─── Page 1: Cover ───────────────────────────────────────────────────────────
const CoverPage = ({ payload }: { payload: PdfReportPayload }) => {
  const { branding, range, generatedAt } = payload;
  const displayName = branding.companyName || branding.systemName;

  return (
    <Page size="A4" style={S.coverPage}>
      {/* Top cyan block */}
      <View style={S.coverTop}>
        <View style={S.coverLogoBox}>
          {branding.logoUrl ? (
            <Image style={S.coverLogoImg} src={branding.logoUrl} />
          ) : (
            <Text style={S.coverLogoFallback}>{displayName.slice(0, 2).toUpperCase()}</Text>
          )}
        </View>
        <Text style={S.coverCompany}>{displayName}</Text>
        {branding.companyName ? <Text style={S.coverSystem}>{branding.systemName}</Text> : null}
      </View>

      {/* Bottom white block */}
      <View style={S.coverBottom}>
        <View style={S.coverDivider} />
        <Text style={S.coverReportTitle}>Availability Report</Text>
        <Text style={S.coverRange}>{range.label}</Text>
        <Text style={S.coverRange}>{fmt.dt(range.from)} → {fmt.dt(range.to)}</Text>
        <Text style={S.coverGenerated}>Generated: {fmt.dt(generatedAt)}</Text>
        {branding.footerText ? (
          <Text style={S.coverFooterNote}>{branding.footerText}</Text>
        ) : null}
      </View>
    </Page>
  );
};

// ─── Page 2: Executive Summary ───────────────────────────────────────────────
const SummaryPage = ({ payload }: { payload: PdfReportPayload }) => {
  const { summary, branding } = payload;
  const uptimeBg = fmt.uptimeColor(summary.reportUptime);

  const kpis = [
    { label: "Total Checks", value: summary.checks.toLocaleString(), unit: "in range" },
    { label: "UP", value: summary.up.toLocaleString(), unit: "" },
    { label: "DOWN", value: summary.down.toLocaleString(), unit: "" },
    { label: "DEGRADED", value: summary.degraded.toLocaleString(), unit: "" },
    { label: "Incidents", value: summary.incidents.toLocaleString(), unit: `${summary.openIncidents} open` },
    { label: "Avg Response", value: summary.avgResponseMs != null ? String(summary.avgResponseMs) : "N/A", unit: summary.avgResponseMs != null ? "ms" : "" },
  ];

  return (
    <Page size="A4" style={S.page}>
      <PageHeader title="Executive Summary" sub={`${payload.range.label}  ·  Generated ${fmt.dt(payload.generatedAt)}`} />
      <View style={S.content}>
        {/* Uptime banner */}
        <View style={[S.uptimeBanner, { backgroundColor: uptimeBg }]}>
          <View style={{ alignItems: "center" }}>
            <Text style={S.uptimeValue}>{fmt.pct(summary.reportUptime)}</Text>
            <Text style={S.uptimeLabel}>Report Uptime</Text>
          </View>
        </View>

        {/* KPI grid */}
        <Text style={S.sectionTitle}>Key Metrics</Text>
        <View style={S.statGrid}>
          {kpis.map((kpi) => (
            <View key={kpi.label} style={S.statCard}>
              <Text style={S.statLabel}>{kpi.label}</Text>
              <Text style={S.statValue}>{kpi.value}</Text>
              {kpi.unit ? <Text style={S.statUnit}>{kpi.unit}</Text> : null}
            </View>
          ))}
        </View>

        {/* Fleet stats */}
        <View style={[S.statGrid, { marginBottom: 14 }]}>
          <View style={[S.statCard, { flex: 1, borderColor: C.border, backgroundColor: C.bg }]}>
            <Text style={S.statLabel}>Fleet Uptime (24h)</Text>
            <Text style={[S.statValue, { fontSize: 16, color: fmt.uptimeColor(summary.fleetUptime24h) }]}>
              {fmt.pct(summary.fleetUptime24h)}
            </Text>
          </View>
          <View style={[S.statCard, { flex: 1, borderColor: C.border, backgroundColor: C.bg }]}>
            <Text style={S.statLabel}>Fleet Avg Response (24h)</Text>
            <Text style={[S.statValue, { fontSize: 16, color: C.primary }]}>
              {fmt.ms(summary.fleetAvgResponseMs)}
            </Text>
          </View>
        </View>

        {/* Status distribution */}
        <Text style={S.sectionTitle}>Status Distribution</Text>
        <View style={S.table}>
          <View style={S.tableHeader}>
            {["Status", "Count", "% of Checks"].map((h) => (
              <Text key={h} style={[S.thCell, { flex: 1 }]}>{h}</Text>
            ))}
          </View>
          {([
            { status: "UP" as MonitorStatus, count: summary.up },
            { status: "DEGRADED" as MonitorStatus, count: summary.degraded },
            { status: "DOWN" as MonitorStatus, count: summary.down },
          ] as const).map((row, i) => (
            <View key={row.status} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Badge status={row.status} />
              </View>
              <Text style={[S.tdCell, { flex: 1 }]}>{row.count.toLocaleString()}</Text>
              <Text style={[S.tdCell, { flex: 1, color: fmt.statusFg(row.status), fontFamily: "Sarabun", fontWeight: "bold" }]}>
                {summary.checks > 0 ? `${((row.count / summary.checks) * 100).toFixed(1)}%` : "N/A"}
              </Text>
            </View>
          ))}
        </View>

        {/* Top 5 worst monitors */}
        {payload.monitorRanking.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Top 5 At-Risk Monitors</Text>
            <View style={S.table}>
              <View style={S.tableHeader}>
                {[{ l: "Monitor", f: 3 }, { l: "Uptime %", f: 1.2 }, { l: "Down", f: 0.8 }, { l: "Degraded", f: 0.9 }].map(({ l, f }, i) => (
                  <Text key={l} style={[S.thCell, { flex: f }, i === 0 ? { textAlign: "left", paddingLeft: 4 } : {}]}>{l}</Text>
                ))}
              </View>
              {payload.monitorRanking.slice(0, 5).map((row, i) => (
                <View key={row.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                  <Text style={[S.tdCellLeft, { flex: 3, paddingLeft: 4 }]} numberOfLines={1}>{row.monitor}</Text>
                  <Text style={[S.tdCell, { flex: 1.2, color: fmt.uptimeColor(row.uptime), fontFamily: "Sarabun", fontWeight: "bold" }]}>
                    {fmt.pct(row.uptime)}
                  </Text>
                  <Text style={[S.tdCell, { flex: 0.8, color: row.down > 0 ? "#E11D48" : C.text }]}>{row.down}</Text>
                  <Text style={[S.tdCell, { flex: 0.9, color: row.degraded > 0 ? "#D97706" : C.text }]}>{row.degraded}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
      <Footer company={branding.companyName} system={branding.systemName} footer={branding.footerText} />
    </Page>
  );
};

// ─── Page 3: Monitor Reliability ─────────────────────────────────────────────
const MonitorPage = ({ payload }: { payload: PdfReportPayload }) => {
  const { monitorRanking, branding } = payload;

  return (
    <Page size="A4" style={S.page}>
      <PageHeader title="Monitor Reliability Ranking" sub={`${monitorRanking.length} monitors · เรียงจากแย่ไปดี`} />
      <View style={S.content}>
        <View style={S.table}>
          <View style={S.tableHeader}>
            {[
              { l: "Monitor", f: 3 },
              { l: "Type", f: 1.1 },
              { l: "Uptime %", f: 1.3 },
              { l: "Checks", f: 0.9 },
              { l: "Down", f: 0.8 },
              { l: "Avg ms", f: 1 },
              { l: "Last", f: 1.2 },
            ].map(({ l, f }, i) => (
              <Text key={l} style={[S.thCell, { flex: f }, i === 0 ? { textAlign: "left", paddingLeft: 4 } : {}]}>{l}</Text>
            ))}
          </View>

          {monitorRanking.map((row, i) => (
            <View key={row.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
              <Text style={[S.tdCellLeft, { flex: 3, paddingLeft: 4 }]} numberOfLines={1}>{row.monitor}</Text>
              <Text style={[S.tdCell, { flex: 1.1, fontSize: 7 }]}>{row.type}</Text>
              <View style={{ flex: 1.3, paddingHorizontal: 2 }}>
                <Text style={[S.tdCell, { color: fmt.uptimeColor(row.uptime), fontFamily: "Sarabun", fontWeight: "bold" }]}>
                  {fmt.pct(row.uptime)}
                </Text>
                <UptimeBar value={row.uptime} />
              </View>
              <Text style={[S.tdCell, { flex: 0.9 }]}>{row.checks}</Text>
              <Text style={[S.tdCell, { flex: 0.8, color: row.down > 0 ? "#E11D48" : C.text }]}>{row.down}</Text>
              <Text style={[S.tdCell, { flex: 1 }]}>{fmt.ms(row.avgResponse)}</Text>
              <View style={{ flex: 1.2, alignItems: "center" }}>
                <Badge status={row.lastStatus} />
              </View>
            </View>
          ))}
        </View>
      </View>
      <Footer company={branding.companyName} system={branding.systemName} footer={branding.footerText} />
    </Page>
  );
};

// ─── Page 4: Incident Report ──────────────────────────────────────────────────
const IncidentPage = ({ payload }: { payload: PdfReportPayload }) => {
  const { incidents, branding } = payload;

  return (
    <Page size="A4" style={S.page}>
      <PageHeader title="Incident Report" sub={`${incidents.length} incidents in range`} />
      <View style={S.content}>
        {incidents.length === 0 ? (
          <Text style={{ fontSize: 10, color: C.textLight, textAlign: "center", marginTop: 32, fontFamily: "Sarabun" }}>
            ไม่มี Incident ในช่วงเวลานี้
          </Text>
        ) : (
          <View style={S.table}>
            <View style={S.tableHeader}>
              {[
                { l: "Started", f: 1.8 },
                { l: "Monitor", f: 2.5 },
                { l: "Status", f: 1.2 },
                { l: "Duration", f: 1 },
                { l: "Severity", f: 1 },
                { l: "Message", f: 2.5 },
              ].map(({ l, f }, i) => (
                <Text key={l} style={[S.thCell, { flex: f }, i <= 1 ? { textAlign: "left", paddingLeft: 4 } : {}]}>{l}</Text>
              ))}
            </View>
            {incidents.map((inc, i) => (
              <View key={inc.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
                <Text style={[S.tdCellLeft, { flex: 1.8, fontSize: 7, paddingLeft: 4 }]}>{fmt.dt(inc.startedAt)}</Text>
                <Text style={[S.tdCellLeft, { flex: 2.5, paddingLeft: 4 }]} numberOfLines={1}>{inc.monitor}</Text>
                <View style={{ flex: 1.2, alignItems: "center" }}>
                  <Badge status={inc.status} />
                </View>
                <Text style={[S.tdCell, { flex: 1 }]}>{inc.duration}</Text>
                <Text style={[S.tdCell, { flex: 1, fontSize: 7 }]}>{inc.severity ?? "-"}</Text>
                <Text style={[S.tdCell, { flex: 2.5, textAlign: "left", paddingLeft: 4, fontSize: 7 }]} numberOfLines={2}>
                  {inc.message ?? "-"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Footer company={branding.companyName} system={branding.systemName} footer={branding.footerText} />
    </Page>
  );
};

// ─── Page 5: Group Summary ────────────────────────────────────────────────────
const GroupPage = ({ payload }: { payload: PdfReportPayload }) => {
  const { groupSummary, branding } = payload;

  return (
    <Page size="A4" style={S.page}>
      <PageHeader title="Group Summary" sub={`${groupSummary.length} groups`} />
      <View style={S.content}>
        {groupSummary.length === 0 ? (
          <Text style={{ fontSize: 10, color: C.textLight, textAlign: "center", marginTop: 32, fontFamily: "Sarabun" }}>
            ไม่มีข้อมูล Group
          </Text>
        ) : (
          <View style={S.table}>
            <View style={S.tableHeader}>
              {[
                { l: "Group", f: 2.5 },
                { l: "Monitors", f: 1 },
                { l: "Uptime %", f: 1.4 },
                { l: "Checks", f: 1 },
                { l: "Down", f: 0.8 },
                { l: "Degraded", f: 0.9 },
                { l: "Incidents", f: 0.9 },
                { l: "Avg ms", f: 1 },
              ].map(({ l, f }, i) => (
                <Text key={l} style={[S.thCell, { flex: f }, i === 0 ? { textAlign: "left", paddingLeft: 4 } : {}]}>{l}</Text>
              ))}
            </View>
            {groupSummary.map((row, i) => (
              <View key={row.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
                <Text style={[S.tdCellLeft, { flex: 2.5, paddingLeft: 4 }]} numberOfLines={1}>{row.name}</Text>
                <Text style={[S.tdCell, { flex: 1 }]}>{row.monitorCount}</Text>
                <View style={{ flex: 1.4, paddingHorizontal: 2 }}>
                  <Text style={[S.tdCell, { color: fmt.uptimeColor(row.uptime), fontFamily: "Sarabun", fontWeight: "bold" }]}>
                    {fmt.pct(row.uptime)}
                  </Text>
                  <UptimeBar value={row.uptime} />
                </View>
                <Text style={[S.tdCell, { flex: 1 }]}>{row.checks}</Text>
                <Text style={[S.tdCell, { flex: 0.8, color: row.down > 0 ? "#E11D48" : C.text }]}>{row.down}</Text>
                <Text style={[S.tdCell, { flex: 0.9, color: row.degraded > 0 ? "#D97706" : C.text }]}>{row.degraded}</Text>
                <Text style={[S.tdCell, { flex: 0.9, color: row.incidents > 0 ? "#E11D48" : C.text }]}>{row.incidents}</Text>
                <Text style={[S.tdCell, { flex: 1 }]}>{fmt.ms(row.avgResponse)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Footer company={branding.companyName} system={branding.systemName} footer={branding.footerText} />
    </Page>
  );
};

// ─── Document ──────────────────────────────────────────────────────────────────
const AvailabilityReportPdf = ({ payload }: { payload: PdfReportPayload }) => (
  <Document
    title={`Availability Report — ${payload.range.label}`}
    author={payload.branding.companyName || payload.branding.systemName}
    creator="Monitoring Hub"
  >
    <CoverPage payload={payload} />
    <SummaryPage payload={payload} />
    <MonitorPage payload={payload} />
    <IncidentPage payload={payload} />
    <GroupPage payload={payload} />
  </Document>
);

// ─── generator function ───────────────────────────────────────────────────────
export async function generatePdfBlob(payload: PdfReportPayload): Promise<Blob> {
  const doc = <AvailabilityReportPdf payload={payload} />;
  return await pdf(doc).toBlob();
}

export default AvailabilityReportPdf;
