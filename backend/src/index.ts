import { Elysia } from "elysia";
import { config } from "./config";
import prisma from "./lib/prisma";
import { ensureEncryptedCredentialSecret, isEncryptedCredentialSecret } from "./lib/credentialSecret";
import { publicRoutes, protectedRoutes } from "./routes";
import { AuthError } from "./middleware/auth";
import { securityMiddleware } from "./middleware/security";
import { fail } from "./lib/response";
import { monitorRunner } from "./services/monitor.Runner";
import { startNotificationRetryScheduler } from "./services/notification.service";
import { startRetentionScheduler } from "./services/retention.service";
import { startScheduledReportScheduler } from "./services/scheduledReport.service";
import { logger } from "./lib/logger";

const getErrorCause = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("cause" in error)) return null;
  return (error as { cause?: unknown }).cause ?? null;
};

const getErrorStatus = (error: unknown): number | null => {
  if (error instanceof AuthError) return error.status;
  if (typeof error !== "object" || error === null) return null;

  const status = "status" in error ? Number((error as { status?: unknown }).status) : NaN;
  if (Number.isInteger(status) && status >= 400 && status < 600) return status;

  const code = "code" in error ? Number((error as { code?: unknown }).code) : NaN;
  if (Number.isInteger(code) && code >= 400 && code < 600) return code;

  const cause = getErrorCause(error);
  return cause ? getErrorStatus(cause) : null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  const cause = getErrorCause(error);
  if (cause) return getErrorMessage(cause);
  return "An internal system error occurred.";
};

const getErrorDetails = (error: unknown, status: number | null) => {
  if (status && status < 500) {
    return error instanceof Error ? error.message : String(error);
  }

  return error instanceof Error ? error.stack ?? error.message : String(error);
};

const migratePlaintextCredentialSecrets = async () => {
  const credentials = await prisma.credential.findMany({
    select: {
      id: true,
      secret: true,
    },
  });

  const plaintextCredentials = credentials.filter((credential) => !isEncryptedCredentialSecret(credential.secret));

  if (plaintextCredentials.length === 0) {
    return;
  }

  await prisma.$transaction(
    plaintextCredentials.map((credential) =>
      prisma.credential.update({
        where: { id: credential.id },
        data: {
          secret: ensureEncryptedCredentialSecret(credential.secret),
        },
      })
    ),
  );

  logger.info("credential", `encrypted ${plaintextCredentials.length} existing secrets`);
};

const bootstrap = async () => {
  await migratePlaintextCredentialSecrets();

  const app = new Elysia()
    .use(securityMiddleware)
    .onError(({ error, set, request }) => {
      const status = getErrorStatus(error);
      const message = getErrorMessage(error);
      const resolvedStatus = status ?? 500;
      const metadata = {
        status: resolvedStatus,
        method: request.method,
        url: request.url,
        message,
        error: getErrorDetails(error, status),
      };

      if (resolvedStatus >= 500) {
        logger.error("server", "request failed", metadata);
      } else {
        logger.warn("server", "request rejected", metadata);
      }

      if (status) {
        set.status = status;
        return fail(message);
      }

      set.status = 500;
      return fail("An internal system error occurred.");
    })
    .group("/api", (app) =>
      app
        .use(publicRoutes)
        .use(protectedRoutes)
    )
    .listen({ port: config.port, hostname: config.host });

  monitorRunner.start();
  startNotificationRetryScheduler();
  startRetentionScheduler();
  startScheduledReportScheduler();

  logger.info("server", `running at http://${app.server?.hostname}:${app.server?.port}`);
};

void bootstrap().catch((error) => {
  console.error("[bootstrap] failed to start server", error);
  void logger.flush().finally(() => process.exit(1));
});
