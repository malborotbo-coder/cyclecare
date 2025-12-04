import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

export function useAuth() {
  const { user, isLoading } = useFirebaseAuth();

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
