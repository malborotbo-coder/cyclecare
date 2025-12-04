import { useState } from 'react';
import LoginPage from '../LoginPage';

export default function LoginPageExample() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  
  return <LoginPage lang={lang} onLanguageChange={() => setLang(lang === 'ar' ? 'en' : 'ar')} />;
}
