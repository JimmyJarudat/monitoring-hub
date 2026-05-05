import { createBrowserRouter, type RouteObject } from "react-router-dom";
import PrivateLayout from "@/layouts/privateLayout";
import PublicLayout from "@/layouts/publicLayout";
import { createProtectedRoute } from "@/utils/routeProtected";

import App from "../App";
import LoginPage from "@/pages/auth/login";
import Dashboard from "@/pages/dashboard";
import MonitorsPage from "@/pages/monitors";

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
    ],
  },
];

const router = createBrowserRouter(routes);

export default router;
