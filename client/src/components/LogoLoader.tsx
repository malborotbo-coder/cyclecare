import { motion, AnimatePresence } from "framer-motion";
import logoUrl from "@assets/1_1764502393151.png";

interface LogoLoaderProps {
  isLoading: boolean;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  message?: string;
}

export function LogoLoader({ 
  isLoading, 
  fullScreen = false, 
  size = "md",
  message 
}: LogoLoaderProps) {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32"
  };

  const containerClasses = fullScreen 
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background" 
    : "flex flex-col items-center justify-center p-4";

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={containerClasses}
          data-testid="logo-loader"
        >
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.7, 1, 0.7],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="relative"
          >
            <img 
              src={logoUrl} 
              alt="Cycle Care" 
              className={`${sizeClasses[size]} object-contain`}
              data-testid="loader-logo"
            />
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(232, 106, 75, 0)",
                  "0 0 0 15px rgba(232, 106, 75, 0.2)",
                  "0 0 0 0 rgba(232, 106, 75, 0)"
                ]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </motion.div>
          
          {message && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 text-muted-foreground text-sm"
              data-testid="loader-message"
            >
              {message}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function FullScreenLoader({ message }: { message?: string }) {
  return <LogoLoader isLoading={true} fullScreen={true} size="lg" message={message} />;
}
