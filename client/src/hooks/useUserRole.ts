import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiRequest } from "@/lib/queryClient";
import { hasStoredAuthTokenSync } from "@/lib/authSession";
import { type AppRole, isTechnicianRole } from "@/lib/authRole";

type RoleInfo = {
  isAdmin: boolean;
  roles: string[];
};

export function useUserRole() {
  const { user, authReady, isGuest } = useFirebaseAuth();
  const canLoadRoles =
    authReady && Boolean(user) && !isGuest && hasStoredAuthTokenSync();

  const roleQuery = useQuery<RoleInfo>({
    queryKey: ["/api/roles/me"],
    queryFn: () => apiRequest("/api/roles/me", "GET"),
    enabled: canLoadRoles,
    staleTime: 60_000,
  });

  const roles = useMemo(
    () => (Array.isArray(roleQuery.data?.roles) ? roleQuery.data?.roles : []),
    [roleQuery.data?.roles],
  );
  const isAdmin = roleQuery.data?.isAdmin === true || user?.isAdmin === true;
  const isTechnician = isTechnicianRole(roles);
  const role: AppRole =
    !user || isGuest
      ? "guest"
      : isAdmin
      ? "admin"
      : isTechnician
      ? "technician"
      : "rider";

  const isRoleLoading = canLoadRoles && roleQuery.isLoading;

  return {
    role,
    roles,
    isRoleLoading,
    isAdmin,
    isTechnician,
    isRider: role === "rider" || role === "guest",
  };
}
