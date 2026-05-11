import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";

type IfaceSnapshot = {
  name: string;
  operStatus: number;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
  inDiscards: number;
  outDiscards: number;
};

type DeviceMetadata = {
  interfaces?: IfaceSnapshot[];
};

type LatestResult = {
  status: "UP" | "DOWN" | "DEGRADED";
  checkedAt: string;
  metadata: DeviceMetadata | null;
};

type Device = {
  id: string;
  name: string;
  type: "SNMP" | "SYSTEM";
  config: { host?: string };
  latestResult: LatestResult | null;
};

type GroupOption = { id: string; name: string };
type ApiResponse<T> = { data: T };
type StatusFilter = "ALL" | "UP" | "DOWN" | "Unknown" | "Issues";
type SortMode =
  | "issues_desc"
  | "traffic_desc"
  | "name_asc"
  | "device_asc"
  | "checked_desc";

type IfaceRow = {
  deviceId: string;
  deviceName: string;
  deviceHost: string;
  deviceType: Device["type"];
  name: string;
  operStatus: number;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
  inDiscards: number;
  outDiscards: number;
  checkedAt: string | null;
  issueScore: number;
  trafficScore: number;
  hasIssues: boolean;
};

const operLabel = (status: number) => (status === 1 ? "UP" : status > 1 ? "DOWN" : "Unknown");
const operClass = (status: number) =>
  status === 1
    ? "bg-emerald-100 text-emerald-700"
    : status > 1
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-500";

const fmtNum = (value: number) => (value > 0 ? value.toLocaleString() : "-");

const initialStringParam = (searchParams: URLSearchParams, key: string, fallback: string) => {
  const value = searchParams.get(key)?.trim();
  return value ? value : fallback;
};

