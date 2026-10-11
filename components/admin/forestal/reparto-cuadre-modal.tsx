"use client";

/**
 * El cuadre de la distribución (Brandon, 2026-10-03): «un botón que me lleve a
 * un apartado o modal donde se analiza, encuentre variaciones, comparaciones
 * entre la distribución, medidas y demás para saber si hay diferencia, si es
 * exacto, cuánto es la diferencia y cuadrar todo».
 *
 * Arriba el veredicto; debajo cada control con su etiqueta (clic = salta a su
 * tabla); y las pestañas Por bloque · Por permiso · Por medida · Por especie
 * con el detalle esperado | obtenido | diferencia. Las cifras salen de
 * `lib/forestal/reparto-cuadre.ts`, que lee las MISMAS fuentes que la
 * pantalla, el PDF y los Anexos 04.
 *
 * `AdminModal` tamaño planilla, como el Anexo 04: clic afuera y Escape
 * cierran; se mueve, se achica y se fija.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Scale, ShieldCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { logger } from "@/lib/logger";
import { hoyISO } from "@/lib/forestal/distribucion-registro";
import type { CuadreReparto, EstadoCuadre, IdControl, PestanaCuadre, Trio } from "@/lib/forestal/reparto-cuadre";
import EtiquetaCuadre, { ESTADO_CUADRE, fmtTrio } from "./reparto-cuadre-etiqueta";
import TablaControl from "./reparto-cuadre-tabla";
import { button } from "@/components/ui-system/button-variants";
import AdminModal from "@/components/admin/shared/AdminModal";

const PESTANAS: { id: PestanaCuadre; label: string }[] = [
  { id: "bloque", label: "Por bloque" },
  { id: "permiso", label: "Por permiso" },
  { id: "medida", label: "Por medida" },
  { id: "especie", label: "Por especie" },
];
const RANGO: Record<EstadoCuadre, number> = { exacto: 0, redondeo: 1, difiere: 2 };
const BTN = button({ variant: "secondary", className: "rounded-xl" });

const trioExcel = (pre: string, t: Trio) => ({ [`${pre} piezas`]: t.piezas, [`${pre} PT`]: t.pt, [`${pre} m³`]: t.m3 });

async function exportarCuadre(c: CuadreReparto) {
  const { exportSheetsToExcel } = await import("@/lib/export-excel");
  await exportSheetsToExcel(
    [
      {
        nombre: "Controles",
        filas: c.controles.map((x) => ({
          Control: x.titulo, Regla: x.regla, Estado: ESTADO_CUADRE[x.estado].label,
          Esperado: x.ladoEsperado, ...trioExcel("Esperado", x.esperado),
          Obtenido: x.ladoObtenido, ...trioExcel("Obtenido", x.obtenido),
          ...trioExcel("Diferencia", x.diferencia),
          "Filas que difieren": x.difieren, "Cómo cuadrarlo": x.comoCuadrar,
        })),
      },
      {
        nombre: "Detalle",
        filas: c.controles.flatMap((x) => x.filas.map((f) => ({
          Control: x.titulo, Dónde: f.rotulo, Nota: f.nota ?? "",
          ...trioExcel("Esperado", f.esperado), ...trioExcel("Obtenido", f.obtenido), ...trioExcel("Diferencia", f.diferencia),
          Estado: f.aviso ? "Mirar" : f.estado === "exacto" ? "Exacto" : ESTADO_CUADRE[f.estado].label,
          "Cómo cuadrarlo": f.comoCuadrar ?? "",
        }))),
      },
    ],
    `cuadre-distribucion-${hoyISO()}`,
  );
}

/** La línea de arriba: todo cuadra, sólo redondeo, o cuántos difieren y cuánto. */
function Veredicto({ c }: { c: CuadreReparto }) {
  const n = c.controles.length;
  if (c.estado === "exacto") {
    return (
      <p className="flex items-center gap-2 text-base font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <ShieldCheck className="h-5 w-5" aria-hidden /> Todo cuadra: los {n} controles dan las mismas cifras.
      </p>
    );
  }
  if (c.estado === "redondeo") {
    return (
      <p className="flex items-center gap-2 text-base font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
        <span aria-hidden className="text-lg leading-none">≈</span> Cuadra: {c.redondeo === 1 ? "un control difiere" : `${c.redondeo} controles difieren`} sólo por redondeo.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-base font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
      <AlertTriangle className="h-5 w-5" aria-hidden />
      {c.difieren === 1 ? "1 control difiere" : `${c.difieren} de ${n} controles difieren`}
      {c.mayorM3 >= 0.0005 && <span>· la mayor diferencia es {fmtTrio.m3(c.mayorM3)} m³</span>}
    </p>
  );
}

export default function RepartoCuadreModal({ cuadre, inicial, onCerrar }: {
  cuadre: CuadreReparto;
  /** El control en el que se abrió («todo» = desde el botón). */
  inicial: IdControl | "todo";
  onCerrar: () => void;
}) {
  const cuerpoRef = useRef<HTMLDivElement>(null);

  const pestanaDe = (id: IdControl) => cuadre.controles.find((x) => x.id === id)?.pestana ?? "bloque";
  const [pestana, setPestana] = useState<PestanaCuadre>(() =>
    inicial !== "todo" ? pestanaDe(inicial) : cuadre.controles.find((x) => x.estado === "difiere")?.pestana ?? "bloque",
  );
  const [destino, setDestino] = useState<IdControl | null>(inicial === "todo" ? null : inicial);
  const [soloDif, setSoloDif] = useState(false);
  const [bajando, setBajando] = useState(false);

  /* Saltar a la tabla del control elegido, recién cuando su pestaña ya se dibujó. */
  useEffect(() => {
    if (!destino) return;
    const id = requestAnimationFrame(() => {
      cuerpoRef.current?.querySelector(`#cuadre-${destino}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [destino, pestana]);

  const porPestana = useMemo(() => {
    const m = new Map<PestanaCuadre, { estado: EstadoCuadre; difieren: number }>();
    for (const p of PESTANAS) {
      const xs = cuadre.controles.filter((x) => x.pestana === p.id);
      m.set(p.id, {
        estado: xs.reduce<EstadoCuadre>((a, x) => (RANGO[x.estado] > RANGO[a] ? x.estado : a), "exacto"),
        difieren: xs.reduce((a, x) => a + x.difieren, 0),
      });
    }
    return m;
  }, [cuadre]);

  const ir = (id: IdControl) => { setPestana(pestanaDe(id)); setDestino(id); };
  const bajar = () => {
    setBajando(true);
    exportarCuadre(cuadre)
      .catch((err) => logger.error("[reparto-cuadre] exportar excel falló", { error: String(err) }))
      .finally(() => setBajando(false));
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Cuadre de la distribución"
      icon={Scale}
      ayuda={
        <InfoTip
          title="Qué se cuadra"
          what="La misma madera se cuenta en varias vistas: el lote, las tarjetas Distribuido y Falta, cada bloque, las medidas que imprime el PDF, los Anexos 04 por permiso y el resumen por especie. Acá se cruzan todas."
          affects="Exacto = hasta 0,01 PT y 0,001 m³. Redondeo = el arrastre de redondear cada fila. Difiere = cualquier pieza de diferencia o un volumen que no explica el redondeo."
          example="Tornillo 2×4×10: 21 en el lote, 20 distribuidas y 0 en falta → Difiere 1 pieza."
        />
      }
      size="planilla"
      /* Se abre desde el cubicador, que vive dentro de «Producir sin lote» (z-70). */
      aboveModals
      claveVentana="reparto-cuadre"
    >
      <div ref={cuerpoRef} className="px-5 py-4 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0"><Veredicto c={cuadre} /></div>
          <label className="flex h-12 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)]">
            <input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Solo lo que no cuadra
          </label>
          <button type="button" onClick={bajar} disabled={bajando} className={BTN}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden /> {bajando ? "Generando…" : "Excel"}
          </button>
        </div>
          {/* Los controles: cada uno con su etiqueta. Clic = salta a su tabla. */}
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Controles del cuadre">
            {cuadre.controles.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => ir(x.id)}
                  className={`flex h-full w-full flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors hover:border-[var(--accent)] ${destino === x.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"}`}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="text-sm font-bold leading-snug text-[var(--text-primary)]">{x.titulo}</span>
                    <EtiquetaCuadre control={x} />
                  </span>
                  <span className="line-clamp-2 text-xs text-[var(--text-tertiary)]">{x.comoCuadrar}</span>
                </button>
              </li>
            ))}
          </ul>

          <div role="tablist" aria-label="Detalle del cuadre" className="sticky top-0 z-10 mt-3 flex flex-wrap gap-1 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] py-1">
            {PESTANAS.map((p) => {
              const info = porPestana.get(p.id);
              const activa = pestana === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => { setPestana(p.id); setDestino(null); }}
                  className={`inline-flex h-12 items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors ${activa ? "bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                  {p.label}
                  {info && info.estado !== "exacto" && (
                    <span className={`rounded-full border px-1.5 font-mono text-xs tabular-nums ${ESTADO_CUADRE[info.estado].clase}`}>
                      {info.estado === "difiere" ? info.difieren : "≈"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="mt-3 space-y-3">
            {cuadre.controles.filter((x) => x.pestana === pestana).map((x) => (
              <TablaControl key={x.id} control={x} soloDiferencias={soloDif} />
            ))}
          </div>
      </div>
    </AdminModal>
  );
}
