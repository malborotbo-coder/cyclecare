import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  POST_LOGIN_RESOLVER_PATH,
  setStoredLoginMode,
} from "@/lib/authRole";

export default function TechnicianAccessBlocked() {
  const [, setLocation] = useLocation();

  const switchToRider = () => {
    setStoredLoginMode("rider");
    setLocation(POST_LOGIN_RESOLVER_PATH);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-6 space-y-5 text-center">
        <h1 className="text-2xl font-bold">أنت غير مسجل كفني</h1>
        <p className="text-sm text-gray-300 leading-7">
          أكمل بياناتك ثم سجّل كفني للبدء في استقبال الطلبات.
        </p>

        <div className="space-y-3">
          <Button
            onClick={() => setLocation("/technician/register")}
            className="w-full h-12 text-base font-semibold"
            data-testid="button-register-technician-from-block"
          >
            تسجيل الفنيين
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setLocation("/my-profile?returnTo=/technician/register")
            }
            className="w-full h-12 text-base font-semibold border-white/30 text-white hover:bg-white/10"
            data-testid="button-profile-from-block"
          >
            بياناتي
          </Button>
          <Button
            variant="ghost"
            onClick={switchToRider}
            className="w-full h-11 text-sm text-white/75 hover:text-white hover:bg-white/10"
            data-testid="button-switch-rider-from-block"
          >
            الدخول كدراج
          </Button>
        </div>
      </div>
    </div>
  );
}
