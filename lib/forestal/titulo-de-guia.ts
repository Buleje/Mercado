/**
 * Declarar el título habilitante de una guía YA asentada (Brandon 05-10).
 *
 * Medido ese día en Blas: 17 de 17 trozas del patio sin título, en 7 guías
 * validadas del inventario de apertura. La corrección de un ingreso
 * (`WoodEntriesDB.update`) sólo vale para los PENDIENTES —«anúlalo y regístralo
 * de nuevo»—, que para un casillero vacío es tirar el asiento entero.
 *
 * Esto es otra cosa: **llenar un hueco**, igual que los D1/D2 medidos en planta
 * (ADR-440). Las reglas, por ingreso de la guía (una GTF con N especies son N
 * ingresos, ADR-312):
 *   · sólo sobre VACÍO: un código ya declarado no se pisa nunca —si es otro, se
 *     dice cuál y no se toca—; la resolución y el vínculo al permiso, igual;
 *   · el mes cerrado manda: lo presentado no cambia;
 *   · lo anulado o rechazado no se toca (no está en el libro vivo).
 * El libro admite el hueco; el certificado no (`trazabilidadCompleta()`): por
 * eso vale la pena poder cerrarlo sin rehacer la guía.
 *
 * PURO: la DB class lo usa para decidir y el test lo prueba sin base.
 */

import { normalizarCodigoContrato } from "./contratos";

export interface IngresoParaTitulo {
  id: string;
  especie: string | null;
  status: string;
  anulado: boolean;
  originCode: string | null;
  originSourceNumber: string | null;
  contratoId: string | null;
  /** Etiqueta del mes cerrado que lo contiene («setiembre 2026»), o null. */
  periodoCerrado: string | null;
}

export interface PedidoTitulo {
  originCode: string;
  originSourceNumber: string | null;
  contratoId: string | null;
}

export interface PlanTitulo {
  id: string;
  especie: string | null;
  /** Lo que se escribe (sólo los campos vacíos). `null` = nada. */
  escribir: { originCode?: string; originSourceNumber?: string; contratoId?: string } | null;
  /** Por qué no se escribió nada, en palabras del operador. */
  motivo: string | null;
  /** El mismo porqué en código, para decidir sin comparar textos. */
  razon: "anulado" | "mes_cerrado" | "otro_titulo" | "igual" | null;
}

const vacio = (s: string | null | undefined) => !(s ?? "").trim();

export function planearTitulo(ingresos: readonly IngresoParaTitulo[], pedido: PedidoTitulo): PlanTitulo[] {
  const codigo = pedido.originCode.trim();
  const res = (pedido.originSourceNumber ?? "").trim();
  return ingresos.map((i) => {
    const base = { id: i.id, especie: i.especie };
    if (i.anulado || i.status === "anulado" || i.status === "rechazado") {
      return { ...base, escribir: null, razon: "anulado", motivo: `está ${i.status === "rechazado" ? "rechazado" : "anulado"}` };
    }
    if (i.periodoCerrado) return { ...base, escribir: null, razon: "mes_cerrado", motivo: `mes cerrado (${i.periodoCerrado})` };
    if (!vacio(i.originCode)) {
      const mismo = normalizarCodigoContrato(i.originCode ?? "") === normalizarCodigoContrato(codigo);
      if (!mismo) return { ...base, escribir: null, razon: "otro_titulo", motivo: `ya declara ${i.originCode?.trim()}: no se pisa` };
    }
    const escribir: NonNullable<PlanTitulo["escribir"]> = {};
    if (vacio(i.originCode) && codigo) escribir.originCode = codigo;
    if (vacio(i.originSourceNumber) && res) escribir.originSourceNumber = res;
    if (!i.contratoId && pedido.contratoId) escribir.contratoId = pedido.contratoId;
    return Object.keys(escribir).length > 0
      ? { ...base, escribir, motivo: null, razon: null }
      : { ...base, escribir: null, motivo: "ya tenía ese título", razon: "igual" };
  });
}

