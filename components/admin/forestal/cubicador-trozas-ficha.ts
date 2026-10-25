/**
 * Los datos de papel de una cubicación de TROZAS guardada, para el detalle y
 * para la tarjeta de cada lado del comparador. Mismo formato que la ficha de
 * la madera aserrada (`datosDeLaGuardada`): sale sólo lo que haya, nunca una
 * fila «—» por cada campo vacío.
 *
 * Datos del camión (placa, chofer, 24-10): se anotan al guardar y salen acá,
 * en el detalle y en los dos lados del comparador; las de antes no los tienen
 * y no muestran fila.
 */
import { formatCurrency } from "@/lib/currency";
import { UNIDADES_FORMULA } from "@/lib/forestal/cubicacion-trozas-formula";
import { esDeTrozas } from "@/lib/forestal/cubicacion-trozas-diferencias";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";
import type { DatoDeGuardada } from "./cubicador-detalle-ficha";
import { ESTADO_CUB, type CubicacionTrozas, type CuentaDeLaPersona } from "./hooks/use-cubicaciones-trozas";

/** «Te debe S/ 120,00» / «Le debes S/ 80,00» / «Sin saldo»: el saldo de la cuenta forestal (+ te debe, − le debes). */
export function textoDeSaldo(saldo: number): string {
  if (Math.abs(saldo) < 0.005) return "Sin saldo";
  return `${saldo > 0 ? "Te debe" : "Le debes"} ${formatCurrency(Math.abs(saldo))}`;
}

export function datosDeTrozas(c: CubicacionTrozas, opciones: { cuenta?: CuentaDeLaPersona | null; completa?: boolean } = {}): DatoDeGuardada[] {
  const completa = opciones.completa === true;
  const estado = ESTADO_CUB[c.estado].label;
  const todos: (DatoDeGuardada | false)[] = [
    completa && { id: "codigo", etiqueta: "Código de la hoja", valor: c.codigo, mono: true },
    { id: "fecha", etiqueta: "Fecha", valor: fechaDeLaGuardada(c.fecha) },
    Boolean(c.personaNombre) && { id: "persona", etiqueta: c.sentido === "venta" ? "Cliente" : "Proveedor", valor: c.personaNombre ?? "" },
    { id: "sentido", etiqueta: "Operación", valor: c.sentido === "venta" ? "Venta (entregas madera)" : "Compra (recibes madera)" },
    { id: "formula", etiqueta: "Fórmula", valor: esDeTrozas(c.formula) ? UNIDADES_FORMULA[c.formula].nombre : c.formula },
    Boolean(c.gtfNumber) && { id: "gtf", etiqueta: "GTF", valor: c.gtfNumber ?? "", mono: true },
    Boolean(c.placa) && { id: "placa", etiqueta: "Placa", valor: c.placa ?? "", mono: true },
    Boolean(c.chofer) && { id: "chofer", etiqueta: "Chofer", valor: c.chofer ?? "" },
    { id: "estado", etiqueta: "Estado de la cuenta", valor: c.estado === "anulada" && c.motivoAnulacion ? `${estado} · ${c.motivoAnulacion}` : estado },
    completa && opciones.cuenta != null && { id: "saldo", etiqueta: `Cuenta de ${opciones.cuenta.nombre}`, valor: textoDeSaldo(opciones.cuenta.saldo) },
    completa && Boolean(c.createdBy) && { id: "guardo", etiqueta: "La guardó", valor: c.createdBy },
  ];
  return todos.filter((d): d is DatoDeGuardada => Boolean(d));
}
