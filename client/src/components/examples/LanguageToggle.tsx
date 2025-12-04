import { useState } from 'react';
import LanguageToggle from '../LanguageToggle';

export default function LanguageToggleExample() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  
  return (
    <div className="p-8 flex items-center justify-center gap-4">
      <p>Current language: {lang === 'ar' ? 'العربية' : 'English'}</p>
      <LanguageToggle 
        currentLang={lang} 
        onToggle={() => setLang(lang === 'ar' ? 'en' : 'ar')} 
      />
    </div>
  );
}
