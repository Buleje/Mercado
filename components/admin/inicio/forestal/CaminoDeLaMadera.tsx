"use client";

import { ArrowDownRight, ArrowUpRight } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { porcentaje } from "@/lib/admin/inicio/formato-tablero";
import { valorConDato } from "@/lib/admin/inicio/hay-datos";
import { cantidadDelPeriodo, type InicioForestalCtp } from "@/lib/forestal/inicio-forestal";
import { TarjetaTablero } from "../resumen/TarjetaTablero";
import { BarraCrece, CTP, m3, TINTA } from "./comun";

interface Paso {
  id: string;
  label: string;
  valor: string;
  /** El número en m³ (sólo así tiene barra: no se compara m³ con pt). */
  enM3: number | null;
  color: string;
  nota?: string;
}

/**
 * El camino de la madera del período (2026-10-31): entró → a la sierra →
 * producto → salió, cada paso con su barra. Las cuatro cifras son las del
 * Tablero del Libro CTP (`movimientoDelLibro`); acá no se suma ni se convierte
 * nada. Las barras comparan sólo pasos en m³: un producido declarado en pt va
 * sin barra y lo dice, porque 100 pt al lado de 10 m³ mentirían.
 */
export function CaminoDeLaMadera({ ctp, className }: { ctp: InicioForestalCtp; className?: string }) {
  const prodM3 = ctp.unidadProducido === "m3";
  const despM3 = ctp.unidadDespachado === "m3";
  const pasos: Paso[] = [
    { id: "entra", label: "Entró al patio", valor: m3(ctp.ingresoM3), enM3: ctp.ingresoM3, color: TINTA.entra, nota: "troza con guía validada" },
    { id: "sierra", label: "Fue a la sierra", valor: m3(ctp.consumoM3), enM3: ctp.consumoM3, color: TINTA.sierra, nota: "troza aserrada en las corridas" },
    {
      id: "producto",
      label: "Salió de la sierra",
      valor: cantidadDelPeriodo(ctp.producido, ctp.unidadProducido),
      enM3: prodM3 ? ctp.producido : null,
      color: TINTA.producto,
      nota: prodM3 ? "producto aserrado" : unidadAparte(ctp.unidadProducido),
    },
    {
      id: "sale",
      label: "Se despachó",
      valor: cantidadDelPeriodo(ctp.despachado, ctp.unidadDespachado),
      enM3: despM3 ? ctp.despachado : null,
      color: TINTA.sale,
      nota: despM3 ? "producto con su guía de salida" : unidadAparte(ctp.unidadDespachado),
    },
  ];
  const tope = Math.max(0, ...pasos.map((p) => p.enM3 ?? 0));
  if (tope <= 0 && !valorConDato(ctp.producido) && !valorConDato(ctp.despachado)) return null;
  const variacion = ctp.variacionPatioM3 ?? 0;
  const conVariacion = Math.abs(variacion) >= 0.01;

  return (
    <TarjetaTablero
      id="forestal-camino"
      titulo="El camino de la madera"
      ayuda="Del Tablero del Libro CTP, el mismo período: lo que entró con guía, lo que se aserró, lo que salió de las corridas y lo que se despachó. Las barras comparan sólo cifras en m³: lo declarado en pt o en unidades va sin barra, porque la suma no convierte pt a m³."
      className={className}
      pie={
        <EnlacePanel href={`${CTP}&vista=produccion`} className="inline-flex min-h-11 items-center">
          Ver la producción
        </EnlacePanel>
      }
    >
      <ol className="space-y-1">
        {pasos.map((p, i) => (
          <li key={p.id}>
            {/* El rendimiento va entre la sierra y el producto: es lo que los une. */}
            {p.id === "producto" && ctp.rendimiento > 0 && (
              <p className="mb-1 ml-5 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] px-2.5 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                rinde <span className="tabular-nums text-[var(--text-primary)]">{porcentaje(ctp.rendimiento, 1)}</span>
              </p>
            )}
            <div className="flex gap-3">
              {/* Riel: un punto por paso y la línea que los une, en el color de cada tramo. */}
              <div className="flex w-2.5 shrink-0 flex-col items-center pt-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                {i < pasos.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--rule-base)]" />}
              </div>
              <div className="min-w-0 flex-1 pb-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-semibold text-[var(--text-secondary)]">{p.label}</span>
                  <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">{p.valor}</span>
                </div>
                {p.enM3 != null && tope > 0 && (
                  <BarraCrece pct={(p.enM3 / tope) * 100} color={p.color} retraso={i * 0.08} className="mt-1" />
                )}
                {p.nota && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{p.nota}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {conVariacion && (
        <p className="mt-auto flex items-start gap-2 border-t border-[var(--rule-soft)] pt-3 text-sm text-[var(--text-secondary)] dark:border-[var(--rule-base)]">
          {variacion > 0 ? (
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          ) : (
            <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          )}
          <span>
            El patio {variacion > 0 ? "sumó" : "bajó"}{" "}
            <strong className="tabular-nums text-[var(--text-primary)]">{m3(Math.abs(variacion))}</strong> en el período{" "}
            <span className="text-[var(--text-tertiary)]">(entró − se aserró)</span>
          </span>
        </p>
      )}
    </TarjetaTablero>
  );
}

function unidadAparte(unidad: string | null): string {
  return unidad == null ? "varias unidades: sin barra" : "en otra unidad: sin barra, no se compara con m³";
}
