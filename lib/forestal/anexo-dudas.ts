/**
 * Las preguntas de «Guías sin registrar» (ADR-446, 26-10-2026): lo que el
 * sistema NO decide solo antes de pasar una guía a Despacho.
 *
 * Medido en Blas el 26-10: la guía 065 tenía DOS Anexos 04 distintos (el del
 * 04/10, 2082 piezas y 31,188 m³ de 11 especies; y el del 20/10, 589 piezas de
 * Tornillo, 16,985 m³) y la regla «vale el más reciente» escondía los 31 m³;
 * el del 20/10 estaba además guardado igual con la guía 066, así que la misma
 * madera contaba dos veces. Registrar la 065 marcaba para siempre el de 31 m³
 * como reemplazado. Por eso:
 *
 * - **Dos papeles** (`dos_papeles`): una guía sin registrar con ≥2 anexos vivos
 *   que llevan OTRAS especies, o uno de los cuales está también en otra guía.
 *   Se sugiere el que no está repetido; nunca se elige solo. Si sólo cambian
 *   piezas de las mismas especies (la 064: 251 → 256 piezas) es una
 *   corrección y vale el más reciente, como decidió Brandon (decisión 1).
 * - **Mismo papel** (`mismo_papel`): el mismo contenido (piezas, m³ y especies)
 *   en ≥2 guías. O es de una sola (se quita de la otra) o salió dos veces (se
 *   contesta y queda anotado).
 * - **Huecos del talonario** (decisión 9): números de la misma serie que
 *   faltan entre dos usados (en Blas, 059 y 061). Se pregunta si existen.
 *
 * Puro: la capa de datos lo aplica bajo el lock de la bandeja.
 */
import { anexoRegistrado, fechaCorta, type AnexoParaDespacho } from "./anexo-a-despacho";
import { fmtM3 } from "./cubicacion-formato";
import { claveNumeroGtf, tramosDe } from "./gtf-talonario";
import { claveEspecie } from "./loth-constants";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Respuestas guardadas: clave de la pregunta → lo que contestó el dueño. */
export type RespuestasDeRevision = Readonly<Record<string, string>>;

/** Lo que se puede contestar a cada pregunta (la ruta valida contra esto). */
export const RESPUESTAS_POR_TIPO = {
  papel: ["distintas"],
  hueco: ["no_salio", "falta_anexo"],
} as const;

export type TipoDePregunta = keyof typeof RESPUESTAS_POR_TIPO;

/** `papel:…` → `papel`; una clave que no es de ninguna pregunta → `null`. */
export function tipoDePregunta(clave: string): TipoDePregunta | null {
  const t = clave.split(":", 1)[0];
  return t === "papel" || t === "hueco" ? t : null;
}

/** El contenido del papel: piezas, m³ y m³ por especie (3 decimales, como se imprime). El N° no entra. */
export function firmaDelPapel(a: Pick<AnexoParaDespacho, "piezas" | "especieGlobal">): string {
  const porEspecie = new Map<string, number>();
  let piezas = 0;
  let total = 0;
  for (const p of a.piezas) {
    const e = claveEspecie((p.especie ?? a.especieGlobal ?? "").trim()) || "-";
    const m = Number(p.m3) || 0;
    porEspecie.set(e, (porEspecie.get(e) ?? 0) + m);
    piezas += Number(p.cantidad) || 0;
    total += m;
  }
  const especies = [...porEspecie]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([e, m]) => `${e}:${r3(m)}`)
    .join(",");
  return `${piezas}|${r3(total)}|${especies}`;
}

/** Las especies del papel, sin cantidades: dos papeles con las mismas son una corrección. */
function juegoDeEspecies(a: Pick<AnexoParaDespacho, "piezas" | "especieGlobal">): string {
  const s = new Set(a.piezas.map((p) => claveEspecie((p.especie ?? a.especieGlobal ?? "").trim()) || "-"));
  return [...s].sort().join(",");
}

/** «Tornillo 16,985 m³» o «11 especies»: lo que distingue un papel de otro a simple vista. */
function especiesDe(a: Pick<AnexoParaDespacho, "piezas" | "especieGlobal">): string {
  const por = new Map<string, { nombre: string; m3: number }>();
  for (const p of a.piezas) {
    const nombre = (p.especie ?? a.especieGlobal ?? "").trim() || "sin especie";
    const k = claveEspecie(nombre) || nombre;
    const x = por.get(k) ?? { nombre, m3: 0 };
    x.m3 += Number(p.m3) || 0;
    por.set(k, x);
  }
  const lista = [...por.values()].sort((x, y) => y.m3 - x.m3);
  if (lista.length > 2) return `${lista.length} especies`;
  return lista.map((x) => `${x.nombre} ${fmtM3(x.m3)} m³`).join(" · ");
}

