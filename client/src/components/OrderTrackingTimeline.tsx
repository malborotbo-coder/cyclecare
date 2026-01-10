import { cn } from "@/lib/utils";
import type { OrderTrackingStep } from "@/lib/mockOrders";

const statusClasses: Record<OrderTrackingStep["status"], { dot: string; line: string; text: string }> = {
  done: {
    dot: "bg-primary",
    line: "bg-primary/40",
    text: "text-foreground",
  },
  current: {
    dot: "bg-emerald-500",
    line: "bg-emerald-500/40",
    text: "text-foreground",
  },
  pending: {
    dot: "bg-muted-foreground/30",
    line: "bg-muted-foreground/20",
    text: "text-muted-foreground",
  },
};

const formatTime = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function OrderTrackingTimeline({
  steps,
  className,
}: {
  steps: OrderTrackingStep[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {steps.map((step, index) => {
        const styles = statusClasses[step.status];
        const showLine = index < steps.length - 1;
        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("h-2.5 w-2.5 rounded-full", styles.dot)} />
              {showLine && <span className={cn("w-px flex-1", styles.line)} />}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm font-semibold", styles.text)}>{step.title}</p>
                <span className="text-xs text-muted-foreground">{formatTime(step.timestamp)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
