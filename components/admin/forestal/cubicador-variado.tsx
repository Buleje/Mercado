"use client";
/**
 * cubicador-variado — el panel «Variado» del cubicado y su aviso en la tabla
 * (Brandon, 2026-10-02): un paquete 6×6 Variado lleva piezas chicas de varias
 * especies; acá se dice qué medidas entran (normal / poco / no entra) y qué
 * especies no lo reciben. El desglose lo hace la Distribución, por proporción.
 */
import { useMemo } from "react";
import { Boxes, RotateCcw, SlidersHorizontal, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { fmtPct, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { formatNumber } from "@/lib/format";
import {
  NIVEL_PESO,
  VARIADO_DEFAULT,
  esVariado,
  pesosPorEspecie,
  type ConfigVariado,
  type PesoEspecie,
} from "@/lib/forestal/variado-desglose";

type Nivel = keyof typeof NIVEL_PESO;
const NIVELES: { nivel: Nivel; label: string }[] = [
  { nivel: "normal", label: "Normal" },
  { nivel: "poco", label: "Poco" },
  { nivel: "no", label: "No entra" },
];
const nivelDe = (peso: number): Nivel => (peso <= 0 ? "no" : peso < NIVEL_PESO.normal ? "poco" : "normal");
const num = (n: number) => formatNumber(n, { max: 2 });
export const medidaVariadoTxt = (m: { espesor: number; ancho: number }) => `${num(m.espesor)}×${num(m.ancho)}`;
/** «Tornillo 62,0 % · Cumala 38,0 %» — el reparto en una línea. */
export const pesosTxt = (pesos: readonly PesoEspecie[]) => pesos.map((p) => `${p.especie} ${fmtPct(p.pct)} %`).join(" · ");

const ETIQUETA = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";

/** Lo que va en el ⓘ del panel y del aviso: qué es un Variado y qué hace con el papel. */
function AyudaVariado() {
  return (
    <InfoTip
      title="Variado"
      what="Paquete de 6×6 armado con piezas chicas de varias especies. Se cubica como 6×6 y en la Distribución se abre en sus medidas y especies."
      affects="La especie sale por proporción del volumen libre de cada permiso en los bloques: es un reparto calculado, no una medición. Hasta que se abra, el Anexo 04 y «Enviar al Libro» esperan."
      example="1 596 paq. 6×6 de 10′ → Tornillo 62 % · Cumala 38 %, en 2×2, 2×3, 2×4, 1×4, 1×3, 1×2 y poco de 1.5×3 y 3×3."
    />
  );
}

export function VariadoModal({ cfg, onGuardar, especies, bloques, piezasNoVariado, onCerrar }: {
  cfg: ConfigVariado;
  onGuardar: (next: ConfigVariado) => void;
  /** El catálogo de la planta (sin «Variado»). */
  especies: readonly string[];
  bloques: readonly BloqueRolliza[];
  piezasNoVariado: readonly PiezaCubicada[];
  onCerrar: () => void;
}) {
  const fuera = useMemo(() => new Set(cfg.excluidas), [cfg.excluidas]);
  /* Las del catálogo y las de los bloques que el catálogo no tiene: una especie
     cargada en un bloque recibe Variado aunque nadie la haya dado de alta. */
  const opciones = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const e of [...especies, ...bloques.map((b) => b.especie)]) {
      const k = claveEspecie(e);
      if (k && !esVariado(e) && !vistas.has(k)) vistas.set(k, e.trim());
    }
    return [...vistas.entries()].map(([clave, nombre]) => ({ clave, nombre }));
  }, [especies, bloques]);
  const pesos = useMemo(() => pesosPorEspecie(bloques, piezasNoVariado, cfg), [bloques, piezasNoVariado, cfg]);
  const entran = cfg.medidas.filter((m) => m.peso > 0).length;

  const ponerNivel = (i: number, nivel: Nivel) =>
    onGuardar({ ...cfg, medidas: cfg.medidas.map((m, j) => (j === i ? { ...m, peso: NIVEL_PESO[nivel] } : m)) });
  const alternar = (clave: string) =>
    onGuardar({ ...cfg, excluidas: fuera.has(clave) ? cfg.excluidas.filter((e) => e !== clave) : [...cfg.excluidas, clave] });

  return (
    <AdminModal
      aboveModals
      open
      onClose={onCerrar}
      title="Variado · paquetes de 6×6"
      icon={Boxes}
      footer={
        <ModalFooter>
          <Btn variant="secondary" onClick={() => onGuardar({ medidas: VARIADO_DEFAULT.medidas.map((m) => ({ ...m })), excluidas: [] })}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Restablecer
          </Btn>
          <Btn variant="primary" onClick={onCerrar}>Listo</Btn>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className={ETIQUETA}>Medidas que entran en el paquete</span>
            <AyudaVariado />
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {cfg.medidas.map((m, i) => {
              const actual = nivelDe(m.peso);
              return (
                <li key={`${m.espesor}x${m.ancho}`} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5">
                  <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{medidaVariadoTxt(m)}</span>
                  <span role="group" aria-label={`Cuánto entra de ${medidaVariadoTxt(m)}`} className="inline-flex rounded-lg border border-[var(--rule-base)] p-0.5">
                    {NIVELES.map(({ nivel, label }) => (
                      <button
                        key={nivel}
                        type="button"
                        aria-pressed={actual === nivel}
                        onClick={() => ponerNivel(i, nivel)}
                        className={`min-h-[2rem] rounded-md px-2 text-xs font-bold transition-colors ${actual === nivel
                          ? nivel === "no"
                            ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                            : "bg-[var(--accent)] text-white"
                          : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
          {entran === 0 && (
            <p role="alert" className="text-xs font-bold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">
              Ninguna medida entra: así el Variado no se puede abrir.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className={ETIQUETA}>Especies que no aplican</span>
            <InfoTip
              title="Especies que no aplican"
              what="Las que marques no reciben piezas del Variado, aunque tengan volumen libre en los bloques."
              example="Marcas Shihuahuaco: el Variado se reparte sólo entre Tornillo y Cumala."
            />
            {cfg.excluidas.length > 0 && (
              <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{cfg.excluidas.length} fuera</span>
            )}
          </div>
          {opciones.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">Todavía no hay especies en el catálogo.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {opciones.map(({ clave, nombre }) => {
                const excluida = fuera.has(clave);
                return (
                  <button
                    key={clave}
                    type="button"
                    aria-pressed={excluida}
                    onClick={() => alternar(clave)}
                    className={`inline-flex min-h-[2rem] items-center gap-1 rounded-full border px-3 text-xs font-bold transition-colors ${excluida
                      ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] line-through dark:text-[var(--data-warning-500)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"}`}
                  >
                    {excluida && <X className="h-3 w-3" aria-hidden />}
                    {nombre}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className={ETIQUETA}>Cómo se repartiría hoy</span>
            <span className="rounded-full border border-[var(--rule-base)] px-2 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">por proporción</span>
          </div>
          {pesos.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              Sin bloques con especie en Resúmenes › Distribución: de ahí sale el % de cada especie.
            </p>
          ) : (
            <ul className="space-y-1">
              {pesos.map((p) => (
                <li key={p.clave} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2 text-xs">
                  <span className="truncate font-bold text-[var(--text-primary)]">{p.especie}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
                    <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, p.pct)}%` }} />
                  </span>
                  <span className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPct(p.pct)} %</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminModal>
  );
}

/**
 * Una línea sobre la tabla del cubicado cuando el lote trae Variado: el reparto
 * que le espera o, si no se puede abrir, por qué (y que el papel espera).
 */
export function AvisoVariado({ paquetes, pesos, bloqueo, papelLibre, onAjustar }: {
  paquetes: number;
  pesos: readonly PesoEspecie[];
  /** Lo que frena el envío (todo el lote). */
  bloqueo: string | null;
  /** Lo tildado para el papel no trae Variado sin abrir: el Anexo 04 sí sale. */
  papelLibre: boolean;
  onAjustar: () => void;
}) {
  return (
    <div
      role="status"
      className={`mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-xs ${bloqueo
        ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]"}`}
    >
      <Boxes className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPiezas(paquetes)} paq. 6×6 Variado</span>
      {bloqueo ? (
        <span className="min-w-0 flex-1 font-bold">{bloqueo} {papelLibre ? "El envío al Libro espera." : "El Anexo 04 y el envío al Libro esperan."}</span>
      ) : (
        <span className="min-w-0 flex-1">
          → {pesosTxt(pesos)}{" "}
          <span className="rounded-full border border-[var(--rule-base)] px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">por proporción</span>
        </span>
      )}
      <AyudaVariado />
      <button
        type="button"
        onClick={onAjustar}
        className="inline-flex min-h-[2rem] items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Ajustar Variado
      </button>
    </div>
  );
}
