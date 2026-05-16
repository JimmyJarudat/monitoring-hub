import Elysia, { t } from "elysia";
import { fail, ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";

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
