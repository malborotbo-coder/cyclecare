import { Switch, Route, useLocation } from "wouter";
import { apiRequest, queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import FirebaseAuthPage from "@/pages/FirebaseAuthPage";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Splash from "@/pages/Splash";
import { useState, useEffect, lazy, Suspense, useRef } from "react";
import HomePage from "@/components/HomePage";
import ServiceBooking from "@/components/ServiceBooking";
import BikeProfile from "@/components/BikeProfile";
import BikeLogPage from "@/pages/BikeLogPage";
import PartsCatalog from "@/components/PartsCatalog";
import TechnicianDashboard from "@/components/TechnicianDashboard";
import TechnicianRegistration from "./pages/TechnicianRegistration";
import ProfilePage from "@/pages/ProfilePage";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import PaymentPage from "@/pages/PaymentPage";
import AppLayout from "@/components/layout/AppLayout";
import { buildApiUrl } from "@/lib/apiConfig";
import { InstallPWA } from "@/components/InstallPWA";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import OrdersPage from "@/pages/OrdersPage";
import SupportPage from "@/pages/Support";
import NotificationsPage from "@/pages/NotificationsPage";
import LegalDocumentPage from "@/pages/LegalDocumentPage";
import {
  FirebaseAuthProvider,
  useFirebaseAuth,
} from "@/contexts/FirebaseAuthContext";
import { NativeAuthProvider } from "@/contexts/NativeAuthContext";
import { FullScreenLoader } from "@/components/LogoLoader";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { CartProvider } from "@/contexts/CartContext";
import Cart from "@/components/Cart";
import Checkout from "@/components/Checkout";
import { setPostLoginRedirect } from "@/lib/authRedirect";
import { initializePushManagerOnce, setPushRoleContext, syncPushRegistrationOnLogin } from "@/lib/pushManager";
import { initializeNotificationSyncOnce } from "@/lib/pushNotificationSync";
import { hasStoredAuthTokenSync } from "@/lib/authSession";
import LegalConsentGate from "@/components/legal/LegalConsentGate";

const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));

const safeStorageGet = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write errors during bootstrap.
  }
};

function BootFailureScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-xl border border-red-500/40 bg-slate-900/80 p-6">
        <h1 className="text-xl font-semibold">App failed to load</h1>
        <p className="mt-2 text-sm text-slate-300">
          {message || "Startup took too long. Please refresh and try again."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

function RedirectToMyProfile() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/my-profile");
  }, [setLocation]);
  return null;
}

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authReady, isGuest } = useFirebaseAuth();
  const [, setLocation] = useLocation();
  const [bootTimeout, setBootTimeout] = useState(false);
  const loginGateLoggedRef = useRef(false);
  const restoreRetryTriggeredRef = useRef(false);
  const debugAuthGate =
    typeof window !== "undefined" &&
    (import.meta.env.DEV || localStorage.getItem("debug_auth") === "true");
  const hasStoredToken = hasStoredAuthTokenSync();

  useEffect(() => {
    if (!isLoading && authReady) {
      setBootTimeout(false);
      return;
    }
    const timer = window.setTimeout(() => {
      console.error("[Bootstrap] Auth bootstrap timeout");
      setBootTimeout(true);
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [isLoading, authReady]);

  useEffect(() => {
    if (!authReady || isLoading || user || isGuest || !hasStoredToken) {
      restoreRetryTriggeredRef.current = false;
      return;
    }
    if (restoreRetryTriggeredRef.current) return;
    restoreRetryTriggeredRef.current = true;
    console.info("[AuthGate] Stored token exists without user, retrying session restore");
    window.dispatchEvent(
      new CustomEvent("auth-token-updated", {
        detail: { action: "persisted", source: "auth_gate_retry" },
      }),
    );
  }, [authReady, isLoading, user, isGuest, hasStoredToken]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    const handleDeepLink = async (event: { url: string }) => {
      console.log('[Deep Link] URL opened:', event.url);
      // Ensure the in-app browser is closed once we get a deep link back
      try {
        await Browser.close();
      } catch {
        // Ignore close failures
      }
      
      try {
        const url = new URL(event.url);
        const code = url.searchParams.get('code');
        const token = url.searchParams.get('token');
        
        if (token) {
          console.log('[Deep Link] JWT token received, redirecting to auth callback');
          setLocation(`/auth/callback?token=${encodeURIComponent(token)}`);
        } else if (code) {
          console.log('[Deep Link] OAuth code received, exchanging for token');
          const callbackPath = buildApiUrl(`/api/login/callback?code=${code}`);
          try {
            const response = await fetch(callbackPath, { 
              credentials: 'include',
              redirect: 'manual'
            });
            
            if (response.type === 'opaqueredirect' || response.redirected) {
              const redirectUrl = response.url || response.headers.get('Location');
              if (redirectUrl) {
                const redirectParams = new URL(redirectUrl).searchParams;
                const jwtToken = redirectParams.get('token');
                if (jwtToken) {
                  console.log('[Deep Link] Got JWT from callback, storing');
                  setLocation(`/auth/callback?token=${encodeURIComponent(jwtToken)}`);
                  return;
                }
              }
            }
            
            if (response.ok) {
              const data = await response.json();
              if (data.token) {
                setLocation(`/auth/callback?token=${encodeURIComponent(data.token)}`);
                return;
              }
            }
            
            console.error('[Deep Link] OAuth callback failed');
            setLocation('/auth?error=callback_failed');
          } catch (err) {
            console.error('[Deep Link] OAuth Error:', err);
            setLocation('/auth?error=oauth_error');
          }
        } else {
          const path = url.pathname || '/';
          console.log('[Deep Link] Navigation to:', path);
          setLocation(path);
        }
      } catch (err) {
        console.error('[Deep Link] Parse error:', err);
        setLocation('/');
      }
    };
    
    const listener = CapApp.addListener('appUrlOpen', handleDeepLink);
    
    return () => {
      listener.then(l => l.remove());
    };
  }, [setLocation]);

  const showOnboarding = !safeStorageGet("onboarding_completed");

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={() => {
          safeStorageSet("onboarding_completed", "true");
          window.location.reload();
        }}
      />
    );
  }

  if (bootTimeout) {
    return <BootFailureScreen message="Authentication bootstrap timed out." />;
  }

  if (isLoading || !authReady) {
    return <FullScreenLoader />;
  }

  if (!user && !isGuest) {
    if (hasStoredToken) {
      return <FullScreenLoader />;
    }
    if (!loginGateLoggedRef.current) {
      loginGateLoggedRef.current = true;
      if (debugAuthGate) {
        const readToken = (key: string) =>
          (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null) ||
          (typeof localStorage !== "undefined" ? localStorage.getItem(key) : null);
        console.warn("[AuthGate] Rendering login screen", {
          authReady,
          isLoading,
          hasUser: Boolean(user),
          isGuest,
          hasAuthToken: Boolean(readToken("auth_token")),
          hasFirebaseToken: Boolean(readToken("firebase_token")),
          hasPhoneSession: Boolean(readToken("phone_session")),
        });
      }
    }
    return <FirebaseAuthPage />;
  }

  loginGateLoggedRef.current = false;
  return <LegalConsentGate>{children}</LegalConsentGate>;
}

function RequireAuth({
  children,
  redirectTo,
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, isGuest, exitGuestMode } = useFirebaseAuth();
  const [location] = useLocation();

  useEffect(() => {
    if (user || !isGuest) return;
    setPostLoginRedirect(redirectTo || location || "/");
    exitGuestMode();
  }, [user, isGuest, exitGuestMode, redirectTo, location]);

  if (!user) return null;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isGuest, exitGuestMode } = useFirebaseAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (user && user.isAdmin) return;
    if (isGuest) {
      setPostLoginRedirect(location || "/admin");
      exitGuestMode();
      return;
    }
    if (user && !user.isAdmin) {
      setLocation("/");
    }
  }, [user, isGuest, exitGuestMode, location, setLocation]);

  if (!user || !user.isAdmin) return null;
  return <>{children}</>;
}


