import type { SubdomainDiscoveryPlugin } from "../types";
import { fetchJson, fetchText, toSourceResults } from "../utils";

const TIMEOUT_MS = 8000;

interface CommonCrawlIndex {
  id?: string;
}

interface CommonCrawlRecord {
  url?: string;
  timestamp?: string;
}

export const commonCrawlPlugin: SubdomainDiscoveryPlugin = {
  name: "commoncrawl",
  confidence: 25,
  timeoutMs: TIMEOUT_MS,
  async discover(domain) {
    const indexes = await fetchJson<CommonCrawlIndex[]>(
      "https://index.commoncrawl.org/collinfo.json",
      TIMEOUT_MS,
    );
    const index = indexes?.[0]?.id;
    if (!index) return [];

    const text = await fetchText(
      `https://index.commoncrawl.org/${encodeURIComponent(index)}-index?url=*.${encodeURIComponent(domain)}/*&output=json&fl=url,timestamp`,
      TIMEOUT_MS,
      { Accept: "application/json" },
    );
    if (!text) return [];

    const records = text
      .split(/\r?\n/)
      .map((line) => {
        try {
          return JSON.parse(line) as CommonCrawlRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is CommonCrawlRecord => record !== null);

    return toSourceResults(
      records.map((record) => ({
        host: record.url ?? "",
        firstSeen: record.timestamp,
        lastSeen: record.timestamp,
      })),
      domain,
    );
  },
};
