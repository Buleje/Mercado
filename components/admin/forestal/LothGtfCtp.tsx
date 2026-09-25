"use client";

/**
 * LothGtfCtp — la guía de un despacho de trozas, vinculada con el Libro CTP.
 *
 * Brandon (2026-09-18): «al despachar la madera se irá a libro CTP en ingresos
 * y tipo una hipervinculación donde todo se vincula entre sí». La fila del
 * despacho dice si ESA guía ya entró a la planta y lleva hasta allá: si entró,
 * a Ingresos; si no, abre el ingreso del CTP pre-llenado con el N° de guía (el
 * mismo puente que ya usaba la vista GTF — ahora vive acá, una sola vez).
 *
 * El estado llega por contexto porque las columnas de la tabla son funciones
 * puras por fila (`COLS`); el cruce se pide una vez por página, no por celda.
 */

import { createContext, useContext } from "react";
import { ArrowRight, Check } from "@buleje/design-system/icons";
import { CTP_INGRESAR_GTF_KEY, CTP_MODULE_TAB_ID } from "./ctp-shared";
import type { EstadoGtfCtp } from "./hooks/use-gtf-en-ctp";

export const GtfCtpContext = createContext<Map<string, EstadoGtfCtp> | null>(null);

/** Abre el Libro CTP con un ingreso nuevo para esta guía. */
export function ingresarGtfAlCtp(gtfNumber: string) {
  try {
    sessionStorage.setItem(CTP_INGRESAR_GTF_KEY, gtfNumber);
  } catch {
    /* modo privado: el formulario del CTP abre vacío, no rompe */
  }
  window.dispatchEvent(
    new CustomEvent("admin:navigate", { detail: { moduleId: CTP_MODULE_TAB_ID } }),
  );
}

function verIngresosDelCtp() {
  window.dispatchEvent(
    new CustomEvent("admin:navigate", {
      detail: { moduleId: CTP_MODULE_TAB_ID, vista: "ingresos" },
    }),
  );
}

/** «jueves 10/09»: como se nombra un día en el aserradero. Fecha date-only → UTC. */
function diaCorto(iso: string) {
  const d = new Date(iso);
  const dia = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][
    d.getUTCDay()
  ];
  return `${dia} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const LINK =
  "inline-flex min-h-6 items-center gap-1 rounded-md text-xs font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

export function GtfConCtp({ gtf }: { gtf: string | null }) {
  const estados = useContext(GtfCtpContext);
  const estado = gtf ? estados?.get(gtf.trim()) : undefined;
  return (
    <div className="flex flex-col items-start">
      <span className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
        {gtf ?? "—"}
      </span>
      {gtf && estado === "sin-ingreso" && (
        <button
          type="button"
          onClick={() => ingresarGtfAlCtp(gtf)}
          title="Esta guía todavía no tiene ingreso en tu Libro CTP. Si la madera fue a tu planta, se abre el ingreso con el N° de guía puesto."
          className={`${LINK} text-[var(--accent-ink)] dark:text-[var(--accent)]`}
        >
          Ingresar al CTP
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {gtf && estado && estado !== "sin-ingreso" && (
        <button
          type="button"
          onClick={verIngresosDelCtp}
          title={`Ingresó al Libro CTP${estado.libroNro != null ? ` con el N° ${estado.libroNro}` : ""} el ${diaCorto(estado.entryDate)}. Abre Ingresos.`}
          className={`${LINK} text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          En el CTP · {diaCorto(estado.entryDate)}
        </button>
      )}
    </div>
  );
}
