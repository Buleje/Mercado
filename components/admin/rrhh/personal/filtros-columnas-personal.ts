/**
 * Autofiltros de Excel de Equipo › Personal (Brandon 23-10: «en su encabezado
 * sus filtros… escoger, fecha, buscar o ambos… se anidan entre ellas»):
 *   · Nombre, Documento y Celular: buscar un pedazo;
 *   · Puesto, Estado y Contrato: tildar de la lista (en cascada);
 *   · Ingreso: desde–hasta.
 * Estado sólo sale con 2+ estados en la lista: los chips de arriba ya lo filtran.
 */
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { ContratoDePersona } from "@/lib/rrhh/contratos-por-persona";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";
import { COLABORADOR_ESTADO_META } from "../rrhh-ui";
import { etiquetaEstadoContrato } from "./FichaContratos";

const ddmm = (v: number | string) => String(v).slice(0, 10).split("-").reverse().join("/");

export function columnasFiltroPersonal(contratos: Map<string, ContratoDePersona> | null): ColumnaFiltro<ColaboradorDTO>[] {
  const columnas: ColumnaFiltro<ColaboradorDTO>[] = [
    { id: "nombre", label: "Nombre", tipo: "texto", valor: (c) => [c.nombre, c.apodo ?? ""] },
    { id: "puesto", label: "Puesto", tipo: "multi", valor: (c) => c.puesto?.nombre ?? "Sin puesto" },
    { id: "estado", label: "Estado", tipo: "multi", valor: (c) => COLABORADOR_ESTADO_META[c.estado]?.label ?? c.estado, soloConVarios: true },
  ];
  if (contratos) {
    columnas.push({
      id: "contrato",
      label: "Contrato",
      tipo: "multi",
      valor: (c) => {
        const k = contratos.get(c.id);
        return k ? etiquetaEstadoContrato(k.estado) : "Sin contrato";
      },
    });
  }
  columnas.push(
    { id: "documento", label: "Documento", tipo: "texto", valor: (c) => c.documento },
    { id: "celular", label: "Celular", tipo: "texto", valor: (c) => c.celular },
    { id: "ingreso", label: "Ingreso", tipo: "fecha", numero: (c) => c.fechaIngreso?.slice(0, 10) ?? null, formatearValor: ddmm },
  );
  return columnas;
}
