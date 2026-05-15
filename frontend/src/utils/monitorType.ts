export const formatMonitorTypeLabel = (type: string) => {
  if (type === "DATABASE") return "Database (Test Connection)";
  return type;
};
