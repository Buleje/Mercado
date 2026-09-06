"use client";

import { useState, useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Palette,
  Menu as MenuIcon,
  Layout,
} from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import AdminTabShell from "@/app/admin/_components/_shared/AdminTabShell";
import AdminEmptyState from "@/app/admin/_components/_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";

interface Page {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
  _count: {
    blocks: number;
  };
}

interface QuickLink {
  href: string;
  icon: typeof FileText;
  title: string;
  description: string;
}

const QUICK_LINKS: QuickLink[] = [
  {
    href: "/admin/cms/pages/new",
    icon: FileText,
    title: "Páginas",
    description: "Crea y gestiona el contenido editorial",
  },
  {
    href: "/admin/cms/media",
    icon: ImageIcon,
    title: "Medios",
    description: "Biblioteca de imágenes y archivos",
  },
  {
    href: "/admin/cms/theme",
    icon: Palette,
    title: "Tema",
    description: "Colores, tipografía y estilos globales",
  },
  {
    href: "/admin/cms/navigation",
    icon: MenuIcon,
    title: "Navegación",
    description: "Estructura del menú y enlaces del sitio",
  },
];

export default function CMSDashboard() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPages();
  }, []);

  async function fetchPages() {
    try {
      const res = await fetch("/api/cms/pages");
      if (res.ok) {
        const data = await res.json();
        setPages(data);
      }
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <AdminTabShell
          title="Sistema CMS"
          description="Gestiona el contenido editorial, páginas, medios y navegación del sitio público."
          icon={Layout}
          actions={
            <Link href="/admin/cms/pages/new" className={ADMIN_TOKENS.btnPrimary}>
              <Plus className="w-4 h-4" aria-hidden />
              Nueva página
            </Link>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {QUICK_LINKS.map(({ href, icon: Icon, title, description }) => (
              <Link
                key={href}
                href={href}
                className={`${ADMIN_TOKENS.card} p-5 hover:border-[var(--accent)]/40 transition-colors group`}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors mb-3">
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <h3 className={ADMIN_TOKENS.headingH3}>{title}</h3>
                <p className={`${ADMIN_TOKENS.bodyText} mt-1`}>{description}</p>
                {title === "Páginas" && (
                  <p className={`${ADMIN_TOKENS.hint} mt-2`}>
                    {pages.length} {pages.length === 1 ? "página" : "páginas"}
                  </p>
                )}
              </Link>
            ))}
          </div>

          <section className={ADMIN_TOKENS.card}>
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule-soft)]">
              <h3 className={ADMIN_TOKENS.headingH3}>Páginas recientes</h3>
              {pages.length > 5 && (
                <Link
                  href="/admin/cms/pages"
                  className={ADMIN_TOKENS.btnGhost}
                >
                  Ver todas →
                </Link>
              )}
            </header>

            {loading ? (
              <div className="p-8">
                <LoadingState />
              </div>
            ) : pages.length === 0 ? (
              <div className="p-5">
                <AdminEmptyState
                  icon={FileText}
                  title="Sin páginas creadas"
                  description="Crea tu primera página editorial para que aparezca en el sitio público."
                  action={{
                    label: "Crear primera página",
                    onClick: () => {
                      window.location.href = "/admin/cms/pages/new";
                    },
                  }}
                  compact
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rule-soft)]">
                {pages.slice(0, 5).map((page) => (
                  <li key={page.id}>
                    <Link
                      href={`/admin/cms/pages/${page.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[var(--surface-sunken)]/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {page.title}
                        </p>
                        <p className={`${ADMIN_TOKENS.hint} truncate`}>/{page.slug}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`${ADMIN_TOKENS.hint}`}>
                          {page._count.blocks} bloques
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            page.status === "PUBLISHED"
                              ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                              : page.status === "DRAFT"
                              ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {page.status}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </AdminTabShell>
      </div>
    </div>
  );
}
