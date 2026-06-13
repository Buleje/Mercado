'use client';

import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

export function LoadingSpinner({
  size = 'md',
  text,
  fullScreen = false,
  className = '',
}: LoadingSpinnerProps) {
  const content = (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-label={text ?? 'Cargando...'}
    >
      <Loader2 className={`${sizeClasses[size]} animate-spin text-[var(--data-success-600)]`} aria-hidden="true" />
      {text && <p className="text-sm text-gray-600 animate-pulse" aria-hidden="true">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-black/60 backdrop-blur-sm z-50">
        {content}
      </div>
    );
  }

  return content;
}

export function ComponentLoader({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div className="w-full py-12 flex items-center justify-center">
      <LoadingSpinner text={text} />
    </div>
  );
}

export function PageLoader() {
  return <LoadingSpinner size="lg" text="Cargando página..." fullScreen />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[var(--surface-canvas)] rounded-lg border border-gray-200 dark:border-[var(--rule-base)] overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-200 dark:bg-[var(--surface-sunken)]" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-3/4" />
        <div className="h-4 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-1/2" />
        <div className="flex justify-between items-center pt-2">
          <div className="h-6 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-20" />
          <div className="h-8 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-24" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-[var(--surface-canvas)] rounded-lg border border-gray-200 dark:border-[var(--rule-base)] animate-pulse">
          <div className="w-16 h-16 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-3/4" />
            <div className="h-3 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-1/2" />
          </div>
          <div className="h-8 w-20 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-[var(--rule-base)]">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="p-3 text-left">
                <div className="h-4 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-24 animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-gray-100 dark:border-[var(--rule-soft)]">
              {Array.from({ length: cols }).map((_, colIndex) => (
                <td key={colIndex} className="p-3">
                  <div className="h-4 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-32 animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonForm() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-24 animate-pulse" />
          <div className="h-10 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-full animate-pulse" />
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <div className="h-10 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-32 animate-pulse" />
        <div className="h-10 bg-gray-200 dark:bg-[var(--surface-sunken)] rounded w-32 animate-pulse" />
      </div>
    </div>
  );
}