export interface AnexoEnDuda {
  anexoId: string;
  numero: string;
  gtf: string;
  fecha: string;
  piezas: number;
  totalM3: number;
  especies: string;
  /** Otras guías que llevan el mismo papel. */
  tambienEn: string[];
}

export type AccionDeDuda =
  /** Vale ESE anexo para su guía: los demás vivos de la guía quedan reemplazados por él. */
  | { tipo: "elegir"; vale: string; descartar: string[] }
  /** El papel no es de esta guía: sus anexos quedan reemplazados por el de la otra. */
  | { tipo: "quitar"; anexoIds: string[]; por: string }
  /** Se contesta y queda anotado (salió dos veces). */
  | { tipo: "responder"; clave: string; valor: string };

export interface OpcionDeDuda {
  clave: string;
  etiqueta: string;
  sugerida: boolean;
  accion: AccionDeDuda;
}

export interface DudaDeAnexo {
  clave: string;
  tipo: "dos_papeles" | "mismo_papel";
  /** Las guías que no se registran mientras la duda siga (`claveNumeroGtf`). */
  guias: string[];
  /** Las mismas, como se escriben. */
  gtfs: string[];
  pregunta: string;
  /** Por qué se sugiere la opción marcada; `null` = no hay sugerencia. */
  porQue: string | null;
  anexos: AnexoEnDuda[];
  opciones: OpcionDeDuda[];
}

interface EstadoDeGuia {
  clave: string;
  gtf: string;
  registrado: AnexoParaDespacho | null;
  vivos: AnexoParaDespacho[];
}

const masNuevoPrimero = (x: AnexoParaDespacho, y: AnexoParaDespacho) => (y.createdAt ?? "").localeCompare(x.createdAt ?? "");

const totalDe = (a: Pick<AnexoParaDespacho, "piezas">) => a.piezas.reduce((s, p) => s + (Number(p.m3) || 0), 0);
const piezasDe = (a: Pick<AnexoParaDespacho, "piezas">) => a.piezas.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);

/** «Anexo N°2-19-0483758 del 04/10/2026». */
const etiqueta = (a: AnexoParaDespacho) => `Anexo ${a.numero || "s/n"} del ${fechaCorta(a.fecha)}`;

function enDuda(a: AnexoParaDespacho, tambienEn: string[]): AnexoEnDuda {
  return {
    anexoId: a.id,
    numero: a.numero,
    gtf: a.gtf,
    fecha: a.fecha,
    piezas: piezasDe(a),
    totalM3: r3(totalDe(a)),
    especies: especiesDe(a),
    tambienEn,
  };
}

/**
 * Las dudas de la bandeja. `respuestas` = lo ya contestado (una pregunta
 * contestada no vuelve; si cambia el conjunto de guías, es otra pregunta).
 */
