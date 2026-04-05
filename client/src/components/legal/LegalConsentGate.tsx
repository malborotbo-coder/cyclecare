import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { FullScreenLoader } from "@/components/LogoLoader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LegalDocumentContent from "@/components/legal/LegalDocumentContent";

type ConsentStatusResponse = {
  requiresConsent: boolean;
  acceptedPrivacyPolicy: boolean;
  acceptedTerms: boolean;
  acceptedLegalVersion: string | null;
  requiredLegalVersion: string;
};

export default function LegalConsentGate({ children }: { children: React.ReactNode }) {
  const { user, authReady, isGuest, logout } = useFirebaseAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState(true);
  const [requiresConsent, setRequiresConsent] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const userId = user?.id ?? null;

  const isArabic = lang === "ar";

  const labels = useMemo(
    () => ({
      title: isArabic ? "سياسة الخصوصية والشروط والأحكام" : "Privacy Policy & Terms",
      description: isArabic
        ? "باستخدامك لتطبيق Cycle Care، فإنك توافق على سياسة الخصوصية والشروط والأحكام."
        : "By using Cycle Care, you agree to the Privacy Policy and Terms & Conditions.",
      view: isArabic ? "عرض الوثيقة القانونية" : "View Legal Document",
      accept: isArabic ? "موافقة" : "Accept",
      decline: isArabic ? "رفض" : "Decline",
      checking: isArabic ? "جاري التحقق من الموافقة القانونية..." : "Checking legal consent...",
      acceptFailed: isArabic ? "تعذر حفظ الموافقة" : "Failed to save legal consent",
      acceptSuccess: isArabic ? "تم حفظ الموافقة القانونية" : "Legal consent saved",
      declineTitle: isArabic ? "تأكيد الرفض" : "Confirm decline",
      declineDescription: isArabic
        ? "في حال الرفض سيتم تسجيل خروجك والعودة إلى صفحة تسجيل الدخول."
        : "Declining will log you out and return you to the login screen.",
      cancel: isArabic ? "إلغاء" : "Cancel",
      confirmDecline: isArabic ? "تأكيد الرفض" : "Confirm decline",
      required: isArabic ? "الموافقة مطلوبة للمتابعة" : "Consent required to continue",
    }),
    [isArabic],
  );

  const refreshConsentStatus = useCallback(async () => {
    if (!authReady || !userId || isGuest) {
      setRequiresConsent(false);
      setIsChecking(false);
      return;
    }
    setIsChecking(true);
    try {
      const status = (await apiRequest("/api/legal/consent-status", "GET")) as ConsentStatusResponse;
      setRequiresConsent(Boolean(status?.requiresConsent));
    } catch (error: any) {
      const code = error?.code;
      if (code === "LEGAL_CONSENT_REQUIRED") {
        setRequiresConsent(true);
      } else {
        console.error("[LegalGate] Failed to load consent status", error);
        setRequiresConsent(false);
      }
    } finally {
      setIsChecking(false);
    }
  }, [authReady, isGuest, userId]);

  useEffect(() => {
    void refreshConsentStatus();
  }, [refreshConsentStatus]);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await apiRequest("/api/legal/accept", "POST", {
        acceptedPrivacyPolicy: true,
        acceptedTerms: true,
      });
      setRequiresConsent(false);
      setViewerOpen(false);
      toast({
        title: labels.acceptSuccess,
        variant: "success",
      });
    } catch (error) {
      console.error("[LegalGate] Accept failed", error);
      toast({
        title: labels.acceptFailed,
        variant: "destructive",
      });
    } finally {
      setIsAccepting(false);
    }
  };

  if (!authReady) {
    return <FullScreenLoader />;
  }

  if (!user || isGuest) {
    return <>{children}</>;
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground" dir={isArabic ? "rtl" : "ltr"}>
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {labels.checking}
      </div>
    );
  }

  if (!requiresConsent) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4" dir={isArabic ? "rtl" : "ltr"}>
        <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-background/95 p-6 shadow-xl">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{labels.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{labels.description}</p>
              <p className="mt-2 text-xs font-medium text-destructive">{labels.required}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Button type="button" variant="outline" onClick={() => setViewerOpen(true)} data-testid="button-view-legal-document">
              {labels.view}
            </Button>
            <Button type="button" onClick={handleAccept} disabled={isAccepting} data-testid="button-accept-legal">
              {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : labels.accept}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeclineConfirmOpen(true)}
              disabled={isAccepting}
              data-testid="button-decline-legal"
            >
              {labels.decline}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-4xl overflow-hidden" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
          </DialogHeader>
          <LegalDocumentContent className="pb-2" />
        </DialogContent>
      </Dialog>

      <AlertDialog open={declineConfirmOpen} onOpenChange={setDeclineConfirmOpen}>
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.declineTitle}</AlertDialogTitle>
            <AlertDialogDescription>{labels.declineDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void logout();
              }}
            >
              {labels.confirmDecline}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
