import type { ReactNode } from "react";
type Props = {
  children: ReactNode;
  className?: string;
};

export default function BookingBackgroundLayout({ children, className }: Props) {
  return (
    <div className={`relative min-h-screen overflow-hidden ${className ?? ""}`}>
      <div className="absolute inset-0 bg-[#f2e8dc] dark:bg-[#0f0f0f]" />
      <div className="pointer-events-none absolute inset-0 bg-black/15 dark:bg-black/35" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
