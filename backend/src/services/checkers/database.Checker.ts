import { createConnection } from "mysql2/promise";
import Redis from "ioredis";
import { MongoClient } from "mongodb";
import pg from "pg";

export interface DatabaseConfig {
  type: "postgresql" | "mariadb" | "redis" | "mongodb" | "mysql" | "sqlite" | "sqlserver";
  host: string;
  port: number;
  user?: string;
  password?: string;
  database?: string;
  timeoutMs?: number;
}

export interface CheckResult {
  status: "UP" | "DOWN";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export async function databaseCheck(config: DatabaseConfig): Promise<CheckResult> {
  const timeout = config.timeoutMs ?? 5000;
  const start = Date.now();

  try {
    const result = await Promise.race([
      doCheck(config),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("connection timeout")), timeout)
      ),
    ]);
    return { ...result, responseTimeMs: Date.now() - start };
  } catch (e: any) {
    return { status: "DOWN", responseTimeMs: Date.now() - start, message: e.message };
  }
}

async function doCheck(config: DatabaseConfig): Promise<Omit<CheckResult, "responseTimeMs">> {
  switch (config.type) {
    case "postgresql": {
      const client = new pg.Client({
        host: config.host, port: config.port,
        user: config.user, password: config.password,
        database: config.database, connectionTimeoutMillis: 5000,
      });
      await client.connect();
      const res = await client.query("SELECT version()");
      await client.end();
      return { status: "UP", metadata: { version: res.rows[0]?.version?.split(" ")[1] } };
    }

    case "mariadb": {
      const conn = await createConnection({
        host: config.host, port: config.port,
        user: config.user, password: config.password,
        database: config.database, connectTimeout: 5000,
      });
      const [rows]: any = await conn.execute("SELECT VERSION() as version");
      await conn.end();
      return { status: "UP", metadata: { version: rows[0]?.version } };
    }

    case "redis": {
      const client = new Redis({
        host: config.host, port: config.port,
        password: config.password,
        connectTimeout: 5000, lazyConnect: true,
      });
      await client.connect();
      const info = await client.info("server");
      const version = info.match(/redis_version:(.+)/)?.[1]?.trim();
      await client.quit();
      return { status: "UP", metadata: { version } };
    }

    case "mongodb": {
      const url = `mongodb://${config.user ? `${config.user}:${config.password}@` : ""}${config.host}:${config.port}/${config.database ?? ""}`;
      const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const admin = client.db().admin();
      const info = await admin.serverInfo();
      await client.close();
      return { status: "UP", metadata: { version: info.version } };
    }

    default:
      return { status: "DOWN", message: `ไม่รองรับ DB type: ${(config as any).type}` };
  }
}