/* ── El título que trae la ficha SERFOR (05-10, «Completar Blas con el QR») ──
 *
 * Al traer los D1/D2 de la guía (ADR-469) la misma ficha trae el casillero 6
 * (N° del título habilitante) y el 8 (resolución). Si los ingresos de esa guía
 * no lo declaran, se declara junto con las medidas —por `TituloGuiaDB.declarar`,
 * con estas mismas reglas—. La vista previa lo dice antes de guardar. */

/** Quiénes declaran el título: admin y dueño, como `PATCH /wood-entries/titulo`.
 *  Se chequea a mano: `requireAdmin` deja pasar al encargado por el bypass de gestión. */
export const ROLES_DECLARAN_TITULO = ["admin", "owner"] as const;

export function bloqueoRolTitulo(rol: string | null | undefined): string | null {
  return (ROLES_DECLARAN_TITULO as readonly string[]).includes(rol ?? "")
    ? null
    : "sólo lo declara el administrador o el dueño (las medidas sí se guardan)";
}

/** Lo de la ficha SERFOR que hace falta (casilleros 6 y 8, y el titular para mostrarlo). */
export interface FichaParaTitulo {
  numeroTitulo: string | null;
  numeroResolucion: string | null;
  titular: string | null;
}

/**
 * `declarar` = al menos un ingreso recibe algo (código, resolución o vínculo);
 * `distinto` = el libro ya declara OTRO título (no se pisa: hay que revisarlo);
 * `ya_tiene` = nada que hacer; `sin_codigo` = la ficha no trae el casillero 6;
 * `bloqueado` = mes cerrado o anulado.
 */
export type EstadoTituloFicha = "declarar" | "ya_tiene" | "distinto" | "sin_codigo" | "bloqueado";

export interface TituloDeLaFicha {
  codigo: string | null;
  resolucion: string | null;
  titular: string | null;
  estado: EstadoTituloFicha;
  /** Ingresos de la guía donde se escribe algo. */
  ingresos: number;
  /** Se escribe el CÓDIGO (no sólo la resolución o el vínculo al permiso). */
  declaraCodigo: boolean;
  /** Los ingresos que no se tocan, con el porqué. */
  omitidos: { especie: string | null; motivo: string }[];
  /** El código es de un permiso de la lista del negocio: se vincula solo. */
  vinculaPermiso: boolean;
  /** Por qué la sesión no puede declararlo (rol), o null. */
  bloqueoRol: string | null;
}

export function tituloDesdeFicha(
  ingresos: readonly IngresoParaTitulo[],
  ficha: FichaParaTitulo,
  /** El permiso de la lista con ese código (`ForestContratoDB.idPorCodigo`), o null. */
  contratoId: string | null,
  rol: string | null | undefined,
): TituloDeLaFicha {
  const codigo = (ficha.numeroTitulo ?? "").trim() || null;
  const resolucion = (ficha.numeroResolucion ?? "").trim() || null;
  const base = {
    codigo,
    resolucion,
    titular: (ficha.titular ?? "").trim() || null,
    vinculaPermiso: codigo != null && contratoId != null,
    bloqueoRol: bloqueoRolTitulo(rol),
  };
  if (!codigo) return { ...base, estado: "sin_codigo", ingresos: 0, declaraCodigo: false, omitidos: [] };

  const planes = planearTitulo(ingresos, { originCode: codigo, originSourceNumber: resolucion, contratoId });
  const escriben = planes.filter((p) => p.escribir != null);
  const omitidos = planes.filter((p) => p.escribir == null).map((p) => ({ especie: p.especie, motivo: p.motivo ?? "" }));
  const estado: EstadoTituloFicha =
    escriben.length > 0
      ? "declarar"
      : planes.some((p) => p.razon === "otro_titulo")
        ? "distinto"
        : planes.length > 0 && planes.every((p) => p.razon === "igual")
          ? "ya_tiene"
          : "bloqueado";
  return {
    ...base,
    estado,
    ingresos: escriben.length,
    declaraCodigo: escriben.some((p) => p.escribir?.originCode != null),
    omitidos,
  };
}
