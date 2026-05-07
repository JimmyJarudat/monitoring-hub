import type { Prisma } from "../generated/prisma/client";
import type { AppNotificationSeverity, AppNotificationType } from "../generated/prisma/enums";
import prisma from "../lib/prisma";
import { isAdminRole } from "../lib/authorization";

type NotificationAudience = "admins" | "users" | "all";

type CreateNotificationInput = {
  audience: NotificationAudience;
  type: AppNotificationType;
  severity: AppNotificationSeverity;
  title: string;
  message?: string | null;
  href?: string | null;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

const resolveRecipientUserIds = async (audience: NotificationAudience) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        role: { select: { name: true } },
      },
    });

    const filtered = users.filter((user) => {
      const isAdmin = isAdminRole(user.role.name);
      if (audience === "admins") return isAdmin;
      if (audience === "users") return !isAdmin;
      return true;
    });

    console.log(
      `[resolveRecipientUserIds] audience="${audience}" → total users: ${users.length}, matched: ${filtered.length}`
    );

    return filtered.map((user) => user.id);
  } catch (error) {
    console.error("[resolveRecipientUserIds] Failed to fetch users:", error);
    throw error;
  }
};

export const createAppNotification = async (input: CreateNotificationInput) => {
  try {
    const recipientUserIds = await resolveRecipientUserIds(input.audience);

    if (recipientUserIds.length === 0) {
      console.warn(
        "[createAppNotification] No recipients found for audience:",
        input.audience
      );
      return null;
    }

    const notification = await prisma.appNotification.create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message ?? null,
        href: input.href ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
        recipients: {
          createMany: {
            data: recipientUserIds.map((userId) => ({ userId })),
            skipDuplicates: true,
          },
        },
      },
    });

    console.log(
      "[createAppNotification] Created notification:",
      notification.id,
      "| type:",
      input.type,
      "| recipients:",
      recipientUserIds.length
    );

    return notification;
  } catch (error) {
    console.error("[createAppNotification] Failed to create notification:", {
      error,
      input,
    });
    throw error;
  }
};

export const notifyAdmins = (input: Omit<CreateNotificationInput, "audience">) =>
  createAppNotification({ ...input, audience: "admins" });

export const notifyUsers = (input: Omit<CreateNotificationInput, "audience">) =>
  createAppNotification({ ...input, audience: "users" });

export const notifyAllUsers = (input: Omit<CreateNotificationInput, "audience">) =>
  createAppNotification({ ...input, audience: "all" });