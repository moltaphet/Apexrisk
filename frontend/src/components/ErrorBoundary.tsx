import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
}

/** Root guard: a render crash shows a recoverable panel, never a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ApexRisk] render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-crit/40 bg-panel p-6">
          <div className="flex items-center gap-3 text-crit">
            <AlertTriangle size={22} />
            <h1 className="font-display text-xl font-semibold">ApexRisk hit an unexpected error</h1>
          </div>
          <p className="mt-3 text-sm text-mute">
            The terminal stopped rendering, but nothing on-chain was affected. Reload to recover;
            Guest mode works without a wallet.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-ink p-3 text-xs text-crit/90 whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-md bg-apex px-4 py-2 text-sm font-semibold text-ink hover:brightness-110"
            >
              <RefreshCw size={16} /> Reload
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-md border border-line px-4 py-2 text-sm text-mute hover:text-white"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
