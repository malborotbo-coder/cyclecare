import React from "react";

/**
 * SafeAreaLayout applies iOS safe-area insets to the top/bottom padding so headers and content
 * stay clear of notches/dynamic island in WebViews and in-app browsers.
 */
export default function SafeAreaLayout({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-h-screen bg-background ${className}`}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: "max(100vh, 100dvh)",
      }}
    >
      {children}
    </div>
  );
}
