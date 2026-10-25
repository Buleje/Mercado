/**
 * Embudos de las cabezas de la Lista (Brandon 25-10: «filtros tipo Excel en el
 * encabezado»). Sólo las columnas que la barra NO filtra ya: cliente, estado,
 * método de pago, fechas y montos viven en `BarraPedidos` y en «Filtros» (y las
 * guardan las vistas); repetirlos acá daría dos controles para el mismo dato.
 * La lista llega entera, no se pagina en el servidor.
 */
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { DbOrder } from "@/lib/jsondb";
import { plataSinMonto } from "./columnas-filtro-archivados";
import { cobroDe } from "./siguiente-paso";
import { msEnEstado, nivelDeEspera, type NivelDeEspera } from "./tiempo-en-estado";

const NIVEL: Record<NivelDeEspera, string> = {
  "al-dia": "Menos de 1 h",
  aviso: "De 1 a 2 h",
  tarde: "2 h o más",
};

export const COLUMNAS_PEDIDOS: readonly ColumnaFiltro<DbOrder>[] = [
  { id: "espera", label: "Sin avanzar", tipo: "multi", valor: (o) => NIVEL[nivelDeEspera(msEnEstado(o, Date.now()))], soloConVarios: true },
  { id: "plata", label: "Plata", tipo: "multi", valor: (o) => plataSinMonto(cobroDe(o).texto), soloConVarios: true },
];
