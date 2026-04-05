import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildApiUrl } from "@/lib/apiConfig";
import { Button } from "@/components/ui/button";

type LegalSection = "privacy" | "terms";

type LegalDocumentResponse = {
  version: string;
  ar: {
    privacy: string;
    terms: string;
  };
  en: {
    privacy: string;
    terms: string;
  };
};

const fetchLegalDocument = async (): Promise<LegalDocumentResponse> => {
  const response = await fetch(buildApiUrl("/api/legal/document"), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load legal document (${response.status})`);
  }
  return response.json();
};

export default function LegalDocumentContent({
  initialSection = "privacy",
  className = "",
}: {
  initialSection?: LegalSection;
  className?: string;
}) {
  const { lang } = useLanguage();
  const [activeSection, setActiveSection] = useState<LegalSection>(initialSection);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const { data, isLoading, error } = useQuery<LegalDocumentResponse>({
    queryKey: ["legal-document"],
    queryFn: fetchLegalDocument,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });

  const isArabic = lang === "ar";
  const copy = useMemo(
    () => ({
      privacy: isArabic ? "سياسة الخصوصية" : "Privacy Policy",
      terms: isArabic ? "الشروط والأحكام" : "Terms & Conditions",
      loading: isArabic ? "جاري تحميل الوثيقة..." : "Loading legal document...",
      failed: isArabic ? "تعذر تحميل الوثيقة القانونية" : "Failed to load legal document",
      version: isArabic ? "إصدار المستند" : "Document version",
    }),
    [isArabic],
  );

  const localized = isArabic ? data?.ar : data?.en;
  const text = activeSection === "privacy" ? localized?.privacy : localized?.terms;

  return (
    <div dir={isArabic ? "rtl" : "ltr"} className={`space-y-4 ${className}`.trim()}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activeSection === "privacy" ? "default" : "outline"}
          onClick={() => setActiveSection("privacy")}
          data-testid="button-legal-privacy"
        >
          {copy.privacy}
        </Button>
        <Button
          type="button"
          variant={activeSection === "terms" ? "default" : "outline"}
          onClick={() => setActiveSection("terms")}
          data-testid="button-legal-terms"
        >
          {copy.terms}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {copy.loading}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {copy.failed}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-background/95 p-4 shadow-sm">
          <div className="mb-3 text-xs text-muted-foreground">
            {copy.version}: <span className="font-medium text-foreground">{data?.version || "-"}</span>
          </div>
          <div className="max-h-[58vh] overflow-y-auto whitespace-pre-line text-sm leading-7 text-foreground">
            {text}
          </div>
        </div>
      )}
    </div>
  );
}
