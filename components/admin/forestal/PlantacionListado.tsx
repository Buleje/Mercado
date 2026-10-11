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
import { AlertCircle, Plus, RefreshCw, TreePine } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { staggerContainer, staggerChild } from "@/components/ui-system/motion";
import { useForestPlantaciones } from "@/hooks/use-forest-plantaciones";
import { ESTADOS_PLANTACION, type EstadoPlantacion } from "@/lib/forestal/plantacion-catalogo";
import type { PlantacionListItem } from "@/lib/forestal/plantacion-tramite";
import { Btn, TablaSkeleton } from "./ctp-shared";
import { ChipEstado as Chip } from "./chip-estado";
import PlantacionAccionesFila from "./PlantacionAccionesFila";
import AdminModal from "@/components/admin/shared/AdminModal";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  SinCoincidenciasFila,
  useFiltrosTabla,
  type ColumnaFiltro,
} from "./filtros-tabla-forestal";

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
    <span className={`inline-flex items-center rounded-full border-2 px-2.5 py-1 text-sm font-bold whitespace-nowrap ${tono}`}>
      {meta?.label ?? estado}
    </span>
  );
}

const fmtArea = (ha: number | null): string => (ha != null ? `${formatNumber(ha, 2)} ha` : "—");

const fmtFecha = (iso: string): string => formatDateTime(iso);

