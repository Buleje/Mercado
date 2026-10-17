/**
 * Lo que leyó la cámara, cruzado contra los datos del negocio — PURO (sin
 * Prisma, sin fetch, sin React). ADR-456 §3-4.
 *
 * La lectura de la IA es texto suelto: «W2D-835», «chaleco 3», «la pila se ve
 * más baja». Esto lo convierte en PROPUESTAS que una persona puede confirmar:
 * esa placa es la del flete de hoy, ese chaleco es de Juan y marcó a las 07:58.
 * Nada de acá escribe en una guía ni en la asistencia (ADR-411: el sistema
 * propone, el que firma decide).
 *
 * Vive aparte de `camaras.ts` porque lo que se cruza (guías, fletes,
 * trabajadores) no es del modelo de la cámara; la parte que habla con la base
 * está en `cruces.server.ts` y la de la pila en `pila.ts`.
 */

import { formatDateShort, formatDateTimeShort, formatTime } from "@/lib/format";
import { esNocheEnLima } from "./camaras";
import type {
  Camara,
  Captura,
  ChalecosDelNegocio,
  CruceChaleco,
  CrucePlaca,
  LecturaPila,
  ResultadoCamaras,
} from "./camaras";

/* ────────────────────────────────────────────────────────────────────────────
 * Días de Lima
 * ──────────────────────────────────────────────────────────────────────────── */

const DIA_LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `AAAA-MM-DD` del día de Lima en que ocurrió un instante. `""` si no es fecha. */
export function diaLima(v: Date | string): string {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? DIA_LIMA.format(d) : "";
}

/**
 * El día de un registro del libro, sea fecha sola o instante.
 *
 * Las fechas «sin hora» del libro (guía, flete, asiento) se guardan a
 * medianoche UTC o —las más nuevas— a mediodía UTC: leerlas en hora de Lima
 * las corre al día anterior (medianoche UTC son las 19:00 del día previo). Un
 * instante de verdad (`createdAt`) sí se lee en Lima.
 */
export function diaDelRegistro(v: Date | string): string {
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  return esFechaSola(d) ? d.toISOString().slice(0, 10) : diaLima(d);
}

/** ¿Es una fecha sola (medianoche o mediodía UTC) y no un instante? */
function esFechaSola(v: Date | string): boolean {
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  if (!Number.isFinite(t)) return false;
  const resto = ((t % 86_400_000) + 86_400_000) % 86_400_000;
  return resto === 0 || resto === 43_200_000;
}

/** Suma (o resta) días a un `AAAA-MM-DD`, sin salir de UTC. */
export function sumarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** ¿`dia` cae dentro de `centro ± radio` días? Compara texto: `AAAA-MM-DD` ordena bien. */
export function dentroDeDias(dia: string, centro: string, radio: number): boolean {
  if (!dia || !centro) return false;
  return dia >= sumarDias(centro, -radio) && dia <= sumarDias(centro, radio);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Placas
 * ──────────────────────────────────────────────────────────────────────────── */

/** Mayúsculas, sin guion ni espacios: «w2d 835» → «W2D835». `""` si no hay nada. */
export function normalizarPlacaCruce(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Los caracteres que una cámara confunde entre sí: de noche, con barro o con
 * la placa de costado, un 0 y una O son el mismo dibujo. Fuera de estos grupos
 * una diferencia es otra placa, no una mala lectura.
 */
const GRUPOS_CONFUNDIBLES = ["0ODQ", "1IL", "8B", "5S", "2Z", "6G"] as const;
const GRUPO_DE = new Map<string, number>(
  GRUPOS_CONFUNDIBLES.flatMap((g, i) => [...g].map((ch) => [ch, i] as const)),
);

/** ¿La cámara puede haber leído `a` donde dice `b`? */
export function sonConfundibles(a: string, b: string): boolean {
  if (a === b) return true;
  const ga = GRUPO_DE.get(a);
  return ga !== undefined && ga === GRUPO_DE.get(b);
}

/**
 * El dígito que la cámara pudo haber leído como letra («B» → «8», «O» → «0»),
 * del mismo grupo de confundibles. `null` si la letra no se confunde con un
 * dígito. Un dígito se devuelve tal cual.
 */
export function comoDigito(ch: string): string | null {
  if (/^\d$/.test(ch)) return ch;
  const grupo = GRUPO_DE.get(ch);
  return grupo === undefined ? null : GRUPOS_CONFUNDIBLES[grupo][0];
}

/** Una placa más corta que esto no se cruza: con 4 caracteres, coincide cualquier cosa. */
const LARGO_MINIMO_PLACA = 5;

/**
 * ¿La placa leída es la registrada?
 *
 * `exacta` = los mismos caracteres. `parecida` = el mismo largo y UNA sola
 * diferencia, entre caracteres confundibles. Dos diferencias ya no se ofrecen:
 * con el patio lleno de camiones, «se parece en casi todo» acusa al camión
 * equivocado.
 */
export function compararPlacas(leida: unknown, registrada: unknown): CrucePlaca["coincidencia"] | null {
  const a = normalizarPlacaCruce(leida);
  const b = normalizarPlacaCruce(registrada);
  if (a.length < LARGO_MINIMO_PLACA || a.length !== b.length) return null;
  if (a === b) return "exacta";
  let diferencias = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!sonConfundibles(a[i], b[i])) return null;
    diferencias += 1;
    if (diferencias > 1) return null;
  }
  return "parecida";
}

