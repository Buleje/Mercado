"use client";

/**
 * Cumplimiento › «Respaldos» (ADR-530) — fotos del Libro CTP entero.
 *
 * Guardar una a mano, ver las que hay (las de la noche y las de antes de vaciar,
 * anular un día o cerrar el mes las guarda el servidor solo), compararlas con
 * el libro de hoy y traer de vuelta lo borrado sin tocar lo de hoy.
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Archive, Download, GitCompareArrows, Loader2 } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { formatNumber } from "@/lib/format";
import {
  ETIQUETA_TABLA_RESPALDO,
  ETIQUETA_TIPO_RESPALDO,
  TABLAS_RESPALDO,
  type RespaldoResumen,
} from "@/lib/forestal/ctp-respaldo-tipos";
import CtpRespaldoCompararModal from "./CtpRespaldoCompararModal";
import { urlDescarga, useCtpRespaldos } from "./hooks/use-ctp-respaldos";
import { Btn, I } from "./ctp-shared";

const FECHA_LIMA = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fechaHora = (iso: string) => FECHA_LIMA.format(new Date(iso));
const kb = (bytes: number) => `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} kB`;

/** «14 ingresos · 17 corridas · 71 trozas»: lo que el operador reconoce a primera vista. */
function resumenDe(r: RespaldoResumen): string {
  const n = (t: "WoodEntry" | "ForestCtpEntry" | "WoodEntryTroza") => r.conteos[t]?.total ?? 0;
  return `${formatNumber(n("WoodEntry"))} ingresos · ${formatNumber(n("ForestCtpEntry"))} corridas · ${formatNumber(n("WoodEntryTroza"))} trozas`;
}

/** El detalle por tabla, para el title de la celda. */
function detalleDe(r: RespaldoResumen): string {
  return TABLAS_RESPALDO.flatMap((t) => {
    const c = r.conteos[t];
    if (!c || c.total === 0) return [];
    const baja = c.deBaja > 0 ? ` (${formatNumber(c.deBaja)} de baja)` : "";
    return [`${ETIQUETA_TABLA_RESPALDO[t]}: ${formatNumber(c.total)}${baja}`];
  }).join("\n");
}

export default function CtpRespaldosView() {
  const { listado, cargando, error, guardando, errorGuardar, guardar, recargar } = useCtpRespaldos();
  const rol = useMiRol();
  /* Solo admin y dueño (ADR-530): el servidor corta también al encargado con
     `soloAdminODueno`, que `puedePedir` dejaría pasar (management-tier). */
  const esAdminODueno = rol === "admin" || rol === "owner";
  const puedeGuardar = esAdminODueno && puedePedir("POST /api/admin/forestal/ctp/respaldos", rol);
  const puedeUsar = esAdminODueno && puedePedir("/api/admin/forestal/ctp/respaldos/[id]", rol);
  const [nota, setNota] = useState("");
  const [comparando, setComparando] = useState<string | null>(null);

  const topeManual = listado?.topes.manuales ?? 20;
  const usados = listado?.manualesUsados ?? 0;
  const lleno = usados >= topeManual;

  async function alGuardar() {
    if (await guardar(nota)) setNota("");
  }

  return (
    <section className="space-y-4" aria-label="Respaldos del libro">
      <p className="text-sm text-[var(--text-secondary)]">
        Una foto del libro entero: ingresos, trozas, corridas, consumos, lotes y salidas. Si algo se borra, comparas con
        la foto y lo traes de vuelta sin tocar lo de hoy.
      </p>

      {puedeGuardar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium text-[var(--text-primary)]">Nota (opcional)</span>
            <input
              className={I}
              value={nota}
              maxLength={200}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. antes de importar las guías de octubre"
              disabled={guardando || lleno}
            />
          </label>
          <Btn variant="primary" onClick={() => void alGuardar()} disabled={guardando || lleno}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
            Guardar respaldo ahora
          </Btn>
        </div>
      )}
      {errorGuardar && (
        <p role="alert" className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {errorGuardar}
        </p>
      )}
      {listado && (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {usados} de {topeManual}
          </span>{" "}
          guardados a mano
          {lleno && " · llegaste al tope: borra uno para guardar otro."}
        </p>
      )}

      {cargando && !listado ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando los respaldos…
        </p>
      ) : error && !listado ? (
        <div role="alert" className="space-y-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <p>{error}</p>
          <Btn onClick={() => void recargar()}>Reintentar</Btn>
        </div>
      ) : listado && listado.respaldos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-4 text-sm text-[var(--text-secondary)]">
          Todavía no hay respaldos. El primero se guarda solo esta noche, o guárdalo ahora.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable className="w-full">
            <thead>
              <tr>
                <th>Fecha y hora (Lima)</th>
                <th>Tipo</th>
                <th>Quién</th>
                <th>Qué guarda</th>
                <th className="text-right">Tamaño</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {listado?.respaldos.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap tabular-nums">{fechaHora(r.createdAt)}</td>
                  <td>
                    {ETIQUETA_TIPO_RESPALDO[r.tipo]}
                    {r.nota && <span className="block text-xs text-[var(--text-secondary)]">{r.nota}</span>}
                  </td>
                  <td className="text-[var(--text-secondary)]">{r.createdBy}</td>
                  <td title={detalleDe(r)}>{resumenDe(r)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{kb(r.bytes)}</td>
                  <td>
                    {puedeUsar && (
                      <div className="flex justify-end gap-2">
                        <Btn size="sm" onClick={() => setComparando(r.id)}>
                          <GitCompareArrows className="h-4 w-4" aria-hidden /> Comparar
                        </Btn>
                        <a
                          href={urlDescarga(r.id)}
                          download
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                        >
                          <Download className="h-4 w-4" aria-hidden /> Descargar
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}

      <p className="text-sm text-[var(--text-secondary)]">
        Cada noche si cambió algo, y siempre antes de vaciar, anular un día o cerrar el mes.
      </p>

      {comparando && (
        <CtpRespaldoCompararModal
          id={comparando}
          onClose={() => {
            setComparando(null);
            void recargar();
          }}
        />
      )}
    </section>
  );
}
