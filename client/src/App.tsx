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
import PartsCatalog from "@/components/PartsCatalog";
import TechnicianDashboard from "@/components/TechnicianDashboard";
import TechnicianRegistration from "./pages/TechnicianRegistration";
import ProfilePage from "@/pages/ProfilePage";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import PaymentPage from "@/pages/PaymentPage";
import BottomNav from "@/components/BottomNav";
import { InstallPWA } from "@/components/InstallPWA";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {
  FirebaseAuthProvider,
  useFirebaseAuth,
} from "@/contexts/FirebaseAuthContext";
import { NativeAuthProvider } from "@/contexts/NativeAuthContext";
import { FullScreenLoader } from "@/components/LogoLoader";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { CartProvider } from "@/contexts/CartContext";
import Cart from "@/components/Cart";
import Checkout from "@/components/Checkout";

const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useFirebaseAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    const handleDeepLink = async (event: { url: string }) => {
      console.log('[Deep Link] URL opened:', event.url);
      
      try {
        const url = new URL(event.url);
        const code = url.searchParams.get('code');
        const token = url.searchParams.get('token');
        
        if (token) {
          console.log('[Deep Link] JWT token received, redirecting to auth callback');
          setLocation(`/auth/callback?token=${token}`);
        } else if (code) {
          console.log('[Deep Link] OAuth code received, exchanging for token');
          const callbackPath = `/api/login/callback?code=${code}`;
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

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <FirebaseAuthPage />;
  }

  return <>{children}</>;
}

function PageWithNav({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const isNative = Capacitor.isNativePlatform();

  const getActiveTab = (path: string) => {
    if (path === "/") return "home";
    if (path === "/booking") return "services";
    if (path === "/parts") return "parts";
    if (path === "/cart") return "parts";
    if (path === "/checkout") return "parts";
    if (path === "/bikes") return "profile";
    if (path === "/profile") return "profile";
    if (path === "/history") return "profile";
    if (path === "/technician") return "technician";
    if (path === "/admin") return "admin";
    return "home";
  };

  return (
    <div 
      className="flex flex-col w-full bg-background"
      style={{
        minHeight: 'max(100vh, 100dvh)',
        paddingTop: isNative ? 'env(safe-area-inset-top, 0px)' : '0px',
      }}
    >
      <main 
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : '80px',
        }}
      >
        {children}
      </main>
      <div 
        className="fixed bottom-0 left-0 right-0 w-full"
        style={{
          paddingBottom: isNative ? 'env(safe-area-inset-bottom, 0px)' : '0px',
        }}
      >
        <BottomNav
          activeTab={getActiveTab(location)}
          onTabChange={(tab) => {
            if (tab === "home") setLocation("/");
            else if (tab === "services") setLocation("/booking");
            else if (tab === "technician") setLocation("/technician");
            else if (tab === "admin") setLocation("/admin");
            else setLocation(`/${tab}`);
          }}
        />
      </div>
    </div>
  );
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
                <PageWithNav>
                  <HomePage />
                </PageWithNav>
              </Route>

              <Route path="/booking">
                <PageWithNav>
                  <ServiceBooking />
                </PageWithNav>
              </Route>

              <Route path="/payment">
                <PageWithNav>
                  <PaymentPage />
                </PageWithNav>
              </Route>

              <Route path="/parts">
                <PageWithNav>
                  <PartsCatalog />
                </PageWithNav>
              </Route>

              <Route path="/cart">
                <PageWithNav>
                  <Cart />
                </PageWithNav>
              </Route>

              <Route path="/checkout">
                <PageWithNav>
                  <Checkout />
                </PageWithNav>
              </Route>

              {/* User Profile route */}
              <Route path="/my-profile">
                <ProfilePage />
              </Route>

              {/* Bike Profile route */}
              <Route path="/profile">
                <PageWithNav>
                  <BikeProfile />
                </PageWithNav>
              </Route>

              <Route path="/bikes">
                <PageWithNav>
                  <BikeProfile />
                </PageWithNav>
              </Route>

              {/* Technician routes - both paths work */}
              <Route path="/technician">
                <PageWithNav>
                  <TechnicianDashboard />
                </PageWithNav>
              </Route>

              <Route path="/technician/dashboard">
                <PageWithNav>
                  <TechnicianDashboard />
                </PageWithNav>
              </Route>

              <Route path="/admin">
                <PageWithNav>
                  <Suspense fallback={<FullScreenLoader />}>
                    <AdminDashboard />
                  </Suspense>
                </PageWithNav>
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