/** Un registro del negocio que lleva placa: guía, flete o vehículo del directorio. */
export interface CandidatoPlaca {
  tipo: CrucePlaca["tipo"];
  refId: string;
  placa: string;
  etiqueta: string;
}

export const MAX_CRUCES_POR_PLACA = 3;
const ORDEN_TIPO: Record<CrucePlaca["tipo"], number> = { gtf: 0, flete: 1, vehiculo: 2 };

/**
 * Las coincidencias de una placa leída, mejores primero: exacta antes que
 * parecida y, a igual coincidencia, guía antes que flete antes que vehículo (la
 * guía es el documento; el vehículo sólo dice de quién es el camión). Dentro de
 * eso se respeta el orden en que llegaron los candidatos (el más nuevo primero).
 */
export function cruzarPlaca(
  placaLeida: string | null | undefined,
  candidatos: readonly CandidatoPlaca[],
  max: number = MAX_CRUCES_POR_PLACA,
): CrucePlaca[] {
  const leida = normalizarPlacaCruce(placaLeida);
  if (leida.length < LARGO_MINIMO_PLACA) return [];
  const mejores = new Map<string, { cruce: CrucePlaca; orden: number }>();
  candidatos.forEach((c, orden) => {
    const coincidencia = compararPlacas(leida, c.placa);
    if (!coincidencia) return;
    /* El mismo registro puede entrar dos veces (la placa del camión y la del
       remolque): queda la mejor coincidencia. */
    const clave = `${c.tipo}:${c.refId}`;
    const previa = mejores.get(clave);
    if (previa && (previa.cruce.coincidencia === "exacta" || coincidencia === "parecida")) return;
    mejores.set(clave, {
      orden: previa?.orden ?? orden,
      cruce: { placa: leida, tipo: c.tipo, refId: c.refId, etiqueta: c.etiqueta, coincidencia },
    });
  });
  return [...mejores.values()]
    .sort(
      (x, y) =>
        Number(x.cruce.coincidencia === "parecida") - Number(y.cruce.coincidencia === "parecida") ||
        ORDEN_TIPO[x.cruce.tipo] - ORDEN_TIPO[y.cruce.tipo] ||
        x.orden - y.orden,
    )
    .slice(0, Math.max(0, max))
    .map((m) => m.cruce);
}

/** «29 set.» de un registro: la fecha sola se lee en UTC para que no retroceda un día. */
export function fechaCortaDelRegistro(v: Date | string | null | undefined): string {
  if (!v) return "";
  return formatDateShort(v, { soloFecha: esFechaSola(v) });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Chalecos
 * ──────────────────────────────────────────────────────────────────────────── */

/** Un número de chaleco no pasa de esto: «12», «A3», «105». */
const LARGO_MAXIMO_CHALECO = 4;
/** Números que se leen en UNA foto: más que esto es la IA contando otra cosa. */
const MAX_CHALECOS_POR_FOTO = 10;
/** Números asignados en un negocio. */
export const MAX_CHALECOS = 300;

/**
 * El número como se guarda: mayúsculas, sin espacios, sin ceros a la izquierda
 * («03» y «3» son el mismo chaleco). Tiene que tener al menos un dígito: «AB»
 * es una sigla de la empresa, no un número de persona.
 */
export function normalizarChaleco(v: unknown): string | null {
  let s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s || s.length > LARGO_MAXIMO_CHALECO || !/\d/.test(s)) return null;
  if (/^\d+$/.test(s)) s = String(Number(s));
  return s;
}

