import React from "react";

type AppBootErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppBootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppBootErrorBoundaryState
> {
  state: AppBootErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): AppBootErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[Bootstrap] Root render failure", { error, info });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const showDetails =
      typeof import.meta !== "undefined" &&
      Boolean((import.meta as any).env?.DEV);

    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-red-500/40 bg-slate-900/80 p-6">
          <h1 className="text-xl font-semibold">App failed to load</h1>
          <p className="mt-2 text-sm text-slate-300">
            A startup error occurred. Please refresh the page.
          </p>
          {showDetails && this.state.message ? (
            <pre className="mt-4 overflow-auto rounded-md bg-black/40 p-3 text-xs text-red-200">
              {this.state.message}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
