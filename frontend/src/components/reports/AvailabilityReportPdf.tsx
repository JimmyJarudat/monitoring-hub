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

// ─── types (mirrored from reports page) ──────────────────────────────────────
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
    if (v >= 99) return "#16A34A";
    if (v >= 95) return "#D97706";
    return "#E11D48";
  },
  statusColor: (s: MonitorStatus | IncidentStatus | null): string => {
    if (s === "UP" || s === "RESOLVED") return "#16A34A";
    if (s === "DOWN" || s === "OPEN") return "#E11D48";
    if (s === "DEGRADED" || s === "ACKNOWLEDGED") return "#D97706";
    return "#94A3B8";
  },
  statusBg: (s: MonitorStatus | IncidentStatus | null): string => {
    if (s === "UP" || s === "RESOLVED") return "#DCFCE7";
    if (s === "DOWN" || s === "OPEN") return "#FFE4E6";
    if (s === "DEGRADED" || s === "ACKNOWLEDGED") return "#FEF3C7";
    return "#F1F5F9";
  },
};

// ─── styles ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { fontFamily: "Helvetica", backgroundColor: "#F8FAFC", paddingBottom: 40 },
  coverPage: { fontFamily: "Helvetica", backgroundColor: "#0F172A" },
  // footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: "#94A3B8" },
  // cover
  coverContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
  coverLogo: { width: 80, height: 80, objectFit: "contain", marginBottom: 24 },
  coverTitle: { fontSize: 32, fontFamily: "Helvetica-Bold", color: "#F8FAFC", textAlign: "center", marginBottom: 8 },
  coverSubtitle: { fontSize: 14, color: "#94A3B8", textAlign: "center", marginBottom: 40 },
  coverDivider: { width: 60, height: 2, backgroundColor: "#06B6D4", marginBottom: 40 },
  coverReportLabel: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#E2E8F0", textAlign: "center", marginBottom: 12 },
  coverRange: { fontSize: 11, color: "#CBD5E1", textAlign: "center", marginBottom: 6 },
  coverGenerated: { fontSize: 9, color: "#64748B", textAlign: "center" },
  // page header
  pageHeader: { backgroundColor: "#0F172A", paddingHorizontal: 24, paddingVertical: 14 },
  pageHeaderTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#F8FAFC" },
  pageHeaderSub: { fontSize: 8, color: "#94A3B8", marginTop: 2 },
  // content
  content: { paddingHorizontal: 24, paddingTop: 16 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0F172A", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  // stat cards
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, minWidth: "28%", backgroundColor: "#FFFFFF", borderRadius: 6, padding: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  statLabel: { fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  statValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#0F172A" },
  statUnit: { fontSize: 8, color: "#64748B", marginTop: 2 },
  // uptime banner
  uptimeBanner: { borderRadius: 6, padding: 12, marginBottom: 16, alignItems: "center" },
  uptimeValue: { fontSize: 36, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },
  uptimeLabel: { fontSize: 9, color: "#FFFFFF", opacity: 0.8, marginTop: 2 },
  // table
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: "row", backgroundColor: "#0F172A", borderRadius: 4, paddingVertical: 6, paddingHorizontal: 4 },
  tableHeaderCell: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#E2E8F0", textAlign: "center" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  tableRowAlt: { backgroundColor: "#F8FAFC" },
  tableCell: { fontSize: 7, color: "#0F172A", textAlign: "center" },
  tableCellLeft: { fontSize: 7, color: "#0F172A", textAlign: "left" },
  // badge
  badge: { borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5, alignSelf: "center" },
  badgeText: { fontSize: 6, fontFamily: "Helvetica-Bold" },
  // uptime bar
  uptimeBarBg: { backgroundColor: "#E2E8F0", borderRadius: 3, height: 6, marginTop: 2 },
  uptimeBarFill: { borderRadius: 3, height: 6 },
  // divider
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 12 },
});

// ─── shared components ────────────────────────────────────────────────────────
const Footer = ({ company, system, footer, pageNum }: { company: string; system: string; footer: string; pageNum?: string }) => (
  <View style={S.footer} fixed>
    <Text style={S.footerText}>{company || system}</Text>
    <Text style={S.footerText}>{footer || "Availability Report"}</Text>
    <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>
);