/** La lista de una foto: normalizada, sin repetidos y con techo. */
export function normalizarChalecos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string" && typeof x !== "number") continue;
    const n = normalizarChaleco(x);
    if (n) vistos.add(n);
    if (vistos.size >= MAX_CHALECOS_POR_FOTO) break;
  }
  return [...vistos];
}

/** Lo que haya en el KV, limpio: número válido → id de texto. Lo demás se ignora. */
export function chalecosDe(raw: unknown): ChalecosDelNegocio {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ChalecosDelNegocio = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = normalizarChaleco(k);
    if (n && typeof v === "string" && v.trim()) out[n] = v.trim();
  }
  return out;
}

/** Minutos desde las 00:00 de Lima → «07:58». `null` si no hay hora. */
export function horaDeMinutos(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min) || min < 0 || min >= 24 * 60) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** La marca de asistencia de un día, como la deja RRHH. */
export interface AsistenciaDelDia {
  estado: string;
  entradaMin: number | null;
  salidaMin: number | null;
}

/**
 * Cada número leído, con su dueño y lo que dice la asistencia de ese día.
 *
 * Un número sin asignar se devuelve igual (con `colaboradorId: null`): es lo
 * que le dice a la pantalla «el chaleco 7 apareció y no es de nadie», que es
 * justo el que hay que asignar.
 */
export function cruzarChalecos(
  numeros: readonly string[],
  mapa: ChalecosDelNegocio,
  nombres: ReadonlyMap<string, string>,
  asistencias: ReadonlyMap<string, AsistenciaDelDia>,
): CruceChaleco[] {
  return normalizarChalecos(numeros).map((numero) => {
    const colaboradorId = mapa[numero] ?? null;
    if (!colaboradorId) return { numero, colaboradorId: null, nombre: null };
    const a = asistencias.get(colaboradorId);
    return {
      numero,
      colaboradorId,
      nombre: nombres.get(colaboradorId) ?? null,
      asistencia: a ? { estado: a.estado, entrada: horaDeMinutos(a.entradaMin), salida: horaDeMinutos(a.salidaMin) } : null,
    };
  });
}

export type ResultadoChalecos =
  | { ok: true; chalecos: ChalecosDelNegocio; mensaje: string }
  | { ok: false; motivo: string };

/**
 * Asigna un número a una persona, o lo libera (`colaboradorId: null`).
 *
 * UN número por persona: el chaleco y el casco llevan el mismo, y cuando se
 * cambia de chaleco el número viejo tiene que quedar libre — si no, la cámara
 * seguiría diciendo que el «3» es de alguien que hoy usa el «7». Si el número
 * era de otra persona, pasa al nuevo dueño y el mensaje lo dice.
 */
