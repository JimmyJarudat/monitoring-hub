import prisma from "../lib/prisma";

const safeUserSelect = {
  id: true,
  username: true,
  email: true,
  roleId: true,
  role: { select: { name: true } },
  createdAt: true,
} as const;

export const authService = {
  async findByUsernameOrEmail(identifier: string) {
    return prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      include: { role: true },
    });
  },

  async createUser(username: string, email: string, password: string) {
    const hashed = await Bun.password.hash(password);
    const userRole = await prisma.role.findUniqueOrThrow({ where: { name: "USER" } });
    return prisma.user.create({
      data: { username, email, password: hashed, roleId: userRole.id },
      select: safeUserSelect,
    });
  },

  async verifyPassword(plain: string, hashed: string) {
    return Bun.password.verify(plain, hashed);
  },
};
