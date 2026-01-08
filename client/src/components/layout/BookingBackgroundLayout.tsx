import type { ReactNode } from "react";
import bookingBg from "@/assets/images/booking-bg.png";

type Props = {
  children: ReactNode;
  className?: string;
};

export default function BookingBackgroundLayout({ children, className }: Props) {
  return (
    <div className={`relative min-h-screen overflow-hidden ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-0">
        <img
          src={bookingBg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/40 md:bg-black/50" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
