import Elysia, { t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { generateExcelReport } from "../services/excelExport.service";

export const reportRoutes = new Elysia({ prefix: "/reports" })
  .use(authMiddleware)
  .get(
    "/export/excel",
    async ({ query, set }) => {
      const from = new Date(query.from);
      const to = new Date(query.to);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        set.status = 400;
        return "Invalid date range.";
      }
      if (from >= to) {
        set.status = 400;
        return "from must be before to.";
      }

      const rangeLabel = query.rangeLabel ?? `${from.toLocaleDateString("en-GB")} – ${to.toLocaleDateString("en-GB")}`;
      const buffer = await generateExcelReport(from, to, rangeLabel);

      const filename = `availability-report-${from.toISOString().slice(0, 10)}.xlsx`;
      set.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      set.headers["Content-Disposition"] = `attachment; filename="${filename}"`;
      set.headers["Content-Length"] = String(buffer.byteLength);

      return buffer;
    },
    {
      query: t.Object({
        from: t.String(),
        to: t.String(),
        rangeLabel: t.Optional(t.String()),
      }),
    },
  );
