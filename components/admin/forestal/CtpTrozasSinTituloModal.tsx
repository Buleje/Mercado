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

import { useEffect, useMemo, useState } from "react";
import { Check, Download, Filter, Search, ShieldAlert } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { Contrato } from "@/lib/forestal/contratos";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import { ChipsDeFiltros } from "@/components/admin/shared/filtros-columna";
import { Btn, ModalBody } from "./ctp-shared";
import { exportarTrozasCsv } from "./ctp-trozas-lista-shared";
import {
  alternarOrden, ORDEN_PRESETS, ordenarTrozas, type IdColumnaTroza, type OrdenColumnaTroza,
} from "./ctp-trozas-filtros-columnas";
import { useFiltrosTrozas } from "./ctp-trozas-filtros-hook";
import { FiltroMultiTroza } from "./ctp-trozas-filtros-th";
import CtpTrozasSinTituloTabla, { agruparPorGuia } from "./ctp-trozas-sin-titulo-tabla";
import type { UbicacionDeCarga } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

/** Todas las columnas de esta tabla filtran; Guía y Proveedor van junto al buscador (la tabla ya está agrupada por guía). */
const COLUMNAS: readonly IdColumnaTroza[] = ["especie", "estado", "guia", "proveedor", "parada", "d1", "d2", "largo", "volumen"];

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

export default function CtpTrozasSinTituloModal({
  piezas, hoy, canchas, onClose, onVerFicha, onFiltrarTabla, onAnotar, onDeclarado,
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
  /** Se declaró un título: releer el patio (esas piezas salen de la lista). */
  onDeclarado: () => void;
}) {
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<OrdenColumnaTroza>(ORDEN_PRESETS.antiguedad);
  const f = useFiltrosTrozas(piezas, hoy, COLUMNAS);
  const [declarando, setDeclarando] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  /* Los permisos del negocio, para elegir el título en vez de tipearlo. Si no
     se pueden leer, el formulario queda con el código a mano. */
  const [contratos, setContratos] = useState<Contrato[]>([]);
  useEffect(() => {
    ctpGet<{ contratos?: Contrato[] }>("/api/admin/forestal/contratos")
      .then((j) => setContratos(j.contratos ?? []))
      .catch((err) => logger.warn("[sin-titulo] no se pudo leer los permisos", { error: String(err) }));
  }, []);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t
      ? f.filtradas.filter((p) =>
          [p.codificacion, p.codigoPlanta, p.especieComun, p.gtfNumber, p.proveedor].some((v) => norm(v).includes(t)),
        )
      : f.filtradas;
    return ordenarTrozas(base, orden, hoy);
  }, [f.filtradas, q, orden, hoy]);
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

        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <FiltroMultiTroza id="guia" label="Guía" f={f} placeholder="Guía" />
          <FiltroMultiTroza id="proveedor" label="Proveedor" f={f} placeholder="Proveedor" />
          <ChipsDeFiltros chips={f.chips} onQuitar={f.quitar} onLimpiarTodo={f.limpiar} className="mt-1.5 flex-1" />
        </div>

        {avisos.map((a) => (
          <p key={a} role="status" className="flex items-center gap-1.5 rounded-xl bg-[var(--data-success-500)]/12 px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
            <Check className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden="true" /> {a}
          </p>
        ))}
        {grupos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">
            {piezas.length === 0 ? "Todas las piezas del patio tienen título declarado." : "Ninguna pieza cumple con eso. Prueba quitando un filtro."}
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
            contratos={contratos}
            f={f}
            orden={orden}
            onOrdenar={(c) => setOrden((o) => alternarOrden(o, c))}
            declarando={declarando}
            onDeclarando={setDeclarando}
            onDeclarado={(aviso) => {
              setAvisos((prev) => [...prev, aviso]);
              setDeclarando(null);
              onDeclarado();
            }}
          />
        )}
      </ModalBody>
    </AdminModal>
  );
}
