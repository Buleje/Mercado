"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: React.ReactNode;
  /** Custom fallback UI. If omitted, renders a default error card. */
  fallback?: React.ReactNode;
  /** Tab/module name for the error message context */
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary — wraps any admin tab to catch runtime errors.
 *
 * Usage:
 *   <ErrorBoundary moduleName="Tesorería">
 *     <TreasuryTab />
 *   </ErrorBoundary>
 *
 * Or wrap all tabs globally in app/admin/page.tsx around the render block.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Forward to Sentry if available
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Sentry) {
      (window as unknown as { Sentry: { captureException: (error: Error, info: React.ErrorInfo) => void } }).Sentry.captureException(error, info);
    }
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[280px] p-8 rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-500 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-extrabold text-red-700 dark:text-red-400 text-lg mb-1">
              Error en {this.props.moduleName ?? "este módulo"}
            </h3>
            <p className="text-sm text-red-600/80 dark:text-red-400/70 max-w-md">
              Ocurrió un error inesperado. El resto del panel sigue funcionando con normalidad.
            </p>
            {this.state.error && (
              <p className="mt-2 text-xs font-mono text-red-400/60 dark:text-red-300/40 max-w-md truncate">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
