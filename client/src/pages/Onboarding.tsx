import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import cycleCareLogo from "@assets/1_1764502393151.png";
import { Capacitor } from "@capacitor/core";

interface OnboardingProps {
  onComplete: () => void;
}

const slides = [
  {
    id: 1,
    titleAr: "صيانة احترافية",
    titleEn: "Professional Care",
    descAr: "احصل على خدمات صيانة عالية الجودة من فنيين معتمدين",
    descEn: "Get high-quality maintenance from certified technicians",
  },
  {
    id: 2,
    titleAr: "فنيون موثوقون",
    titleEn: "Trusted Technicians",
    descAr: "اختر من أفضل الفنيين المتاحين بالقرب منك",
    descEn: "Choose from the best technicians near you",
  },
  {
    id: 3,
    titleAr: "حجز سريع",
    titleEn: "Quick Booking",
    descAr: "احجز خدمتك في ثوان معدودة",
    descEn: "Book your service in seconds",
  },
  {
    id: 4,
    titleAr: "جودة مضمونة",
    titleEn: "Quality Guaranteed",
    descAr: "احصل على أفضل جودة بأسعار منافسة",
    descEn: "Get the best quality at great prices",
  },
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { lang, toggleLanguage } = useLanguage();
  const isNative = Capacitor.isNativePlatform();

  const slide = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;
  const isArabic = lang === "ar";

  const handleNext = () => {
    if (isLastSlide) {
      localStorage.setItem("onboarding_completed", "true");
      onComplete();
    } else {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("onboarding_completed", "true");
    onComplete();
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <div 
      className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ paddingTop: isNative ? 'env(safe-area-inset-top, 0px)' : '0px' }}
    >
      {/* Language Toggle - Top Right */}
      <div 
        className="absolute right-4 z-50"
        style={{ top: isNative ? 'calc(env(safe-area-inset-top, 0px) + 16px)' : '16px' }}
      >
        <button
          onClick={toggleLanguage}
          className="px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:opacity-90 transition"
          data-testid="button-language-toggle-onboarding"
        >
          {isArabic ? "EN" : "العربية"}
        </button>
      </div>

      {/* Static Background - Removed animations for performance */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-slate-700/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-600/20 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-md space-y-6 z-10">
        {/* Logo - Optimized animation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex justify-center mb-4"
        >
          <img
            src={cycleCareLogo}
            alt="Cycle Care"
            className="w-48 h-auto object-contain"
            loading="eager"
          />
        </motion.div>

        {/* Slide Content */}
        <div className="relative h-[280px]">
          <AnimatePresence initial={false} custom={1} mode="wait">
            <motion.div
              key={currentSlide}
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 400, damping: 35 },
                opacity: { duration: 0.15 },
              }}
              className="absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.2 }}
                className="text-3xl font-bold text-white mb-4"
              >
                {isArabic ? slide.titleAr : slide.titleEn}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
                className="text-gray-300 text-base leading-relaxed max-w-xs"
              >
                {isArabic ? slide.descAr : slide.descEn}
              </motion.p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`transition-all duration-200 rounded-full ${
                idx === currentSlide
                  ? "h-3 w-8 bg-gradient-to-r from-primary to-secondary"
                  : "h-3 w-3 bg-white/30 hover:bg-white/50"
              }`}
              data-testid={`dot-progress-${idx}`}
            />
          ))}
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-3">
          {/* Previous Button */}
          {currentSlide > 0 && (
            <Button
              onClick={handlePrev}
              variant="outline"
              className="h-12 flex-1 border-white/20 text-white hover:bg-white/10 rounded-xl"
              data-testid="button-onboarding-prev"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}

          {/* Main Action Button */}
          <Button
            onClick={handleNext}
            className="h-12 flex-1 rounded-xl font-semibold text-base flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-secondary text-white hover:shadow-lg transition-shadow"
            data-testid="button-onboarding-next"
          >
            {isLastSlide ? (
              <>
                {isArabic ? "ابدأ الآن" : "Get Started"}
              </>
            ) : (
              <>
                {isArabic ? "التالي" : "Next"}
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>

        {/* Skip Button */}
        <div>
          <Button
            onClick={handleSkip}
            variant="ghost"
            className="w-full h-11 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl"
            data-testid="button-onboarding-skip"
          >
            {isArabic ? "تخطي" : "Skip"}
          </Button>
        </div>

        {/* Slide Counter */}
        <div className="text-center text-sm text-gray-500">
          {currentSlide + 1} / {slides.length}
        </div>
      </div>
    </div>
  );
}
