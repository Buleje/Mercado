/**
 * lib/caja/parte-exportar.ts
 *
 * Sacar el parte del día de la pantalla: CSV de los movimientos (con su
 * origen) y el texto para mandarlo por WhatsApp. Las cifras vienen del parte
 * que arma el servidor (`lib/caja/parte-del-dia.ts`); acá sólo se escriben.
 */
import { celdaCsv } from "@/lib/adelantos/exportar-csv";
import { medioDeMovimiento } from "./saldo-esperado";
import { origenDeMovimiento } from "./origen-movimiento";
import type { ParteDelDia } from "./parte-del-dia";

export interface MovimientoParaCsv {
  type: string;
  amount: number;
  method?: string | null;
  description?: string | null;
  createdAt: string;
  saleId?: string | null;
  liquidacionCodigo?: string | null;
}

const SUMA = new Set(["venta", "ingreso", "apertura"]);

/** CSV con `;` (Excel en español lo abre en columnas) y BOM para las tildes. */
export function movimientosACsv(movimientos: ReadonlyArray<MovimientoParaCsv>, hora: (iso: string) => string): string {
  const filas = [["Hora", "Tipo", "Origen", "Medio", "Detalle", "Monto", "Venta"].join(";")];
  for (const m of movimientos) {
    const signo = m.type === "egreso" ? -1 : SUMA.has(m.type) ? 1 : 0;
    filas.push(
      [
        hora(m.createdAt),
        m.type,
        origenDeMovimiento(m).etiqueta,
        medioDeMovimiento(m.method),
        m.description ?? "",
        (signo * (Number(m.amount) || 0)).toFixed(2),
        m.saleId ?? "",
      ]
        .map(celdaCsv)
        .join(";"),
    );
  }
  return `﻿${filas.join("\n")}`;
}

export function descargarTexto(contenido: string, nombre: string, tipo = "text/csv;charset=utf-8;"): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** El parte en texto plano, corto, para WhatsApp. */
export function textoParteWhatsApp(parte: ParteDelDia, formato: (n: number) => string, fecha: string): string {
  const lineas = [`*Parte de caja · ${fecha}*`, `Fondo de apertura: ${formato(parte.apertura)}`];
  for (const l of parte.porOrigen) {
    if (l.clave === "apertura") continue;
    if (l.entraEfectivo) lineas.push(`+ ${l.etiqueta}: ${formato(l.entraEfectivo)}`);
    if (l.saleEfectivo) lineas.push(`− ${l.etiqueta}: ${formato(l.saleEfectivo)}`);
  }
  lineas.push(`*Esperado en el cajón: ${formato(parte.esperado)}*`);
  if (parte.contado != null) {
    const d = parte.diferencia ?? 0;
    lineas.push(`Contado: ${formato(parte.contado)} (${d >= 0 ? "+" : "−"}${formato(Math.abs(d))})`);
  }
  const c = parte.conciliacion;
  lineas.push(
    c.cuadra
      ? `Ventas: ${c.ventasSistema.n} por ${formato(c.ventasSistema.total)} — todas pasaron por la caja`
      : `Ventas: ${c.ventasSistema.n} por ${formato(c.ventasSistema.total)} — ${c.sinCaja.n} sin pasar por la caja (${formato(c.sinCaja.total)})`,
  );
  return lineas.join("\n");
}
