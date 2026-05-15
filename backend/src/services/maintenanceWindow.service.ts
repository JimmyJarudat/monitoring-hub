import prisma from "../lib/prisma";

export const findActiveMaintenanceWindow = async (monitorId: string, checkedAt = new Date()) => {
  const groupMemberships = await prisma.monitorGroupMember.findMany({
    where: { monitorId },
    select: { groupId: true },
  });
  const groupIds = groupMemberships.map((item) => item.groupId);

  return prisma.maintenanceWindow.findFirst({
    where: {
      enabled: true,
      startsAt: { lte: checkedAt },
      endsAt: { gte: checkedAt },
      OR: [
        { monitorId },
        ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
      ],
    },
    orderBy: [{ startsAt: "asc" }],
    include: {
      monitor: { select: { id: true, name: true, type: true } },
      group: { select: { id: true, name: true, color: true } },
    },
  });
};
