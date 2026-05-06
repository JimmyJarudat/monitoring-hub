import LoadingSpinner from "@/components/LoadingSpinner";
import { useSession } from "@/contexts/session.context";
import { isAdminUser } from "@/utils/permissions";
import { Fragment, createElement, type ReactNode } from "react";
import { Navigate, type RouteObject } from "react-router-dom";

type ProtectedRouteOptions = RouteObject & {
  adminOnly?: boolean;
};

const ProtectedRouteGuard = ({
  element,
  adminOnly,
}: {
  element: ReactNode;
  adminOnly?: boolean;
}) => {
  const { isLoading, user } = useSession();

  if (isLoading) {
    return createElement(LoadingSpinner);
  }

  if (adminOnly && !isAdminUser(user)) {
    return createElement(Navigate, { replace: true, to: "/dashboard" });
  }

  return createElement(Fragment, null, element);
};

export function createProtectedRoute({ adminOnly, element, ...route }: ProtectedRouteOptions): RouteObject {
  return {
    ...route,
    element: element
      ? createElement(ProtectedRouteGuard, { adminOnly, element })
      : element,
  };
}
