import { AuthError } from "../middleware/auth";

export const normalizeRoleName = (role: string | null | undefined) =>
  String(role ?? "").trim().toLowerCase();

export const isAdminRole = (role: string | null | undefined) =>
  normalizeRoleName(role) === "admin";

export const requireAdminRole = (role: string | null | undefined) => {
  if (!isAdminRole(role)) {
    throw new AuthError("Admin access only.", 403);
  }
};
