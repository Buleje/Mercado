/**
 * De los códigos escritos al cubicar a una PROPUESTA de vinculación (ADR-408).
 *
 * El hueco medido en Blas (2026-09-15): **0 de 14** corridas de producción
 * tienen trozas atribuidas y en el patio quedan **160 trozas / 197,646 m³** sin
 * consumir. El libro muestra producción declarada que no dice de qué madera
 * salió, y el patio nunca baja. Mientras tanto, quien cubica YA escribe el
 * código de la troza en cada pieza (`codigo-de-troza.ts`) — ese dato existe y
 * no se estaba usando para nada.
 *
 * ## Lo que esto hace, y lo que NO hace
 *
 * Esto **pre-arma**: junta los códigos escritos, busca sus trozas, dice de qué
 * guía y de qué permiso son, cuánto volumen suman y si ese volumen alcanza para
 * lo declarado. Nada más.
 *
 * **No vincula.** Vincular materia prima es un acto aparte y explícito, con sus
 * reglas de especie, volumen y largo (`revisarVinculacion`, invariantes I1-I6 y
 * T1) y su escritura con locks en `sumar-corrida`. Quien registra tiene que
 * confirmar la propuesta. Fabricar trazabilidad automática sería peor que no
 * tenerla: el libro es lo que se presenta ante SERFOR y OSINFOR, y un origen
 * que nadie eligió es un origen inventado.
 *
 * ## Los códigos que no cierran SE DICEN
 *
 * Un código que no se encontró, uno que señala dos trozas, uno cuya guía
 * todavía no llegó al patio: cada uno sale nombrado con su motivo. Ignorarlos
 * en silencio dejaría una propuesta que parece completa y no lo es — el mismo
 * error que descartó 51 trozas sin avisar en el importador CTP.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { estaDisponible, motivoBloqueo, LABEL_BLOQUEO, type TrozaConsumible } from "./consumo-trozas";
import { esCodigoReal } from "./codigo-de-troza";
import { claveEspecie } from "./loth-constants";
import { TOPE_RENDIMIENTO_PCT } from "./vincular-produccion";

/** Diez litros: la tolerancia del patio, no la del float. */
const TOL_M3 = 0.01;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

const normalizar = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const fmt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Qué le pasó a un código escrito. */
export type EstadoCodigo =
  | "propuesto"
  | "sin-codigo"
  | "ambiguo"
  | "no-disponible"
  | "sin-recepcion"
  | "desconocido";

/** Una troza que la propuesta señala, con su origen legal a la vista. */
export interface TrozaPropuesta {
  id: string;
  codigo: string;
  especie: string | null;
  volumenM3: number;
  largoM: number | null;
  /** La guía por la que entró — el origen legal (GTF). */
  guia: string | null;
  /** El título habilitante que la ampara. */
  permiso: string | null;
  /** El lote de aserrío donde está apartada, si está en alguno. */
  loteId: string | null;
  loteCode: string | null;
  fechaIngreso: string | null;
}

/** Un código escrito y su suerte. */
export interface CodigoLeido {
  codigo: string;
  estado: EstadoCodigo;
  /** Por qué, en una línea que se puede mostrar tal cual. */
  detalle: string;
  /** Las trozas que llevan ese código (vacío si no lo lleva ninguna). */
  candidatas: TrozaPropuesta[];
}

/** De dónde sale la madera propuesta: una línea por guía. */
export interface OrigenPropuesto {
  guia: string | null;
  permiso: string | null;
  trozas: number;
  volumenM3: number;
}

/** El lote donde ya están apartadas las trozas propuestas. */
export interface LotePropuesto {
  id: string;
  code: string | null;
  trozas: number;
  volumenM3: number;
}

/**
 * ¿El volumen propuesto alcanza para lo que la corrida declaró?
 *
 * El tope de la plaza (ADR-358) dice que de 100 m³ de troza no salen más de 56
 * de madera aserrada. Dado lo declarado, el volumen de troza que hace falta es
 * `producido / 0,56`: menos que eso y la corrida estaría rindiendo por encima
 * del tope, que es lo primero que pregunta una fiscalización.
 */
