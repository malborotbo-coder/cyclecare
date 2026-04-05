import React from "react";

/**
 * SafeAreaLayout applies safe-area insets used by the global app shell.
 * Top spacing is managed by AppHeader/AppLayout to keep one consistent offset source.
 */
export default function SafeAreaLayout({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`min-h-screen bg-transparent ${className}`}
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: "max(100vh, 100dvh)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
