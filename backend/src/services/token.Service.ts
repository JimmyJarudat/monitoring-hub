import { randomBytes } from "crypto";
import prisma from "../lib/prisma";
import { getSystemConfig } from "./systemConfig.service";

export const tokenService = {
  async createRefreshToken(userId: string) {
    const token = randomBytes(64).toString("hex");
    const { security } = await getSystemConfig();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + security.sessionDays);

    return prisma.refreshToken.create({
      data: { token, userId, expiresAt },
      select: { token: true, expiresAt: true },
    });
  },

  async findValid(token: string) {
    return prisma.refreshToken.findFirst({
      where: {
        token,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { include: { role: true } } },
    });
  },

  async revoke(token: string) {
    return prisma.refreshToken.updateMany({
      where: { token },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllByUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
