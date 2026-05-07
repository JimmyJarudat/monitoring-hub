import {
  Navigate,
  createBrowserRouter,
  type RouteObject,
  useParams,
} from "react-router-dom";
import PrivateLayout from "@/layouts/privateLayout";
import PublicLayout from "@/layouts/publicLayout";
import { createProtectedRoute } from "@/utils/routeProtected";
import App from "../App";
import LoginPage from "@/pages/auth/login";
import Dashboard from "@/pages/dashboard";
import IncidentsPage from "@/pages/incidents";
import MonitorsPage from "@/pages/monitors";
import AddMonitorPage from "@/pages/monitors/new";
import MonitorDetailPage from "@/pages/monitors/detail";
import DevicesPage from "@/pages/devices";
import ResultsPage from "@/pages/results";
import GroupsPage from "@/pages/groups";
import GroupDetailPage from "@/pages/groups/detail";
import CredentialsPage from "@/pages/credentials";
import InterfaceInventoryPage from "@/pages/interfaces";
import SettingsPage from "@/pages/settings";
import ChannelsPage from "@/pages/channels";
import AlertsPage from "@/pages/alerts";
import AuditLogsPage from "@/pages/audit-logs";
import LoginHistoryPage from "@/pages/login-history";
import NotificationsPage from "@/pages/notifications";
import UsersPage from "@/pages/users";
import ProfilePage from "@/pages/profile";
import ChangePasswordPage from "@/pages/change-password";
import DomainIntelligencePage from "@/pages/domain";

const LegacyMonitorDetailRedirect = () => {
  const { id } = useParams();

  return <Navigate replace to={id ? `/monitors/${id}` : "/monitors"} />;
};

const routes: RouteObject[] = [
  {
    path: "/",
    element: <PublicLayout />,
    children: [
      { index: true, element: <App /> },
      { path: "login", element: <LoginPage /> },
    ],
  },
  {
    path: "/",
    element: <PrivateLayout />,
    children: [
      createProtectedRoute({ path: "dashboard", element: <Dashboard /> }),
      createProtectedRoute({ path: "monitors", element: <MonitorsPage /> }),
      createProtectedRoute({ path: "monitors/new", element: <AddMonitorPage />, adminOnly: true }),
      createProtectedRoute({ path: "monitors/:id", element: <MonitorDetailPage /> }),
      createProtectedRoute({ path: "devices", element: <DevicesPage /> }),
      createProtectedRoute({ path: "groups", element: <GroupsPage /> }),
      createProtectedRoute({ path: "groups/:id", element: <GroupDetailPage /> }),
      createProtectedRoute({ path: "credentials", element: <CredentialsPage />, adminOnly: true }),
      createProtectedRoute({ path: "interfaces", element: <InterfaceInventoryPage /> }),
      createProtectedRoute({ path: "results", element: <ResultsPage /> }),
      createProtectedRoute({ path: "incidents", element: <IncidentsPage /> }),
      createProtectedRoute({ path: "profile", element: <ProfilePage /> }),
      createProtectedRoute({ path: "change-password", element: <ChangePasswordPage /> }),
      createProtectedRoute({ path: "login-history", element: <LoginHistoryPage /> }),
      createProtectedRoute({ path: "notifications", element: <NotificationsPage /> }),
      createProtectedRoute({ path: "alerts", element: <AlertsPage />, adminOnly: true }),
      createProtectedRoute({ path: "channels", element: <ChannelsPage />, adminOnly: true }),
      createProtectedRoute({ path: "users", element: <UsersPage />, adminOnly: true }),
      createProtectedRoute({ path: "audit-logs", element: <AuditLogsPage />, adminOnly: true }),
      createProtectedRoute({ path: "settings", element: <SettingsPage />, adminOnly: true }),
      createProtectedRoute({ path: "domain", element: <DomainIntelligencePage />, adminOnly: true }),
      createProtectedRoute({
        path: "dashboard/monitors",
        element: <Navigate replace to="/monitors" />,
      }),
      createProtectedRoute({
        path: "dashboard/monitors/new",
        element: <Navigate replace to="/monitors/new" />,
        adminOnly: true,
      }),
      createProtectedRoute({
        path: "dashboard/monitors/:id",
        element: <LegacyMonitorDetailRedirect />,
      }),
      createProtectedRoute({
        path: "dashboard/results",
        element: <Navigate replace to="/results" />,
      }),
      createProtectedRoute({
        path: "dashboard/groups",
        element: <Navigate replace to="/groups" />,
      }),
      createProtectedRoute({
        path: "dashboard/credentials",
        element: <Navigate replace to="/credentials" />,
        adminOnly: true,
      }),
      createProtectedRoute({
        path: "dashboard/incidents",
        element: <Navigate replace to="/incidents" />,
      }),
    ],
  },
];

const router = createBrowserRouter(routes);

export default router;
