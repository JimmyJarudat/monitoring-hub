import prisma from "../src/lib/prisma";

// สร้าง roles ก่อน
const adminRole = await prisma.role.upsert({
  where: { name: "ADMIN" },
  update: {},
  create: { name: "ADMIN", description: "ผู้ดูแลระบบ" },
});

const userRole = await prisma.role.upsert({
  where: { name: "USER" },
  update: {},
  create: { name: "USER", description: "ผู้ใช้ทั่วไป" },
});

console.log(`✓ role: ADMIN, USER`);

// สร้าง users
const users = [
  { username: "demo", email: "demo@monitoring.local", password: "1234", roleId: userRole.id },
  { username: "admin", email: "admin@monitoring.local", password: "1234", roleId: adminRole.id },
];

for (const u of users) {
  const hashed = await Bun.password.hash(u.password);
  await prisma.user.upsert({
    where: { username: u.username },
    update: {},
    create: { ...u, password: hashed },
  });
  console.log(`✓ user: ${u.username}`);
}

await prisma.$disconnect();
