import prisma from "../src/lib/prisma";

const users = [
  { username: "demo", email: "demo@monitoring.local", password: "1234", role: "USER" as const },
  { username: "admin", email: "admin@monitoring.local", password: "1234", role: "ADMIN" as const },
];

for (const u of users) {
  const hashed = await Bun.password.hash(u.password);
  await prisma.user.upsert({
    where: { username: u.username },
    update: {},
    create: { ...u, password: hashed },
  });
  console.log(`✓ ${u.username} (${u.role})`);
}

await prisma.$disconnect();
