import { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";

type DiscoverySource =
  | "crt.sh"
  | "dns-bruteforce"
  | "subfinder"
  | "assetfinder"
  | "securitytrails"
  | "alienvault-otx"
  | "commoncrawl"
  | "wayback";

interface SubdomainInfo {
  host: string;
  source?: DiscoverySource[];
  confidenceScore?: number;
  firstSeen?: string | null;
  lastSeen?: string | null;
  online: boolean;
  hasSSL: boolean;
  ip: string | null;
  aRecords?: string[];
  cnameRecords?: string[];
  sslExpiresAt?: string;
  sslIssuer?: string;
}

interface DomainResult {
  success: boolean;
  domain: string;
  registrar: string | null;
  nameservers: string[];
  dnsProvider: string;
  subdomains: SubdomainInfo[];
}

interface HistoryItem {
  id: string;
  domain: string;
  registrar: string | null;
  dnsProvider: string;
  nameserverCount: number;
  subdomainCount: number;
  onlineCount: number;
  durationMs: number;
  scannerIp: string | null;
  scannedAt: string;
}

interface HistoryPage {
  items: HistoryItem[];
  total: number;
  page: number;
  totalPages: number;
}

type ScanPhase = "idle" | "scanning" | "done" | "error";
type ActiveTab = "scan" | "history";

const dtFmt = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
});