export function asignarChaleco(
  mapa: ChalecosDelNegocio,
  numeroBruto: string,
  colaboradorId: string | null,
  nombreDe: (id: string) => string | null,
): ResultadoChalecos {
  const numero = normalizarChaleco(numeroBruto);
  if (!numero) {
    return { ok: false, motivo: "El número del chaleco tiene que ser corto: de 1 a 4 letras o dígitos, con al menos un número (por ejemplo 3 o 12)." };
  }
  const anterior = mapa[numero] ?? null;
  if (!colaboradorId) {
    if (!anterior) return { ok: false, motivo: `El chaleco N° ${numero} no estaba asignado a nadie.` };
    const resto: ChalecosDelNegocio = { ...mapa };
    delete resto[numero];
    return { ok: true, chalecos: resto, mensaje: `El chaleco N° ${numero} quedó libre.` };
  }
  const nombre = nombreDe(colaboradorId) ?? "esa persona";
  if (anterior === colaboradorId) {
    return { ok: true, chalecos: { ...mapa }, mensaje: `El chaleco N° ${numero} ya era de ${nombre}.` };
  }
  const liberados = Object.keys(mapa).filter((k) => mapa[k] === colaboradorId && k !== numero);
  const nuevo: ChalecosDelNegocio = {};
  for (const [k, v] of Object.entries(mapa)) if (!liberados.includes(k)) nuevo[k] = v;
  if (!anterior && Object.keys(nuevo).length >= MAX_CHALECOS) {
    return { ok: false, motivo: `Ya hay ${MAX_CHALECOS} chalecos asignados.` };
  }
  nuevo[numero] = colaboradorId;
  const antes = anterior ? ` Antes era de ${nombreDe(anterior) ?? "otra persona"}.` : "";
  const libres = liberados.length
    ? ` ${liberados.length === 1 ? "Su número anterior" : "Sus números anteriores"} (${liberados.join(", ")}) ${liberados.length === 1 ? "quedó libre" : "quedaron libres"}.`
    : "";
  return { ok: true, chalecos: nuevo, mensaje: `El chaleco N° ${numero} es de ${nombre}.${antes}${libres}` };
}

