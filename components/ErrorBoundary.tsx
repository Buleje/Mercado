"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type FallbackRender = (error: Error, reset: () => void) => ReactNode;

interface Props {
  children: ReactNode;
  /**
   * Fallback UI to show when error occurs
   * Can be a ReactNode or a render function that receives error and reset callback
   */
  fallback?: ReactNode;
  /**
   * Fallback render function (alternative to fallback)
   * Receives error and reset callback
   */
  fallbackRender?: FallbackRender;
  /**
   * Callback when error is caught
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Custom error message
   */
  errorMessage?: string;
  /**
   * Whether to show error details in production
   * @default false
   */
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Enhanced Error Boundary with recovery capabilities
 * 
 * Catches React errors in child components and displays a fallback UI
 * Includes error logging, stack traces, and recovery options
 * 
 * @example
 * ```tsx
 * <ErrorBoundary
 *   onError={(error, errorInfo) => {
 *     logErrorToService(error, errorInfo);
 *   }}
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report error to Sentry
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // Store error info in state
    this.setState({
      errorInfo,
    });

    // Log to Google Analytics if available
    try {
      if (typeof window !== "undefined") {
        const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
        if (gtag) {
          gtag("event", "exception", {
            description: error.message,
            fatal: true,
          });
        }
      }
    } catch {
      // Silently fail if analytics not available
    }
  }

  reset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback render function if provided
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender(this.state.error, this.reset);
      }

      // Use custom fallback ReactNode if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      const isDevelopment = process.env.NODE_ENV === "development";
      const canShowDetails = this.props.showDetails || isDevelopment;

      return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white dark:bg-card rounded-2xl shadow-[var(--shadow-xl)] border border-gray-200 dark:border-card-border p-8">
              {/* Error Icon */}
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full">
                  <AlertTriangle className="h-12 w-12 text-[var(--data-error-600)] dark:text-red-400" />
                </div>
              </div>

              {/* Error Message */}
              <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-foreground mb-3">
                {this.props.errorMessage || "¡Ups! Algo salió mal"}
              </h1>
              <p className="text-center text-gray-600 dark:text-muted mb-8">
                Ocurrió un error inesperado. No te preocupes, tus datos están seguros. Puedes intentar recargar la página o volver al inicio.
              </p>

              {/* Error Details (Development/Optional) */}
              {canShowDetails && this.state.error && (
                <div className="mb-6">
                  <button
                    onClick={this.toggleDetails}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-foreground font-semibold mb-3 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                  >
                    {this.state.showDetails ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    Detalles técnicos
                  </button>

                  {this.state.showDetails && (
                    <div className="bg-gray-50 dark:bg-surface rounded-lg p-4 overflow-x-auto">
                      <p className="text-xs font-mono text-[var(--data-error-600)] dark:text-red-400 mb-2">
                        {this.state.error.name}: {this.state.error.message}
                      </p>
                      {this.state.error.stack && (
                        <pre className="text-xs font-mono text-gray-600 dark:text-muted whitespace-pre-wrap wrap-break-word max-h-60 overflow-y-auto">
                          {this.state.error.stack}
                        </pre>
                      )}
                      {this.state.errorInfo?.componentStack && (
                        <>
                          <p className="text-xs font-semibold text-gray-700 dark:text-foreground mt-4 mb-2">
                            Component Stack:
                          </p>
                          <pre className="text-xs font-mono text-gray-600 dark:text-muted whitespace-pre-wrap wrap-break-word max-h-60 overflow-y-auto">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.reset}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2",
                    "px-6 py-3 rounded-xl",
                    "bg-primary text-white",
                    "hover:bg-primary-dark",
                    "transition-colors font-semibold shadow-[var(--shadow-md)]"
                  )}
                >
                  <RefreshCw className="h-5 w-5" />
                  Reintentar
                </button>
                <button
                  onClick={() => {
                    window.location.href = "/";
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2",
                    "px-6 py-3 rounded-xl",
                    "bg-gray-100 dark:bg-surface text-gray-700 dark:text-foreground",
                    "hover:bg-gray-200 dark:hover:bg-gray-700",
                    "transition-colors font-semibold"
                  )}
                >
                  <Home className="h-5 w-5" />
                  Ir al inicio
                </button>
              </div>

              {/* Development Note */}
              {isDevelopment && (
                <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-[var(--data-success-700)] dark:text-emerald-300">
                    <span className="font-semibold">Modo desarrollo:</span> Los detalles del error son visibles. En producción, solo se mostrará un mensaje genérico.
                  </p>
                </div>
              )}

              {/* Contact Link */}
              <p className="text-xs text-center text-muted mt-6">
                Si el problema persiste, contáctanos por{" "}
                <a
                  href="https://wa.me/51961646678"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-semibold"
                >
                  WhatsApp
                </a>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary wrapper (for use in functional components)
 * 
 * @example
 * ```tsx
 * function MyPage() {
 *   return (
 *     <ErrorBoundaryWrapper>
 *       <MyComponent />
 *     </ErrorBoundaryWrapper>
 *   );
 * }
 * ```
 */
export function ErrorBoundaryWrapper({
  children,
  ...props
}: Omit<Props, "children"> & { children: ReactNode }) {
  return <ErrorBoundary {...props}>{children}</ErrorBoundary>;
}

/**
 * Simple error fallback component
 */
export function SimpleErrorFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
      <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
        Error
      </h3>
      <p className="text-sm text-[var(--data-error-700)] dark:text-red-300 mb-4">
        {error.message}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-[var(--data-error-600)] text-white rounded-lg hover:bg-[var(--data-error-700)] transition-colors text-sm font-semibold"
      >
        Reintentar
      </button>
    </div>
  );
}
