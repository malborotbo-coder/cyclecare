import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import FirebaseAuthPage from "@/pages/FirebaseAuthPage";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Splash from "@/pages/Splash";
import { useState, useEffect, lazy, Suspense } from "react";
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

const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authReady, isGuest } = useFirebaseAuth();
  const [, setLocation] = useLocation();

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
          setLocation(`/auth/callback?token=${token}`);
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
                  setLocation(`/auth/callback?token=${jwtToken}`);
                  return;
                }
              }
            }
            
            if (response.ok) {
              const data = await response.json();
              if (data.token) {
                setLocation(`/auth/callback?token=${data.token}`);
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

  const showOnboarding = !localStorage.getItem("onboarding_completed");

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={() => {
          localStorage.setItem("onboarding_completed", "true");
          window.location.reload();
        }}
      />
    );
  }

  if (isLoading || !authReady) {
    return <FullScreenLoader />;
  }

  if (!user && !isGuest) {
    return <FirebaseAuthPage />;
  }

  return <>{children}</>;
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

              {/* Bike Profile route */}
              <Route path="/profile">
                <AppLayout>
                  <ProfilePage />
                </AppLayout>
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
    // Show splash screen on first load
    if (localStorage.getItem("splash_shown")) {
      setShowSplash(false);
    } else {
      const timer = setTimeout(() => {
        localStorage.setItem("splash_shown", "true");
        setShowSplash(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <FirebaseAuthProvider>
        <NativeAuthProvider>
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

export default App;
