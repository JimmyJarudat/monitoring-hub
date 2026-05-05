import { createBrowserRouter, type RouteObject } from "react-router-dom";
import PrivateLayout from "@/layouts/privateLayout";
import PublicLayout from "@/layouts/publicLayout";
import { createProtectedRoute } from "@/utils/routeProtected";

import App from "../App";
import LoginPage from "@/pages/auth/login";
import Dashboard from "@/pages/dashboard";
import MonitorsPage from "@/pages/monitors";
import AddMonitorPage from "@/pages/monitors/new";
import MonitorDetailPage from "@/pages/monitors/detail";

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
    path: "/dashboard",
    element: <PrivateLayout />,
    children: [
      createProtectedRoute({ index: true, element: <Dashboard /> }),
      createProtectedRoute({ path: "monitors", element: <MonitorsPage /> }),
      createProtectedRoute({ path: "monitors/new", element: <AddMonitorPage /> }),
      createProtectedRoute({ path: "monitors/:id", element: <MonitorDetailPage /> }),
    ],
  },
];

const router = createBrowserRouter(routes);

export default router;
