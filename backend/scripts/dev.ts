import { spawn } from "bun";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";

const logsDir = "../logs";

if (!existsSync(logsDir)) {
  mkdirSync(logsDir);
}

// ลบ log ที่เกิน 90 วัน
const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
for (const file of readdirSync(logsDir)) {
  if (!file.endsWith(".log")) continue;
  const path = join(logsDir, file);
  const stat = statSync(path);
  if (stat.mtimeMs < cutoff) {
    unlinkSync(path);
    console.log(`Deleted old log: ${file}`);
  }
}

// ตั้งชื่อ log ตามวันที่
const date = new Date().toISOString().split("T")[0];

const stdoutLog = Bun.file(`${logsDir}/backend-${date}.log`).writer();
const stderrLog = Bun.file(`${logsDir}/backend-error-${date}.log`).writer();

const proc = spawn(["bun", "--watch", "src/index.ts"], {
  stdout: "pipe",
  stderr: "pipe",
});

(async () => {
  for await (const chunk of proc.stdout) {
    process.stdout.write(chunk);
    stdoutLog.write(chunk);
  }
})();

(async () => {
  for await (const chunk of proc.stderr) {
    process.stderr.write(chunk);
    stderrLog.write(chunk);
  }
})();

await proc.exited;