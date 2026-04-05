import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import LegalDocumentContent from "@/components/legal/LegalDocumentContent";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LegalSection = "privacy" | "terms";

const getInitialSection = (): LegalSection => {
  if (typeof window === "undefined") return "terms";
  const section = new URLSearchParams(window.location.search).get("section");
  return section === "privacy" ? "privacy" : "terms";
};

export default function LegalDocumentPage() {
  const { lang } = useLanguage();
  const isArabic = lang === "ar";
  const initialSection = useMemo(() => getInitialSection(), []);

  return (
    <main className="container mx-auto max-w-5xl px-4 py-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">
          {isArabic ? "سياسة الخصوصية والشروط والأحكام" : "Privacy Policy & Terms"}
        </h1>
        <Link href="/my-profile">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {isArabic ? "العودة للملف الشخصي" : "Back to Profile"}
          </Button>
        </Link>
      </div>

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">
            {isArabic
              ? "يرجى قراءة المستند القانوني بعناية."
              : "Please review the legal document carefully."}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LegalDocumentContent initialSection={initialSection} />
        </CardContent>
      </Card>
    </main>
  );
}