/** El mapa como lo ve la pantalla: número → quién, con el nombre ya puesto. */
export function chalecosParaPantalla(
  mapa: ChalecosDelNegocio,
  nombres: ReadonlyMap<string, string>,
): Record<string, { colaboradorId: string; nombre: string | null }> {
  const out: Record<string, { colaboradorId: string; nombre: string | null }> = {};
  for (const [numero, colaboradorId] of Object.entries(mapa)) {
    out[numero] = { colaboradorId, nombre: nombres.get(colaboradorId) ?? null };
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Confirmar un cruce y guardar el análisis
 * ──────────────────────────────────────────────────────────────────────────── */

export type ResultadoConfirmar =
  | { ok: true; capturas: Captura[]; captura: Captura; mensaje: string; cambio: boolean }
  | { ok: false; motivo: string };

/**
 * Una persona dice «sí, esa placa es la de esa guía». Se marca EN LA CAPTURA:
 * quién y cuándo. La guía, el flete y el vehículo no se tocan.
 */
export function confirmarCruce(
  capturas: readonly Captura[],
  capturaId: string,
  refId: string,
  usuario: string,
  ahoraIso: string,
): ResultadoConfirmar {
  const captura = capturas.find((c) => c.id === capturaId);
  if (!captura) return { ok: false, motivo: "Esa foto ya no está en el historial." };
  const cruce = captura.cruces?.placas.find((p) => p.refId === refId);
  if (!cruce || !captura.cruces) return { ok: false, motivo: "Esa coincidencia ya no está en la foto." };
  if (cruce.confirmadoEn) {
    return {
      ok: true,
      capturas: [...capturas],
      captura,
      cambio: false,
      mensaje: `Ya estaba confirmada${cruce.confirmadoPor ? ` por ${cruce.confirmadoPor}` : ""}.`,
    };
  }
  const nueva: Captura = {
    ...captura,
    cruces: {
      ...captura.cruces,
      placas: captura.cruces.placas.map((p) =>
        p.refId === refId ? { ...p, confirmadoPor: usuario, confirmadoEn: ahoraIso } : p,
      ),
    },
  };
  return {
    ok: true,
    capturas: capturas.map((c) => (c.id === capturaId ? nueva : c)),
    captura: nueva,
    cambio: true,
    mensaje: `Confirmado: la placa ${cruce.placa} es ${cruce.etiqueta}.`,
  };
}

/** Lo que el análisis le agrega a una foto, en UN solo cambio. */
export interface AnalisisDeCaptura {
  lectura: Captura["lectura"];
  cruces: Captura["cruces"];
  pila: Captura["pila"];
}

/**
 * Pone lectura, cruces y pila en la foto. `null` si la foto ya no está (se
 * borró o se cayó del tope mientras la IA leía): no se resucita.
 */
export function aplicarAnalisis(
  capturas: readonly Captura[],
  capturaId: string,
  analisis: AnalisisDeCaptura,
): Captura[] | null {
  let tocada = false;
  const next = capturas.map((c) => {
    if (c.id !== capturaId) return c;
    tocada = true;
    return {
      ...c,
      lectura: analisis.lectura ?? null,
      cruces: analisis.cruces ?? null,
      pila: analisis.pila ?? null,
    };
  });
  return tocada ? next : null;
}

/** Marca o desmarca la cámara como vigía de la pila de trozas. */
export function configurarVigilaPila(camaras: readonly Camara[], id: string, activa: boolean): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, vigilaPila: activa } : c)),
    mensaje: activa
      ? `«${camara.nombre}» vigila la pila: cada foto se compara con la de al menos ${MINUTOS_MINIMOS_PILA} minutos antes.`
      : `«${camara.nombre}» ya no vigila la pila.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pila de trozas
 * ──────────────────────────────────────────────────────────────────────────── */

/** Contra qué foto se compara: una de al menos esto antes. Con menos, la pila no tuvo tiempo de cambiar. */
export const MINUTOS_MINIMOS_PILA = 30;
/** Entre dos avisos de pila de la misma cámara. */
export const HORAS_ENTRE_AVISOS_PILA = 3;

/**
 * ¿Ya se comparó la pila de esta cámara en los últimos 30 minutos? Una
 * intrusión manda 3-4 fotos en segundos y cada comparación son dos imágenes al
 * modelo (~US$ 0,015): la pila no cambia entre esas fotos, la cuenta sí.
 */
export function comparadaHacePoco(
  historial: readonly Pick<Captura, "id" | "camaraId" | "at" | "pila">[],
  camaraId: string,
  captura: Pick<Captura, "id" | "at">,
  minutos = 30,
): boolean {
  const ahora = Date.parse(captura.at);
  return historial.some((c) => {
    if (c.id === captura.id || c.camaraId !== camaraId || !c.pila) return false;
    const diferencia = ahora - Date.parse(c.at);
    return diferencia >= 0 && diferencia < minutos * 60_000;
  });
}

/**
 * La foto anterior de la MISMA cámara contra la que tiene sentido comparar: la
 * más reciente que tenga al menos `MINUTOS_MINIMOS_PILA` de diferencia. Una
 * subida a mano no sirve: es otro encuadre, desde otro lugar.
 */
export function anteriorParaPila(
  capturas: readonly Captura[],
  camaraId: string,
  nueva: Pick<Captura, "id" | "at">,
  minutos: number = MINUTOS_MINIMOS_PILA,
): Captura | null {
  const tope = Date.parse(nueva.at) - minutos * 60_000;
  if (!Number.isFinite(tope)) return null;
  let mejor: Captura | null = null;
  let mejorT = -Infinity;
  for (const c of capturas) {
    if (c.camaraId !== camaraId || c.id === nueva.id || c.evento === "manual") continue;
    const t = Date.parse(c.at);
    if (!Number.isFinite(t) || t > tope || t <= mejorT) continue;
    mejor = c;
    mejorT = t;
  }
  return mejor;
}

/** ¿Lo que vio la IA merece mirar el libro? Sólo «bajó» con confianza media o alta. */
export function pilaBajoDeVerdad(p: Pick<LecturaPila, "cambio" | "confianza">): boolean {
  return p.cambio === "bajo" && p.confianza !== "baja";
}

/**
 * ¿Le toca a esta foto comparar la pila? Sí si nadie reservó una comparación
 * de esta cámara en los últimos `MINUTOS_MINIMOS_PILA` (por la hora de la
 * FOTO, no la del reloj: la ráfaga trae fotos de segundos de diferencia).
 */
export function puedeCompararPila(previoIso: string | null | undefined, atIso: string): boolean {
  if (!previoIso) return true;
  const diferencia = Math.abs(Date.parse(atIso) - Date.parse(previoIso));
  return !Number.isFinite(diferencia) || diferencia >= MINUTOS_MINIMOS_PILA * 60_000;
}

/** La noche más larga del patio: de 19:00 a 06:00. */
const HORAS_DE_NOCHE = 11;

/**
 * ¿La bajada pasó de NOCHE, con el patio sin nadie?
 *
 * Sólo eso dispara el WhatsApp en el acto. De día la sierra baja la pila todos
 * los días, y el libro no sirve para saberlo a tiempo: en Blas, 44 de 48
 * asientos de producción se cargaron DÍAS después de su fecha (mediana 13). Que
 * «no hay producción anotada» a las 11:00 casi nunca quiere decir «no hubo
 * sierra».
 *
 * Las DOS fotos tienen que ser de la misma noche: una anterior de las 18:30 y
 * una nueva de las 19:30 dejan media hora de día en el medio (la sierra pudo
 * trabajar ahí), y dos fotos de noches distintas tienen un día entero.
 */
export function bajadaDeNoche(anteriorAt: string, nuevaAt: string): boolean {
  const a = Date.parse(anteriorAt);
  const b = Date.parse(nuevaAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return false;
  return esNocheEnLima(anteriorAt) && esNocheEnLima(nuevaAt) && b - a <= HORAS_DE_NOCHE * 3_600_000;
}

/** ¿Pasó el tiempo mínimo desde el último aviso de pila de esta cámara? */
export function puedeAvisarPila(ultimoIso: string | null | undefined, ahora: Date): boolean {
  if (!ultimoIso) return true;
  const hace = ahora.getTime() - Date.parse(ultimoIso);
  return !Number.isFinite(hace) || hace >= HORAS_ENTRE_AVISOS_PILA * 3_600_000 || hace < 0;
}

/**
 * Los días que cubre la comparación: del de la foto anterior al de la nueva.
 * Si la anterior es de ayer a las 17:00 y la nueva de hoy a las 07:00, un
 * despacho anotado ayer también explica que la pila esté más baja.
 */
export function diasDeLaComparacion(anteriorAt: string, nuevaAt: string): { desde: string; hasta: string } {
  const a = diaLima(anteriorAt);
  const b = diaLima(nuevaAt);
  return a && b && a <= b ? { desde: a, hasta: b } : { desde: b || a, hasta: b || a };
}

/**
 * ¿Qué movimiento anotó el libro en esos días?
 *
 * La pila de trozas baja por dos caminos legítimos: un despacho (salen trozas)
 * y la sierra (se aserrían). En Blas, en los 60 días al 01-10-2026, hubo
 * producción anotada en 14 días y despacho en ninguno: avisar «bajó sin
 * despacho» sin mirar la producción sería un WhatsApp falso cada día de sierra.
 */
export function movimientosEnDias(
  asientos: readonly { section: string; entryDate: Date | string }[],
  desde: string,
  hasta: string,
): { despacho: boolean; produccion: boolean } {
  let despacho = false;
  let produccion = false;
  for (const a of asientos) {
    const dia = diaDelRegistro(a.entryDate);
    if (!dia || dia < desde || dia > hasta) continue;
    if (a.section === "despacho") despacho = true;
    else if (a.section === "produccion") produccion = true;
  }
  return { despacho, produccion };
}

/** El número al que avisa la pila: el mismo de los avisos de la cámara, salvo «nunca». */
export function numeroParaAvisoPila(camara: Pick<Camara, "activa" | "avisos">): string | null {
  const a = camara.avisos;
  if (!camara.activa || !a?.whatsapp || a.cuando === "nunca") return null;
  return a.whatsapp;
}

/** El WhatsApp de la pila: qué cámara, desde cuándo y dónde ver las dos fotos. */
export function textoAvisoPila(
  camara: Pick<Camara, "nombre" | "lugar">,
  anteriorAt: string,
  ahora: Date,
  enlace: string,
): string {
  const lugar = camara.lugar ? ` (${camara.lugar})` : "";
  /* Si la foto anterior es de otro día, «a las 17:00» sola no dice de cuándo. */
  const antes = diaLima(anteriorAt) === diaLima(ahora) ? `a las ${formatTime(anteriorAt)}` : `el ${formatDateTimeShort(anteriorAt)}`;
  return (
    `📷 ${camara.nombre}${lugar} · ${formatTime(ahora)}\n` +
    `De noche, la pila de trozas se ve más baja que ${antes} y no hay despacho ni producción anotados.\n` +
    `Compara las dos fotos: ${enlace}`
  );
}
