import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const { lang } = useLanguage();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  const handleDismiss = () => {
    setShowInstallButton(false);
  };

  if (!showInstallButton) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4" data-testid="install-pwa-banner">
      <div className="bg-card border border-border rounded-lg shadow-lg p-4 flex items-center gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1" data-testid="text-install-title">
            {lang === 'ar' ? 'ثبت التطبيق' : 'Install App'}
          </h3>
          <p className="text-xs text-muted-foreground" data-testid="text-install-description">
            {lang === 'ar' 
              ? 'ثبت Cycle Care على جهازك للوصول السريع' 
              : 'Install Cycle Care on your device for quick access'}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleInstallClick}
          data-testid="button-install-app"
          className="shrink-0"
        >
          <Download className="w-4 h-4" />
          {lang === 'ar' ? 'ثبت' : 'Install'}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDismiss}
          data-testid="button-dismiss-install"
          className="shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
