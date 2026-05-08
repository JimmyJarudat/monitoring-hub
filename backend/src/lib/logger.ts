import prisma from "./prisma";

type Level = "INFO" | "WARN" | "ERROR";

interface Entry {
  level: Level;
  category: string;
  message: string;
  metadata: Record<string, unknown> | null;
}

const buffer: Entry[] = [];
const FLUSH_MS = 2_000;
const MAX_BUFFER = 200;

const flush = async () => {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await prisma.systemLog.createMany({ data: batch as any });
  } catch {
    // DB unavailable — entries already printed to console, discard silently
  }
};

const timer = setInterval(() => void flush(), FLUSH_MS);
// ไม่ block process exit
if (typeof timer.unref === "function") timer.unref();

process.on("beforeExit", () => void flush());

const emit = (level: Level, category: string, message: string, meta?: Record<string, unknown>) => {
  const prefix = `[${category}]`;
  if (level === "ERROR") console.error(prefix, message, ...(meta ? [meta] : []));
  else if (level === "WARN") console.warn(prefix, message, ...(meta ? [meta] : []));
  else console.log(prefix, message);

  buffer.push({ level, category, message, metadata: meta ?? null });
  if (buffer.length >= MAX_BUFFER) void flush();
};

export const logger = {
  info: (category: string, message: string, meta?: Record<string, unknown>) =>
    emit("INFO", category, message, meta),
  warn: (category: string, message: string, meta?: Record<string, unknown>) =>
    emit("WARN", category, message, meta),
  error: (category: string, message: string, meta?: Record<string, unknown>) =>
    emit("ERROR", category, message, meta),
  flush,
};
