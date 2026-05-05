import prisma from "../src/lib/prisma";

await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "login_history" CASCADE`);
await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "users" CASCADE`);
await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "roles" CASCADE`);
await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "LoginStatus" CASCADE`);

console.log("✓ dropped all tables");
await prisma.$disconnect();
