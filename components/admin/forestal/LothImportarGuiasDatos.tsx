"use client";

/**
 * «Datos de la guía» en la vista previa de «Importar guías despachadas»
 * (ADR-461). Desde el 02-10-2026 (Brandon: «todos los datos en bloques igual
 * como es para despachar») son los bloques de `LothImportarGuiasBloques`, de a
 * dos por fila. Desde el 07-10-2026 es una PESTAÑA de la tarjeta de la guía
 * (Brandon: «los datos como destinatario, propietario y otros en una sección»):
 * sólo el documento; el resumen por especie y el (37) van en «Trozas y resumen».
 */

import { placasDeLaGuia, sinRaya } from "@/lib/forestal/loth-importar-guia";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import LothImportarGuiasBloques from "./LothImportarGuiasBloques";

/** «Titular → Destinatario · placa»: la cifra del rótulo de la pestaña. */
export function resumenDelViaje(ficha: GtfSerfor): string {
  const placa = placasDeLaGuia(ficha.placa).placa;
  const viaje = [sinRaya(ficha.titular), sinRaya(ficha.destinatario)].filter(Boolean).join(" → ");
  return [viaje, placa].filter(Boolean).join(" · ");
}

export default function LothImportarGuiasDatos({ ficha }: { ficha: GtfSerfor }) {
  return (
    <div className="px-3 pb-3 pt-2">
      <LothImportarGuiasBloques ficha={ficha} piezas={[]} partes="datos" />
    </div>
  );
}
