import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed.error) {
          friendly = `Cloud Sync (${parsed.operationType || 'op'} ${parsed.path || ''}): ${parsed.error}`;
        }
      } catch {
        // plain string message
      }
      return (
        <div className="min-h-[100dvh] w-full bg-slate-50 text-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white border border-rose-300 shadow-xl p-6 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="font-display text-xl font-bold text-slate-950">Something Went Wrong</h2>
            <p className="text-xs text-slate-600 break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-display font-bold text-xs cursor-pointer transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload Koopal Clash</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
