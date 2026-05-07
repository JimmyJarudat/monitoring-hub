import { Elysia } from "elysia";
import { config } from "./config";
import prisma from "./lib/prisma";
import { ensureEncryptedCredentialSecret, isEncryptedCredentialSecret } from "./lib/credentialSecret";
import { publicRoutes, protectedRoutes } from "./routes";
import { AuthError } from "./middleware/auth";
import { securityMiddleware } from "./middleware/security";
import { fail } from "./lib/response";
import { monitorRunner } from "./services/monitor.Runner";
import { startRetentionScheduler } from "./services/retention.service";
import { logger } from "./lib/logger";

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
    .onError(({ error, set }) => {
      if (error instanceof AuthError) {
        set.status = error.status;
        return fail(error.message);
      }
      set.status = 500;
      return fail("เกิดข้อผิดพลาดภายในระบบ");
    })
    .use(publicRoutes)
    .use(protectedRoutes)
    .listen({ port: config.port, hostname: config.host });

  monitorRunner.start();
  startRetentionScheduler();

  logger.info("server", `running at http://${app.server?.hostname}:${app.server?.port}`);
};

void bootstrap().catch((error) => {
  console.error("[bootstrap] failed to start server", error);
  void logger.flush().finally(() => process.exit(1));
});
