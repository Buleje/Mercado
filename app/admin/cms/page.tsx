// ═══════════════════════════════════════════════════════
// CMS DASHBOARD - Main entry point
// ═══════════════════════════════════════════════════════

"use client";

import { useState, useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { Plus, FileText, Image as ImageIcon, Palette, Menu as MenuIcon } from "lucide-react";

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
          <h1 className="text-3xl font-bold mb-2">Sistema CMS</h1>
          <p className="text-gray-600">
            Gestiona el contenido de tu sitio web
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Link
            href="/admin/cms/pages/new"
            className="p-6 bg-linear-to-br from-blue-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <FileText className="w-8 h-8 mb-2" />
            <h3 className="font-bold">Páginas</h3>
            <p className="text-sm opacity-90">{pages.length} páginas</p>
          </Link>

          <Link
            href="/admin/cms/media"
            className="p-6 bg-linear-to-br from-purple-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <ImageIcon className="w-8 h-8 mb-2" />
            <h3 className="font-bold">Medios</h3>
            <p className="text-sm opacity-90">Biblioteca de imágenes</p>
          </Link>

          <Link
            href="/admin/cms/theme"
            className="p-6 bg-linear-to-br from-pink-500 to-pink-600 text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <Palette className="w-8 h-8 mb-2" />
            <h3 className="font-bold">Tema</h3>
            <p className="text-sm opacity-90">Colores y estilos</p>
          </Link>

          <Link
            href="/admin/cms/navigation"
            className="p-6 bg-linear-to-br from-green-500 to-green-600 text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            <MenuIcon className="w-8 h-8 mb-2" />
            <h3 className="font-bold">Navegación</h3>
            <p className="text-sm opacity-90">Menú del sitio</p>
          </Link>
        </div>

        {/* Pages list */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-xl font-bold">Páginas recientes</h2>
            <Link
              href="/admin/cms/pages/new"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nueva página
            </Link>
          </div>

          <div className="divide-y">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Cargando...</div>
            ) : pages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
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
                      <h3 className="font-semibold">{page.title}</h3>
                      <p className="text-sm text-gray-600">/{page.slug}</p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                          page.status === "PUBLISHED"
                            ? "bg-green-100 text-green-800"
                            : page.status === "DRAFT"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {page.status}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
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
                className="text-blue-500 hover:underline"
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
