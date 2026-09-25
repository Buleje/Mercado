/**
 * Lo que comparten la tabla del escritorio y las tarjetas del teléfono: la
 * misma pieza se dibuja dos veces y tiene que decir lo mismo en las dos.
 *
 * PURO: sin JSX y sin estado, para que la lista, la tabla y las tarjetas lo
 * importen sin arrastrarse entre ellas.
 */

import {
  diasParada,
  ESTADO_META,
  estadoDeTroza,
  type OrdenTrozas,
} from "@/lib/forestal/trozas-patio";
import type { UbicacionDeCarga } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

/** Una medida que no está es «—», nunca 0: cero centímetros es un dato falso. */
export const n = (v: number | null | undefined, dec = 2) => (v == null ? "—" : v.toFixed(dec));

export const NUM = "text-right font-mono tabular-nums";

export const ORDENES: { v: OrdenTrozas; label: string }[] = [
  { v: "antiguedad", label: "Más vieja primero" },
  { v: "volumen", label: "Mayor volumen" },
  { v: "codigo", label: "Código de troza" },
  { v: "especie", label: "Especie" },
];

/**
 * Los días, con el aviso en el FONDO y no en el texto.
 *
 * Medido en dark: ningún rojo del DS llega a 4.5:1 sobre la fila —el mejor,
 * `--data-error-500`, da 3.93— así que un «822 d» en rojo es exactamente el
 * dato que no se lee. El número va en el token de texto (14.3:1) y el color
 * queda en el tinte del fondo, que es señal y no información.
 */
export const claseDias = (d: number | null) =>
  d == null ? "text-[var(--text-secondary)]"
    : d >= 60 ? "rounded-md bg-[var(--data-error-500)]/18 px-1.5 text-[var(--text-primary)]"
    : d >= 30 ? "rounded-md bg-[var(--data-warning-500)]/18 px-1.5 text-[var(--text-primary)]"
    : "text-[var(--text-secondary)]";

export const tituloDias = (d: number | null) =>
  d == null ? "Sin fecha de recepción ni de asiento"
    : d >= 60 ? `${d} días parada: la troza se mancha y se raja, hay que aserrarla`
    : d >= 30 ? `${d} días parada: conviene programarla`
    : `${d} días desde que entró`;

/** Lo que se está viendo, para cruzarlo en Excel contra el conteo del patio. */
export function exportarTrozasCsv(
  filtradas: readonly TrozaPatioAPI[],
  hoy: Date,
  canchas: Record<string, UbicacionDeCarga>,
) {
  const cel = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
  const cab = ["N°", "Codigo troza", "Codigo planta", "Especie", "Estado", "Dias parada", "D1(cm)", "D2(cm)", "Largo(m)", "Volumen(m3)", "GTF", "Proveedor", "Titulo", "Lote", "Cancha"];
  const filas = filtradas.map((t, i) => [
    i + 1, t.codificacion ?? "", t.codigoPlanta ?? "", t.especieComun ?? "",
    ESTADO_META[estadoDeTroza(t)].label, diasParada(t, hoy) ?? "",
    num(t.d1Cm), num(t.d2Cm), num(t.largoM), num(t.volumenM3),
    t.gtfNumber ?? "", t.proveedor ?? "", t.permiso ?? "", t.loteAserrioCode ?? "",
    canchas[t.woodEntryId]?.nombre ?? "",
  ]);
  const csv = "﻿" + [cab, ...filas].map((f) => f.map(cel).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `patio-trozas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
