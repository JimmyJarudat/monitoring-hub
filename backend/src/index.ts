import { Elysia } from "elysia";
import { config } from "./config";
import { authRoutes } from "./routes/auth";

const app = new Elysia()
  .get("/health", () => ({ status: "ok" }))
  .use(authRoutes)
  .listen({ port: config.port, hostname: config.host });

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);
