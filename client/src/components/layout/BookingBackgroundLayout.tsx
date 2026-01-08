import type { ReactNode } from "react";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";
type Props = {
  children: ReactNode;
  className?: string;
};

export default function BookingBackgroundLayout({ children, className }: Props) {
  return (
    <div className={`relative min-h-screen overflow-hidden ${className ?? ""}`}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${workshopBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "scroll",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-black/35" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
