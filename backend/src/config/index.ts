const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === "change-me-in-production") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET ต้องตั้งค่าก่อนใช้งาน production");
  }
  console.warn("⚠️  JWT_SECRET ใช้ค่า default — ห้ามใช้ใน production");
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: jwtSecret || "change-me-in-production",
  cors: {
    origins: process.env.CORS_ORIGINS?.split(",") ?? ["http://localhost:5173"],
  },
  rateLimit: {
    login: { max: 10, windowMs: 60_000 },     // 10 ครั้ง / นาที / IP
    register: { max: 5, windowMs: 60_000 },   // 5 ครั้ง / นาที / IP
    global: { max: 100, windowMs: 60_000 },   // 100 ครั้ง / นาที / IP
  },
  lockout: {
    maxFailures: 5,      // ล็อกหลังล้มเหลว 5 ครั้ง
    windowMinutes: 15,   // นับย้อนหลัง 15 นาที
    durationMinutes: 15, // ล็อกนาน 15 นาที
  },
};