export interface AlcanceDelVolumen {
  producidoM3: number;
  propuestoM3: number;
  /** Troza que haría falta para no pasar del tope. */
  necesarioM3: number;
  /** `necesario − propuesto`, nunca negativo. */
  faltaM3: number;
  rendimientoPct: number | null;
  /**
   * · `sin-trozas` — los códigos no señalaron ninguna troza usable.
   * · `imposible` — lo declarado es MÁS que la troza propuesta: de la sierra no
   *   sale más madera de la que entró. Es el error que bloquea al confirmar.
   * · `sobre-el-tope` — entra, pero por encima del 56 %: aviso, se firma igual.
   * · `sin-comparar` — la corrida no declara su producción en m³ (declaró en
   *   pie tablar, o todavía no declaró): dividir unidades distintas inventaría
   *   el número, la misma regla que `corridasOtraUnidad` en Consumos.
   * · `alcanza` — el rendimiento queda dentro del tope.
   */
  veredicto: "alcanza" | "sobre-el-tope" | "imposible" | "sin-trozas" | "sin-comparar";
  /** `null` cuando alcanza: no hay nada que advertir. */
  mensaje: string | null;
}

export interface PropuestaVinculacion {
  /** Las trozas que se proponen atribuir. */
  trozas: TrozaPropuesta[];
  volumenM3: number;
  origenes: OrigenPropuesto[];
  /** Todos los códigos leídos, incluidos los que no cerraron. */
  codigos: CodigoLeido[];
  lotes: LotePropuesto[];
  /** Propuestas que todavía no están en ningún lote de aserrío. */
  sinLote: TrozaPropuesta[];
  alcance: AlcanceDelVolumen;
  /** Propuestas de una especie distinta a la que declara la corrida. */
  otraEspecie: TrozaPropuesta[];
  /** Cuántos códigos no terminaron en una troza propuesta. */
  codigosSinResolver: number;
}

/** La corrida contra la que se arma la propuesta. */
export interface CorridaAProponer {
  /** La especie declarada del asiento (para avisar si la troza es otra madera). */
  especie: string | null;
  /** m³ de producto que la corrida declara. */
  producidoM3: number;
}

/** De una troza del patio a la forma que muestra la propuesta. */
function aPropuesta(t: TrozaConsumible, codigo: string): TrozaPropuesta {
  return {
    id: t.id,
    codigo,
    especie: t.especieComun?.trim() || null,
    volumenM3: Number(t.volumenM3 ?? 0),
    largoM: t.largoM == null ? null : Number(t.largoM),
    guia: t.gtfNumber?.trim() || null,
    permiso: t.permiso?.trim() || null,
    loteId: t.loteAserrioId ?? null,
    loteCode: t.loteAserrioCode ?? null,
    fechaIngreso: t.fechaIngreso ? String(t.fechaIngreso).slice(0, 10) : null,
  };
}

/**
 * Los códigos que lleva una pieza: sin repetir, en el orden en que se
 * escribieron y sin los marcadores de «sin código».
 *
 * «-» significa **sin código** (49 de las 160 trozas de Blas lo traen), no es
 * un código válido: buscarlo devolvería medio patio.
 */
export function codigosDeLoCubicado(piezas: readonly { codigo?: string | null }[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of piezas) {
    const c = (p.codigo ?? "").trim();
    if (!esCodigoReal(c)) continue;
    const clave = normalizar(c);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(c);
  }
  return out;
}

/**
 * La propuesta de vinculación a partir de los códigos escritos al cubicar.
 *
 * `patio` viene crudo de `/api/admin/forestal/trozas/patio` —con las bloqueadas
 * adentro— a propósito: sin ellas no se podría distinguir «ese código no
 * existe» de «ese código ya entró a otra corrida», y ésa es justamente la
 * diferencia que el operador necesita leer.
 */
