import Elysia, { t } from "elysia";
import { fail, ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";
import { requireAdminRole } from "../lib/authorization";
import { insightRunner } from "../services/insight.Runner";
import { generateDbInsightExcel } from "../services/dbInsightExport.service";

const snapshotInclude = {
  slowQueries: {
    orderBy: { avgDurationMs: "desc" as const },
  },
  indexStats: {
    orderBy: [{ status: "asc" as const }, { scansCount: "asc" as const }] as { status?: "asc" | "desc"; scansCount?: "asc" | "desc" }[],
  },
  tableSizes: {
    orderBy: { totalBytes: "desc" as const },
  },
  fileSizes: true,
  connectionStats: true,
  replicationStatus: true,
} as const;

type RawSnapshot = NonNullable<Awaited<ReturnType<typeof prisma.dbInsightSnapshot.findFirst<{ include: typeof snapshotInclude }>>>>;

// BigInt from Prisma won't JSON-serialize — convert to number (safe for byte sizes up to ~9 PB)
const serializeSnapshot = (snapshot: RawSnapshot | null) => {
  if (!snapshot) return null;
  return {
    ...snapshot,
    tableSizes: snapshot.tableSizes.map((t) => ({
      ...t,
      totalBytes: Number(t.totalBytes),
      dataBytes: Number(t.dataBytes),
      indexBytes: Number(t.indexBytes),
      rowCount: Number(t.rowCount),
    })),
    indexStats: snapshot.indexStats.map((i) => ({
      ...i,
      sizeBytes: i.sizeBytes != null ? Number(i.sizeBytes) : null,
    })),
    fileSizes: snapshot.fileSizes.map((f) => ({
      ...f,
      sizeBytes: Number(f.sizeBytes),
    })),
  };
};

export const dbInsightRoutes = new Elysia({ prefix: "/db-insight" })
  .use(authMiddleware)

  // GET /db-insight/:monitorId/export/excel — export latest snapshot as workbook
  .get(
    "/:monitorId/export/excel",
    async ({ params, set }) => {
      const monitor = await prisma.monitor.findUnique({ where: { id: params.monitorId } });
      if (!monitor) { set.status = 404; return "Monitor not found"; }

      const result = await generateDbInsightExcel(params.monitorId);
      if (!result) { set.status = 404; return "Snapshot not found"; }

      set.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      set.headers["Content-Disposition"] = `attachment; filename="${result.filename}"`;
      set.headers["Content-Length"] = String(result.buffer.byteLength);
      return result.buffer;
    },
    { params: t.Object({ monitorId: t.String() }) },
  )

  // POST /db-insight/:monitorId/collect — collect a snapshot immediately
  .post(
    "/:monitorId/collect",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const monitor = await prisma.monitor.findUnique({ where: { id: params.monitorId } });
      if (!monitor) { set.status = 404; return fail("Monitor not found"); }

      try {
        const result = await insightRunner.triggerNow(params.monitorId);
        return ok(result);
      } catch (error) {
        set.status = 400;
        return fail(error instanceof Error ? error.message : "Failed to collect DB Insight snapshot");
      }
    },
    { params: t.Object({ monitorId: t.String() }) },
  )

  // GET /db-insight/:monitorId/snapshots — list recent snapshots (summary only)
  .get(
    "/:monitorId/snapshots",
    async ({ params, query, set }) => {
      const monitor = await prisma.monitor.findUnique({ where: { id: params.monitorId } });
      if (!monitor) { set.status = 404; return fail("Monitor not found"); }

      const config = await prisma.dbInsightConfig.findUnique({ where: { monitorId: params.monitorId } });

      const limit = Math.min(query.limit ?? 20, 100);
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;

      const snapshots = await prisma.dbInsightSnapshot.findMany({
        where: {
          monitorId: params.monitorId,
          ...(from || to
            ? {
                collectedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        orderBy: { collectedAt: "desc" },
        take: limit,
        select: {
          id: true,
          monitorId: true,
          dbType: true,
          collectedAt: true,
          collectionDurationMs: true,
          errorMessage: true,
          connectionStats: {
            select: {
              total: true,
              active: true,
              maxConnections: true,
              blockedCount: true,
            },
          },
          _count: {
            select: {
              slowQueries: true,
              indexStats: true,
              tableSizes: true,
              replicationStatus: true,
            },
          },
        },
      });

      return ok({ monitor, config, snapshots });
    },
    {
      params: t.Object({ monitorId: t.String() }),
      query: t.Object({
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    },
  )

  // GET /db-insight/:monitorId/latest — latest snapshot with full detail
  .get(
    "/:monitorId/latest",
    async ({ params, set }) => {
      const monitor = await prisma.monitor.findUnique({ where: { id: params.monitorId } });
      if (!monitor) { set.status = 404; return fail("Monitor not found"); }

      const config = await prisma.dbInsightConfig.findUnique({ where: { monitorId: params.monitorId } });

      const raw = await prisma.dbInsightSnapshot.findFirst({
        where: { monitorId: params.monitorId },
        orderBy: { collectedAt: "desc" },
        include: snapshotInclude,
      });

      return ok({ monitor, config, snapshot: serializeSnapshot(raw) });
    },
    { params: t.Object({ monitorId: t.String() }) },
  )

  // GET /db-insight/:monitorId/snapshots/:snapshotId — specific snapshot with full detail
  .get(
    "/:monitorId/snapshots/:snapshotId",
    async ({ params, set }) => {
      const monitor = await prisma.monitor.findUnique({ where: { id: params.monitorId } });
      if (!monitor) { set.status = 404; return fail("Monitor not found"); }

      const raw = await prisma.dbInsightSnapshot.findFirst({
        where: { id: params.snapshotId, monitorId: params.monitorId },
        include: snapshotInclude,
      });

      if (!raw) { set.status = 404; return fail("Snapshot not found"); }

      return ok({ monitor, snapshot: serializeSnapshot(raw) });
    },
    { params: t.Object({ monitorId: t.String(), snapshotId: t.String() }) },
  );
