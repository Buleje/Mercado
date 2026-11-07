/**
 * lib/caja/excepciones-del-turno.ts — lo raro del turno en UNA bandeja, con el
 * lugar donde se mira cada cosa (auditoría 15-10, M22).
 *
 * Antes cada rareza vivía en su sección y había que recorrerlas todas para
 * saber si el turno estaba limpio: el arqueo con diferencia en Cuadrar, los
 * Yape repetidos en Medios de pago (M29), un retiro sin detalle perdido entre
 * los movimientos y la caja de ayer cerrada sin contar en el Historial. La
 * bandeja sólo LISTA y lleva al origen: no corrige ni reescribe nada. Lo que
 * ya se ve en el Resumen (ventas que no pasaron por la caja, esperado
 * negativo, caja de varios días) no se repite.
 *
 * Asignar una excepción a alguien necesitaría guardar quién la tiene: DECIDE
 * BRANDON (ver reporte de la noche 17-10).
 *
 * PURO y client-safe.
 */
import { esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import { fechaCortaLima } from "@/lib/caja/caja-abierta";
import { diferenciaDeArqueo } from "@/lib/caja/constancia-cierre";
import { cobrosDigitalesParaRevisar, type MovimientoParaRevisar } from "@/lib/caja/cobros-para-revisar";

export type DestinoExcepcion = "movimientos" | "medios" | "cuadrar" | "caja";

export interface ExcepcionDelTurno {
  clave: string;
  texto: string;
  /** Por qué importa (va en la ⓘ). */
  detalle: string;
  ir: DestinoExcepcion;
  /** Para `ir: "caja"`: qué caja cerrada abrir. */
  cajaId?: string;
  /** Rojo: cambia la plata del cuadre. */
  grave: boolean;
}

export interface CajaCerradaParaRevisar {
  id: string;
  closedAt?: string | null;
  difference?: number | null;
  notes?: string | null;
}

/** Detalle que no dice nada: «Retiro», «egreso», vacío. */
const SIN_DETALLE = /^(retiro|egreso|salida|gasto|egreso manual|retiro de caja)?\.?$/i;

const DIAS_ATRAS = 7;
const DIA_MS = 86_400_000;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function excepcionesDelTurno(
  e: {
    ahora: Date;
    movimientos: ReadonlyArray<MovimientoParaRevisar>;
    /** Cajas cerradas (de cualquier fecha: se miran las de los últimos 7 días). */
    cerradas: ReadonlyArray<CajaCerradaParaRevisar>;
    tolerancia: number;
    /** Cierre a ciegas: sin montos de diferencia (delatan el esperado). */
    aCiegas?: boolean;
  },
  formato: (n: number) => string,
): ExcepcionDelTurno[] {
  const out: ExcepcionDelTurno[] = [];
  const ciego = e.aCiegas === true;
  const tope = Math.max(e.tolerancia, 0.01);

  const ultimoArqueo = [...e.movimientos].filter((m) => m.type === "arqueo").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const dif = diferenciaDeArqueo(ultimoArqueo?.description);
  if (!ciego && dif != null && Math.abs(dif) >= tope) {
    out.push({
      clave: "arqueo",
      texto: `El último arqueo dio ${dif > 0 ? "un sobrante" : "un faltante"} de ${formato(Math.abs(dif))}`,
      detalle: `Pasa la tolerancia de ${formato(e.tolerancia)}. Si no se aclara, el cierre va a mostrar la misma diferencia.`,
      ir: "cuadrar",
      grave: dif < 0,
    });
  }

  const repetidos = cobrosDigitalesParaRevisar(e.movimientos);
  if (repetidos.length > 0) {
    const medios = [...new Set(repetidos.map((r) => r.medio))].map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(", ");
    out.push({
      clave: "cobros-repetidos",
      texto: `${plural(repetidos.length, "cobro", "cobros")} por ${medios} ${repetidos.length === 1 ? "parece repetido" : "parecen repetidos"}`,
      detalle: "La misma venta entró dos veces, o un ingreso a mano igual se anotó dos veces en 30 minutos. El total puede cuadrar igual con la app si otro cobro falta.",
      ir: "medios",
      grave: true,
    });
  }

  const sinDetalle = e.movimientos.filter((m) => m.type === "egreso" && SIN_DETALLE.test((m.description ?? "").trim()));
  if (sinDetalle.length > 0) {
    out.push({
      clave: "retiros-sin-detalle",
      texto: `${plural(sinDetalle.length, "retiro", "retiros")} sin detalle (${formato(sinDetalle.reduce((s, m) => s + m.amount, 0))})`,
      detalle: "No dicen para qué salió la plata ni quién la recibió: al cerrar no hay cómo explicarlos.",
      ir: "movimientos",
      grave: false,
    });
  }

  const desde = e.ahora.getTime() - DIAS_ATRAS * DIA_MS;
  for (const c of e.cerradas) {
    const cerrada = c.closedAt ? Date.parse(c.closedAt) : NaN;
    if (!Number.isFinite(cerrada) || cerrada < desde) continue;
    const cuando = fechaCortaLima(c.closedAt as string);
    if (esCierreAutomatico(c.notes)) {
      out.push({
        clave: `sin-conteo:${c.id}`,
        texto: `La caja cerrada el ${cuando} no se contó`,
        detalle: "Se cerró sola (al cerrar el turno) sin conteo: nadie confirmó cuánto había en el cajón.",
        ir: "caja",
        cajaId: c.id,
        grave: false,
      });
      continue;
    }
    const d = Number(c.difference ?? 0);
    if (!ciego && Math.abs(d) >= tope && !(c.notes ?? "").trim()) {
      out.push({
        clave: `sin-explicar:${c.id}`,
        texto: `La caja cerrada el ${cuando} tuvo ${d < 0 ? "un faltante" : "un sobrante"} de ${formato(Math.abs(d))} sin explicar`,
        detalle: "Pasó la tolerancia y quien cerró no dejó nota.",
        ir: "caja",
        cajaId: c.id,
        grave: d < 0,
      });
    }
  }

  return out.sort((a, b) => Number(b.grave) - Number(a.grave));
}
