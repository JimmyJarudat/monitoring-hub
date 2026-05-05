import prisma from "../lib/prisma";

export const authService = {
  async findByUsernameOrEmail(identifier: string) {
    return prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });
  },

  async createUser(username: string, email: string, password: string) {
    const hashed = await Bun.password.hash(password);
    return prisma.user.create({
      data: { username, email, password: hashed },
      select: { id: true, username: true, email: true, role: true, createdAt: true },
    });
  },

  async verifyPassword(plain: string, hashed: string) {
    return Bun.password.verify(plain, hashed);
  },
};