export function proponerVinculacion(
  corrida: CorridaAProponer,
  codigosEscritos: readonly string[],
  patio: readonly TrozaConsumible[],
): PropuestaVinculacion {
  /* Índice por código: las DOS codificaciones, igual que el buscador del patio
     —el operador tipea la que tiene delante—. */
  const porCodigo = new Map<string, TrozaConsumible[]>();
  const indexar = (valor: string | null | undefined, t: TrozaConsumible) => {
    const v = (valor ?? "").trim();
    if (!esCodigoReal(v)) return;
    const k = normalizar(v);
    const lista = porCodigo.get(k);
    if (lista) {
      if (!lista.includes(t)) lista.push(t);
    } else porCodigo.set(k, [t]);
  };
  for (const t of patio) {
    indexar(t.codificacion, t);
    indexar(t.codigoPlanta, t);
  }

  const codigos: CodigoLeido[] = [];
  const trozas: TrozaPropuesta[] = [];
  const yaPropuesta = new Set<string>();

  for (const escrito of codigosEscritos) {
    const texto = (escrito ?? "").trim();
    if (!esCodigoReal(texto)) {
      codigos.push({
        codigo: texto || "—",
        estado: "sin-codigo",
        detalle: "La pieza se cubicó sin código de troza: no hay nada que buscar.",
        candidatas: [],
      });
      continue;
    }

    const halladas = porCodigo.get(normalizar(texto)) ?? [];
    if (halladas.length === 0) {
      codigos.push({
        codigo: texto,
        estado: "desconocido",
        detalle: "Ninguna troza del patio lleva ese código. Revisa cómo se escribió o de dónde salió esa madera.",
        candidatas: [],
      });
      continue;
    }

    /* El corte que no se cambia: sólo trozas de guías YA RECIBIDAS. Una troza
       cuya guía sigue pendiente no llegó a la planta, así que no pudo pasar por
       la sierra. En Blas eso deja 7 de 111 códigos, y se dice por qué. */
    const usables = halladas.filter((t) => estaDisponible(t) && t.guiaRecepcionada !== false);
    if (usables.length === 0) {
      const pendiente = halladas.find((t) => estaDisponible(t) && t.guiaRecepcionada === false);
      if (pendiente) {
        codigos.push({
          codigo: texto,
          estado: "sin-recepcion",
          detalle:
            `La guía ${pendiente.gtfNumber ?? "de esa troza"} todavía no se recibió en el patio: ` +
            "hasta que se reciba, esa madera no pudo pasar por la sierra.",
          candidatas: halladas.map((t) => aPropuesta(t, texto)),
        });
        continue;
      }
      const motivo = motivoBloqueo(halladas[0]);
      codigos.push({
        codigo: texto,
        estado: "no-disponible",
        detalle: motivo ? `${LABEL_BLOQUEO[motivo]}: no se puede volver a atribuir.` : "No está disponible.",
        candidatas: halladas.map((t) => aPropuesta(t, texto)),
      });
      continue;
    }

    /* Varias trozas vivas con el mismo código: elegir una sería adivinar, y un
       origen adivinado es peor que un hueco declarado. Se muestran las dos y
       decide quien registra. Su volumen NO entra en el total propuesto. */
    if (usables.length > 1) {
      codigos.push({
        codigo: texto,
        estado: "ambiguo",
        detalle:
          `Ese código lleva a ${usables.length} trozas del patio: elige cuál fue, ` +
          "acá no se adivina de qué guía salió la madera.",
        candidatas: usables.map((t) => aPropuesta(t, texto)),
      });
      continue;
    }

    const troza = aPropuesta(usables[0], texto);
    codigos.push({
      codigo: texto,
      estado: "propuesto",
      detalle: `${fmt(troza.volumenM3)} m³ · guía ${troza.guia ?? "—"}`,
      candidatas: [troza],
    });
    /* Dos piezas cubicadas pueden nombrar la MISMA troza: su volumen se cuenta
       una sola vez o el total propuesto diría el doble de la madera que hay. */
    if (!yaPropuesta.has(troza.id)) {
      yaPropuesta.add(troza.id);
      trozas.push(troza);
    }
  }

  const volumenM3 = r4(trozas.reduce((a, t) => a + t.volumenM3, 0));

  /* Origen legal: una línea por guía, con su permiso. */
  const mapaOrigen = new Map<string, OrigenPropuesto>();
  for (const t of trozas) {
    const clave = `${t.guia ?? ""}|${t.permiso ?? ""}`;
    const prev = mapaOrigen.get(clave);
    if (prev) {
      prev.trozas += 1;
      prev.volumenM3 = r4(prev.volumenM3 + t.volumenM3);
    } else {
      mapaOrigen.set(clave, { guia: t.guia, permiso: t.permiso, trozas: 1, volumenM3: r4(t.volumenM3) });
    }
  }

  const mapaLote = new Map<string, LotePropuesto>();
  const sinLote: TrozaPropuesta[] = [];
  for (const t of trozas) {
    if (!t.loteId) {
      sinLote.push(t);
      continue;
    }
    const prev = mapaLote.get(t.loteId);
    if (prev) {
      prev.trozas += 1;
      prev.volumenM3 = r4(prev.volumenM3 + t.volumenM3);
    } else {
      mapaLote.set(t.loteId, { id: t.loteId, code: t.loteCode, trozas: 1, volumenM3: r4(t.volumenM3) });
    }
  }

  const claveCorrida = corrida.especie ? claveEspecie(corrida.especie) : "";
  const otraEspecie = claveCorrida
    ? trozas.filter((t) => t.especie && claveEspecie(t.especie) !== claveCorrida)
    : [];

  return {
    trozas,
    volumenM3,
    origenes: [...mapaOrigen.values()],
    codigos,
    lotes: [...mapaLote.values()],
    sinLote,
    alcance: medirAlcance(corrida.producidoM3, volumenM3, trozas.length),
    otraEspecie,
    codigosSinResolver: codigos.filter((c) => c.estado !== "propuesto").length,
  };
}

