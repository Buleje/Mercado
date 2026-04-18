"use client";

import { CardTitle, PageTitle, SectionTitle } from "@buleje/design-system";
// ═══════════════════════════════════════════════════════
// CMS DASHBOARD - Main entry point
// ═══════════════════════════════════════════════════════


import { useState, useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { Plus, FileText, Image as ImageIcon, Palette, Menu as MenuIcon } from "@buleje/design-system/icons";

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
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <PageTitle className="text-3xl font-bold mb-2">Sistema CMS</PageTitle>
          <p className="text-[var(--text-secondary)]">
            Gestiona el contenido de tu sitio web
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Link
            href="/admin/cms/pages/new"
            className="p-6 bg-[var(--accent)] text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <FileText className="w-8 h-8 mb-2" />
            <CardTitle className="font-bold">Páginas</CardTitle>
            <p className="text-sm opacity-90">{pages.length} páginas</p>
          </Link>

          <Link
            href="/admin/cms/media"
            className="p-6 bg-[var(--surface-sunken)] text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <ImageIcon className="w-8 h-8 mb-2" />
            <CardTitle className="font-bold">Medios</CardTitle>
            <p className="text-sm opacity-90">Biblioteca de imágenes</p>
          </Link>

          <Link
            href="/admin/cms/theme"
            className="p-6 bg-[var(--surface-sunken)] text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <Palette className="w-8 h-8 mb-2" />
            <CardTitle className="font-bold">Tema</CardTitle>
            <p className="text-sm opacity-90">Colores y estilos</p>
          </Link>

          <Link
            href="/admin/cms/navigation"
            className="p-6 bg-[var(--accent)] text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <MenuIcon className="w-8 h-8 mb-2" />
            <CardTitle className="font-bold">Navegación</CardTitle>
            <p className="text-sm opacity-90">Menú del sitio</p>
          </Link>
        </div>

        {/* Pages list */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex justify-between items-center">
            <SectionTitle className="text-xl font-bold">Páginas recientes</SectionTitle>
            <Link
              href="/admin/cms/pages/new"
              className="px-4 py-2 bg-[var(--accent-soft)] text-white rounded-lg hover:bg-[var(--accent-soft)] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nueva página
            </Link>
          </div>

          <div className="divide-y">
            {loading ? (
              <div className="p-8 text-center text-[var(--text-secondary)]">Cargando...</div>
            ) : pages.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-secondary)]">
                No hay páginas creadas. ¡Crea tu primera página!
              </div>
            ) : (
              pages.slice(0, 5).map((page) => (
                <Link
                  key={page.id}
                  href={`/admin/cms/pages/${page.id}`}
                  className="p-4 hover:bg-gray-50 block"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="font-semibold">{page.title}</CardTitle>
                      <p className="text-sm text-[var(--text-secondary)]">/{page.slug}</p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                          page.status === "PUBLISHED"
                            ? "bg-[var(--accent-soft)] text-[var(--data-success)]"
                            : page.status === "DRAFT"
                            ? "bg-[var(--data-warning-100)] text-[var(--data-warning)]"
                            : "bg-gray-100 text-[var(--text-primary)]"
                        }`}
                      >
                        {page.status}
                      </span>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {page._count.blocks} bloques
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          {pages.length > 5 && (
            <div className="p-4 text-center border-t">
              <Link
                href="/admin/cms/pages"
                className="text-[var(--data-success)] hover:underline"
              >
                Ver todas las páginas →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
