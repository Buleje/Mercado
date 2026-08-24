"use client";

/**
 * PlantacionListado — "Mis Registros de Plantación" del RNPF.
 *
 * Mismo lenguaje visual que las otras dos vistas del módulo Trámites y
 * Oficios: tira de resumen arriba (como en `TramitesCatalogo`) y chips de
 * estado que filtran + entrada animada fila a fila (como en
 * `TramitesExpediente`). El título ya lo pone `LibroChrome` — repetirlo acá
 * duplicaba la cabecera que las vistas hermanas no llevan.
 *
 * Tabla simple: el shell del admin ya convierte toda `<table>` en cards en
 * mobile (`useMobileTableCards` + `.admin-mobile-cards`, admin-tab-enabling
 * gotcha del proyecto) — no hay que armar una vista aparte.
 */

import { useMemo, useState } from "react";
import { m as motion } from "framer-motion";
import {
  AlertCircle,
  Copy,
  Eye,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TreePine,
} from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { staggerContainer, staggerChild } from "@/components/ui-system/motion";
import { useForestPlantaciones } from "@/hooks/use-forest-plantaciones";
import { ESTADOS_PLANTACION, type EstadoPlantacion } from "@/lib/forestal/plantacion-catalogo";
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
  const [filtro, setFiltro] = useState<EstadoPlantacion | "">("");

  const porEstado = useMemo(() => {
    const acc = Object.fromEntries(ESTADOS_PLANTACION.map((e) => [e.key, 0])) as Record<EstadoPlantacion, number>;
    for (const p of listado) acc[p.estado] = (acc[p.estado] ?? 0) + 1;
    return acc;
  }, [listado]);
  const areaTotalHa = useMemo(
    () => listado.reduce((sum, p) => sum + (p.predioAreaTotalHa ?? 0), 0),
    [listado],
  );
  const visibles = useMemo(
    () => (filtro ? listado.filter((p) => p.estado === filtro) : listado),
    [listado, filtro],
  );

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
      <ResumenTira
        total={listado.length}
        listas={porEstado.listo_presentar}
        pendientesDocs={porEstado.pendiente_documentos}
        areaTotalHa={areaTotalHa}
      />

      {/* Estados = filtro, mismo patrón que la vista Expediente: un chip con un
          número que no se puede tocar es un cartel. */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Todos" count={listado.length} activo={filtro === ""} onClick={() => setFiltro("")} />
        {ESTADOS_PLANTACION.map((e) => (
          <Chip
            key={e.key}
            label={e.label}
            count={porEstado[e.key]}
            activo={filtro === e.key}
            tono={e.tono}
            onClick={() => setFiltro(filtro === e.key ? "" : e.key)}
          />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void recargar()}
            disabled={cargando}
            className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            Recargar
          </button>
          <Btn variant="dark" size="sm" onClick={onNueva}>
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
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 text-center">
          <TreePine className="h-10 w-10 text-[var(--text-tertiary)] opacity-40" aria-hidden="true" />
          <p className="font-display text-xl text-[var(--text-primary)]">
            {filtro ? "Ningún registro en ese estado" : "Todavía no registraste ninguna plantación"}
          </p>
          <p className="mx-auto max-w-sm text-sm text-[var(--text-tertiary)]">
            {filtro
              ? "Probá con otro estado o mirá todos."
              : "Empezá con el Formato Único de Inscripción — el sistema guía cada sección."}
          </p>
          <Btn variant="dark" onClick={onNueva}>
            <Plus className="h-4 w-4" />
            Nueva Plantación
          </Btn>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] admin-mobile-cards">
          <div className="max-h-[38rem] overflow-auto">
            <DataTable className="w-full min-w-[960px] text-sm">
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
              <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
                {visibles.map((p) => (
                  <motion.tr key={p.id} variants={staggerChild} className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]">
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
                  </motion.tr>
                ))}
              </motion.tbody>
            </DataTable>
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

/**
 * Tira de resumen — mismo look que `TirasResumen` en `TramitesCatalogo`: un
 * número por dato, no una tabla. Dice de un vistazo cuánto queda por
 * completar antes de generar el Formato N°01, sin abrir cada registro.
 */
function ResumenTira({
  total,
  listas,
  pendientesDocs,
  areaTotalHa,
}: {
  total: number;
  listas: number;
  pendientesDocs: number;
  areaTotalHa: number;
}) {
  const items: { label: string; value: string; tono: "neutral" | "warning" | "success" }[] = [
    { label: "registros", value: String(total), tono: "neutral" },
    { label: "listos para presentar", value: String(listas), tono: "success" },
    { label: "pendientes de documentos", value: String(pendientesDocs), tono: "warning" },
    {
      label: "hectáreas registradas",
      value: areaTotalHa.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      tono: "neutral",
    },
  ];
  const TONO: Record<string, string> = {
    neutral: "text-[var(--text-primary)]",
    warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  };
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-1.5">
          <span className={`font-display text-xl leading-none tabular-nums ${TONO[it.tono]}`}>{it.value}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

const TONO_CHIP: Record<string, { chip: string; activo: string }> = {
  muted: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo: "border-[var(--rule-strong)] bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
  info: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
  },
  warning: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  },
  success: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  },
};

/** Chip de filtro por estado — mismo componente que la vista Expediente. */
function Chip({
  label,
  count,
  activo,
  tono = "muted",
  onClick,
}: {
  label: string;
  count: number;
  activo: boolean;
  tono?: string;
  onClick: () => void;
}) {
  const t = TONO_CHIP[tono] ?? TONO_CHIP.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      disabled={count === 0 && !activo}
      className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-bold transition disabled:opacity-40 ${
        activo ? t.activo : `${t.chip} hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]`
      }`}
    >
      {label}
      <span className="font-mono tabular-nums">{count}</span>
    </button>
  );
}
