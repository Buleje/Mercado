"use client";

/**
 * «Sin título declarado» — las piezas del patio que no tienen origen legal que
 * acreditar, en su propia tabla (Brandon 05-10: «que esté en un botón y abra un
 * modal donde esté la tabla bien hecha»).
 *
 * Antes era una cifra suelta en la línea de apoyo del panorama: decía cuántas
 * eran pero no cuáles, y para verlas había que encontrar el filtro «Sin
 * título» en la cabecera de la tabla. Ahora el botón vive en la cabecera de la
 * vista —visible aunque los indicadores estén plegados— y el modal lista las
 * piezas agrupadas por la guía que las ampara, que es donde se corrige.
 *
 * Mismo predicado que siempre (`piezasSinTitulo` = lo que sigue parado sin
 * `permiso`): lo aserrado o despachado se arregla en su asiento, no acá.
 */

import { useMemo, useState } from "react";
import { Download, Filter, Search, ShieldAlert } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { Btn, ModalBody } from "./ctp-shared";
import { exportarTrozasCsv } from "./ctp-trozas-lista-shared";
import CtpTrozasSinTituloTabla, { agruparPorGuia } from "./ctp-trozas-sin-titulo-tabla";
import type { UbicacionDeCarga } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

export default function CtpTrozasSinTituloModal({
  piezas, hoy, canchas, onClose, onVerFicha, onFiltrarTabla, onAnotar,
}: {
  /** Ya filtradas por `piezasSinTitulo`. */
  piezas: readonly TrozaPatioAPI[];
  hoy: Date;
  canchas: Record<string, UbicacionDeCarga>;
  onClose: () => void;
  onVerFicha: (id: string) => void;
  /** Deja la tabla del patio mostrando sólo estas (filtro «Sin título»). */
  onFiltrarTabla: () => void;
  /** Abre la planilla de D1/D2 con esa pieza primero. */
  onAnotar: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return piezas;
    return piezas.filter((p) =>
      [p.codificacion, p.codigoPlanta, p.especieComun, p.gtfNumber, p.proveedor].some((v) => norm(v).includes(t)),
    );
  }, [piezas, q]);
  const grupos = useMemo(() => agruparPorGuia(visibles), [visibles]);
  const m3 = piezas.reduce((a, p) => a + (p.volumenM3 ?? 0), 0);
  const guias = new Set(piezas.map((p) => p.gtfNumber ?? "")).size;
  const especies = new Set(piezas.map((p) => p.especieComun ?? "")).size;

  const cifras: { label: string; valor: string }[] = [
    { label: "Piezas", valor: String(piezas.length) },
    { label: "Volumen", valor: `${fmtM3(m3)} m³` },
    { label: "Guías", valor: String(guias) },
    { label: "Especies", valor: String(especies) },
  ];

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={ShieldAlert}
      title="Trozas sin título declarado"
      description={`${piezas.length} ${piezas.length === 1 ? "pieza parada" : "piezas paradas"} en el patio sin título habilitante`}
      ventana
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Btn
            onClick={() => exportarTrozasCsv(visibles, hoy, canchas, "trozas-sin-titulo")}
            disabled={visibles.length === 0}
          >
            <Download className="h-4 w-4" aria-hidden="true" /> CSV
          </Btn>
          <span className="ml-auto" />
          <Btn onClick={onClose}>Cerrar</Btn>
          <Btn
            variant="primary"
            onClick={() => {
              onFiltrarTabla();
              onClose();
            }}
          >
            <Filter className="h-4 w-4" aria-hidden="true" /> Ver sólo estas en el patio
          </Btn>
        </div>
      }
    >
      <ModalBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <dl className="flex flex-wrap gap-2">
            {cifras.map((c) => (
              <div key={c.label} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1.5">
                <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{c.label}</dt>
                <dd className="font-mono text-base font-bold tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{c.valor}</dd>
              </div>
            ))}
          </dl>
          <InfoTip
            title="Por qué importa y dónde se corrige"
            what="Sin título habilitante la pieza no tiene origen legal que acreditar: el libro la admite, pero el certificado de trazabilidad no se puede emitir."
            affects="El título (código de origen del permiso o contrato) se declara una vez por guía, en su ingreso: Libro CTP → Ingresos → la guía → completar. Al corregir la guía, todas sus piezas salen de esta lista."
            example="GTF 010-001-0000014 con 3 trozas de Ana Caspi: se completa el código de origen de esa guía y las 3 quedan con título."
          />
          <label className="relative ml-auto min-w-[14rem] flex-1 sm:max-w-[20rem]">
            <span className="sr-only">Buscar en las piezas sin título</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código, especie, guía, proveedor…"
              className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
          </label>
        </div>

        {grupos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">
            {piezas.length === 0 ? "Todas las piezas del patio tienen título declarado." : `Ninguna pieza coincide con «${q.trim()}».`}
          </p>
        ) : (
          <CtpTrozasSinTituloTabla
            grupos={grupos}
            hoy={hoy}
            onVerFicha={(id) => {
              onClose();
              onVerFicha(id);
            }}
            onAnotar={(id) => {
              onClose();
              onAnotar(id);
            }}
          />
        )}
      </ModalBody>
    </AdminModal>
  );
}