export function dudasDeAnexos(
  anexos: readonly AnexoParaDespacho[],
  vigentes: ReadonlySet<string>,
  respuestas: RespuestasDeRevision = {},
): DudaDeAnexo[] {
  const porId = new Map(anexos.map((a) => [a.id, a]));
  const porGuia = new Map<string, AnexoParaDespacho[]>();
  for (const a of anexos) {
    const k = claveNumeroGtf(a.gtf);
    if (!k) continue;
    const lista = porGuia.get(k) ?? [];
    lista.push(a);
    porGuia.set(k, lista);
  }
  const estados: EstadoDeGuia[] = [...porGuia].map(([clave, misma]) => ({
    clave,
    gtf: misma[0].gtf,
    registrado: misma.find((b) => anexoRegistrado(b, vigentes)) ?? null,
    vivos: misma.filter((b) => !b.reemplazadoPor || !porId.has(b.reemplazadoPor)).sort(masNuevoPrimero),
  }));
  const firmas = new Map<string, string>();
  const firma = (a: AnexoParaDespacho) => {
    let f = firmas.get(a.id);
    if (f == null) firmas.set(a.id, (f = firmaDelPapel(a)));
    return f;
  };

  /* En qué guías aparece cada papel (sus vivos y el registrado). */
  const guiasDeFirma = new Map<string, Set<string>>();
  for (const e of estados) {
    for (const a of new Set([...e.vivos, ...(e.registrado ? [e.registrado] : [])])) {
      const s = guiasDeFirma.get(firma(a)) ?? new Set<string>();
      s.add(e.clave);
      guiasDeFirma.set(firma(a), s);
    }
  }
  const enOtraGuia = (a: AnexoParaDespacho, salvo: string) => [...(guiasDeFirma.get(firma(a)) ?? [])].some((g) => g !== salvo);

  /* Una guía con dos papeles de verdad distintos no tiene «su» papel hasta que el dueño elija. */
  const conDosPapeles = new Map<string, AnexoParaDespacho[]>();
  for (const e of estados) {
    if (e.registrado || e.vivos.length < 2) continue;
    const representantes = new Map<string, AnexoParaDespacho>();
    for (const v of e.vivos) if (!representantes.has(firma(v))) representantes.set(firma(v), v);
    if (representantes.size < 2) continue;
    const reps = [...representantes.values()];
    const otrasEspecies = new Set(reps.map(juegoDeEspecies)).size > 1;
    if (otrasEspecies || reps.some((r) => enOtraGuia(r, e.clave))) conDosPapeles.set(e.clave, reps);
  }

  /* El papel que vale para cada guía sin duda propia: el registrado o el vivo más nuevo. */
  const papelDe = new Map<string, { estado: EstadoDeGuia; anexo: AnexoParaDespacho }>();
  for (const e of estados) {
    if (conDosPapeles.has(e.clave)) continue;
    const anexo = e.registrado ?? e.vivos[0];
    if (anexo) papelDe.set(e.clave, { estado: e, anexo });
  }

  const dudas: DudaDeAnexo[] = [];
  for (const e of estados) {
    const reps = conDosPapeles.get(e.clave);
    if (!reps) continue;
    const conRepetido = reps.map((r) => ({
      r,
      tambienEn: estados.filter((x) => x.clave !== e.clave && guiasDeFirma.get(firma(r))?.has(x.clave)).map((x) => x.gtf),
    }));
    const unicos = conRepetido.filter((x) => x.tambienEn.length === 0);
    const sugerido = unicos.length === 1 ? unicos[0].r : reps[0];
    const repetido = conRepetido.find((x) => x.tambienEn.length > 0);
    dudas.push({
      clave: `guia:${e.clave}`,
      tipo: "dos_papeles",
      guias: [e.clave],
      gtfs: [e.gtf],
      pregunta: `La guía ${e.gtf} tiene ${reps.length} Anexos 04 distintos: ¿cuál viajó con ella?`,
      porQue:
        unicos.length === 1 && repetido
          ? `El otro es el mismo papel que el de la guía ${repetido.tambienEn.join(", ")}.`
          : "Es el más reciente; si viajó el otro, elígelo.",
      anexos: conRepetido.map((x) => enDuda(x.r, x.tambienEn)),
      opciones: reps.map((r) => ({
        clave: `vale:${r.id}`,
        etiqueta: `Viajó el ${etiqueta(r)}`,
        sugerida: r.id === sugerido.id,
        accion: { tipo: "elegir", vale: r.id, descartar: e.vivos.filter((v) => v.id !== r.id).map((v) => v.id) },
      })),
    });
  }

  /* El mismo papel en varias guías (entre las que ya tienen el suyo). */
  const porFirma = new Map<string, { estado: EstadoDeGuia; anexo: AnexoParaDespacho }[]>();
  for (const x of papelDe.values()) {
    const lista = porFirma.get(firma(x.anexo)) ?? [];
    lista.push(x);
    porFirma.set(firma(x.anexo), lista);
  }
  for (const [f, lista] of porFirma) {
    if (lista.length < 2) continue;
    const pendientes = lista.filter((x) => !x.estado.registrado);
    if (pendientes.length === 0) continue;
    const ordenadas = [...lista].sort((a, b) => a.estado.clave.localeCompare(b.estado.clave));
    const clave = `papel:${f}|${ordenadas.map((x) => x.estado.clave).join(",")}`;
    if (respuestas[clave] === "distintas") continue;
    const gtfs = ordenadas.map((x) => x.estado.gtf);
    const muestra = ordenadas[0].anexo;
    const opciones: OpcionDeDuda[] = pendientes.map((x) => {
      /* El que queda: el registrado si lo hay; si no, el de otra guía más nuevo. */
      const otro = lista.find((y) => y !== x && y.estado.registrado) ?? lista.filter((y) => y !== x).sort((a, b) => masNuevoPrimero(a.anexo, b.anexo))[0];
      return {
        clave: `quitar:${x.estado.clave}`,
        etiqueta: `No es de la ${x.estado.gtf}: es de la ${otro.estado.gtf}`,
        sugerida: false,
        accion: { tipo: "quitar", anexoIds: x.estado.vivos.map((v) => v.id), por: otro.anexo.id },
      };
    });
    opciones.push({
      clave: "distintas",
      etiqueta: "Salieron dos veces: son guías distintas",
      sugerida: false,
      accion: { tipo: "responder", clave, valor: "distintas" },
    });
    dudas.push({
      clave,
      tipo: "mismo_papel",
      guias: pendientes.map((x) => x.estado.clave),
      gtfs,
      pregunta: `El mismo Anexo 04 (${piezasDe(muestra)} piezas, ${fmtM3(totalDe(muestra))} m³) está en ${gtfs.length} guías: ${gtfs.join(", ")}. ¿Salió más de una vez?`,
      porQue: null,
      anexos: ordenadas.map((x) => enDuda(x.anexo, gtfs.filter((g) => g !== x.estado.gtf))),
      opciones,
    });
  }
  return dudas;
}

