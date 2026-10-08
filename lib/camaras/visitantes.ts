/**
 * «Visitante A, B…» del día y el conteo de personas distintas (ADR-479,
 * contrato K3 (c), 2026-10-08). Puro, determinista y client-safe.
 *
 * Entrada: las fotos del detector de UN día con sus cajas (la firma de la
 * ropa y el chaleco los calculó el servidor al guardar: `apariencia.ts`).
 * Salida: grupos de cajas que probablemente son la misma persona.
 *
 * Reglas:
 *   - Orden por hora (y por id de foto y número de caja): el mismo día da
 *     siempre las mismas letras, venga como venga la lista.
 *   - Cada caja se une al grupo más parecido si la distancia de la ropa es
 *     ≤ umbral, en promedio contra las ÚLTIMAS fotos del grupo (la luz cambia
 *     en el día). Nunca con un grupo que ya tiene otra caja de la MISMA foto: dos
 *     personas en el mismo cuadro no son la misma.
 *   - Con chaleco → «Personal 1, 2…»; sin chaleco → «Visitante A, B…». Nunca
 *     se cruzan. Un marcador leído en el chaleco (fase 5) manda sobre la ropa,
 *     pero sólo si es un chaleco REGISTRADO (`chalecosRegistrados`; hoy
 *     ninguno): el número lo manda el cliente y no se le cree a ciegas.
 *   - Sin firma (caja chica, < 40 px) → «sin agrupar»: se cuenta aparte.
 *   - Nada de esto se guarda: «Visitante A» vale sólo para ese día y se arma
 *     cada vez que se lee. Las cifras van con «aprox.».
 */

import {
  SIN_CHALECOS_REGISTRADOS,
  UMBRAL_MISMA_ROPA,
  distanciaFirmas,
  marcadorDeChaleco,
  type CajaGuardada,
} from "./apariencia";

export interface FotoConCajas {
  docId: string;
  /** Instante ISO. */
  at: string;
  camaraId: string | null;
  camaraNombre: string;
  /** `null` = foto de antes del 08-10 (no guardaba dónde estaba cada persona). */
  cajas: readonly CajaGuardada[] | null;
}

export interface FotoDeGrupo {
  docId: string;
  at: string;
  camaraId: string | null;
  /** Índice de la caja dentro de la foto. */
  caja: number;
}

export interface RecuadroPortada {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface GrupoPersonas {
  /**
   * Identifica al grupo dentro del día: la primera foto y caja donde aparece
   * («<docId>#<caja>»). Las fotos que llegan después no la cambian; la letra
   * sí puede correrse (si se borra una foto de antes), por eso la UI elige por
   * esto y no por la etiqueta.
   */
  clave: string;
  /** «Visitante A», «Personal 1», «Personal · marcador 203». */
  etiqueta: string;
  tipo: "visitante" | "personal";
  /** Por el marcador del chaleco (fase 5); `null` mientras no se lea. */
  colaboradorId: string | null;
  marcador: number | null;
  fotos: FotoDeGrupo[];
  desde: string;
  hasta: string;
  /** Nombres de las cámaras donde se lo vio, en orden de aparición. */
  camaras: string[];
  /** La foto donde se lo ve más grande: la «portada» de la carpeta del visitante. */
  portada: { docId: string; caja: RecuadroPortada };
}

export interface PersonasPorHoraUnicas {
  hora: number;
  /** Grupos distintos vistos en esa hora. */
  personas: number;
  conChaleco: number;
  /** Apariciones sin firma en esa hora (lejos de la cámara). */
  sinAgrupar: number;
}

export interface ResumenPersonasDia {
  dia: string;
  /** Grupos distintos (visitantes + personal). */
  personas: number;
  conChaleco: number;
  visitantes: number;
  grupos: GrupoPersonas[];
  /** Apariciones sin firma (persona muy chica en el cuadro): no se adivinan. */
  sinAgrupar: number;
  /** Fotos guardadas sin cajas (de antes del 08-10): no entran en el conteo. */
  fotosSinCajas: number;
  /** Fotos del día que sí entraron. */
  fotosConCajas: number;
  porHora: PersonasPorHoraUnicas[];
  /** El conteo es una estimación por la ropa: siempre «aprox.». */
  aprox: true;
}

/**
 * Una caja nueva se compara con el PROMEDIO de distancias a las últimas 5 del
 * grupo. Con las fotos de Blas del 08-10 (26 cajas con firma, etiquetadas a
 * ojo): promedio de 5 a 0,30 → 11 grupos para 11 personas/objetos reales,
 * precisión 0,86 y cobertura 0,70 de los pares; el mínimo de 3 juntaba a dos
 * personas distintas (precisión 0,52).
 */
const ULTIMAS_DEL_GRUPO = 5;

const fmtHoraLima = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hourCycle: "h23", hour: "2-digit" });
const horaLima = (ms: number) => Number(fmtHoraLima.format(new Date(ms)));

