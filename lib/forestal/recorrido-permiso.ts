/**
 * recorrido-permiso — el contrato del «Recorrido del permiso» (ADR-519): los
 * pasos de un bloque de la distribución, de los datos del grupo a la salida
 * con su guía, y el estado de cada uno. Lo comparten el servidor
 * (`/api/admin/forestal/distribuciones/recorrido`, fase 2) y la pantalla del
 * recorrido (fase 4).
 *
 * El estado NO se guarda: se DERIVA del Libro en cada lectura (lote por
 * `loteId`, corridas vivas de las jornadas, anexo guardado con su permiso,
 * despachos del anexo). Así cerrar la pantalla a la mitad no deja una segunda
 * verdad desincronizada: se vuelve a leer y sigue desde `siguiente`.
 *
 * Sin lote comercial (Brandon 27-10: la salida va directo de la producción).
 * PURO y client-safe.
 */

import { z } from "zod";

export type PasoRecorrido = "datos" | "trozas" | "lote" | "jornadas" | "anexo" | "salida";

/** En orden. `ejecutable` = lo hace el servidor con un clic (POST); los demás piden algo de la persona. */
export const PASOS_RECORRIDO: ReadonlyArray<{ id: PasoRecorrido; titulo: string; ejecutable: boolean }> = [
  { id: "datos", titulo: "Datos listos", ejecutable: false },
  { id: "trozas", titulo: "Elegir las trozas", ejecutable: false },
  { id: "lote", titulo: "Lote de aserrío", ejecutable: true },
  { id: "jornadas", titulo: "Consumo y producción", ejecutable: true },
  { id: "anexo", titulo: "Anexo 04", ejecutable: false },
  { id: "salida", titulo: "Salida con su guía", ejecutable: false },
];

export type EstadoDePaso = "pendiente" | "hecho" | "con_problema" | "no_aplica";

export interface PasoDelRecorrido {
  paso: PasoRecorrido;
  estado: EstadoDePaso;
  /** Lo que lo prueba en el Libro: id del lote, de las corridas, del anexo, de los despachos. */
  ids: string[];
  /** Con problema: en palabras de Brandon, qué pasó y qué hacer («La guía QA19-GTF-A1 no está recibida»). */
  motivo?: string;
  /** El código del servidor que lo frenó (`PERMISO_DISTINTO`, `MES_CERRADO`, …). */
  code?: string;
  /** Una línea de lo hecho («4 jornadas · 12 trozas · 18,214 m³ → 2.340 PT»). */
  detalle?: string;
}

export interface EstadoRecorrido {
  distribucionId: string;
  bloqueId: string;
  permiso: string | null;
  especie: string;
  /** m³ de rolliza de las trozas elegidas (o de todas, si el bloque no eligió). */
  rollizaM3: number;
  /** Lo que el bloque ampara (usado de la distribución). */
  amparadoM3: number;
  /** Lo declarado en las corridas vivas del bloque. */
  producidoM3: number;
  producidoPt: number;
  /** Lo que el bloque ampara y no tiene de dónde salir (siempre ≥ 0; nunca se fuerza). */
  sinAtribuirM3: number;
  pasos: PasoDelRecorrido[];
  /** El primer paso no hecho (null = recorrido completo). */
  siguiente: PasoRecorrido | null;
  /**
   * El Anexo 04 cuya salida falta registrar en el Libro y antes vence su plazo
   * (2 días hábiles desde la guía), si hay y no venció. Registrada = sin aviso.
   */
  plazo: { anexoId: string; gtfNumber: string | null; venceEl: string } | null;
  /** Rendimiento sugerido por la distribución contra el real de las corridas (null si no hay producción). */
  rendimiento: { sugeridoPct: number; realPct: number | null } | null;
}

const id = z.string().trim().min(1).max(120);

const num = z.coerce.number().finite().min(0).max(1e7);
const medidaDelDia = z.object({
  clave: z.string().max(120),
  medida: z.string().max(60),
  espesor: num,
  ancho: num,
  largo: num,
  uEspesor: z.string().max(10),
  uAncho: z.string().max(10),
  uLargo: z.string().max(10),
  m3: num,
  pieTablar: num,
  piezas: z.coerce.number().int().min(0).max(1e6),
});
const grupoDelDia = z.object({
  clave: z.string().max(200),
  label: z.string().max(200),
  m3: num,
  pieTablar: num,
  piezas: z.coerce.number().int().min(0).max(1e6),
  medidas: z.array(medidaDelDia).max(200),
  m3Declarado: z.boolean().optional(),
});
const diaDelBloque = z.object({
  dia: z.coerce.number().int().min(1).max(366),
  piezas: z.coerce.number().int().min(0).max(1e6),
  pieTablar: num,
  m3: num,
  grupos: z.array(grupoDelDia).max(200),
});

/** GET `?distribucionId=&bloqueId=`. */
export const RecorridoQuery = z.object({
  distribucionId: id,
  bloqueId: id,
  /**
   * (fase 2, opcional) Lo que el bloque ampara en la distribución de la
   * pantalla (`BloqueDistribuido.usadoM3`). Sin él, el servidor usa la
   * capacidad del bloque: no tiene la cubicación para repartir.
   */
  usadoM3: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).max(1e7).optional()),
});

/** POST: ejecuta los pasos `ejecutable` desde `siguiente` hasta `hasta` (incluido), uno por transacción. */
export const RecorridoEjecutarBody = z.object({
  distribucionId: id,
  bloqueId: id,
  hasta: z.enum(["lote", "jornadas"]).optional(),
  /**
   * (fase 2, opcional) Los días del bloque tal como los reparte la pantalla
   * (`BloqueDistribuido.porDia`). El paso «jornadas» lo necesita: la
   * cubicación no se guarda en el servidor. Los totales NO se creen: cada día
   * pasa por las reglas de Declarar (paquetes que cuadran, tope del 56 %).
   */
  porDia: z.array(diaDelBloque).max(366).optional(),
  /** (fase 2, opcional) Igual que en el GET: lo que el bloque ampara en la pantalla, para el estado que devuelve. */
  usadoM3: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).max(1e7).optional()),
});

export type RecorridoEjecutar = z.infer<typeof RecorridoEjecutarBody>;

/** El primer paso que no está hecho ni «no aplica». */
export function siguientePaso(pasos: readonly PasoDelRecorrido[]): PasoRecorrido | null {
  for (const def of PASOS_RECORRIDO) {
    const p = pasos.find((x) => x.paso === def.id);
    if (!p || (p.estado !== "hecho" && p.estado !== "no_aplica")) return def.id;
  }
  return null;
}
