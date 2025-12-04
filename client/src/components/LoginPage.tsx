import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, Phone, UserCircle } from "lucide-react";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { SiGoogle, SiApple, SiGithub } from "react-icons/si";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const { t, lang, toggleLanguage } = useLanguage();

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center p-4">
      <div className="absolute top-4 left-4 z-10">
        <LanguageToggle currentLang={lang} onToggle={toggleLanguage} />
      </div>
      
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center items-center">
            <Logo size="lg" className="drop-shadow-2xl" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">{t('loginTitle')}</h1>
            <p className="text-xl text-white/90">{t('loginSubtitle')}</p>
          </div>
        </div>

        <Card className="p-8 bg-white/10 backdrop-blur-md border-white/20">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-white text-center mb-6">{t('loginHeading')}</h2>
            
            <Button 
              variant="outline" 
              className="w-full h-12 text-base gap-3 bg-white text-black border-white hover:bg-white/90"
              onClick={handleLogin}
              data-testid="button-login-google"
            >
              <SiGoogle className="w-5 h-5" />
              {t('loginGoogle')}
            </Button>

            <Button 
              variant="outline" 
              className="w-full h-12 text-base gap-3 bg-white/10 text-white border-white/30 hover:bg-white/20"
              onClick={handleLogin}
              data-testid="button-login-apple"
            >
              <SiApple className="w-5 h-5" />
              {t('loginApple')}
            </Button>

            <Button 
              variant="outline" 
              className="w-full h-12 text-base gap-3 bg-white/10 text-white border-white/30 hover:bg-white/20"
              onClick={handleLogin}
              data-testid="button-login-github"
            >
              <SiGithub className="w-5 h-5" />
              {t('loginGithub')}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-sidebar/80 text-white/80">{t('orLoginWith')}</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="w-full h-12 text-base gap-3 bg-white/10 text-white border-white/30 hover:bg-white/20"
              onClick={handleLogin}
              data-testid="button-login-email"
            >
              <Mail className="w-5 h-5" />
              {t('loginEmail')}
            </Button>

            <div className="text-center text-sm text-white/70 pt-4">
              {t('loginTerms')}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white/5 backdrop-blur-sm border-white/10">
          <div className="text-center space-y-3">
            <h3 className="text-lg font-semibold text-white">
              {lang === 'ar' ? 'مستخدم جديد؟' : 'New User?'}
            </h3>
            <p className="text-sm text-white/70">
              {lang === 'ar' 
                ? 'عند تسجيل الدخول بأي من الطرق أعلاه، سيتم إنشاء حساب جديد لك تلقائياً'
                : 'When you login with any method above, a new account will be created for you automatically'}
            </p>
            <Button 
              variant="outline" 
              className="w-full h-11 text-base gap-2 bg-primary hover:bg-primary/90 text-white border-white/30"
              onClick={handleLogin}
              data-testid="button-create-account"
            >
              <UserCircle className="w-5 h-5" />
              {lang === 'ar' ? 'إنشاء حساب جديد' : 'Create New Account'}
            </Button>
          </div>
        </Card>

        <div className="text-center text-white/60 text-sm">
          {t('loginFooter')}
        </div>
      </div>
    </div>
  );
}
