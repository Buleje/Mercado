/**
 * Los autofiltros de Excel de la lista de adelantos (Brandon 23-10: «en su
 * encabezado sus filtros… escoger, fecha, buscar o ambos… se anidan entre
 * ellas»). Cada columna con el filtro que le toca:
 *   · Código y Motivo: buscar un pedazo (un código se tipea, no se elige de 80);
 *   · Persona y Estado: tildar de la lista (con «Buscar…» adentro si son 8+);
 *   · Fecha: desde–hasta; Adelantado y Saldo: de–a.
 * Las listas van en cascada (`opcionesEnCascada`): elegir «Abierto» deja en
 * Persona sólo a quien tiene un adelanto abierto.
 */
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { limaDateKey } from "@/lib/utils";
import { STATUS_BADGE } from "../shared";

const ddmm = (v: number | string) => String(v).slice(0, 10).split("-").reverse().join("/");

export const COLUMNAS_FILTRO_ADELANTOS: readonly ColumnaFiltro<DbAdelanto>[] = [
  { id: "codigo", label: "Código", tipo: "texto", valor: (a) => a.codigoOperacion },
  { id: "persona", label: "Persona", tipo: "multi", valor: (a) => a.beneficiario?.nombre },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (a) => limaDateKey(a.fechaAdelanto) || null, formatearValor: ddmm },
  { id: "motivo", label: "Motivo", tipo: "texto", valor: (a) => a.notas },
  { id: "monto", label: "Adelantado", tipo: "rango", numero: (a) => a.montoAdelantado, paso: 1 },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (a) => a.saldoPendiente, paso: 1 },
  { id: "estado", label: "Estado", tipo: "multi", valor: (a) => STATUS_BADGE[a.status]?.label ?? a.status },
];
