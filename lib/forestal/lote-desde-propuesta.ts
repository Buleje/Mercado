/**
 * De la propuesta de vinculación al LOTE que la hace confirmable (ADR-408).
 *
 * ## El callejón que esto abre
 *
 * `CtpVincularMateriaPrimaModal` escribe por `sumar-corrida`, y esa acción
 * **sólo mueve piezas de un lote**. Medido el 2026-09-15 en
 * `inversiones-agroforestales-blas-sociedad-anonima`: las 160 trozas del patio
 * (197,646 m³) están **todas sin `loteAserrioId`** y los 3 lotes abiertos no
 * tienen ni una pieza libre. El desplegable de lotes salía vacío siempre, así
 * que la pantalla no era difícil de encontrar: era imposible de terminar. Por
 * eso 0 de 14 corridas de producción tienen materia prima atribuida.
 *
 * Acá se decide **qué hay que hacer con las trozas propuestas para que ese
 * desplegable tenga algo**: armar un lote nuevo con ellas, o guardarlas en el
 * lote abierto donde ya están sus hermanas. Nada más — quien escribe es el
 * endpoint de siempre (`POST` + `PATCH accion:"agregar"`), con sus invariantes.
 *
 * ## Lo que NO hace
 *
 * No vincula, no consume y no elige por nadie. Y **no mezcla**: un lote es de
 * una especie (L-A1) y de un título habilitante (ADR-393). Cuando las trozas
 * propuestas no cumplen eso, devuelve el impedimento con los nombres a la vista
 * en vez de armar un lote mezclado que después nadie puede explicar. En el
 * patio real eso pasa: el Tornillo sin lote viene de DOS permisos
 * (`19-SEC/REG-PLT-2018-020` con 49 trozas y `19-SEC/REG-PLT-2021-017` con 65).
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { claveEspecie } from "./loth-constants";
import type { PropuestaVinculacion, TrozaPropuesta } from "./propuesta-de-vinculacion";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Un lote del tenant, mirado sólo por lo que decide si sirve de destino. */
export interface LoteDestino {
  id: string;
  code: string;
  speciesCommon: string | null;
  status: string;
}

/** Qué escribir para que la vinculación se pueda confirmar. */
export interface PlanDeLote {
  /** `crear` abre un lote nuevo; `agregar` guarda en el que ya tiene hermanas. */
  accion: "crear" | "agregar";
  /** El lote destino cuando la acción es `agregar`. */
  loteId: string | null;
  loteCode: string | null;
  /** Las trozas que hoy no están en ningún lote: las únicas que se mueven. */
  trozas: TrozaPropuesta[];
  trozaIds: string[];
  volumenM3: number;
  /** La especie del lote — una sola, siempre. */
  especie: string;
  /** El título habilitante (ADR-393). `null` = las trozas no lo declaran. */
  permiso: string | null;
  /** Las guías de las que sale esa madera, para nombrarlas en la nota. */
  guias: string[];
}

export interface ArmadoDeLote {
  /** `null` cuando no hay nada que armar o algo lo impide. */
  plan: PlanDeLote | null;
  /** Por qué no se puede, en una línea que se muestra tal cual. */
  impedimento: string | null;
  /** Lo que hay que saber aunque se pueda. No bloquea. */
  avisos: string[];
}

/** La corrida contra la que se arma, para nombrarla en la nota del lote. */
export interface CorridaDelPlan {
  lineNo: number | null;
  especie: string | null;
  /** Fecha del asiento (ISO date-only): abre la ventana del proceso. */
  fecha: string;
}

const listar = (xs: readonly string[]): string => xs.join(", ");

/**
 * Qué hacer con las trozas propuestas que todavía no están en ningún lote.
 *
 * `lotes` son los del tenant tal como los tiene la pantalla: se mira su estado
 * y su especie, no su contenido — el servidor vuelve a validar todo al escribir.
 */