function Router() {
  useEffect(() => {
    console.info("[Bootstrap] Router mounted");
  }, []);

  return (
    <Switch>
      {/* Public routes - no authentication required */}
      <Route path="/privacy">
        <PrivacyPolicy />
      </Route>

      <Route path="/terms">
        <TermsOfService />
      </Route>

      {/* Auth callback for JWT token capture */}
      <Route path="/auth/callback" component={AuthCallback} />

      {/* Technician Registration Page */}
      <Route path="/technician/register" component={TechnicianRegistration} />

      {/* All other routes require authentication */}
      <Route>
        {() => (
          <AuthWrapper>
            <Switch>
              <Route path="/">
                <AppLayout>
                  <HomePage />
                </AppLayout>
              </Route>

              <Route path="/booking">
                <AppLayout>
                  <ServiceBooking />
                </AppLayout>
              </Route>

              <Route path="/payment">
                <AppLayout>
                  <PaymentPage />
                </AppLayout>
              </Route>

              <Route path="/parts">
                <AppLayout>
                  <PartsCatalog />
                </AppLayout>
              </Route>

              <Route path="/cart">
                <AppLayout>
                  <Cart />
                </AppLayout>
              </Route>

              <Route path="/checkout">
                <AppLayout>
                  <Checkout />
                </AppLayout>
              </Route>

              <Route path="/orders">
                <AppLayout>
                  <OrdersPage />
                </AppLayout>
              </Route>

              <Route path="/notifications">
                <RequireAuth redirectTo="/notifications">
                  <AppLayout>
                    <NotificationsPage />
                  </AppLayout>
                </RequireAuth>
              </Route>

              <Route path="/support">
                <AppLayout>
                  <SupportPage />
                </AppLayout>
              </Route>

              {/* User Profile route */}
              <Route path="/my-profile">
                <AppLayout>
                  <ProfilePage />
                </AppLayout>
              </Route>

              <Route path="/legal">
                <AppLayout>
                  <LegalDocumentPage />
                </AppLayout>
              </Route>

              {/* Bike Profile route */}
              <Route path="/profile">
                <RedirectToMyProfile />
              </Route>

              <Route path="/bikes">
                <AppLayout>
                  <BikeProfile />
                </AppLayout>
              </Route>

              <Route path="/history">
                <AppLayout>
                  <BikeLogPage />
                </AppLayout>
              </Route>

              <Route path="/bike-log">
                <AppLayout>
                  <BikeLogPage />
                </AppLayout>
              </Route>

              {/* Technician routes - both paths work */}
              <Route path="/technician">
                <RequireAuth redirectTo="/technician">
                  <AppLayout>
                    <TechnicianDashboard />
                  </AppLayout>
                </RequireAuth>
              </Route>

              <Route path="/technician/dashboard">
                <RequireAuth redirectTo="/technician/dashboard">
                  <AppLayout>
                    <TechnicianDashboard />
                  </AppLayout>
                </RequireAuth>
              </Route>

              <Route path="/admin">
                <RequireAdmin>
                  <AppLayout>
                    <Suspense fallback={<FullScreenLoader />}>
                      <AdminDashboard />
                    </Suspense>
                  </AppLayout>
                </RequireAdmin>
              </Route>

              {/* 404 Page */}
              <Route>
                <NotFound />
              </Route>
            </Switch>
          </AuthWrapper>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    console.info("[Bootstrap] App mount");
    // Show splash screen on first load
    if (safeStorageGet("splash_shown")) {
      setShowSplash(false);
    } else {
      const timer = setTimeout(() => {
        safeStorageSet("splash_shown", "true");
        setShowSplash(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    console.info("[Bootstrap] Push init start");
    void initializePushManagerOnce()
      .then(() => {
        console.info("[Bootstrap] Push manager init done");
      })
      .catch((error) => {
        console.error("[Bootstrap] Push manager init failed", error);
      });

    try {
      initializeNotificationSyncOnce();
      console.info("[Bootstrap] Notification sync init done");
    } catch (error) {
      console.error("[Bootstrap] Notification sync init failed", error);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <FirebaseAuthProvider>
        <NativeAuthProvider>
          <PushGate />
          <CartProvider>
            <ThemeProvider>
              <LanguageProvider>
                <TooltipProvider>
                  <Toaster />
                  {showSplash ? (
                    <Splash onComplete={() => setShowSplash(false)} />
                  ) : (
                    <Router />
                  )}
                  <InstallPWA />
                </TooltipProvider>
              </LanguageProvider>
            </ThemeProvider>
          </CartProvider>
        </NativeAuthProvider>
      </FirebaseAuthProvider>
    </QueryClientProvider>
  );
}

function PushGate() {
  const { user } = useFirebaseAuth();
  const lastUserIdRef = useRef<string | null>(null);
  const canLoadRoles = Boolean(user?.id) && hasStoredAuthTokenSync();
  const { data: roleInfo } = useQuery<{ isAdmin: boolean; roles: string[] }>({
    queryKey: ["/api/roles/me"],
    queryFn: () => apiRequest("/api/roles/me", "GET"),
    enabled: canLoadRoles,
    staleTime: 60_000,
  });

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (lastUserIdRef.current === nextUserId) return;
    lastUserIdRef.current = nextUserId;

    if (!nextUserId) {
      void syncPushRegistrationOnLogin(null);
      void setPushRoleContext(null);
      return;
    }
    void syncPushRegistrationOnLogin(nextUserId);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !roleInfo) return;
    const roles = Array.isArray(roleInfo?.roles) ? roleInfo.roles : [];
    const role =
      roleInfo?.isAdmin === true
        ? "admin"
        : roles.includes("technician")
        ? "technician"
        : "customer";
    void setPushRoleContext(role);
  }, [user?.id, roleInfo]);

  return null;
}

export default App;
