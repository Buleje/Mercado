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
import { msEnEstado } from "./tiempo-en-estado";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que «Por cobrar» pone en el embudo «Plata»: se cobra al entregar o ya se
 * debe. No incluye Yape por verificar (eso se verifica, no se cobra) ni fiado
 * (ya está en la cuenta del cliente). Son los textos de `cobroDe` sin monto.
 */
export const PLATA_POR_COBRAR: readonly string[] = ["Cobrar al entregar", "Debe"];

/** ¿Falta cobrarle plata a este pedido? (la misma lectura que la columna «Plata»). */
export const faltaCobrar = (o: DbOrder) => PLATA_POR_COBRAR.includes(plataSinMonto(cobroDe(o).texto));

/**
 * «Sin avanzar» en días: en `main` los 18 pedidos en marcha llevan de 56 a 200
 * días, así que los niveles «menos de 1 h / 2 h o más» los dejaban a todos en
 * el mismo (25-10). Un rango en días sí separa «de hoy» de «de hace meses».
 * El reloj se lee al filtrar: se recalcula cuando cambian las filas.
 */
const diasSinAvanzar = (o: DbOrder) => Math.floor(msEnEstado(o, Date.now()) / DIA_MS);

export const COLUMNAS_PEDIDOS: readonly ColumnaFiltro<DbOrder>[] = [
  { id: "espera", label: "Sin avanzar", tipo: "rango", numero: diasSinAvanzar, unidad: "días", paso: 1 },
  { id: "plata", label: "Plata", tipo: "multi", valor: (o) => plataSinMonto(cobroDe(o).texto), soloConVarios: true },
];
