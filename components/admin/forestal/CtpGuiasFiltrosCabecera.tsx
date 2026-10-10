"use client";

/**
 * El autofiltro de cada columna de la bandeja de Ingresos (Brandon,
 * 2026-09-26: «en fecha para buscar la fecha o seleccionarla, en documento
 * para buscar, en N° SNIFFS, en cantidad, en estado para elegir… y las demás
 * también»).
 *
 * Qué control lleva cada columna sale de lo que se busca en ella:
 * - un código que se tipea (documento, SNIFFS, tipo, origen, unidad, quién) →
 *   buscador;
 * - una fecha → rango con «sólo ese día»;
 * - una cantidad → rango (m³, piezas);
 * - pocos valores fijos (estado, recepción, trozas, precio) → un desplegable.
 *
 * Estado, recepción, producto y «sin costo» escriben el MISMO estado que ya
 * tenían los chips y el panel «Filtros»: dos lugares, un filtro.
 */

import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  FiltroColumna,
  FiltroColumnaMulti,
  FiltroColumnaRango,
  FiltroColumnaTexto,
} from "@/components/admin/shared/filtros-columna";
import { FILTROS_PAGO, FILTRO_PAGO_LABEL, type FiltroPago, type FiltrosColumnaIngresos } from "@/lib/forestal/ingresos-filtros-columna";
import type { CtpFacetasActivas } from "./CtpIngresosFiltros";
import type { ColGuia } from "./ctp-guias-columnas";
import { STATUS_META, productLabel, type WoodEntryStats, type WoodEntryStatus } from "./ctp-shared";

interface Args {
  col: FiltrosColumnaIngresos;
  setCol: Dispatch<SetStateAction<FiltrosColumnaIngresos>>;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  recepcionSel: "pendiente" | "cerrada" | "";
  setRecepcionSel: (v: "pendiente" | "cerrada" | "") => void;
  facetas: CtpFacetasActivas;
  setFacetas: Dispatch<SetStateAction<CtpFacetasActivas>>;
  stats: WoodEntryStats | null;
  /** Clases extra para cada control (el panel del celular los estira al ancho). */
  clase?: string;
}