const PageHeader = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={S.pageHeader}>
    <Text style={S.pageHeaderTitle}>{title}</Text>
    {sub ? <Text style={S.pageHeaderSub}>{sub}</Text> : null}
  </View>
);

const UptimeBar = ({ value }: { value: number | null }) => (
  <View style={S.uptimeBarBg}>
    <View style={[S.uptimeBarFill, { width: `${value ?? 0}%`, backgroundColor: fmt.uptimeColor(value) }]} />
  </View>
);

const Badge = ({ status }: { status: MonitorStatus | IncidentStatus | null }) => (
  <View style={[S.badge, { backgroundColor: fmt.statusBg(status) }]}>
    <Text style={[S.badgeText, { color: fmt.statusColor(status) }]}>{status ?? "N/A"}</Text>
  </View>
);

// ─── Page 1: Cover ───────────────────────────────────────────────────────────
const CoverPage = ({ payload }: { payload: PdfReportPayload }) => {
  const { branding, range, generatedAt } = payload;
  const displayName = branding.companyName || branding.systemName;

  return (
    <Page size="A4" style={S.coverPage}>
      <View style={S.coverContent}>
        {branding.logoUrl ? (
          <Image style={S.coverLogo} src={branding.logoUrl} />
        ) : (
          <View style={{ width: 64, height: 64, backgroundColor: "#06B6D4", borderRadius: 12, marginBottom: 24, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 28, fontFamily: "Helvetica-Bold", color: "#FFFFFF" }}>
              {displayName.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={S.coverTitle}>{displayName}</Text>
        <Text style={S.coverSubtitle}>{branding.systemName}</Text>

        <View style={S.coverDivider} />

        <Text style={S.coverReportLabel}>Availability Report</Text>
        <Text style={S.coverRange}>{range.label}</Text>
        <Text style={S.coverRange}>{fmt.dt(range.from)} → {fmt.dt(range.to)}</Text>
        <Text style={S.coverGenerated}>Generated: {fmt.dt(generatedAt)}</Text>

        {branding.footerText ? (
          <Text style={{ fontSize: 8, color: "#475569", marginTop: 40, fontStyle: "italic" }}>
            {branding.footerText}
          </Text>
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
    { label: "UP Checks", value: summary.up.toLocaleString(), unit: "" },
    { label: "DOWN Checks", value: summary.down.toLocaleString(), unit: "" },
    { label: "DEGRADED", value: summary.degraded.toLocaleString(), unit: "" },
    { label: "Incidents", value: summary.incidents.toLocaleString(), unit: `${summary.openIncidents} open` },
    { label: "Avg Response", value: summary.avgResponseMs != null ? String(summary.avgResponseMs) : "N/A", unit: summary.avgResponseMs != null ? "ms" : "" },
  ];

  return (
    <Page size="A4" style={S.page}>
      <PageHeader title="Executive Summary" sub={`${payload.range.label}  ·  Generated ${fmt.dt(payload.generatedAt)}`} />
      <View style={S.content}>
        {/* Uptime banner */}
        <View style={[S.uptimeBanner, { backgroundColor: uptimeBg, marginBottom: 16 }]}>
          <Text style={S.uptimeValue}>{fmt.pct(summary.reportUptime)}</Text>
          <Text style={S.uptimeLabel}>Report Uptime</Text>
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
        <View style={[S.statGrid, { marginBottom: 16 }]}>
          <View style={[S.statCard, { flex: 1 }]}>
            <Text style={S.statLabel}>Fleet Uptime (24h)</Text>
            <Text style={[S.statValue, { fontSize: 16, color: fmt.uptimeColor(summary.fleetUptime24h) }]}>
              {fmt.pct(summary.fleetUptime24h)}
            </Text>
          </View>
          <View style={[S.statCard, { flex: 1 }]}>
            <Text style={S.statLabel}>Fleet Avg Response (24h)</Text>
            <Text style={[S.statValue, { fontSize: 16 }]}>
              {fmt.ms(summary.fleetAvgResponseMs)}
            </Text>
          </View>
        </View>

        {/* Status distribution */}
        <Text style={S.sectionTitle}>Status Distribution</Text>
        <View style={S.table}>
          <View style={S.tableHeader}>
            {["Status", "Count", "% of Checks"].map((h) => (
              <Text key={h} style={[S.tableHeaderCell, { flex: 1 }]}>{h}</Text>
            ))}
          </View>
          {[
            { status: "UP" as MonitorStatus, count: summary.up },
            { status: "DEGRADED" as MonitorStatus, count: summary.degraded },
            { status: "DOWN" as MonitorStatus, count: summary.down },
          ].map((row, i) => (
            <View key={row.status} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Badge status={row.status} />
              </View>
              <Text style={[S.tableCell, { flex: 1 }]}>{row.count.toLocaleString()}</Text>
              <Text style={[S.tableCell, { flex: 1, color: fmt.statusColor(row.status) }]}>
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
                {["Monitor", "Uptime %", "Down", "Degraded"].map((h, i) => (
                  <Text key={h} style={[S.tableHeaderCell, i === 0 ? { flex: 3, textAlign: "left", paddingLeft: 4 } : { flex: 1 }]}>{h}</Text>
                ))}
              </View>
              {payload.monitorRanking.slice(0, 5).map((row, i) => (
                <View key={row.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                  <Text style={[S.tableCellLeft, { flex: 3, paddingLeft: 4 }]} numberOfLines={1}>{row.monitor}</Text>
                  <Text style={[S.tableCell, { flex: 1, color: fmt.uptimeColor(row.uptime) }]}>
                    {fmt.pct(row.uptime)}
                  </Text>
                  <Text style={[S.tableCell, { flex: 1, color: row.down > 0 ? "#E11D48" : "#0F172A" }]}>{row.down}</Text>
                  <Text style={[S.tableCell, { flex: 1, color: row.degraded > 0 ? "#D97706" : "#0F172A" }]}>{row.degraded}</Text>
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
      <PageHeader title="Monitor Reliability Ranking" sub={`${monitorRanking.length} monitors · sorted by uptime (worst first)`} />
      <View style={S.content}>
        <View style={S.table}>
          <View style={S.tableHeader}>
            {[
              { label: "Monitor", flex: 3 },
              { label: "Type", flex: 1.2 },
              { label: "Uptime %", flex: 1.2 },
              { label: "Checks", flex: 0.9 },
              { label: "Down", flex: 0.8 },
              { label: "Avg ms", flex: 1 },
              { label: "Last", flex: 1.2 },
            ].map(({ label, flex }, i) => (
              <Text
                key={label}
                style={[S.tableHeaderCell, { flex }, i === 0 ? { textAlign: "left", paddingLeft: 4 } : {}]}
              >
                {label}
              </Text>
            ))}
          </View>

          {monitorRanking.map((row, i) => (
            <View key={row.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
              <Text style={[S.tableCellLeft, { flex: 3, paddingLeft: 4 }]} numberOfLines={1}>{row.monitor}</Text>
              <Text style={[S.tableCell, { flex: 1.2, fontSize: 6 }]}>{row.type}</Text>
              <View style={{ flex: 1.2, paddingHorizontal: 2 }}>
                <Text style={[S.tableCell, { color: fmt.uptimeColor(row.uptime), fontFamily: "Helvetica-Bold" }]}>
                  {fmt.pct(row.uptime)}
                </Text>
                <UptimeBar value={row.uptime} />
              </View>
              <Text style={[S.tableCell, { flex: 0.9 }]}>{row.checks}</Text>
              <Text style={[S.tableCell, { flex: 0.8, color: row.down > 0 ? "#E11D48" : "#0F172A" }]}>{row.down}</Text>
              <Text style={[S.tableCell, { flex: 1 }]}>{fmt.ms(row.avgResponse)}</Text>
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

// ─── Page 4: Incident Report ─────────────────────────────────────────────────
const IncidentPage = ({ payload }: { payload: PdfReportPayload }) => {
  const { incidents, branding } = payload;

  return (
    <Page size="A4" style={S.page}>
      <PageHeader title="Incident Report" sub={`${incidents.length} incidents in range`} />
      <View style={S.content}>
        {incidents.length === 0 ? (
          <Text style={{ fontSize: 10, color: "#94A3B8", textAlign: "center", marginTop: 32 }}>
            No incidents in this time range.
          </Text>
        ) : (
          <View style={S.table}>
            <View style={S.tableHeader}>
              {[
                { label: "Started", flex: 1.8 },
                { label: "Monitor", flex: 2.5 },
                { label: "Status", flex: 1.2 },
                { label: "Duration", flex: 1 },
                { label: "Severity", flex: 1 },
                { label: "Message", flex: 2.5 },
              ].map(({ label, flex }, i) => (
                <Text
                  key={label}
                  style={[S.tableHeaderCell, { flex }, i <= 1 ? { textAlign: "left", paddingLeft: 4 } : {}]}
                >
                  {label}
                </Text>
              ))}
            </View>

            {incidents.map((inc, i) => (
              <View key={inc.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
                <Text style={[S.tableCellLeft, { flex: 1.8, fontSize: 6, paddingLeft: 4 }]}>{fmt.dt(inc.startedAt)}</Text>
                <Text style={[S.tableCellLeft, { flex: 2.5, paddingLeft: 4 }]} numberOfLines={1}>{inc.monitor}</Text>
                <View style={{ flex: 1.2, alignItems: "center" }}>
                  <Badge status={inc.status} />
                </View>
                <Text style={[S.tableCell, { flex: 1 }]}>{inc.duration}</Text>
                <Text style={[S.tableCell, { flex: 1, fontSize: 6 }]}>{inc.severity ?? "-"}</Text>
                <Text style={[S.tableCell, { flex: 2.5, textAlign: "left", paddingLeft: 4, fontSize: 6 }]} numberOfLines={2}>
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
          <Text style={{ fontSize: 10, color: "#94A3B8", textAlign: "center", marginTop: 32 }}>
            No group data available.
          </Text>
        ) : (
          <View style={S.table}>
            <View style={S.tableHeader}>
              {[
                { label: "Group", flex: 2.5 },
                { label: "Monitors", flex: 1 },
                { label: "Uptime %", flex: 1.4 },
                { label: "Checks", flex: 1 },
                { label: "Down", flex: 0.8 },
                { label: "Degraded", flex: 0.9 },
                { label: "Incidents", flex: 0.9 },
                { label: "Avg ms", flex: 1 },
              ].map(({ label, flex }, i) => (
                <Text
                  key={label}
                  style={[S.tableHeaderCell, { flex }, i === 0 ? { textAlign: "left", paddingLeft: 4 } : {}]}
                >
                  {label}
                </Text>
              ))}
            </View>

            {groupSummary.map((row, i) => (
              <View key={row.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
                <Text style={[S.tableCellLeft, { flex: 2.5, paddingLeft: 4 }]} numberOfLines={1}>{row.name}</Text>
                <Text style={[S.tableCell, { flex: 1 }]}>{row.monitorCount}</Text>
                <View style={{ flex: 1.4, paddingHorizontal: 2 }}>
                  <Text style={[S.tableCell, { color: fmt.uptimeColor(row.uptime), fontFamily: "Helvetica-Bold" }]}>
                    {fmt.pct(row.uptime)}
                  </Text>
                  <UptimeBar value={row.uptime} />
                </View>
                <Text style={[S.tableCell, { flex: 1 }]}>{row.checks}</Text>
                <Text style={[S.tableCell, { flex: 0.8, color: row.down > 0 ? "#E11D48" : "#0F172A" }]}>{row.down}</Text>
                <Text style={[S.tableCell, { flex: 0.9, color: row.degraded > 0 ? "#D97706" : "#0F172A" }]}>{row.degraded}</Text>
                <Text style={[S.tableCell, { flex: 0.9, color: row.incidents > 0 ? "#E11D48" : "#0F172A" }]}>{row.incidents}</Text>
                <Text style={[S.tableCell, { flex: 1 }]}>{fmt.ms(row.avgResponse)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Footer company={branding.companyName} system={branding.systemName} footer={branding.footerText} />
    </Page>
  );
};

// ─── Document ─────────────────────────────────────────────────────────────────
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

// ─── export generator ─────────────────────────────────────────────────────────
export async function generatePdfBlob(payload: PdfReportPayload): Promise<Blob> {
  const doc = <AvailabilityReportPdf payload={payload} />;
  return await pdf(doc).toBlob();
}

export default AvailabilityReportPdf;