const InterfaceInventoryPage = () => {
  const { t, i18n } = useTranslation();
  const { api } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupFilter, setGroupFilter] = useState<"ALL" | string>(() =>
    initialStringParam(searchParams, "groupId", "ALL"),
  );
  const [deviceFilter, setDeviceFilter] = useState<"ALL" | string>(() =>
    initialStringParam(searchParams, "deviceId", "ALL"),
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    initialStringParam(searchParams, "status", "ALL") as StatusFilter,
  );
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    initialStringParam(searchParams, "sort", "issues_desc") as SortMode,
  );
  const [issuesOnly, setIssuesOnly] = useState(searchParams.get("issuesOnly") === "true");
  const [search, setSearch] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [monitorsRes, groupsRes] = await Promise.all([
        api.get<ApiResponse<Device[]>>("/monitors", {
          params: { groupId: groupFilter === "ALL" ? undefined : groupFilter },
        }),
        api.get<ApiResponse<GroupOption[]>>("/groups"),
      ]);
      const items = (monitorsRes.data.data ?? []).filter((device) => device.type === "SNMP" || device.type === "SYSTEM");
      setDevices(items as Device[]);
      setGroups(groupsRes.data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [api, groupFilter]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (groupFilter === "ALL") next.delete("groupId");
    else next.set("groupId", groupFilter);

    if (deviceFilter === "ALL") next.delete("deviceId");
    else next.set("deviceId", deviceFilter);

    if (statusFilter === "ALL") next.delete("status");
    else next.set("status", statusFilter);

    if (sortMode === "issues_desc") next.delete("sort");
    else next.set("sort", sortMode);

    if (issuesOnly) next.set("issuesOnly", "true");
    else next.delete("issuesOnly");

    if (search.trim()) next.set("q", search.trim());
    else next.delete("q");

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    deviceFilter,
    groupFilter,
    issuesOnly,
    search,
    searchParams,
    setSearchParams,
    sortMode,
    statusFilter,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<IfaceRow[]>(() => {
    const result: IfaceRow[] = [];

    for (const device of devices) {
      const interfaces = device.latestResult?.metadata?.interfaces ?? [];

      for (const iface of interfaces) {
        const inErrors = iface.inErrors ?? 0;
        const outErrors = iface.outErrors ?? 0;
        const inDiscards = iface.inDiscards ?? 0;
        const outDiscards = iface.outDiscards ?? 0;
        const issueScore = inErrors + outErrors + inDiscards + outDiscards;

        result.push({
          deviceId: device.id,
          deviceName: device.name,
          deviceHost: device.config.host ?? "",
          deviceType: device.type,
          name: iface.name,
          operStatus: iface.operStatus,
          inOctets: iface.inOctets ?? 0,
          outOctets: iface.outOctets ?? 0,
          inErrors,
          outErrors,
          inDiscards,
          outDiscards,
          checkedAt: device.latestResult?.checkedAt ?? null,
          issueScore,
          trafficScore: (iface.inOctets ?? 0) + (iface.outOctets ?? 0),
          hasIssues: issueScore > 0,
        });
      }
    }

    return result;
  }, [devices]);

  const deviceOptions = useMemo(
    () =>
      [...devices]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((device) => ({ id: device.id, label: `${device.name}${device.config.host ? ` · ${device.config.host}` : ""}` })),
    [devices],
  );

  const filtered = useMemo(() => {
    const query = search.toLowerCase();

    const next = rows.filter((row) => {
      if (deviceFilter !== "ALL" && row.deviceId !== deviceFilter) return false;
      if (issuesOnly && !row.hasIssues) return false;

      if (statusFilter !== "ALL") {
        if (statusFilter === "Issues" && !row.hasIssues) return false;
        if (statusFilter !== "Issues" && operLabel(row.operStatus) !== statusFilter) return false;
      }

      if (
        query &&
        !row.name.toLowerCase().includes(query) &&
        !row.deviceName.toLowerCase().includes(query) &&
        !row.deviceHost.toLowerCase().includes(query)
      ) {
        return false;
      }

      return true;
    });

    return next.sort((a, b) => {
      switch (sortMode) {
        case "traffic_desc":
          return b.trafficScore - a.trafficScore || a.name.localeCompare(b.name);
        case "name_asc":
          return a.name.localeCompare(b.name) || a.deviceName.localeCompare(b.deviceName);
        case "device_asc":
          return a.deviceName.localeCompare(b.deviceName) || a.name.localeCompare(b.name);
        case "checked_desc":
          return (
            new Date(b.checkedAt ?? 0).getTime() - new Date(a.checkedAt ?? 0).getTime() ||
            b.issueScore - a.issueScore
          );
        case "issues_desc":
        default:
          return (
            b.issueScore - a.issueScore ||
            Number(b.operStatus > 1) - Number(a.operStatus > 1) ||
            b.trafficScore - a.trafficScore
          );
      }
    });
  }, [deviceFilter, issuesOnly, rows, search, sortMode, statusFilter]);

  const totalUp = rows.filter((row) => row.operStatus === 1).length;
  const totalDown = rows.filter((row) => row.operStatus > 1).length;
  const totalUnknown = rows.filter((row) => row.operStatus === 0).length;
  const totalWithIssues = rows.filter((row) => row.hasIssues).length;
  const totalDevices = new Set(rows.map((row) => row.deviceId)).size;
  const topNoisy = filtered.slice(0, 5);
  const statusLabel = (status: number) =>
    status === 1 ? "UP" : status > 1 ? "DOWN" : t("interfaces.statusUnknown");

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("interfaces.subtitle")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("interfaces.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("interfaces.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/devices"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t("interfaces.backToDevices")}
          </Link>
          <Link
            to="/monitors/new"
            className="inline-flex items-center rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            {t("interfaces.addDevice")}
          </Link>
        </div>
      </div>

      {!loading && rows.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label={t("interfaces.summaryInterfaces")} value={rows.length} tone="text-slate-900" />
          <SummaryCard label={t("interfaces.summaryDevices")} value={totalDevices} tone="text-cyan-700" />
          <SummaryCard label="UP" value={totalUp} tone="text-emerald-700" />
          <SummaryCard label="DOWN" value={totalDown} tone="text-rose-700" />
          <SummaryCard label={t("interfaces.summaryIssues")} value={totalWithIssues} tone="text-amber-700" />
        </div>
      ) : null}

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <FilterField label={t("interfaces.filterGroup")}>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={groupFilter}
              onChange={(event) => {
                setGroupFilter(event.target.value);
                setDeviceFilter("ALL");
              }}
            >
              <option value="ALL">{t("interfaces.allGroups")}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label={t("interfaces.filterDevice")}>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={deviceFilter}
              onChange={(event) => setDeviceFilter(event.target.value)}
            >
              <option value="ALL">{t("interfaces.allDevices")}</option>
              {deviceOptions.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label={t("interfaces.filterStatus")}>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="ALL">{t("interfaces.allStatuses")}</option>
              <option value="UP">{t("interfaces.upOnly")}</option>
              <option value="DOWN">{t("interfaces.downOnly")}</option>
              <option value="Unknown">{t("interfaces.statusUnknown")}</option>
              <option value="Issues">{t("interfaces.hasIssues")}</option>
            </select>
          </FilterField>

          <FilterField label={t("interfaces.filterSort")}>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              <option value="issues_desc">{t("interfaces.sortIssues")}</option>
              <option value="traffic_desc">{t("interfaces.sortTraffic")}</option>
              <option value="checked_desc">{t("interfaces.sortChecked")}</option>
              <option value="device_asc">{t("interfaces.sortDevice")}</option>
              <option value="name_asc">{t("interfaces.sortInterface")}</option>
            </select>
          </FilterField>

          <FilterField label={t("interfaces.filterSearch")}>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              placeholder={t("interfaces.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FilterField>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={issuesOnly}
              onChange={(event) => setIssuesOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            {t("interfaces.issuesOnly")}
          </label>
          {(groupFilter !== "ALL" ||
            deviceFilter !== "ALL" ||
            statusFilter !== "ALL" ||
            search.trim() ||
            issuesOnly ||
            sortMode !== "issues_desc") && (
            <button
              type="button"
              onClick={() => {
                setGroupFilter("ALL");
                setDeviceFilter("ALL");
                setStatusFilter("ALL");
                setSearch("");
                setIssuesOnly(false);
                setSortMode("issues_desc");
              }}
              className="text-xs font-semibold text-cyan-700 transition hover:text-cyan-900"
            >
              {t("interfaces.resetFilters")}
            </button>
          )}
          <span className="text-xs text-slate-400">
            {t("interfaces.showing", { filtered: filtered.length, total: rows.length })}
          </span>
        </div>
      </div>

      {!loading && topNoisy.length > 0 ? (
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">{t("interfaces.noisyTitle")}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {t("interfaces.noisyDesc")}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            {topNoisy.map((row) => (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={`${row.deviceId}-${row.name}`}>
                <Link
                  to={`/monitors/${row.deviceId}`}
                  className="text-sm font-semibold text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                >
                  {row.deviceName}
                </Link>
                <p className="mt-1 font-mono text-xs font-semibold text-slate-700">{row.name}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {t("interfaces.errors")} {fmtNum(row.inErrors + row.outErrors)} · {t("interfaces.discards")} {fmtNum(row.inDiscards + row.outDiscards)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t("interfaces.trafficCounters")} {fmtNum(row.trafficScore)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="font-medium text-slate-700">{t("interfaces.noData")}</p>
            <p className="mt-1 text-sm text-slate-400">
              {t("interfaces.emptyHint")}
            </p>
            <Link
              to="/monitors/new"
              className="mt-4 inline-flex items-center rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {t("interfaces.addDevice")}
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            {t("interfaces.noMatch")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("interfaces.colDevice")}</th>
                  <th className="px-4 py-3">{t("interfaces.colInterface")}</th>
                  <th className="px-4 py-3">{t("interfaces.colStatus")}</th>
                  <th className="px-4 py-3 text-right">{t("interfaces.colIssueScore")}</th>
                  <th className="px-4 py-3 text-right">{t("interfaces.colInOctets")}</th>
                  <th className="px-4 py-3 text-right">{t("interfaces.colOutOctets")}</th>
                  <th className="px-4 py-3 text-right">{t("interfaces.colInErrors")}</th>
                  <th className="px-4 py-3 text-right">{t("interfaces.colOutErrors")}</th>
                  <th className="px-4 py-3 text-right">{t("interfaces.colInDiscards")}</th>
                  <th className="px-4 py-3 text-right">{t("interfaces.colOutDiscards")}</th>
                  <th className="px-4 py-3">{t("interfaces.colLastChecked")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row, index) => (
                  <tr
                    key={`${row.deviceId}-${row.name}-${index}`}
                    className={[
                      "transition hover:bg-slate-50",
                      row.hasIssues ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        to={`/monitors/${row.deviceId}`}
                        className="font-medium text-slate-800 underline-offset-2 transition hover:text-cyan-600 hover:underline"
                      >
                        {row.deviceName}
                      </Link>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {row.deviceType}
                        {row.deviceHost ? ` · ${row.deviceHost}` : ""}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-700">{row.name}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${operClass(row.operStatus)}`}>
                        {statusLabel(row.operStatus)}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${row.hasIssues ? "text-amber-700" : "text-slate-400"}`}>
                      {fmtNum(row.issueScore)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                      {fmtNum(row.inOctets)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                      {fmtNum(row.outOctets)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.inErrors > 0 ? "text-amber-700" : "text-slate-400"}`}>
                      {fmtNum(row.inErrors)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.outErrors > 0 ? "text-amber-700" : "text-slate-400"}`}>
                      {fmtNum(row.outErrors)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.inDiscards > 0 ? "text-orange-600" : "text-slate-400"}`}>
                      {fmtNum(row.inDiscards)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.outDiscards > 0 ? "text-orange-600" : "text-slate-400"}`}>
                      {fmtNum(row.outDiscards)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                      {row.checkedAt
                        ? new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(row.checkedAt))
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 ? (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            {t("interfaces.footer", {
              interfaces: filtered.length,
              devices: new Set(filtered.map((row) => row.deviceId)).size,
            })}
            {totalUnknown > 0 ? <span className="ml-3">· {t("interfaces.unknownCount", { count: totalUnknown })}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const FilterField = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-slate-600">{label}</span>
    <div className="mt-1.5">{children}</div>
  </label>
);

const SummaryCard = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
    <p className={`text-2xl font-bold ${tone}`}>{value.toLocaleString()}</p>
    <p className="mt-0.5 text-xs text-slate-500">{label}</p>
  </div>
);

export default InterfaceInventoryPage;
