"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Eye, Trash2, Copy, MoreHorizontal, Send, Undo2 } from "@buleje/design-system/icons";
import { SectionTitle, LoadingState } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import AdminEmptyState from "@/app/admin/_components/_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";
import { useCmsPages } from "@/hooks/use-cms-pages";
import { useTenantSlug } from "@/contexts/tenant-context";
import { formatDate } from "@/lib/format";
import NuevaPaginaModal from "./NuevaPaginaModal";
import { ETIQUETA_ESTADO, type PaginaResumen } from "./tipos";

const PILDORA: Record<PaginaResumen["status"], string> = {
  PUBLISHED: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)]",
  DRAFT: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  ARCHIVED: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

/** Dónde se ve la página de verdad: bajo el negocio, no bajo el host de quien la mire. */
function enlacePublico(tenantSlug: string, slug: string): string {
  return `${window.location.origin}/t/${tenantSlug}/cms/${slug}`;
}

export default function PaginasPorBloquesTab() {
  const { paginas, cargando, error, recargar, crear, publicar, despublicar, eliminar } = useCmsPages();
  const { confirm } = useConfirm();
  const tenantSlug = useTenantSlug();
  const router = useRouter();
  const [nueva, setNueva] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);

  async function alCrear(titulo: string, enlace: string): Promise<string | null> {
    const r = await crear(titulo, enlace);
    if (!r.ok) return r.error;
    router.push(`/admin/cms/pages/${r.id}`);
    return null;
  }

  async function cambiarEstado(p: PaginaResumen) {
    setOcupada(p.id);
    const r = p.status === "PUBLISHED" ? await despublicar(p.id) : await publicar(p.id);
    setOcupada(null);
    if (r.ok) toast.success(p.status === "PUBLISHED" ? "Volvió a borrador" : "Página publicada");
    else toast.error(r.error);
  }

  async function borrar(p: PaginaResumen) {
    const ok = await confirm({
      title: `¿Eliminar «${p.title}»?`,
      description: "Se borra con sus bloques y deja de verse en tu tienda. No se puede deshacer.",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    });
    if (!ok) return;
    setOcupada(p.id);
    const r = await eliminar(p.id);
    setOcupada(null);
    if (r.ok) toast.success("Página eliminada");
    else toast.error(r.error);
  }

  async function copiar(p: PaginaResumen) {
    try {
      await navigator.clipboard.writeText(enlacePublico(tenantSlug, p.slug));
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  function accionesDe(p: PaginaResumen): MenuAccion[] {
    const publicada = p.status === "PUBLISHED";
    return [
      ...(publicada
        ? [
            { id: "ver", label: "Ver en tu tienda", icon: Eye, onSelect: () => window.open(`/t/${tenantSlug}/cms/${p.slug}`, "_blank", "noopener,noreferrer") },
            { id: "copiar", label: "Copiar enlace", icon: Copy, onSelect: () => void copiar(p) },
          ]
        : []),
      publicada
        ? { id: "estado", label: "Despublicar", hint: "Vuelve a borrador y deja de verse", icon: Undo2, onSelect: () => void cambiarEstado(p) }
        : { id: "estado", label: "Publicar", hint: "Se ve en /cms/ y se puede enlazar", icon: Send, onSelect: () => void cambiarEstado(p) },
      { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: () => void borrar(p) },
    ];
  }

  return (
    <section className="space-y-3" aria-label="Páginas por bloques">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle>Páginas por bloques</SectionTitle>
          <InfoTip
            title="Páginas por bloques"
            what="Arma páginas como «Ofertas» o «Nosotros» juntando bloques (portada, productos, preguntas, contacto). Quedan en borrador hasta que las publiques; entonces se ven en /cms/ y se pueden enlazar desde tu portada."
          />
        </div>
        {/* A 400 px queda en ícono: la cabecera no se parte en dos filas. */}
        <button type="button" onClick={() => setNueva(true)} title="Nueva página" className={button({ variant: "primary", className: "ml-auto h-12 rounded-xl max-sm:w-12 max-sm:px-0" })}>
          <Plus className="w-4 h-4" aria-hidden />
          <span className="max-sm:sr-only">Nueva página</span>
        </button>
      </header>

      {cargando ? (
        <div className="p-8">
          <LoadingState />
        </div>
      ) : error ? (
        <div className={`${ADMIN_TOKENS.cardPadded} text-center`} role="alert">
          <p className={ADMIN_TOKENS.bodyText}>{error}</p>
          <button type="button" onClick={() => void recargar()} className={`${ADMIN_TOKENS.btnSecondary} mt-3`}>
            Reintentar
          </button>
        </div>
      ) : paginas.length === 0 ? (
        <div className={ADMIN_TOKENS.card}>
          <AdminEmptyState
            icon={FileText}
            title="Aún no tienes páginas: crea la primera con «Nueva página»."
            compact
          />
        </div>
      ) : (
        <ul className={`${ADMIN_TOKENS.card} divide-y divide-[var(--rule-soft)]`}>
          {paginas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/cms/pages/${p.id}`} className="font-semibold text-base text-[var(--text-primary)] hover:text-[var(--accent)] truncate">
                    {p.title}
                  </Link>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${PILDORA[p.status]}`}>
                    {ETIQUETA_ESTADO[p.status]}
                  </span>
                </div>
                <p className={`${ADMIN_TOKENS.hint} truncate`}>
                  /cms/{p.slug} · {p._count.blocks} {p._count.blocks === 1 ? "bloque" : "bloques"} · editada {formatDate(p.updatedAt)}
                </p>
              </div>
              {/* La principal a la vista (48 px); el resto en «⋯» (patrón del panel, 11-10).
                  Antes: cinco botones de 40 px por fila. */}
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/admin/cms/pages/${p.id}`} className={button({ variant: "secondary", className: "h-12 rounded-xl" })}>
                  <Pencil className="w-4 h-4" aria-hidden /> Editar
                </Link>
                <ActionMenu
                  label={`Más acciones de ${p.title}`}
                  icon={MoreHorizontal}
                  actions={accionesDe(p)}
                  soloIcono
                  size="md"
                  className="w-12 shrink-0"
                  disabled={ocupada === p.id}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <NuevaPaginaModal open={nueva} onClose={() => setNueva(false)} onCrear={alCrear} />
    </section>
  );
}
