import { useState } from 'react';
import HomePage from '../HomePage';

export default function HomePageExample() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  
  return <HomePage lang={lang} onLanguageChange={() => setLang(lang === 'ar' ? 'en' : 'ar')} />;
}
