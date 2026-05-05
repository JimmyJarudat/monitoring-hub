import { createConnection } from "mysql2/promise";
import Redis from "ioredis";
import { MongoClient } from "mongodb";
import pg from "pg";
import { Database } from "bun:sqlite";

export interface DatabaseConfig {
  type:
    | "postgresql"
    | "mariadb"
    | "redis"
    | "mongodb"
    | "mysql"
    | "sqlite"
    | "sqlserver"
    | "mssql";
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  uri?: string;
  authSource?: string;
  timeoutMs?: number;
  filename?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
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
        host: config.host,
        port: config.port ?? 5432,
        user: config.user, password: config.password,
        database: config.database, connectionTimeoutMillis: 5000,
      });
      await client.connect();
      const res = await client.query("SELECT version()");
      await client.end();
      return { status: "UP", metadata: { version: res.rows[0]?.version?.split(" ")[1] } };
    }

    case "mysql":
    case "mariadb": {
      const conn = await createConnection({
        host: config.host,
        port: config.port ?? 3306,
        user: config.user, password: config.password,
        database: config.database, connectTimeout: 5000,
      });
      const [rows]: any = await conn.execute("SELECT VERSION() as version");
      await conn.end();
      return { status: "UP", metadata: { version: rows[0]?.version, engine: config.type } };
    }

    case "redis": {
      const client = new Redis({
        host: config.host,
        port: config.port ?? 6379,
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
      const credentials =
        config.user
          ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password ?? "")}@`
          : "";
      const query = config.authSource
        ? `?authSource=${encodeURIComponent(config.authSource)}`
        : "";
      const url =
        config.uri ??
        `mongodb://${credentials}${config.host}:${config.port}/${config.database ?? ""}${query}`;
      const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const admin = client.db().admin();
      const info = await admin.serverInfo();
      await client.close();
      return { status: "UP", metadata: { version: info.version } };
    }

    case "sqlite": {
      const filename = config.filename ?? config.database;

      if (!filename) {
        return { status: "DOWN", message: "sqlite ต้องระบุ filename หรือ database" };
      }

      const db = new Database(filename, { readonly: true });
      const row = db.query("SELECT sqlite_version() AS version").get() as { version?: string };
      db.close();

      return { status: "UP", metadata: { version: row.version, filename } };
    }

    case "sqlserver":
    case "mssql": {
      const sql = await import("mssql");
      const pool = await new sql.ConnectionPool({
        server: config.host ?? "localhost",
        port: config.port ?? 1433,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionTimeout: config.timeoutMs ?? 5000,
        requestTimeout: config.timeoutMs ?? 5000,
        options: {
          encrypt: config.encrypt ?? false,
          trustServerCertificate: config.trustServerCertificate ?? true,
        },
      }).connect();
      const result = await pool.request().query("SELECT @@VERSION AS version");
      await pool.close();

      return {
        status: "UP",
        metadata: { version: result.recordset[0]?.version?.split("\n")[0] },
      };
    }

    default:
      return { status: "DOWN", message: `ไม่รองรับ DB type: ${(config as any).type}` };
  }
}
