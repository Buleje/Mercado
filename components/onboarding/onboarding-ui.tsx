'use client';

import type { ReactNode } from 'react';

/**
 * onboarding-ui — primitivos visuales compartidos del wizard de onboarding.
 *
 * Centraliza el botón primario y las clases de inputs/labels para que los 5
 * steps se vean idénticos y elegantes. Antes cada step repetía el botón con
 * `hover:bg-[var(--accent-dark)]` (token UNDEFINED → fondo transparente →
 * texto blanco invisible sobre card blanco). Ahora el botón usa un gradiente
 * con tokens definidos + lift + glow + sheen, sin depender de hover-bg roto.
 */

/* ── Input / label class tokens (DS-compliant, dark-mode safe) ────────────── */
export const OB_INPUT =
  'w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] ' +
  'px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] ' +
  'outline-none transition-all duration-200 ' +
  'hover:border-[var(--accent)]/40 ' +
  'focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]';

export const OB_LABEL =
  'block text-sm font-semibold text-[var(--text-secondary)] mb-1.5';

/* ── Primary button ───────────────────────────────────────────────────────── */
interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
  type?: 'button' | 'submit';
  withArrow?: boolean;
  'aria-label'?: string;
}

export function OnboardingPrimaryButton({
  children,
  onClick,
  disabled = false,
  size = 'md',
  type = 'button',
  withArrow = false,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className={[
        'group relative w-full overflow-hidden rounded-2xl font-bold text-white',
        'transition-[transform,box-shadow,filter] duration-300 ease-out',
        size === 'lg' ? 'py-4 text-lg' : 'py-3.5 text-base',
        'shadow-[0_10px_28px_-8px_var(--accent-glow)]',
        'hover:-translate-y-0.5 hover:shadow-[0_18px_42px_-10px_var(--accent-glow)] hover:brightness-[1.05]',
        'active:translate-y-0 active:scale-[0.99] active:brightness-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-[0.4] disabled:shadow-none disabled:brightness-100 disabled:translate-y-0',
      ].join(' ')}
      style={{
        backgroundImage:
          'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)',
      }}
    >
      {/* Sheen sweep — glint diagonal que cruza el botón en hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/25 blur-md transition-[left] duration-700 ease-out group-hover:left-[140%] group-disabled:hidden"
      />
      <span className="relative z-[1] flex items-center justify-center gap-2">
        {children}
        {withArrow && (
          <svg
            className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        )}
      </span>
    </button>
  );
}

/* ── Secondary / skip button ──────────────────────────────────────────────── */
interface SkipProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function OnboardingSkipButton({ children, onClick, disabled }: SkipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl py-2.5 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:text-[var(--accent)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {children}
    </button>
  );
}
