"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function TenantTiendaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  useEffect(() => {
    Sentry.captureException(error, {
      tags: { surface: "tenant-storefront", slug },
    });
  }, [error, slug]);

  const tenantHome = slug ? `/t/${slug}` : "/";

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <svg
            className="h-8 w-8 text-[var(--data-error-500)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] dark:text-white">
            No pudimos cargar la tienda
          </h2>
          <p className="mt-2 text-sm text-[var(--text-tertiary)] dark:text-muted">
            Tuvimos un problema momentáneo. Probá reintentar; si persiste,
            volvé al inicio de la tienda.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
          <Link
            href={tenantHome}
            className="px-6 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
