import * as snmp from "net-snmp";
import { snmpGet, snmpSubtreeWalk, snmpVersion, safeNumber } from "./snmp.shared";
import type { CheckResult } from "./snmp.Checker";

// Standard Printer MIB (RFC 3805) + Host Resources MIB
const PRINTER_STATUS_OID = "1.3.6.1.2.1.25.3.5.1.1.1";
const PRINTER_ERROR_OID  = "1.3.6.1.2.1.25.3.5.1.2.1";
const TONER_DESC_OID     = "1.3.6.1.2.1.43.11.1.1.23.1";
const TONER_LEVEL_OID    = "1.3.6.1.2.1.43.11.1.1.9.1";
const TONER_MAX_OID      = "1.3.6.1.2.1.43.11.1.1.8.1";
const PAPER_DESC_OID     = "1.3.6.1.2.1.43.8.2.1.18.1";
const PAPER_LEVEL_OID    = "1.3.6.1.2.1.43.8.2.1.10.1";
const PAPER_MAX_OID      = "1.3.6.1.2.1.43.8.2.1.9.1";

// hrPrinterDetectedErrorState bitmask — MSB first
const ERROR_BITS = [
  "Low paper", "No paper", "Low toner", "No toner",
  "Door open", "Jammed", "Offline", "Service required",
] as const;

const HR_STATUS: Record<number, string> = { 3: "Idle", 4: "Printing", 5: "Error" };

export interface PrinterConfig {
  host: string;
  port?: number;
  community?: string;
  version?: "1" | "2c";
  timeoutMs?: number;
  printerPreset: "status" | "toner" | "paper" | "full";
  tonerAlertThreshold?: number;
  paperAlertThreshold?: number;
}

export interface TonerInfo {
  name: string;
  level: number;
  max: number;
  percent: number | null;
}

export interface PaperInfo {
  name: string;
  level: number;
  max: number;
  percent: number | null;
}

export interface PrinterInfo {
  printerStatus?: number;
  printerStatusLabel?: string;
  errorBits?: string[];
  toners?: TonerInfo[];
  papers?: PaperInfo[];
}

function parseBitmask(value: unknown): string[] {
  let byte0 = 0;
  if (Buffer.isBuffer(value)) byte0 = value[0] ?? 0;
  else if (typeof value === "number") byte0 = value;
  return ERROR_BITS.filter((_, i) => (byte0 & (0x80 >> i)) !== 0);
}

function walkIndexMap(vbs: snmp.Varbind[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const vb of vbs) {
    const idx = vb.oid.split(".").pop();
    if (idx) map.set(idx, vb.value);
  }
  return map;
}

const CRITICAL_ERRORS = new Set(["No paper", "No toner", "Door open", "Jammed", "Offline"]);

export async function printerCheck(config: PrinterConfig): Promise<CheckResult> {
  const start = Date.now();
  const session = snmp.createSession(config.host, config.community ?? "public", {
    port: config.port ?? 161,
    version: snmpVersion(config.version),
    timeout: config.timeoutMs ?? 5000,
    retries: 1,
  });

  try {
    const printerInfo: PrinterInfo = {};
    const issues: string[] = [];
    const tonerThreshold = config.tonerAlertThreshold ?? 15;
    const paperThreshold = config.paperAlertThreshold ?? 10;
    const includeStatus = config.printerPreset === "status" || config.printerPreset === "full";
    const includeToner  = config.printerPreset === "toner"  || config.printerPreset === "full";
    const includePaper  = config.printerPreset === "paper"  || config.printerPreset === "full";

    if (includeStatus) {
      const vbs = await snmpGet(session, [PRINTER_STATUS_OID, PRINTER_ERROR_OID]);
      for (const vb of vbs) {
        if (snmp.isVarbindError(vb)) continue;
        if (vb.oid === PRINTER_STATUS_OID) {
          const st = safeNumber(vb.value);
          printerInfo.printerStatus = st;
          printerInfo.printerStatusLabel = HR_STATUS[st] ?? "Unknown";
          if (st === 5) issues.push("Printer in error state");
        }
        if (vb.oid === PRINTER_ERROR_OID) {
          const bits = parseBitmask(vb.value);
          printerInfo.errorBits = bits;
          issues.push(...bits.filter((b) => CRITICAL_ERRORS.has(b)));
        }
      }
    }

    if (includeToner) {
      const [descVbs, levelVbs, maxVbs] = await Promise.all([
        snmpSubtreeWalk(session, TONER_DESC_OID),
        snmpSubtreeWalk(session, TONER_LEVEL_OID),
        snmpSubtreeWalk(session, TONER_MAX_OID),
      ]);
      const descMap  = walkIndexMap(descVbs);
      const levelMap = walkIndexMap(levelVbs);
      const maxMap   = walkIndexMap(maxVbs);
      const toners: TonerInfo[] = [];

      for (const [idx, desc] of descMap) {
        const level = safeNumber(levelMap.get(idx));
        const max   = safeNumber(maxMap.get(idx));
        if (level < 0) continue; // -1 / -2 = unknown
        const percent = max > 0 ? Math.round((level / max) * 100) : null;
        const name    = desc?.toString() ?? `Cartridge ${idx}`;
        toners.push({ name, level, max, percent });
        if (percent !== null && percent < tonerThreshold) {
          issues.push(`${name}: ${percent}% remaining`);
        }
      }
      printerInfo.toners = toners;
    }

    if (includePaper) {
      const [descVbs, levelVbs, maxVbs] = await Promise.all([
        snmpSubtreeWalk(session, PAPER_DESC_OID),
        snmpSubtreeWalk(session, PAPER_LEVEL_OID),
        snmpSubtreeWalk(session, PAPER_MAX_OID),
      ]);
      const descMap  = walkIndexMap(descVbs);
      const levelMap = walkIndexMap(levelVbs);
      const maxMap   = walkIndexMap(maxVbs);
      const papers: PaperInfo[] = [];

      for (const [idx, desc] of descMap) {
        const level = safeNumber(levelMap.get(idx));
        const max   = safeNumber(maxMap.get(idx));
        if (max < 0) continue; // unknown max
        const percent = max > 0 ? Math.round((level / max) * 100) : null;
        const name    = desc?.toString() ?? `Tray ${idx}`;
        papers.push({ name, level, max, percent });
        if (percent !== null && percent < paperThreshold) {
          issues.push(`${name}: ${percent}% paper remaining`);
        }
      }
      printerInfo.papers = papers;
    }

    const hasCritical = issues.some(
      (msg) => CRITICAL_ERRORS.has(msg) || msg === "Printer in error state",
    );

    return {
      status: hasCritical ? "DEGRADED" : "UP",
      responseTimeMs: Date.now() - start,
      message: issues.length > 0 ? issues.slice(0, 3).join(" | ") : undefined,
      metadata: { host: config.host, printer: printerInfo },
    };
  } catch (error) {
    return {
      status: "DOWN",
      responseTimeMs: Date.now() - start,
      message: error instanceof Error ? error.message : "SNMP error",
      metadata: { host: config.host },
    };
  } finally {
    session.close();
  }
}
