/**
 * Las columnas del censo con su autofiltro de encabezado (Brandon, 2026-10-07:
 * «filtros estilo Excel en los encabezados… y quitar los filtros sueltos»).
 * Reemplazan al buscador, al selector de estado y al de categoría POA que
 * vivían sueltos arriba de la tabla. Las opciones de las listas salen del
 * censo completo (hasta 10.000), no de las 200 filas que se pintan.
 */

import { CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { ColumnaFiltro } from "./filtros-tabla-forestal";
import type { ArbolCenso } from "./loth-censo-arbol";

export const ESTADO_LABEL: Record<string, string> = { en_pie: "En pie", talado: "Talado", descartado: "Descartado" };

const num = (v: string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function columnasCenso(categorias: ReadonlyMap<string, keyof typeof CATEGORIA_LABEL>): ColumnaFiltro<ArbolCenso>[] {
  return [
    { id: "codigo", label: "Código", tipo: "texto", valor: (t) => t.treeCode },
    { id: "especie", label: "Especie", tipo: "multi", valor: (t) => t.speciesCommon, clave: claveEspecie },
    { id: "dap", label: "DAP (m)", tipo: "rango", numero: (t) => num(t.dapM), unidad: "m", paso: 0.05 },
    { id: "hc", label: "Hc (m)", tipo: "rango", numero: (t) => num(t.alturaComercialM), unidad: "m", paso: 1 },
    { id: "vol", label: "Vol. m³", tipo: "rango", numero: (t) => num(t.volumenEstimadoM3), unidad: "m³", paso: 0.5 },
    { id: "este", label: "Este", tipo: "rango", numero: (t) => num(t.utmX), paso: 1000 },
    { id: "norte", label: "Norte", tipo: "rango", numero: (t) => num(t.utmY), paso: 1000 },
    { id: "condicion", label: "Condición", tipo: "multi", valor: (t) => t.condicion },
    {
      id: "categoria",
      label: "Categoría POA",
      tipo: "multi",
      valor: (t) => {
        const c = categorias.get(t.id);
        return c ? CATEGORIA_LABEL[c] : null;
      },
    },
    { id: "estado", label: "Estado", tipo: "multi", valor: (t) => ESTADO_LABEL[t.estado] ?? t.estado },
  ];
}