/**
 * Si el volumen propuesto alcanza para lo declarado — ANTES de confirmar.
 *
 * Se separa de `proponerVinculacion` para poder recalcularlo cuando quien
 * registra agrega o saca trozas a mano: la cuenta es la misma y no se copia.
 */
export function medirAlcance(
  producidoM3: number,
  propuestoM3: number,
  cuantasTrozas: number,
): AlcanceDelVolumen {
  const necesarioM3 = r4(producidoM3 / (TOPE_RENDIMIENTO_PCT / 100));
  const faltaM3 = Math.max(0, r4(necesarioM3 - propuestoM3));
  const rendimientoPct = propuestoM3 > 0 ? r2((producidoM3 / propuestoM3) * 100) : null;
  const base = { producidoM3: r4(producidoM3), propuestoM3, necesarioM3, faltaM3, rendimientoPct };

  if (!(producidoM3 > 0)) {
    return {
      ...base,
      necesarioM3: 0,
      faltaM3: 0,
      veredicto: "sin-comparar",
      mensaje:
        "Esta corrida no declara su producción en m³, así que no se puede comparar contra el volumen propuesto. " +
        "Las trozas de abajo son las que señalan los códigos; el volumen lo revisas tú.",
    };
  }
  if (cuantasTrozas === 0 || propuestoM3 <= 0) {
    return {
      ...base,
      veredicto: "sin-trozas",
      mensaje:
        "Los códigos escritos no señalan ninguna troza que se pueda usar: no hay volumen que proponer. " +
        "Elige la madera a mano abajo.",
    };
  }
  if (producidoM3 > propuestoM3 + TOL_M3) {
    return {
      ...base,
      veredicto: "imposible",
      mensaje:
        `La corrida declara ${fmt(producidoM3)} m³ y estas trozas suman ${fmt(propuestoM3)} m³: ` +
        "de la sierra nunca sale más madera de la que entró. " +
        `Para no pasar del ${TOPE_RENDIMIENTO_PCT} % faltan ${fmt(faltaM3)} m³ de troza.`,
    };
  }
  if (rendimientoPct != null && rendimientoPct > TOPE_RENDIMIENTO_PCT) {
    return {
      ...base,
      veredicto: "sobre-el-tope",
      mensaje:
        `Con estas trozas la corrida rinde ${rendimientoPct} %, por encima del ${TOPE_RENDIMIENTO_PCT} % de la plaza. ` +
        `Faltan ${fmt(faltaM3)} m³ de troza para quedar dentro del tope: puede ser real, pero es lo primero que pregunta una fiscalización.`,
    };
  }
  return { ...base, veredicto: "alcanza", mensaje: null };
}
