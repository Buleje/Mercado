"use client";

/**
 * ExplorarErrorBoundary — wrapper que aisla cada seccion de /explorar.
 *
 * Si una seccion explota (fetch error, render error), el resto sigue vivo.
 * Hace fallback a un placeholder discreto con tokens del proyecto.
 *
 * Uso:
 * ```tsx
 * <ExplorarErrorBoundary section="recently-viewed">
 *   <RecentlyViewedStrip />
 * </ExplorarErrorBoundary>
 * ```
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "@buleje/design-system/icons";

interface Props {
  section: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ExplorarErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof window !== "undefined") {
      console.warn(`[ExplorarErrorBoundary:${this.props.section}]`, error.message, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <section
          aria-label={`Seccion ${this.props.section} no disponible`}
          className="w-full py-6"
        >
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>Esta seccion no esta disponible ahora. Volve a intentarlo mas tarde.</span>
            </div>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
