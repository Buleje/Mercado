"use client";

/**
 * Qué parte del lote se usa — la línea que lo dice y el botón que lo cambia.
 *
 * Sin la línea, quien abre Resúmenes o la Distribución ve totales más chicos
 * que los del cubicador y no sabe por qué (Brandon 2026-10-27). Por eso:
 *  · en el cubicador (Cargar y Lote) la línea está SIEMPRE: ahí se elige;
 *  · en Resúmenes, sólo cuando se usa una parte (con «Cambiar»), y un botón de
 *    ícono en la cabecera para elegir con el lote entero.
 * La línea sale también en el papel: un resumen impreso de una parte tiene que
 * decirlo.
 */
import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, ListChecks, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import {
  esUsoParcial,
  filtrarPorUso,
  fraseDelUso,
  TODO_EL_LOTE,
  totalesUso,
} from "@/lib/forestal/cubicacion-uso";
import { leerLoQueYaEstaEnElLibro, useUsoDelLote, type UsoDelLote } from "./hooks/use-uso-del-lote";

const UsoDelLoteModal = dynamic(() => import("./cubicador-uso-modal"), { ssr: false });

const BTN = button({ variant: "secondary" });

export interface UiUsoDelLote {
  /** Botón de ícono (48 px) para una cabecera. */
  boton: ReactNode;
  /** La línea «Usando una parte…» (o «Se usa todo el lote» con `siempre`). */
  linea: ReactNode;
  /** El modal, montado sólo mientras está abierto. */
  modal: ReactNode;
}

/**
 * `todas` = el lote ENTERO; `uso` = el de `useUsoDelLote` (lo comparte quien
 * filtra con lo que se dibuja: una sola lectura).
 */
export function useUiUsoDelLote(
  todas: readonly PiezaCubicada[],
  uso: UsoDelLote,
  { siempre = false } = {},
): UiUsoDelLote {
  const [abierto, setAbierto] = useState(false);
  const parcial = esUsoParcial(uso.fuera);
  const cuenta = useMemo(() => {
    if (!parcial) return null;
    const usadas = filtrarPorUso(todas, uso.fuera);
    return {
      usado: totalesUso(usadas),
      total: totalesUso(todas),
      frase: fraseDelUso(todas, uso.fuera),
      /* Se relee con cada cambio de la elección: es lo que la línea advierte. */
      enLibro: leerLoQueYaEstaEnElLibro(),
    };
  }, [parcial, todas, uso.fuera]);
  const abrir = () => setAbierto(true);

  const boton =
    todas.length > 0 ? (
      <button
        type="button"
        onClick={abrir}
        aria-label="Qué parte del lote se usa"
        title={
          parcial ? "Se usa una parte del lote: cambiarla" : "Elegir qué parte del lote se usa"
        }
        aria-pressed={parcial}
        /* Con una parte en uso la línea ya trae «Cambiar»: en el celular el botón sobra y partía el título. */
        className={button({
          variant: "secondary",
          size: "icon",
          className: parcial
            ? "border-[var(--accent)] text-[var(--accent-ink)] max-sm:hidden dark:text-[var(--accent)]"
            : undefined,
        })}
        data-uso-boton
      >
        <ListChecks className="h-5 w-5" aria-hidden />
      </button>
    ) : null;

  let linea: ReactNode = null;
  if (cuenta) {
    linea = (
      <div
        role="status"
        data-uso-linea="parte"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[var(--accent)]/40 bg-primary/8 px-4 py-2"
      >
        <ListChecks
          className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          aria-hidden
        />
        {/* Frase arriba y cifras abajo: en una sola fila con los botones a 1280 (en fila partía en dos). */}
        <span className="flex min-w-0 grow basis-64 flex-col">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {cuenta.usado.piezas === 0 ? "No se usa nada del lote" : <>Usando {cuenta.frase}</>}
          </span>
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {fmtPiezas(cuenta.usado.piezas)} de {fmtPiezas(cuenta.total.piezas)} pzas ·{" "}
            {fmtPt(cuenta.usado.pt)} de {fmtPt(cuenta.total.pt)} PT · {fmtM3(cuenta.usado.m3)} m³
          </span>
        </span>
        {cuenta.enLibro.bloques > 0 && (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-warning-ink)]">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {cuenta.enLibro.bloques}{" "}
            {cuenta.enLibro.bloques === 1 ? "bloque ya está" : "bloques ya están"} en el Libro
          </span>
        )}
        <span className="print:hidden">
          <InfoTip
            what="Resúmenes, la Distribución y lo que se declara desde ahí usan sólo esta parte. Lo demás sigue en el cubicador, sin borrarse."
            affects={
              cuenta.enLibro.bloques > 0
                ? "Lo que ya pasó al Libro no cambia al cambiar la parte: revisa el cuadre de esos bloques."
                : "Se elige en el cubicador o con «Cambiar»."
            }
            example="Usando Comercial + Paquetería larga: la corta y la tabla no se reparten ni se declaran."
          />
        </span>
        <span className="flex gap-2 print:hidden">
          <button type="button" onClick={abrir} className={BTN} data-uso-cambiar>
            Cambiar
          </button>
          <button
            type="button"
            onClick={() => uso.guardar(TODO_EL_LOTE)}
            className={button({ variant: "ghost", size: "icon" })}
            aria-label="Usar todo el lote"
            title="Usar todo el lote"
            data-uso-todo
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </span>
      </div>
    );
  } else if (siempre && todas.length > 0) {
    linea = (
      <div
        data-uso-linea="todo"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2"
      >
        <ListChecks className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="text-sm text-[var(--text-secondary)]">
          Resúmenes y Distribución usan <b className="text-[var(--text-primary)]">todo el lote</b>
        </span>
        <InfoTip
          what="Puedes usar sólo una parte de lo cubicado: un tipo, una especie, un dueño… Lo que no elijas no se borra, pero no entra a Resúmenes ni a la Distribución."
          example="Sólo la comercial, sólo la paquetería, o paquetería y corta de Tornillo."
        />
        <button type="button" onClick={abrir} className={`${BTN} ml-auto`} data-uso-elegir>
          Elegir qué parte
        </button>
      </div>
    );
  }

  const modal = abierto ? (
    <UsoDelLoteModal
      todas={todas}
      fuera={uso.fuera}
      onGuardar={uso.guardar}
      onCerrar={() => setAbierto(false)}
    />
  ) : null;

  return { boton, linea, modal };
}

/** En el cubicador: lee la elección del lote que está en pantalla y la deja cambiar. */
export function UsoDelLoteEnCubicador({ rows }: { rows: readonly PiezaCubicada[] }) {
  const uso = useUsoDelLote(rows);
  const ui = useUiUsoDelLote(rows, uso, { siempre: true });
  if (rows.length === 0) return null;
  return (
    <>
      {ui.linea}
      {ui.modal}
    </>
  );
}
