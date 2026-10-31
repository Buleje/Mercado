/**
 * foda/foda-config.ts — cómo se nombra y se pinta cada parte del FODA y de la
 * matriz de estrategias (ADR-497). Un solo lugar para el color de cada
 * cuadrante: lo usan la grilla, los chips de la estrategia y su ventana.
 */
import type { LucideIcon } from "@buleje/design-system/icons";
import { AlertTriangle, Lightbulb, Rocket, Shield, ShieldCheck, TrendingUp, Wrench } from "@buleje/design-system/icons";
import type { CuadranteFoda, DatosSeccion } from "@/lib/planificacion/secciones";
import type { Tono } from "../piezas/clases";

export type PuntoFoda = DatosSeccion<"foda">["fortalezas"][number];
export type Estrategia = DatosSeccion<"estrategias">["items"][number];
export type TipoEstrategia = Estrategia["tipo"];
export type EstadoEstrategia = Estrategia["estado"];
export type Impacto = PuntoFoda["impacto"];

interface InfoCuadrante {
  nombre: string;
  /** Singular, para la sugerencia («tu fortaleza más fuerte»). */
  singular: string;
  tono: Tono;
  icono: LucideIcon;
  origen: "interna" | "externa";
  preguntas: string;
  ejemplo: string;
  placeholder: string;
}

export const CUADRANTE: Readonly<Record<CuadranteFoda, InfoCuadrante>> = {
  fortalezas: {
    nombre: "Fortalezas",
    singular: "fortaleza",
    tono: "exito",
    icono: ShieldCheck,
    origen: "interna",
    preguntas: "Mira hacia adentro: ¿qué haces mejor que la competencia? ¿Qué te elogian tus clientes? ¿Qué tienes que otros no (local, contactos, experiencia)?",
    ejemplo: "Clientes fieles del barrio que compran todos los días.",
    placeholder: "Algo que haces bien",
  },
  oportunidades: {
    nombre: "Oportunidades",
    singular: "oportunidad",
    tono: "info",
    icono: Lightbulb,
    origen: "externa",
    preguntas: "Mira hacia afuera: ¿qué cambia a tu favor? ¿Qué piden los clientes y nadie ofrece? ¿Hay un barrio, una feria o un cliente grande por ganar?",
    ejemplo: "Abren un colegio a dos cuadras.",
    placeholder: "Algo de afuera que te conviene",
  },
  debilidades: {
    nombre: "Debilidades",
    singular: "debilidad",
    tono: "aviso",
    icono: Wrench,
    origen: "interna",
    preguntas: "Mira hacia adentro: ¿qué te reclaman? ¿Dónde pierdes plata o tiempo? ¿Qué te falta (capital, personal, orden, sistema)?",
    ejemplo: "No llevamos el control del fiado.",
    placeholder: "Algo que te falta o haces mal",
  },
  amenazas: {
    nombre: "Amenazas",
    singular: "amenaza",
    tono: "error",
    icono: AlertTriangle,
    origen: "externa",
    preguntas: "Mira hacia afuera: ¿qué hace la competencia? ¿Qué subió de precio? ¿Qué podría frenarte (clima, una ley, un proveedor que falla)?",
    ejemplo: "Un minimarket de cadena abre en la avenida.",
    placeholder: "Algo de afuera que te puede afectar",
  },
};

/** Orden en la grilla: arriba lo de adentro, abajo lo de afuera. */
export const ORDEN_GRILLA: readonly CuadranteFoda[] = ["fortalezas", "debilidades", "oportunidades", "amenazas"];

interface InfoTipo {
  nombre: string;
  icono: LucideIcon;
  /** Los dos cuadrantes que cruza: [interno, externo]. */
  cruza: readonly [CuadranteFoda, CuadranteFoda];
  significado: string;
  ejemplo: string;
}

export const TIPO: Readonly<Record<TipoEstrategia, InfoTipo>> = {
  FO: {
    nombre: "Crecer",
    icono: Rocket,
    cruza: ["fortalezas", "oportunidades"],
    significado: "Usa una fortaleza para aprovechar una oportunidad.",
    ejemplo: "Clientes fieles + colegio nuevo → combo de lonchera para los papás.",
  },
  DO: {
    nombre: "Mejorar",
    icono: TrendingUp,
    cruza: ["debilidades", "oportunidades"],
    significado: "Corrige una debilidad aprovechando una oportunidad.",
    ejemplo: "Sin control del fiado + Yape gratis → cobrar el fiado por Yape con recordatorio.",
  },
  FA: {
    nombre: "Defender",
    icono: ShieldCheck,
    cruza: ["fortalezas", "amenazas"],
    significado: "Usa una fortaleza para frenar una amenaza.",
    ejemplo: "Trato cercano + cadena nueva → delivery en 20 minutos a los vecinos de siempre.",
  },
  DA: {
    nombre: "Protegerte",
    icono: Shield,
    cruza: ["debilidades", "amenazas"],
    significado: "Reduce una debilidad para que una amenaza no te golpee.",
    ejemplo: "Poco capital + precios que suben → comprar en grupo con otras bodegas.",
  },
};

/** Orden de la matriz: columnas fortalezas | debilidades; filas oportunidades / amenazas. */
export const ORDEN_MATRIZ: readonly TipoEstrategia[] = ["FO", "DO", "FA", "DA"];

export const ESTADO_ESTRATEGIA: Readonly<Record<EstadoEstrategia, { nombre: string; tono: Tono }>> = {
  idea: { nombre: "Idea", tono: "neutro" },
  "en-curso": { nombre: "En curso", tono: "info" },
  hecha: { nombre: "Hecha", tono: "exito" },
  descartada: { nombre: "Descartada", tono: "neutro" },
};

export const NOMBRE_IMPACTO: Readonly<Record<Impacto, string>> = { alto: "Alto", medio: "Medio", bajo: "Bajo" };
export const SIGUIENTE_IMPACTO: Readonly<Record<Impacto, Impacto>> = { alto: "medio", medio: "bajo", bajo: "alto" };
const PESO: Readonly<Record<Impacto, number>> = { alto: 0, medio: 1, bajo: 2 };

/** El punto de más impacto de un cuadrante (el primero escrito si empatan). */
export function masFuerte(puntos: readonly PuntoFoda[]): PuntoFoda | null {
  return puntos.reduce<PuntoFoda | null>((mejor, p) => (!mejor || PESO[p.impacto] < PESO[mejor.impacto] ? p : mejor), null);
}

/** Dónde vive cada punto, para pintar el chip de una estrategia con su color. */
export function indicePuntos(foda: DatosSeccion<"foda">): Map<string, { punto: PuntoFoda; cuadrante: CuadranteFoda }> {
  const m = new Map<string, { punto: PuntoFoda; cuadrante: CuadranteFoda }>();
  for (const c of ORDEN_GRILLA) for (const punto of foda[c]) m.set(punto.id, { punto, cuadrante: c });
  return m;
}