const lista = (v: string | readonly string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? [...v] : [v as string];

export function filtrosDeCabeceraGuias({
  col,
  setCol,
  statusFilter,
  setStatusFilter,
  recepcionSel,
  setRecepcionSel,
  facetas,
  setFacetas,
  stats,
  clase,
}: Args): Partial<Record<ColGuia, ReactNode>> {
  /* Un campo vacío se guarda como `undefined`, no como "" ni {min:null,max:null}:
     si no, «hay filtro» contaría algo que no filtra. */
  const texto = (k: "doc" | "sniffs" | "tipo" | "origen" | "unidad" | "registro", label: string, placeholder?: string) => (
    <FiltroColumnaTexto
      className={clase}
      label={label}
      value={col[k]}
      placeholder={placeholder}
      onChange={(v) => setCol((f) => ({ ...f, [k]: v || undefined }))}
    />
  );
  const rango = (
    k: "fecha" | "fechaGuia" | "cantidad" | "piezas",
    label: string,
    extra: { esFecha?: boolean; unidad?: string; paso?: number },
  ) => (
    <FiltroColumnaRango
      className={clase}
      label={label}
      {...extra}
      valor={col[k]}
      onChange={(r) =>
        setCol((f) => ({ ...f, [k]: r.min == null && r.max == null ? undefined : r }))
      }
    />
  );
  const estados = (Object.keys(STATUS_META) as WoodEntryStatus[]).map((s) => ({
    value: s,
    count: stats?.byStatus?.[s] ?? 0,
  }));

  return {
    fecha: rango("fecha", "Fecha", { esFecha: true }),
    tipoDoc: texto("tipo", "tipo de documento", "GTF, boleta…"),
    documento: texto("doc", "documento", "N° de guía"),
    fechaGuia: rango("fechaGuia", "Fecha del documento", { esFecha: true }),
    sniffs: texto("sniffs", "N° SNIFFS", "N° constancia"),
    origen: texto("origen", "origen", "Región o distrito"),
    recepcion: (
      <FiltroColumna
        className={clase}
        label="recepción"
        value={recepcionSel || undefined}
        options={[{ value: "pendiente" }, { value: "cerrada" }]}
        etiqueta={(v) => (v === "pendiente" ? "Por recibir" : "Recibidas")}
        onChange={(v) => setRecepcionSel((v as "pendiente" | "cerrada" | undefined) ?? "")}
      />
    ),
    producto: (
      <FiltroColumnaMulti
        className={clase}
        label="producto"
        value={lista(facetas.product)}
        options={(stats?.products ?? []).map((o) => ({ value: o.value, count: o.count, peso: o.volumeM3 }))}
        etiqueta={productLabel}
        onChange={(v) => setFacetas((f) => ({ ...f, product: v.length > 0 ? v : undefined }))}
      />
    ),
    cantidad: rango("cantidad", "Cantidad", { unidad: "m³", paso: 0.01 }),
    piezas: rango("piezas", "Piezas", { paso: 1 }),
    trozas: (
      <FiltroColumna
        className={clase}
        label="trozas"
        value={col.trozas}
        options={[{ value: "con" }, { value: "sin" }]}
        etiqueta={(v) => (v === "con" ? "Con trozas" : "Sin trozas")}
        onChange={(v) => setCol((f) => ({ ...f, trozas: (v as "con" | "sin" | undefined) || undefined }))}
      />
    ),
    unidad: texto("unidad", "unidad", "m³, pt…"),
    /* «Con precio» es de la cabecera; «sin precio» es el mismo `sinCosto` de la
       pastilla de Ingresos. Uno apaga al otro: pedir los dos daría cero. */
    /* Y el pago (ADR-437): de servicio / sin pagar / pagadas. Una sola
       elección en la cabecera: «sin precio» y «pagadas» a la vez darían cero. */
    costo: (
      <FiltroColumna
        className={clase}
        label="plata"
        value={facetas.sinCosto ? "sin" : col.pago ?? (col.conCosto ? "con" : undefined)}
        options={[{ value: "con" }, { value: "sin" }, ...FILTROS_PAGO.map((value) => ({ value }))]}
        etiqueta={(v) => (v === "con" ? "Con precio" : v === "sin" ? "Sin precio" : FILTRO_PAGO_LABEL[v as FiltroPago] ?? v)}
        onChange={(v) => {
          const pago = (FILTROS_PAGO as readonly string[]).includes(v ?? "") ? (v as FiltroPago) : undefined;
          setCol((f) => ({ ...f, conCosto: v === "con" || undefined, pago }));
          setFacetas((f) => ({ ...f, sinCosto: v === "sin" || undefined }));
        }}
      />
    ),
    registro: texto("registro", "quién registró", "Usuario"),
    estado: (
      <FiltroColumna
        className={clase}
        label="estado"
        value={statusFilter || undefined}
        options={estados}
        etiqueta={(v) => STATUS_META[v as WoodEntryStatus]?.label ?? v}
        onChange={(v) => setStatusFilter(v ?? "")}
      />
    ),
  };
}

/**
 * El permiso se elige con su resolución y su proveedor al lado (Brandon,
 * 2026-09-08): el código suelto no alcanza. Lo usan la cabecera y el panel.
 */
export function etiquetaDePermiso(stats: WoodEntryStats | null): (v: string) => string {
  return (v) => {
    const p = stats?.permisos?.find((x) => x.value === v);
    if (!p) return v;
    return [v, p.resoluciones[0] ? `Res. ${p.resoluciones[0]}` : null, p.proveedores[0]].filter(Boolean).join(" · ");
  };
}

/**
 * Qué autofiltros de cabecera pasan al panel «Filtros» del celular, con qué
 * rótulo y en qué orden (Brandon, 2026-09-26). A <640 px no hay tabla —son
 * tarjetas— y sin esto los filtros por columna no existían en el teléfono.
 *
 * Fuera: Producto, Especie, Proveedor y Permiso (ya son campos del panel) y
 * Estado (sus chips están a la vista justo arriba de las tarjetas).
 *
 * El panel es de dos columnas: las fechas van a la IZQUIERDA porque su
 * desplegable (256 px) es el más ancho y a la derecha rozaría el borde.
 */
const ROTULO_MOVIL: Partial<Record<ColGuia, string>> = {
  fecha: "Fecha",
  documento: "Documento",
  fechaGuia: "Fecha del documento",
  sniffs: "N° SNIFFS",
  cantidad: "Cantidad (m³)",
  piezas: "Piezas",
  recepcion: "Recepción",
  trozas: "Trozas",
  costo: "Precio y pago",
  tipoDoc: "Tipo de documento",
  origen: "Origen",
  unidad: "Unidad",
  registro: "Registró",
};

/** En el celular cada control ocupa su celda entera y llega a 44 px de alto (dedo). */
const CLASE_MOVIL =
  "max-sm:w-full max-sm:max-w-none max-sm:h-11 max-sm:[&>summary]:h-11 max-sm:[&>summary]:max-w-none";

export interface FiltroMovil {
  id: ColGuia;
  label: string;
  nodo: ReactNode;
}

export function filtrosDeCabeceraGuiasMovil(args: Omit<Args, "clase">): FiltroMovil[] {
  const nodos = filtrosDeCabeceraGuias({ ...args, clase: CLASE_MOVIL });
  return (Object.keys(ROTULO_MOVIL) as ColGuia[]).flatMap((id) =>
    nodos[id] ? [{ id, label: ROTULO_MOVIL[id] ?? id, nodo: nodos[id] }] : [],
  );
}
