import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

interface LanguageToggleProps {
  currentLang: 'ar' | 'en';
  onToggle: () => void;
}

export default function LanguageToggle({ currentLang, onToggle }: LanguageToggleProps) {
  return (
    <Button 
      variant="ghost" 
      size="sm"
      onClick={onToggle}
      className="gap-2"
      data-testid="button-language-toggle"
    >
      <Globe className="w-4 h-4" />
      <span className="text-sm font-medium">{currentLang === 'ar' ? 'EN' : 'ع'}</span>
    </Button>
  );
}
