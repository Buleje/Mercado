"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Eye, Trash2, Copy } from "@buleje/design-system/icons";
import { SectionTitle, LoadingState } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
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

const BTN_FILA =
  "inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-lg border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors disabled:opacity-50";

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

  return (
    <section className="space-y-4" aria-label="Páginas por bloques">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionTitle>Páginas por bloques</SectionTitle>
          <InfoTip
            title="Páginas por bloques"
            what="Arma páginas como «Ofertas» o «Nosotros» juntando bloques (portada, productos, preguntas, contacto). Quedan en borrador hasta que las publiques; entonces se ven en /cms/ y se pueden enlazar desde tu portada."
          />
        </div>
        <button type="button" onClick={() => setNueva(true)} className={ADMIN_TOKENS.btnPrimary}>
          <Plus className="w-4 h-4" aria-hidden />
          Nueva página
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
            title="Aún no tienes páginas"
            description="Crea la primera: eliges un título y vas sumando bloques."
            action={{ label: "Crear mi primera página", onClick: () => setNueva(true) }}
            compact
          />
        </div>
      ) : (
        <ul className={`${ADMIN_TOKENS.card} divide-y divide-[var(--rule-soft)]`}>
          {paginas.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/cms/pages/${p.id}`} className="font-semibold text-base text-[var(--text-primary)] hover:text-[var(--accent)] truncate">
                    {p.title}
                  </Link>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILDORA[p.status]}`}>
                    {ETIQUETA_ESTADO[p.status]}
                  </span>
                </div>
                <p className={`${ADMIN_TOKENS.hint} truncate`}>
                  /cms/{p.slug} · {p._count.blocks} {p._count.blocks === 1 ? "bloque" : "bloques"} · editada {formatDate(p.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link href={`/admin/cms/pages/${p.id}`} className={BTN_FILA}>
                  <Pencil className="w-4 h-4" aria-hidden /> Editar
                </Link>
                {p.status === "PUBLISHED" && (
                  <>
                    <a href={`/t/${tenantSlug}/cms/${p.slug}`} target="_blank" rel="noopener noreferrer" className={BTN_FILA}>
                      <Eye className="w-4 h-4" aria-hidden /> Ver
                    </a>
                    <button type="button" onClick={() => void copiar(p)} className={BTN_FILA} aria-label={`Copiar el enlace de ${p.title}`}>
                      <Copy className="w-4 h-4" aria-hidden /> Copiar enlace
                    </button>
                  </>
                )}
                <button type="button" onClick={() => void cambiarEstado(p)} disabled={ocupada === p.id} className={BTN_FILA}>
                  {p.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
                </button>
                <button
                  type="button"
                  onClick={() => void borrar(p)}
                  disabled={ocupada === p.id}
                  className={`${BTN_FILA} text-[var(--data-error-700)]`}
                  aria-label={`Eliminar ${p.title}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NuevaPaginaModal open={nueva} onClose={() => setNueva(false)} onCrear={alCrear} />
    </section>
  );
}
