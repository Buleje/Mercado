import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import type { TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import { ENTIDAD_UI, ESTADO_TRAMITE_UI, entidadDe, personaDe, proximaFecha } from "./tramites-ui";

/** La lista llega entera: se filtra y ordena en el cliente (entidad, estado y persona, como pidió el contrato). */
export const COLUMNAS_TRAMITES: readonly ColumnaFiltro<TramiteDto>[] = [
  { id: "tramite", label: "Trámite", tipo: "texto", valor: (t) => [t.asunto, entidadDe(t), t.proximoPaso ?? ""] },
  { id: "entidad", label: "Entidad", tipo: "multi", valor: (t) => ENTIDAD_UI[t.entidad], soloConVarios: true },
  { id: "persona", label: "Persona", tipo: "multi", valor: (t) => personaDe(t) || "Sin persona", soloConVarios: true },
  { id: "estado", label: "Estado", tipo: "multi", valor: (t) => ESTADO_TRAMITE_UI[t.estado].texto, soloConVarios: true },
];

export const ORDEN_TRAMITES: Record<string, AccesorOrden<TramiteDto>> = {
  tramite: { valor: (t) => t.asunto, texto: true },
  entidad: { valor: entidadDe, texto: true },
  persona: { valor: personaDe, texto: true },
  estado: { valor: (t) => ESTADO_TRAMITE_UI[t.estado].texto, texto: true },
  requisitos: { valor: (t) => t.conteo.falta },
  /* Sin fecha va al final en orden ascendente. */
  proximo: { valor: (t) => proximaFecha(t) ?? "9999-12-31", texto: true },
};
