import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import type { AlquilerDto } from "@/lib/admin/fichas-tramites-alquileres";
import { ESTADO_ALQUILER_UI, duenoDe, inquilinoDe } from "./alquileres-ui";

export const COLUMNAS_ALQUILERES: readonly ColumnaFiltro<AlquilerDto>[] = [
  { id: "local", label: "Local", tipo: "texto", valor: (a) => [a.nombre, a.direccion ?? "", duenoDe(a)] },
  { id: "inquilino", label: "Inquilino", tipo: "multi", valor: (a) => inquilinoDe(a) || "Sin inquilino", soloConVarios: true },
  { id: "estado", label: "Estado", tipo: "multi", valor: (a) => ESTADO_ALQUILER_UI[a.estado].texto, soloConVarios: true },
  { id: "alertas", label: "Alertas", tipo: "multi", valor: (a) => (a.resumen.alertas.length > 0 ? "Con alertas" : "Sin alertas"), soloConVarios: true },
];

export const ORDEN_ALQUILERES: Record<string, AccesorOrden<AlquilerDto>> = {
  local: { valor: (a) => a.nombre, texto: true },
  inquilino: { valor: inquilinoDe, texto: true },
  renta: { valor: (a) => a.rentaMensual },
  estado: { valor: (a) => ESTADO_ALQUILER_UI[a.estado].texto, texto: true },
  proximo: { valor: (a) => a.resumen.proximoVenceEl ?? "9999-12-31", texto: true },
  alertas: { valor: (a) => a.resumen.alertas.length },
};
