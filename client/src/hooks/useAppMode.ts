import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiRequest } from "@/lib/queryClient";
import { hasStoredAuthTokenSync } from "@/lib/authSession";
import { type AppExperienceMode } from "@/lib/authRole";
import { useLoginMode } from "@/hooks/useLoginMode";

type TechnicianProfile = {
  id?: string;
  status?: string | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  is_approved?: boolean | null;
  isApproved?: boolean | null;
};

export function useAppMode() {
  const { loginMode } = useLoginMode();
  const { user, authReady, isGuest } = useFirebaseAuth();

  const canCheckTechnicianStatus =
    loginMode === "technician" &&
    authReady &&
    Boolean(user) &&
    !isGuest &&
    hasStoredAuthTokenSync();

  const technicianQuery = useQuery<TechnicianProfile | null>({
    queryKey: ["/api/technicians/me", "login-mode-enforcement", user?.id ?? null],
    queryFn: () => apiRequest("/api/technicians/me", "GET"),
    enabled: canCheckTechnicianStatus,
    staleTime: 60_000,
  });

  const technicianProfile = technicianQuery.data ?? null;
  const hasProfile = Boolean(technicianProfile?.id);
  const status = String(technicianProfile?.status || "").toLowerCase();
  const isApproved =
    technicianProfile?.isApproved === true ||
    technicianProfile?.is_approved === true ||
    status === "approved";
  const isActive =
    technicianProfile?.isActive === true || technicianProfile?.is_active === true;
  const isValidTechnician = hasProfile && isApproved && isActive;

  const isModeLoading = canCheckTechnicianStatus && technicianQuery.isLoading;

  const appMode: AppExperienceMode = useMemo(() => {
    if (loginMode === "rider") return "rider";
    if (isModeLoading) return "blocked";
    return isValidTechnician ? "technician" : "blocked";
  }, [isModeLoading, isValidTechnician, loginMode]);

  return {
    loginMode,
    appMode,
    isModeLoading,
    technicianStatus: {
      hasProfile,
      isApproved,
      isActive,
      isValidTechnician,
    },
  };
}