export default function DomainIntelligencePage() {
  const { get } = useApi();

  // --- scan state ---
  const [activeTab, setActiveTab] = useState<ActiveTab>("scan");
  const [input, setInput] = useState("");
  const [consented, setConsented] = useState(false);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [result, setResult] = useState<DomainResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // --- history state ---
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await get<{ data: HistoryPage }>(`/domain/history?page=${page}&limit=20`);
      setHistory(res.data.data);
      setHistoryPage(page);
    } catch {
      // silently fail — history is non-critical
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") void loadHistory(historyPage);
  }, [activeTab]);

  const handleScan = async () => {
    const domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
    if (!domain || !consented) return;

    setPhase("scanning");
    setResult(null);
    setErrorMsg("");

    try {
      const res = await get<DomainResult>(`/domain/${domain}`, { timeout: 0 });
      setResult(res.data);
      setPhase("done");
    } catch {
      setErrorMsg("ไม่สามารถวิเคราะห์ domain ได้ กรุณาตรวจสอบชื่อ domain และลองใหม่อีกครั้ง");
      setPhase("error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleScan();
  };

  const reScan = (domain: string) => {
    setInput(domain);
    setActiveTab("scan");
  };

  const onlineCount = result?.subdomains.filter((s) => s.online).length ?? 0;
  const sslCount = result?.subdomains.filter((s) => s.hasSSL).length ?? 0;
  const avgConfidence = result?.subdomains.length
    ? Math.round(
        result.subdomains.reduce((acc, s) => acc + (s.confidenceScore ?? 0), 0) /
          result.subdomains.length,
      )
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Domain Intelligence</h1>
          <p className="mt-1 text-sm text-slate-500">
            วิเคราะห์ข้อมูล registrar, DNS, nameserver และ subdomains ของ domain
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {(["scan", "history"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
              activeTab === tab
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {tab === "scan" ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                สแกน
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                ประวัติการสแกน
                {history && history.total > 0 && (
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                    {history.total}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* ========== SCAN TAB ========== */}
      {activeTab === "scan" && (
        <>
          {/* Legal notice */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-800">ข้อควรระวังทางกฎหมาย</p>
                <p className="mt-1 text-xs leading-5 text-amber-700">
                  เครื่องมือนี้ทำการ query DNS สาธารณะ, เปิด TCP connection, และส่ง HTTP/TLS request
                  ไปยัง server เป้าหมายโดยตรง การใช้กับ domain ที่ไม่ได้รับอนุญาตอาจผิด{" "}
                  <strong>พ.ร.บ. คอมพิวเตอร์ฯ มาตรา 5–7</strong> และกฎหมายอาชญากรรมคอมพิวเตอร์ในประเทศอื่น
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={consented}
                    onChange={(e) => setConsented(e.target.checked)}
                    disabled={phase === "scanning"}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-amber-300 accent-amber-500"
                  />
                  <span className="text-xs font-medium leading-5 text-amber-800">
                    ฉันยืนยันว่า domain ที่จะสแกนเป็นของฉัน หรือได้รับอนุญาตเป็นลายลักษณ์อักษรจากเจ้าของแล้ว
                    และรับผิดชอบต่อการใช้งานนี้ทั้งหมด
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="example.com"
              disabled={phase === "scanning"}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleScan()}
              disabled={phase === "scanning" || !input.trim() || !consented}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "scanning" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  กำลังวิเคราะห์...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  วิเคราะห์
                </>
              )}
            </button>
          </div>

          {/* Scanning skeleton */}
          {phase === "scanning" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
              <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
              <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
                กำลังตรวจ passive sources, external tools, DNS records และ HTTP services
              </div>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errorMsg}
            </div>
          )}

          {/* Results */}
          {phase === "done" && result && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SummaryCard
                  label="Registrar"
                  value={result.registrar ?? "ไม่พบข้อมูล"}
                  icon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                  }
                />
                <SummaryCard
                  label="DNS Provider"
                  value={result.dnsProvider}
                  icon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16A8 8 0 0010 2zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
                    </svg>
                  }
                />
                <SummaryCard
                  label="Subdomains พบ"
                  value={`${result.subdomains.length} host · ${onlineCount} active · ${sslCount} SSL · ${avgConfidence}% confidence`}
                  icon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                  }
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Nameservers</h2>
                {result.nameservers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {result.nameservers.map((ns) => (
                      <span key={ns} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs text-slate-700">
                        {ns}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">ไม่พบ nameserver</p>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-slate-700">Subdomains ({result.subdomains.length})</h2>
                </div>
                {result.subdomains.length === 0 ? (
                  <div className="space-y-1 py-12 text-center text-sm text-slate-400">
                    <p>ไม่พบ subdomains จาก passive sources</p>
                    <p>ระบบได้ลอง external tools และ DNS Bruteforce เพิ่มเติมแล้ว</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-5 py-3">Host</th>
                          <th className="px-4 py-3">Source</th>
                          <th className="px-4 py-3">Confidence</th>
                          <th className="px-4 py-3">IP</th>
                          <th className="px-4 py-3">CNAME</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">SSL</th>
                          <th className="px-4 py-3">Last Seen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.subdomains.map((sub) => (
                          <tr key={sub.host} className="transition hover:bg-slate-50">
                            <td className="px-5 py-3 font-mono text-xs text-slate-800">{sub.host}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {(sub.source ?? ["crt.sh"]).map((src) => (
                                  <SourceBadge key={`${sub.host}-${src}`} source={src} />
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{sub.confidenceScore ?? 0}%</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                              {sub.aRecords?.[0] ?? sub.ip ?? <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                              {sub.cnameRecords?.length ? sub.cnameRecords.join(", ") : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {sub.online ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Offline
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {sub.hasSSL ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-700">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                  </svg>
                                  Valid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                                  </svg>
                                  No SSL
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {sub.lastSeen ? new Date(sub.lastSeen).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== HISTORY TAB ========== */}
      {activeTab === "history" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-700">
              ประวัติการสแกน{history ? ` (${history.total} รายการ)` : ""}
            </h2>
            <button
              type="button"
              onClick={() => void loadHistory(historyPage)}
              disabled={historyLoading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              รีเฟรช
            </button>
          </div>

          {historyLoading && !history ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : !history || history.items.length === 0 ? (
            <div className="py-16 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-10 w-10 text-slate-300" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <p className="mt-3 text-sm font-medium text-slate-500">ยังไม่มีประวัติการสแกน</p>
              <p className="mt-1 text-xs text-slate-400">สแกน domain แรกแล้วมาดูที่นี่</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Domain</th>
                      <th className="px-4 py-3">Registrar</th>
                      <th className="px-4 py-3">DNS Provider</th>
                      <th className="px-4 py-3">NS</th>
                      <th className="px-4 py-3">Subdomains</th>
                      <th className="px-4 py-3">Online</th>
                      <th className="px-4 py-3">ใช้เวลา</th>
                      <th className="px-4 py-3">Scanner IP</th>
                      <th className="px-4 py-3">เวลาสแกน</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.items.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-800">{item.domain}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{item.registrar ?? <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{item.dnsProvider}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{item.nameserverCount}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{item.subdomainCount}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {item.onlineCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.durationMs >= 1000 ? `${(item.durationMs / 1000).toFixed(1)}s` : `${item.durationMs}ms`}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{item.scannerIp ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{dtFmt.format(new Date(item.scannedAt))}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => reScan(item.domain)}
                            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            สแกนอีกครั้ง
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {history.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                  <p className="text-xs text-slate-500">
                    หน้า {history.page} / {history.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={history.page <= 1 || historyLoading}
                      onClick={() => void loadHistory(history.page - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      ← ก่อนหน้า
                    </button>
                    <button
                      type="button"
                      disabled={history.page >= history.totalPages || historyLoading}
                      onClick={() => void loadHistory(history.page + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      ถัดไป →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: DiscoverySource }) {
  const palette: Record<DiscoverySource, string> = {
    "crt.sh": "border-sky-200 bg-sky-50 text-sky-700",
    "dns-bruteforce": "border-emerald-200 bg-emerald-50 text-emerald-700",
    subfinder: "border-indigo-200 bg-indigo-50 text-indigo-700",
    assetfinder: "border-violet-200 bg-violet-50 text-violet-700",
    securitytrails: "border-amber-200 bg-amber-50 text-amber-700",
    "alienvault-otx": "border-rose-200 bg-rose-50 text-rose-700",
    commoncrawl: "border-slate-200 bg-slate-50 text-slate-700",
    wayback: "border-cyan-200 bg-cyan-50 text-cyan-700",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${palette[source]}`}>{source}</span>
  );
}
