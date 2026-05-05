import { Elysia } from "elysia";
import { config } from "./config";
import { publicRoutes, protectedRoutes } from "./routes";
import { AuthError } from "./middleware/auth";

const app = new Elysia()
  .onError(({ error, set }) => {
    if (error instanceof AuthError) {
      set.status = error.status;
      return { success: false, message: error.message };
    }
    set.status = 500;
    return { success: false, message: "เกิดข้อผิดพลาดภายในระบบ" };
  })
  .use(publicRoutes)
  .use(protectedRoutes)
  .listen({ port: config.port, hostname: config.host });

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);
