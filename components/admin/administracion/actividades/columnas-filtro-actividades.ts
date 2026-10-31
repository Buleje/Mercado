import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import type { ActividadDTO } from "@/lib/agenda/tipos";
import { textoRecurrencia } from "../comun/recurrencia-texto";
import { CANAL_UI, ROL_UI } from "../comun/reglas";

const quien = (a: ActividadDTO) => (a.responsableRol ? (ROL_UI[a.responsableRol as keyof typeof ROL_UI] ?? a.responsableRol) : "Cualquiera");
const canales = (a: ActividadDTO) => a.canales.map((c) => CANAL_UI[c].label);
const cuando = (a: ActividadDTO) => textoRecurrencia(a.recurrencia, a.hora);

/** La lista llega entera: se filtra y ordena en el cliente. */
export const COLUMNAS_ACTIVIDADES: readonly ColumnaFiltro<ActividadDTO>[] = [
  { id: "actividad", label: "Actividad", tipo: "texto", valor: (a) => [a.nombre, a.objetivo?.nombre ?? ""] },
  { id: "cuando", label: "Cuándo", tipo: "multi", valor: cuando, soloConVarios: true },
  { id: "avisa", label: "Avisa por", tipo: "multi", valor: canales, soloConVarios: true },
  { id: "quien", label: "Quién la hace", tipo: "multi", valor: quien, soloConVarios: true },
  { id: "prendida", label: "Prendida", tipo: "multi", valor: (a) => (a.activo ? "Sí" : "No"), soloConVarios: true },
];

export const ORDEN_ACTIVIDADES: Record<string, AccesorOrden<ActividadDTO>> = {
  actividad: { valor: (a) => a.nombre, texto: true },
  cuando: { valor: cuando, texto: true },
  avisa: { valor: (a) => canales(a).join(", "), texto: true },
  quien: { valor: quien, texto: true },
  prendida: { valor: (a) => (a.activo ? 1 : 0) },
};