/** A, B … Z, AA, AB … */
export function letraDeVisitante(n: number): string {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

interface Aparicion {
  docId: string;
  ms: number;
  at: string;
  camaraId: string | null;
  camaraNombre: string;
  caja: number;
  firma: string | null;
  chaleco: boolean;
  marcador: number | null;
  recuadro: RecuadroPortada;
}

interface GrupoEnArmado {
  tipo: "visitante" | "personal";
  marcador: number | null;
  miembros: Aparicion[];
  docs: Set<string>;
}

export function agruparPersonasDelDia(
  dia: string,
  fotos: readonly FotoConCajas[],
  umbral: number = UMBRAL_MISMA_ROPA,
  chalecosRegistrados: ReadonlySet<number> = SIN_CHALECOS_REGISTRADOS,
): ResumenPersonasDia {
  let fotosSinCajas = 0;
  let fotosConCajas = 0;
  const apariciones: Aparicion[] = [];
  for (const f of fotos) {
    const ms = Date.parse(f.at);
    if (!f.cajas || !Number.isFinite(ms)) {
      fotosSinCajas++;
      continue;
    }
    fotosConCajas++;
    f.cajas.forEach((c, i) =>
      apariciones.push({
        docId: f.docId,
        ms,
        at: new Date(ms).toISOString(),
        camaraId: f.camaraId,
        camaraNombre: f.camaraNombre,
        caja: i,
        firma: c.firma,
        chaleco: c.chaleco === true,
        marcador: marcadorDeChaleco(c.marcador, chalecosRegistrados),
        recuadro: { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto },
      }),
    );
  }
  apariciones.sort((a, b) => a.ms - b.ms || a.docId.localeCompare(b.docId) || a.caja - b.caja);

  const grupos: GrupoEnArmado[] = [];
  const sueltas: Aparicion[] = [];
  for (const a of apariciones) {
    if (a.marcador !== null) {
      const g = grupos.find((x) => x.marcador === a.marcador);
      if (g) sumar(g, a);
      else grupos.push(nuevo("personal", a.marcador, a));
      continue;
    }
    if (!a.firma) {
      sueltas.push(a);
      continue;
    }
    const tipo = a.chaleco ? "personal" : "visitante";
    let mejor: GrupoEnArmado | null = null;
    let mejorD = Infinity;
    for (const g of grupos) {
      if (g.tipo !== tipo || g.marcador !== null || g.docs.has(a.docId)) continue;
      const ultimas = g.miembros.slice(-ULTIMAS_DEL_GRUPO);
      const d = ultimas.reduce((s, m) => s + (m.firma ? distanciaFirmas(m.firma, a.firma!) : 1), 0) / ultimas.length;
      if (d < mejorD) {
        mejorD = d;
        mejor = g;
      }
    }
    if (mejor && mejorD <= umbral) sumar(mejor, a);
    else grupos.push(nuevo(tipo, null, a));
  }

  let nVisitante = 0;
  let nPersonal = 0;
  const salida: GrupoPersonas[] = grupos.map((g) => {
    const etiqueta =
      g.marcador !== null
        ? `Personal · marcador ${g.marcador}`
        : g.tipo === "personal"
          ? `Personal ${++nPersonal}`
          : `Visitante ${letraDeVisitante(nVisitante++)}`;
    const portada = g.miembros.reduce((m, x) => (x.recuadro.ancho * x.recuadro.alto > m.recuadro.ancho * m.recuadro.alto ? x : m));
    const camaras: string[] = [];
    for (const m of g.miembros) if (!camaras.includes(m.camaraNombre)) camaras.push(m.camaraNombre);
    return {
      clave: `${g.miembros[0].docId}#${g.miembros[0].caja}`,
      etiqueta,
      tipo: g.tipo,
      colaboradorId: null,
      marcador: g.marcador,
      fotos: g.miembros.map((m) => ({ docId: m.docId, at: m.at, camaraId: m.camaraId, caja: m.caja })),
      desde: g.miembros[0].at,
      hasta: g.miembros[g.miembros.length - 1].at,
      camaras,
      portada: { docId: portada.docId, caja: portada.recuadro },
    };
  });

  const horas = new Map<number, { grupos: Set<number>; chaleco: Set<number>; sinAgrupar: number }>();
  const hora = (h: number) => {
    const fila = horas.get(h) ?? { grupos: new Set<number>(), chaleco: new Set<number>(), sinAgrupar: 0 };
    horas.set(h, fila);
    return fila;
  };
  grupos.forEach((g, i) => {
    for (const m of g.miembros) {
      const fila = hora(horaLima(m.ms));
      fila.grupos.add(i);
      if (g.tipo === "personal") fila.chaleco.add(i);
    }
  });
  for (const s of sueltas) hora(horaLima(s.ms)).sinAgrupar++;

  const conChaleco = salida.filter((g) => g.tipo === "personal").length;
  return {
    dia,
    personas: salida.length,
    conChaleco,
    visitantes: salida.length - conChaleco,
    grupos: salida,
    sinAgrupar: sueltas.length,
    fotosSinCajas,
    fotosConCajas,
    porHora: [...horas.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([h, f]) => ({ hora: h, personas: f.grupos.size, conChaleco: f.chaleco.size, sinAgrupar: f.sinAgrupar })),
    aprox: true,
  };
}

function nuevo(tipo: GrupoEnArmado["tipo"], marcador: number | null, a: Aparicion): GrupoEnArmado {
  return { tipo, marcador, miembros: [a], docs: new Set([a.docId]) };
}

function sumar(g: GrupoEnArmado, a: Aparicion): void {
  g.miembros.push(a);
  g.docs.add(a.docId);
}

/** Lo que contesta `GET /api/admin/camaras/personas/resumen`. */
export type RespuestaResumenPersonas = ResumenPersonasDia & { ok: true; truncado?: boolean };
