import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Footer() {
  const { lang } = useLanguage();

  const t = {
    ar: {
      privacy: "سياسة الخصوصية",
      terms: "شروط الخدمة",
      rights: "© 2025 Cycle Care. جميع الحقوق محفوظة.",
      domain: "cyclecatrtec.com"
    },
    en: {
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      rights: "© 2025 Cycle Care. All rights reserved.",
      domain: "cyclecatrtec.com"
    }
  };

  return (
    <footer className="bg-sidebar/50 border-t border-sidebar-border mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <Link href="/privacy">
              <a className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-privacy-footer">
                {t[lang].privacy}
              </a>
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link href="/terms">
              <a className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-terms-footer">
                {t[lang].terms}
              </a>
            </Link>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{t[lang].rights}</p>
            <p className="text-primary font-medium">{t[lang].domain}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
