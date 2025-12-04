import { useEffect } from "react";
import { motion } from "framer-motion";
import cycleCareLogo from "@assets/1_1764502393151.png";

interface SplashProps {
  onComplete: () => void;
}

export default function Splash({ onComplete }: SplashProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 1500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900 flex items-center justify-center overflow-hidden">
      {/* Static background elements for performance */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      {/* Logo Container */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-4">
        {/* Animated Logo with pulse effect */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex justify-center"
        >
          <motion.img
            src={cycleCareLogo}
            alt="Cycle Care"
            className="w-40 h-auto object-contain"
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.9, 1, 0.9],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>

        {/* Pulsing ring effect */}
        <motion.div
          className="absolute w-48 h-48 rounded-full border-2 border-primary/30"
          animate={{
            scale: [1, 1.3],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      </div>
    </div>
  );
}
