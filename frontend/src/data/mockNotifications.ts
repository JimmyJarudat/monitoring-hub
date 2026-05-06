export type MockNotification = {
  id: string;
  title: string;
  message: string;
  type: "incident" | "resolved" | "system" | "alert";
  createdAt: string;
  read: boolean;
  href: string;
};

export const mockNotifications: MockNotification[] = [
  {
    id: "mock-001",
    title: "HTTP monitor is down",
    message: "Website Production reported DOWN. Incident opened and notification sent to On-call.",
    type: "incident",
    createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    read: false,
    href: "/incidents",
  },
  {
    id: "mock-002",
    title: "CPU threshold triggered",
    message: "Core Router CPU usage reached 91.4%, above the configured 85% threshold.",
    type: "alert",
    createdAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    read: false,
    href: "/alerts",
  },
  {
    id: "mock-003",
    title: "Database recovered",
    message: "PostgreSQL monitor is healthy again. The open incident was resolved.",
    type: "resolved",
    createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    read: true,
    href: "/incidents",
  },
  {
    id: "mock-004",
    title: "Retention cleanup completed",
    message: "Cleanup removed 0 results, 0 metrics, and 0 audit logs.",
    type: "system",
    createdAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
    read: true,
    href: "/settings",
  },
  {
    id: "mock-005",
    title: "TLS certificate warning",
    message: "api.example.com certificate will expire in 14 days.",
    type: "alert",
    createdAt: new Date(Date.now() - 22 * 60 * 60_000).toISOString(),
    read: false,
    href: "/monitors",
  },
];
