import type { SessionUser } from "@/contexts/session.context";

export const getUserRoleName = (user: SessionUser | null | undefined) => {
  if (!user?.role) return "user";
  return typeof user.role === "string" ? user.role.toLowerCase() : user.role.name.toLowerCase();
};

export const isAdminUser = (user: SessionUser | null | undefined) =>
  getUserRoleName(user) === "admin";
