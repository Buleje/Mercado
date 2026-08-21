"use client";

/**
 * PlantacionListado — "Mis Registros de Plantación" del RNPF.
 *
 * Tabla simple: el shell del admin ya convierte toda `<table>` en cards en
 * mobile (`useMobileTableCards` + `.admin-mobile-cards`, admin-tab-enabling
 * gotcha del proyecto) — no hay que armar una vista aparte.
 */

import { useState } from "react";
import {
  AlertCircle,
  Copy,
  Eye,
  FileText,
  Inbox,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { useForestPlantaciones } from "@/hooks/use-forest-plantaciones";
import { ESTADOS_PLANTACION } from "@/lib/forestal/plantacion-catalogo";
import type { PlantacionListItem } from "@/lib/forestal/plantacion-tramite";
import { Btn, IconAction, TablaSkeleton } from "./ctp-shared";
import AdminModal from "@/components/admin/shared/AdminModal";

const TONO_BADGE: Record<string, string> = {
  muted: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  info: "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
  warning:
    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  success:
    "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
};

function EstadoBadge({ estado }: { estado: string }) {
  const meta = ESTADOS_PLANTACION.find((e) => e.key === estado);
  const tono = TONO_BADGE[meta?.tono ?? "muted"];
  return (
    <span className={`inline-flex items-center rounded-full border-2 px-2.5 py-1 text-xs font-bold whitespace-nowrap ${tono}`}>
      {meta?.label ?? estado}
    </span>
  );
}

const fmtArea = (ha: number | null): string => (ha != null ? `${ha.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha` : "—");

const fmtFecha = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
};

export default function PlantacionListado({
  onNueva,
  onAbrir,
}: {
  onNueva: () => void;
  onAbrir: (id: string, opts?: { soloLectura?: boolean; irARevision?: boolean }) => void;
}) {
  const { listado, cargando, error, recargar, duplicar, borrar } = useForestPlantaciones();
  const [aBorrar, setABorrar] = useState<PlantacionListItem | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [duplicando, setDuplicando] = useState<string | null>(null);

  async function confirmarBorrar() {
    if (!aBorrar) return;
    setBorrando(true);
    const ok = await borrar(aBorrar.id);
    setBorrando(false);
    if (ok) setABorrar(null);
  }

  async function onDuplicar(id: string) {
    setDuplicando(id);
    await duplicar(id);
    setDuplicando(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageTitle as="h2" className="text-xl sm:text-2xl">
            Mis Registros de Plantación
          </PageTitle>
          <p className="text-sm text-[var(--text-tertiary)]">Registro Nacional de Plantaciones Forestales (RNPF) — SERFOR.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void recargar()}
            disabled={cargando}
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            Recargar
          </button>
          <Btn variant="dark" onClick={onNueva}>
            <Plus className="h-4 w-4" />
            Nueva Plantación
          </Btn>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {cargando ? (
        <TablaSkeleton columnas={8} />
      ) : listado.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 text-center">
          <Inbox className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden="true" />
          <p className="font-bold text-[var(--text-primary)]">Todavía no registraste ninguna plantación.</p>
          <p className="max-w-sm text-sm text-[var(--text-tertiary)]">
            Empezá con el Formato Único de Inscripción — el sistema guía cada sección.
          </p>
          <Btn variant="dark" onClick={onNueva}>
            <Plus className="h-4 w-4" />
            Nueva Plantación
          </Btn>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] admin-mobile-cards">
          <div className="max-h-[38rem] overflow-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <tr className="text-left">
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Código interno</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Titular</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Predio</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Distrito</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Área</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Bloques</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Estado</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Última modificación</th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {listado.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]">
                    <td data-label="Código interno" className="px-4 py-3 font-mono text-xs font-bold text-[var(--text-primary)]">{p.codigoInterno}</td>
                    <td data-label="Titular" className="px-4 py-3 text-[var(--text-primary)]">{p.titular ?? "—"}</td>
                    <td data-label="Predio" className="px-4 py-3 text-[var(--text-secondary)]">{p.predioNombre ?? "—"}</td>
                    <td data-label="Distrito" className="px-4 py-3 text-[var(--text-secondary)]">{p.predioDistrito ?? "—"}</td>
                    <td data-label="Área" className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{fmtArea(p.predioAreaTotalHa)}</td>
                    <td data-label="Bloques" className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{p.numBloques}</td>
                    <td data-label="Estado" className="px-4 py-3"><EstadoBadge estado={p.estado} /></td>
                    <td data-label="Última modificación" className="px-4 py-3 whitespace-nowrap text-xs text-[var(--text-tertiary)]">{fmtFecha(p.updatedAt)}</td>
                    <td data-label="Acciones" className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <IconAction icon={Pencil} label="Continuar / Editar" tone="accent" onClick={() => onAbrir(p.id)} />
                        <IconAction icon={Eye} label="Ver" tone="muted" onClick={() => onAbrir(p.id, { soloLectura: true })} />
                        <IconAction icon={Copy} label="Duplicar" tone="info" busy={duplicando === p.id} disabled={duplicando === p.id} onClick={() => void onDuplicar(p.id)} />
                        <IconAction icon={FileText} label="Generar documento" tone="success" onClick={() => onAbrir(p.id, { irARevision: true })} />
                        <IconAction icon={Trash2} label="Eliminar" tone="danger" onClick={() => setABorrar(p)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminModal
        open={Boolean(aBorrar)}
        onClose={() => setABorrar(null)}
        title="Eliminar registro de plantación"
        description={aBorrar ? `${aBorrar.codigoInterno} — ${aBorrar.titular ?? "sin titular"}` : undefined}
        variant="centered-sm"
        footer={
          <div className="flex justify-end gap-2 px-4 py-3">
            <Btn variant="secondary" onClick={() => setABorrar(null)} disabled={borrando}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => void confirmarBorrar()} disabled={borrando}>
              {borrando ? "Eliminando…" : "Eliminar"}
            </Btn>
          </div>
        }
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Esta acción borra el registro y todo lo que hayas llenado (titular, predio, bloques, documentos). No se puede deshacer.
          </p>
          {error && (
            <p className="flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </div>
      </AdminModal>
    </div>
  );
}
