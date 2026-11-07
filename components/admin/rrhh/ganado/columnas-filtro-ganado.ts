import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { calcularQuedaPorPagar } from "@/lib/rrhh/ganado";
import type { GanadoDTO } from "@/lib/rrhh/tipos";

export type PersonaGanada = GanadoDTO["personas"][number];

const dias = (p: PersonaGanada) => p.tramos.reduce((s, t) => (t.modalidad === "SIN_PAGO" ? s : s + t.factor), 0);
const horas = (p: PersonaGanada) => p.tramos.reduce((s, t) => s + t.horas, 0);
const queda = (p: PersonaGanada) => calcularQuedaPorPagar(p)?.aPagar ?? null;

/** Lo que la columna Avisos muestra, en pocas clases (el texto trae números: «3 días sin tarifa»). */
export const CON_AVISO = ["Sin marcar", "Sin tarifa", "Otro aviso"] as const;
const clasesDeAviso = (p: PersonaGanada): string[] => {
  const c: string[] = [];
  if (p.sinMarcar.length > 0) c.push("Sin marcar");
  if (p.sinTarifa.length > 0) c.push("Sin tarifa");
  if (p.avisos.some((a) => !/sin tarifa/i.test(a))) c.push("Otro aviso");
  return c;
};
/** Misma regla que la tarjeta «Con avisos»: el atajo y la cifra cuentan igual. */
export const tieneAviso = (p: PersonaGanada) => p.avisos.length > 0 || p.sinMarcar.length > 0 || p.sinTarifa.length > 0;

/** La lista llega entera para el período: se filtra en el cliente. */
export const COLUMNAS_GANADO: readonly ColumnaFiltro<PersonaGanada>[] = [
  { id: "persona", label: "Persona", tipo: "texto", valor: (p) => [p.nombre, p.puesto ?? ""] },
  { id: "ganado", label: "Ganado", tipo: "rango", numero: (p) => p.total, unidad: "S/", paso: 0.01 },
  { id: "queda", label: "Queda por pagar", tipo: "rango", numero: queda, unidad: "S/", paso: 0.01 },
  { id: "avisos", label: "Avisos", tipo: "multi", valor: (p) => { const c = clasesDeAviso(p); return c.length > 0 ? c : "Sin avisos"; }, soloConVarios: true },
];

export const ORDEN_GANADO: Record<string, AccesorOrden<PersonaGanada>> = {
  persona: { valor: (p) => p.nombre, texto: true },
  dias: { valor: dias },
  horas: { valor: horas },
  ganado: { valor: (p) => p.total },
  adelantos: { valor: (p) => p.adelantos?.planillaPen ?? null },
  queda: { valor: queda },
};