/** El Estado NO lleva autofiltro de columna: ya se filtra con los chips de arriba (un solo control por estado). */
const COLUMNAS_PLANTACION: ColumnaFiltro<PlantacionListItem>[] = [
  { id: "codigo", label: "Código interno", tipo: "texto", valor: (p) => p.codigoInterno },
  { id: "titular", label: "Titular", tipo: "multi", valor: (p) => p.titular },
  { id: "predio", label: "Predio", tipo: "multi", valor: (p) => p.predioNombre },
  { id: "distrito", label: "Distrito", tipo: "multi", valor: (p) => p.predioDistrito },
  { id: "area", label: "Área", tipo: "rango", numero: (p) => p.predioAreaTotalHa, unidad: "ha", paso: 0.1 },
  { id: "bloques", label: "Bloques", tipo: "rango", numero: (p) => p.numBloques, paso: 1 },
  { id: "modificada", label: "Última modificación", tipo: "fecha", numero: (p) => p.updatedAt?.slice(0, 10) ?? null },
];

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
  const porEstadoElegido = useMemo(
    () => (filtro ? listado.filter((p) => p.estado === filtro) : listado),
    [listado, filtro],
  );
  const f = useFiltrosTabla(porEstadoElegido, COLUMNAS_PLANTACION);
  const visibles = f.filtradas;
  /* Las hectáreas de lo que se ve (con los filtros puestos): antes iban en una tira
     aparte, junto a tres cuentas que repetían los chips. */
  const areaVisibleHa = useMemo(() => visibles.reduce((sum, p) => sum + (p.predioAreaTotalHa ?? 0), 0), [visibles]);

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
      {/* Estados, hectáreas, recargar y «Nueva plantación» en UNA fila. La tira
          «N registros · N listos · N pendientes» se fue (11-10): repetía las
          cuentas de los chips; las hectáreas, que no estaban en otro lado, quedan acá. */}
      <div className="flex flex-wrap items-center gap-2">
        {listado.length > 0 && (
          <div role="group" aria-label="Filtrar por estado" className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
            <Chip label="Todos" count={listado.length} activo={filtro === ""} onClick={() => setFiltro("")} />
            {ESTADOS_PLANTACION.filter((e) => porEstado[e.key] > 0 || filtro === e.key).map((e) => (
              <Chip
                key={e.key}
                label={e.label}
                count={porEstado[e.key]}
                activo={filtro === e.key}
                tono={e.tono}
                onClick={() => setFiltro(filtro === e.key ? "" : e.key)}
              />
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void recargar()}
            disabled={cargando}
            aria-label="Recargar las plantaciones"
            title="Recargar las plantaciones"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <Btn variant="dark" onClick={onNueva} className="h-12">
            <Plus className="h-4 w-4" aria-hidden />
            Nueva plantación
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
      ) : porEstadoElegido.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-10 text-center">
          <TreePine className="h-8 w-8 text-[var(--text-tertiary)] opacity-60" aria-hidden="true" />
          <p className="text-base font-bold text-[var(--text-primary)]">
            {filtro ? "Ningún registro en ese estado" : "Todavía no registraste ninguna plantación"}
          </p>
          <p className="mx-auto max-w-sm text-sm text-[var(--text-secondary)]">
            {filtro
              ? "Prueba con otro estado o mira todos."
              : "Con «Nueva plantación» llenas el Formato Único de Inscripción, sección por sección."}
          </p>
        </div>
      ) : (
        <>
        <BarraFiltrosTabla f={f} className="mb-3" />
        <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] admin-mobile-cards">
          <div className="max-h-[38rem] overflow-auto">
            <DataTable className="w-full min-w-[960px] text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <tr className="text-left align-top">
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Código interno<FiltroEnCabecera id="codigo" f={f} /></th>
                  {/* Estado al lado del código (11-10): con 9 columnas la tabla pasa de 1.200 px y lo
                      que quedaba fuera de la vista era justo el estado. */}
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Estado</th>
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Titular<FiltroEnCabecera id="titular" f={f} /></th>
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Predio<FiltroEnCabecera id="predio" f={f} /></th>
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Distrito<FiltroEnCabecera id="distrito" f={f} /></th>
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Área<FiltroEnCabecera id="area" f={f} /></th>
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Bloques<FiltroEnCabecera id="bloques" f={f} /></th>
                  <th scope="col" className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Última modificación<FiltroEnCabecera id="modificada" f={f} /></th>
                  <th scope="col" className="px-3 py-2.5 text-right text-sm font-bold text-[var(--text-secondary)] sm:sticky sm:right-0 sm:z-[1] sm:bg-[var(--surface-sunken)]"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
                {visibles.length === 0 && <SinCoincidenciasFila colSpan={9} />}
                {visibles.map((p) => (
                  <motion.tr key={p.id} variants={staggerChild} className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]">
                    <td data-label="Código interno" className="px-3 py-3 font-mono text-sm font-bold text-[var(--text-primary)]">{p.codigoInterno}</td>
                    <td data-label="Estado" className="px-3 py-3"><EstadoBadge estado={p.estado} /></td>
                    <td data-label="Titular" className="px-3 py-3 text-[var(--text-primary)]">{p.titular ?? "—"}</td>
                    <td data-label="Predio" className="px-3 py-3 text-[var(--text-secondary)]">{p.predioNombre ?? "—"}</td>
                    <td data-label="Distrito" className="px-3 py-3 text-[var(--text-secondary)]">{p.predioDistrito ?? "—"}</td>
                    <td data-label="Área" className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">{fmtArea(p.predioAreaTotalHa)}</td>
                    <td data-label="Bloques" className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">{p.numBloques}</td>
                    <td data-label="Última modificación" className="px-3 py-3 whitespace-nowrap text-sm text-[var(--text-secondary)]">{fmtFecha(p.updatedAt)}</td>
                    <td data-label="Acciones" className="px-2 py-1.5 sm:sticky sm:right-0 sm:border-l sm:border-[var(--rule-soft)] sm:bg-[var(--surface-raised)]">
                      <PlantacionAccionesFila p={p} duplicando={duplicando === p.id} onAbrir={onAbrir} onDuplicar={(id) => void onDuplicar(id)} onBorrar={setABorrar} />
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </DataTable>
          </div>
        </div>
        {areaVisibleHa > 0 && (
          <p className="text-right text-sm text-[var(--text-secondary)]">
            Área de lo listado: <strong className="font-mono tabular-nums text-[var(--text-primary)]">{formatNumber(areaVisibleHa, 2)}</strong> ha
          </p>
        )}
        </>
      )}

      <AdminModal
        open={Boolean(aBorrar)}
        onClose={() => setABorrar(null)}
        title="Eliminar registro de plantación"
        description={aBorrar ? `${aBorrar.codigoInterno} — ${aBorrar.titular ?? "sin titular"}` : undefined}
        variant="centered-sm"
        footer={
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setABorrar(null)} disabled={borrando}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => void confirmarBorrar()} disabled={borrando}>
              {borrando ? "Eliminando…" : "Eliminar"}
            </Btn>
          </div>
        }
      >
        <div className="space-y-3 px-5 py-4 sm:px-6">
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
