const jwtSecret = process.env.JWT_SECRET;
const credentialSecretKey = process.env.CREDENTIAL_SECRET_KEY || jwtSecret;
if (!jwtSecret || jwtSecret === "change-me-in-production") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be configured before running in production.");
  }
  console.warn("⚠️  JWT_SECRET is using the default value — do not use this in production.");
}

if (!process.env.CREDENTIAL_SECRET_KEY) {
  if (process.env.NODE_ENV === "production") {
    console.warn("⚠️  CREDENTIAL_SECRET_KEY is not configured — temporarily falling back to JWT_SECRET.");
  } else {
    console.warn("⚠️  CREDENTIAL_SECRET_KEY is not configured — using JWT_SECRET as a fallback in development.");
  }
}

export const config = {
  port: 3000,
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: jwtSecret || "change-me-in-production",
  credentialSecretKey: credentialSecretKey || "change-me-in-production",
  cors: {
    origins: process.env.CORS_ORIGINS?.split(",") ?? ["http://localhost:5173"],
  },
  rateLimit: {
    login: { max: 10, windowMs: 60_000 },     // 10 ครั้ง / นาที / IP
    register: { max: 5, windowMs: 60_000 },   // 5 ครั้ง / นาที / IP
    global: { max: 300, windowMs: 60_000 },   // 300 ครั้ง / นาที / IP
  },
  lockout: {
    maxFailures: 5,      // ล็อกหลังล้มเหลว 5 ครั้ง
    windowMinutes: 15,   // นับย้อนหลัง 15 นาที
    durationMinutes: 15, // ล็อกนาน 15 นาที
  },
};
