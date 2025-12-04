import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LocationPermission() {
  const { lang } = useLanguage();
  const [showPrompt, setShowPrompt] = useState(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');

  useEffect(() => {
    const hasAsked = localStorage.getItem('locationPermissionAsked');
    
    if (hasAsked) {
      return;
    }

    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        if (result.state === 'prompt') {
          setShowPrompt(true);
        }
      }).catch(() => {
        setShowPrompt(true);
      });
    } else {
      setShowPrompt(true);
    }
  }, []);

  const requestLocation = () => {
    localStorage.setItem('locationPermissionAsked', 'true');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissionState('granted');
          setShowPrompt(false);
        },
        () => {
          setPermissionState('denied');
          setShowPrompt(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setShowPrompt(false);
    }
  };

  const dismissPrompt = () => {
    localStorage.setItem('locationPermissionAsked', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-300">
        <button
          onClick={dismissPrompt}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          data-testid="button-dismiss-location"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-8 h-8 text-primary" />
          </div>

          <h2 className="text-xl font-bold">
            {lang === 'ar' ? 'تفعيل خدمة الموقع' : 'Enable Location Services'}
          </h2>

          <p className="text-muted-foreground">
            {lang === 'ar' 
              ? 'للحصول على أفضل تجربة، نحتاج إلى معرفة موقعك لإرسال فني قريب منك.'
              : 'For the best experience, we need your location to send a nearby technician to you.'}
          </p>

          <div className="flex flex-col gap-3 pt-2">
            <Button 
              onClick={requestLocation} 
              className="w-full"
              data-testid="button-allow-location"
            >
              <MapPin className="w-4 h-4 mr-2" />
              {lang === 'ar' ? 'السماح بالوصول للموقع' : 'Allow Location Access'}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={dismissPrompt}
              className="w-full"
              data-testid="button-skip-location"
            >
              {lang === 'ar' ? 'ليس الآن' : 'Not Now'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