export function planearLoteDesdePropuesta(
  propuesta: PropuestaVinculacion,
  corrida: CorridaDelPlan,
  lotes: readonly LoteDestino[],
): ArmadoDeLote {
  const sinLote = propuesta.sinLote;
  const avisos: string[] = [];

  if (sinLote.length === 0) {
    return {
      plan: null,
      impedimento:
        propuesta.trozas.length === 0
          ? null
          : "Las trozas propuestas ya están apartadas en un lote: no hay nada que armar.",
      avisos,
    };
  }

  /* 1 · UNA especie por lote (L-A1). La de la corrida manda si la declara; si no,
     la de las trozas — y si las trozas traen dos maderas, no hay lote posible. */
  const especiesTroza = [...new Set(sinLote.map((t) => claveEspecie(t.especie)).filter(Boolean))];
  if (especiesTroza.length > 1) {
    const nombres = [...new Set(sinLote.map((t) => t.especie).filter((e): e is string => Boolean(e)))];
    return {
      plan: null,
      impedimento:
        `Estas trozas son de ${especiesTroza.length} maderas distintas (${listar(nombres)}) y un lote es de una sola. ` +
        "Ármalo en Lotes eligiendo la especie, o corrige los códigos del cubicado.",
      avisos,
    };
  }
  if (propuesta.otraEspecie.length > 0) {
    return {
      plan: null,
      impedimento:
        `${propuesta.otraEspecie.length === 1 ? "Una troza propuesta es" : `${propuesta.otraEspecie.length} trozas propuestas son`} ` +
        `de otra madera que la que declara la corrida (${corrida.especie ?? "sin especie"}): de una especie no sale la otra.`,
      avisos,
    };
  }
  const especie = corrida.especie?.trim() || sinLote.find((t) => t.especie)?.especie?.trim() || "";
  if (!especie) {
    return {
      plan: null,
      impedimento:
        "Ni la corrida ni estas trozas declaran la especie, y un lote necesita una. " +
        "Ármalo en Lotes eligiéndola a mano.",
      avisos,
    };
  }

  /* 2 · UN título habilitante por lote (ADR-393). Acá el permiso SÍ se puede
     derivar —las piezas ya están elegidas—, así que mezclar sería mezclar
     sabiendo, que es justo lo que el ADR no admite. */
  const permisos = [...new Set(sinLote.map((t) => (t.permiso ?? "").trim()).filter(Boolean))];
  if (permisos.length > 1) {
    return {
      plan: null,
      impedimento:
        `Estas trozas vienen de ${permisos.length} títulos habilitantes (${listar(permisos)}). ` +
        "Un lote es de un permiso: si se mezclan, la corrida que salga de ahí no puede decir de cuál salió su madera. " +
        "Ármalo en Lotes eligiendo el título.",
      avisos,
    };
  }
  const permiso = permisos[0] ?? null;
  if (!permiso) {
    avisos.push(
      "Estas trozas no declaran título habilitante: el lote nace sin permiso, como los que ya existen.",
    );
  }

  /* 3 · ¿Hay un lote donde meterlas, o hay que abrir uno? */
  const porId = new Map(lotes.map((l) => [l.id, l]));
  const abiertosDeLaPropuesta = propuesta.lotes
    .map((l) => porId.get(l.id))
    .filter((l): l is LoteDestino => Boolean(l) && l!.status === "abierto");

  if (abiertosDeLaPropuesta.length > 1) {
    return {
      plan: null,
      impedimento:
        `Las trozas propuestas están repartidas en ${abiertosDeLaPropuesta.length} lotes abiertos ` +
        `(${listar(abiertosDeLaPropuesta.map((l) => l.code))}), y la materia prima se atribuye desde uno solo. ` +
        "Elige el lote abajo y la madera que va con él.",
      avisos,
    };
  }

  const destino = abiertosDeLaPropuesta[0] ?? null;
  if (destino && claveEspecie(destino.speciesCommon) !== claveEspecie(especie)) {
    return {
      plan: null,
      impedimento:
        `El lote ${destino.code} es de ${destino.speciesCommon ?? "otra especie"} y estas trozas son de ${especie}: no entran ahí.`,
      avisos,
    };
  }

  /* Trozas ya apartadas en un lote que NO está abierto: quedan afuera y se dice.
     Repartir una vinculación en dos lotes no se puede deshacer después —
     `sumar-corrida` sólo admite una pasada por corrida. */
  const apartadasFuera = propuesta.trozas.length - sinLote.length;
  if (apartadasFuera > 0 && !destino) {
    avisos.push(
      `${apartadasFuera} ${apartadasFuera === 1 ? "troza propuesta ya está" : "trozas propuestas ya están"} en un lote que no está abierto: ` +
        "quedan fuera de esta vinculación.",
    );
  }

  const guias = [...new Set(sinLote.map((t) => t.guia).filter((g): g is string => Boolean(g)))];

  return {
    plan: {
      accion: destino ? "agregar" : "crear",
      loteId: destino?.id ?? null,
      loteCode: destino?.code ?? null,
      trozas: sinLote,
      trozaIds: sinLote.map((t) => t.id),
      volumenM3: r4(sinLote.reduce((a, t) => a + t.volumenM3, 0)),
      especie,
      permiso,
      guias,
    },
    impedimento: null,
    avisos,
  };
}

/**
 * La nota del lote: de dónde salió, para que dentro de un año se entienda.
 *
 * Un lote que aparece sin explicación en la lista es un lote que nadie borra
 * por las dudas. Dice la corrida que lo pidió y las guías de su madera.
 */
export function notaDelLote(plan: PlanDeLote, corrida: CorridaDelPlan): string {
  return (
    `Armado desde los códigos del cubicado de la corrida N° ${corrida.lineNo ?? "—"} ` +
    `(${plan.trozas.length} troza${plan.trozas.length === 1 ? "" : "s"} · ${plan.volumenM3} m³` +
    `${plan.guias.length > 0 ? ` · guía${plan.guias.length === 1 ? "" : "s"} ${listar(plan.guias)}` : ""})`
  ).slice(0, 500);
}