/** guía (`claveNumeroGtf`) → por qué no se registra todavía. Lo que la tanda pone como bloqueo. */
export function bloqueosPorDuda(dudas: readonly DudaDeAnexo[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of dudas) {
    for (const g of d.guias) {
      if (out.has(g)) continue;
      out.set(
        g,
        d.tipo === "dos_papeles"
          ? "Esta guía tiene dos Anexos 04 distintos: elige arriba cuál viajó con ella."
          : `Su Anexo 04 también está en la guía ${d.gtfs.filter((x) => claveNumeroGtf(x) !== g).join(", ")}: contesta arriba si salió dos veces.`,
      );
    }
  }
  return out;
}

// ── Huecos del talonario (decisión 9) ─────────────────────────────────────

/** Más de esto seguido sin usar ya no es una guía perdida: es otro tramo del talonario. */
export const HUECO_MAX = 5;

export interface HuecoDelTalonario {
  clave: string;
  numero: string;
  /** Los usados de cada lado, como se escribieron. */
  entre: [string, string];
  respuesta: string | null;
}

/**
 * Los números que faltan entre dos usados de la MISMA serie, dentro del tramo
 * de las guías sin registrar (en Blas, 059 y 061 entre la 054 y la 068).
 * `usados` = todo lo que gastó el talonario: despachos (también anulados) y
 * anexos. Un hueco de más de `HUECO_MAX` seguidos no se pregunta.
 */
export function huecosDelTalonario(
  usados: readonly string[],
  pendientes: readonly string[],
  respuestas: RespuestasDeRevision = {},
): HuecoDelTalonario[] {
  type Uso = { correlativo: number; digitos: number; escrito: string; prefijo: string };
  const porSerie = new Map<string, Map<number, Uso>>();
  const tramoPendiente = new Map<string, { min: number; max: number }>();
  const leer = (numero: string): { serie: string; uso: Uso } | null => {
    const t = tramosDe(numero);
    if (!t || t.length < 2) return null;
    const ult = t[t.length - 1];
    if (!/^\d+$/.test(ult)) return null;
    const prefijo = t.slice(0, -1).join("-");
    const serie = claveNumeroGtf(prefijo);
    const correlativo = Number(ult);
    if (!serie || !Number.isSafeInteger(correlativo) || correlativo <= 0) return null;
    return { serie, uso: { correlativo, digitos: ult.length, escrito: numero.trim(), prefijo } };
  };
  for (const n of [...usados, ...pendientes]) {
    const x = leer(n);
    if (!x) continue;
    const m = porSerie.get(x.serie) ?? new Map<number, Uso>();
    if (!m.has(x.uso.correlativo)) m.set(x.uso.correlativo, x.uso);
    porSerie.set(x.serie, m);
  }
  for (const n of pendientes) {
    const x = leer(n);
    if (!x) continue;
    const t = tramoPendiente.get(x.serie);
    tramoPendiente.set(x.serie, {
      min: Math.min(t?.min ?? Infinity, x.uso.correlativo),
      max: Math.max(t?.max ?? -Infinity, x.uso.correlativo),
    });
  }
  const huecos: HuecoDelTalonario[] = [];
  for (const [serie, m] of porSerie) {
    const tramo = tramoPendiente.get(serie);
    if (!tramo) continue;
    const orden = [...m.values()].sort((a, b) => a.correlativo - b.correlativo);
    for (let i = 1; i < orden.length; i++) {
      const a = orden[i - 1];
      const b = orden[i];
      const faltan = b.correlativo - a.correlativo - 1;
      if (faltan < 1 || faltan > HUECO_MAX) continue;
      for (let c = a.correlativo + 1; c < b.correlativo; c++) {
        if (c < tramo.min || c > tramo.max) continue;
        const clave = `hueco:${serie}-${c}`;
        huecos.push({
          clave,
          numero: `${b.prefijo}-${String(c).padStart(b.digitos, "0")}`,
          entre: [a.escrito, b.escrito],
          respuesta: respuestas[clave] ?? null,
        });
      }
    }
  }
  return huecos;
}
