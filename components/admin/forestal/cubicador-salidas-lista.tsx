"use client";

/**
 * Los viajes anotados de una cubicación (Brandon 28-10): fecha, a quién, en
 * qué vehículo y cuánto se llevó (piezas, m³ y PT). Corregir y quitar son
 * opcionales: en «Guardar cubicación» se ven sólo para saber qué salió.
 */
import { Loader2, Pencil, Trash2, Truck } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { AccionesDelViaje } from "./cubicador-salidas-acciones";
import { fechaDeLaGuardada } from "./cubicador-guardadas-fecha";
import { totalDeSalida } from "./cubicador-salidas-logica";

const BOTON_ICONO = button({ variant: "secondary", className: "w-12 shrink-0 px-0" });

/** «Camión Volvo · ABC-123 · chofer Juan» (lo que haya). */
export const vehiculoDeSalida = (s: Pick<SalidaCubicacion, "vehiculo" | "placa" | "chofer">): string =>
  [s.vehiculo, s.placa, s.chofer && `chofer ${s.chofer}`].filter(Boolean).join(" · ");

export function ListaDeViajes({ salidas, compradorDeLaFicha, editandoId, quitandoId, onEditar, onQuitar, guardada, partes }: {
  salidas: readonly SalidaCubicacion[];
  /** Lo que se muestra si el viaje no dice a quién (vacío = el comprador). */
  compradorDeLaFicha?: string;
  editandoId?: string | null;
  quitandoId?: string | null;
  onEditar?: (s: SalidaCubicacion) => void;
  onQuitar?: (s: SalidaCubicacion) => void;
  /** La guardada: con ella cada viaje ofrece su «Papel» y «WhatsApp». */
  guardada?: CubicacionRegistro;
  /** El Directorio (para el celular del comprador). */
  partes?: Parameters<typeof AccionesDelViaje>[0]["partes"];
}) {
  if (salidas.length === 0) return null;
  return (
    <ol className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" aria-label="Viajes anotados" data-lista="viajes">
      {salidas.map((s, i) => {
        const t = totalDeSalida(s);
        const quien = s.cliente || compradorDeLaFicha;
        const vehiculo = vehiculoDeSalida(s);
        const editando = editandoId === s.id;
        return (
          <li key={s.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 ${editando ? "bg-[var(--accent-soft)]" : ""}`} data-salida={s.id}>
            <Truck className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0 flex-[1_1_14rem]">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                Viaje {i + 1} · {fechaDeLaGuardada(s.fecha)}
                {s.completo && <span className="ml-1.5 font-semibold text-[var(--text-secondary)]">· se llevó todo lo que quedaba</span>}
              </p>
              <p className="break-words text-sm text-[var(--text-secondary)]">
                {[quien && `A ${quien}`, vehiculo, s.gtf && `GTF ${s.gtf}`, s.destino && `a ${s.destino}`].filter(Boolean).join(" · ") || "Sin datos del viaje"}
              </p>
              {s.notas && <p className="break-words text-sm text-[var(--text-tertiary)]">{s.notas}</p>}
            </div>
            <p className="ml-auto text-right font-mono text-sm tabular-nums text-[var(--text-primary)]" data-viaje-pt={t.pt}>
              <span className="font-bold">{fmtM3(t.m3)} m³</span>
              <span className="block text-[var(--text-secondary)]">{fmtPiezas(t.piezas)} pzas · {fmtPt(t.pt)} PT</span>
            </p>
            {(onEditar || onQuitar) && (
              <div className="flex gap-1.5">
                {onEditar && (
                  <button type="button" className={BOTON_ICONO} onClick={() => onEditar(s)} aria-label={`Corregir el viaje ${i + 1}`} title="Corregir" data-accion="corregir-viaje">
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {onQuitar && (
                  <button type="button" className={BOTON_ICONO} onClick={() => onQuitar(s)} disabled={quitandoId === s.id} aria-label={`Quitar el viaje ${i + 1}`} title="Quitar" data-accion="quitar-viaje">
                    {quitandoId === s.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  </button>
                )}
              </div>
            )}
            {guardada && <AccionesDelViaje c={guardada} salida={s} indice={i} partes={partes ?? []} />}
          </li>
        );
      })}
    </ol>
  );
}
