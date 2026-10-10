/**
 * Las marcas de origen y salida de un día de producción (ADR-445, 27-09).
 *
 * Brandon: *«un identificador de cuál viene de cubicación (cargando pieza por
 * pieza) y cuál de producción tipo ya puesto los m³ por tipo […] definir cuál
 * de esos días se despacharon, cuáles no, a qué guía pertenecen»*.
 *
 * El servidor clasifica (`lib/forestal/origen-y-salida-del-dia.ts`); acá sólo
 * se decide cómo se DICE: ícono, palabra corta, frase larga y tono. Cada marca
 * tiene su propio ícono además del color — dos días con el mismo color y otra
 * forma se distinguen igual en un celular al sol o con daltonismo.
 *
 * Lo único que se deriva acá es «con cubicación»: un día o una corrida por
 * tipo a la que ya se le vinculó su cubicación. Sin eso la marca quedaría en
 * «por tipo» para siempre y no habría forma de ver cuáles ya se completaron.
 */

import {
  Clock,
  FileWarning,
  Layers,
  Link2,
  PackageOpen,
  PieChart,
  Ruler,
  Truck,
  Warehouse,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  TOLERANCIA_PAQUETE_M3,
  TOLERANCIA_PAQUETE_PCT,
  type CubicacionVinculada,
  type EstadoDeSalida,
  type GuiaDelDia,
  type OrigenDelDia,
  type OrigenYSalida,
  type OrigenYSalidaDeCorrida,
} from "@/lib/forestal/origen-y-salida-del-dia";

/** Lo que se pinta: el origen del servidor, más «parcial» (corrida) y «con cubicación». */
export type OrigenVisible = OrigenDelDia | "parcial" | "con_cubicacion";
export type TonoDeMarca = "exito" | "info" | "aviso" | "neutro";

export interface Marca {
  Icono: LucideIcon;
  /** Para la pastilla: una o dos palabras. */
  corto: string;
  /** Para el globo y el lector de pantalla. */
  largo: string;
  tono: TonoDeMarca;
  /** Cómo se cuenta en los chips de la semana: «3 por tipo», «1 despachado». */
  uno: string;
  varios: string;
}

export const MARCA_ORIGEN: Record<OrigenVisible, Marca> = {
  cubicado: {
    Icono: Ruler,
    corto: "Cubicado",
    largo: "Cubicado pieza por pieza",
    tono: "exito",
    uno: "cubicado",
    varios: "cubicados",
  },
  con_cubicacion: {
    Icono: Link2,
    corto: "Con cubicación",
    largo: "Por tipo, con su cubicación vinculada",
    tono: "exito",
    uno: "con cubicación",
    varios: "con cubicación",
  },
  por_tipo: {
    Icono: Layers,
    corto: "Por tipo",
    largo: "Por tipo: m³ sin pieza por pieza",
    tono: "info",
    uno: "por tipo",
    varios: "por tipo",
  },
  mixto: {
    Icono: PieChart,
    corto: "Mixto",
    largo: "Mixto: parte cubicada y parte por tipo",
    tono: "info",
    uno: "mixto",
    varios: "mixtos",
  },
  parcial: {
    Icono: PieChart,
    corto: "Cubicada en parte",
    largo: "Cubicada en parte: algunos paquetes sin escuadría",
    tono: "info",
    uno: "en parte",
    varios: "en parte",
  },
  por_declarar: {
    Icono: Clock,
    corto: "Por declarar",
    largo: "Por declarar: sin m³ ni paquetes",
    tono: "neutro",
    uno: "por declarar",
    varios: "por declarar",
  },
};

export const MARCA_SALIDA: Record<EstadoDeSalida, Marca> = {
  sin_salida: {
    Icono: Warehouse,
    corto: "En patio",
    largo: "Sin salida: todo sigue en el patio",
    tono: "neutro",
    uno: "en patio",
    varios: "en patio",
  },
  parcial: {
    Icono: PackageOpen,
    corto: "Salió parte",
    largo: "Salió una parte; el resto sigue en el patio",
    tono: "info",
    uno: "salió en parte",
    varios: "salieron en parte",
  },
  despachado: {
    Icono: Truck,
    corto: "Despachado",
    largo: "Salió todo con guía",
    tono: "exito",
    uno: "despachado",
    varios: "despachados",
  },
  sin_guia: {
    Icono: FileWarning,
    corto: "Sin guía",
    largo: "Salió marcado «usado», sin guía en el libro",
    tono: "aviso",
    uno: "sin guía",
    varios: "sin guía",
  },
};

/**
 * Tolerancia de NEGOCIO, la misma de la regla del servidor para un paquete
 * cubicado: 10 litros o el 2 %, lo que sea mayor. Una cinta no mide décimas
 * de litro.
 */
export const toleranciaM3 = (declarado: number): number =>
  Math.max(TOLERANCIA_PAQUETE_M3, Math.abs(declarado) * TOLERANCIA_PAQUETE_PCT);

/** El origen que se pinta para un día. */
export function origenVisibleDelDia(os: OrigenYSalida): OrigenVisible {
  const completable = os.origen === "por_tipo" || os.origen === "mixto";
  /* Sólo cuentan las cubicaciones de ESTE día (`soloEsteDia`, las mismas que
     suma `m3ConCubicacion`): una atada también a otro día no se reparte a ojo,
     y pintar «con cubicación» a los dos sería respaldar dos veces la misma
     madera (revisión 27-09). */
  if (
    completable &&
    os.cubicaciones.some((c) => c.soloEsteDia) &&
    os.m3Cubicado + os.m3ConCubicacion >= os.m3Declarado - toleranciaM3(os.m3Declarado)
  ) {
    return "con_cubicacion";
  }
  return os.origen;
}

/**
 * Lo que a cada corrida del día le falta explicar con una cubicación
 * (declarado − lo que ya explican sus paquetes cubicados). `undefined` = no es
 * de este día.
 */
export type NecesarioDe = (idCorrida: string) => number | undefined;

export function necesarioDelDia(
  corridas: readonly { id: string; m3: number; origenYSalida?: OrigenYSalidaDeCorrida }[],
): NecesarioDe {
  const m = new Map(
    corridas.map((c) => {
      const o = c.origenYSalida;
      return [c.id, Math.max(0, o ? o.m3Declarado - o.m3Cubicado : c.m3)] as const;
    }),
  );
  return (id) => m.get(id);
}

/**
 * ¿Esta cubicación alcanza para TODAS las corridas que ampara? Sólo se puede
 * saber si todas son del día (`soloEsteDia`) y se conoce lo que declararon;
 * si no, no se afirma.
 */
function cubreSusCorridas(
  c: CubicacionVinculada,
  propia: OrigenYSalidaDeCorrida,
  necesarioDe?: NecesarioDe,
): boolean {
  if (!c.soloEsteDia) return false;
  let falta = 0;
  if (!necesarioDe) {
    if (c.corridas.length !== 1) return false;
    falta = Math.max(0, propia.m3Declarado - propia.m3Cubicado);
  } else {
    for (const id of c.corridas) {
      const n = necesarioDe(id);
      if (n == null) return false;
      falta += n;
    }
  }
  return c.m3 >= falta - toleranciaM3(falta);
}

/**
 * El origen que se pinta para una corrida: por tipo o en parte, pero ya con
 * una cubicación que alcanza para todo lo que ampara. Con `necesarioDe` (las
 * corridas del día) se juzga una cubicación que ampara varias corridas.
 */
export function origenVisibleDeCorrida(
  o: OrigenYSalidaDeCorrida,
  necesarioDe?: NecesarioDe,
): OrigenVisible {
  if (
    (o.origen === "por_tipo" || o.origen === "parcial") &&
    o.cubicaciones.some((c) => cubreSusCorridas(c, o, necesarioDe))
  ) {
    return "con_cubicacion";
  }
  /* La corrida dice «cubicada» y el día «cubicado»: es la misma marca. */
  return o.origen === "cubicada" ? "cubicado" : o.origen;
}

/** ¿Tiene sentido ofrecerle «Agregar cubicación»? Por tipo o a medias, y todavía sin completar. */
export const diaPideCubicacion = (os: OrigenYSalida | undefined): boolean => {
  if (!os) return false;
  const v = origenVisibleDelDia(os);
  return v === "por_tipo" || v === "mixto";
};

export const corridaPideCubicacion = (
  o: OrigenYSalidaDeCorrida | undefined,
  necesarioDe?: NecesarioDe,
): boolean => {
  if (!o) return false;
  const v = origenVisibleDeCorrida(o, necesarioDe);
  return v === "por_tipo" || v === "parcial";
};

/** «GTF 001-0000203» o, si todavía no tiene número, «Borrador N.º 95110». */
export const textoDeGuia = (g: Pick<GuiaDelDia, "gtfNumber" | "lineNo">): string =>
  g.gtfNumber ? `GTF ${g.gtfNumber}` : `Borrador N.º ${g.lineNo}`;

/** La frase entera de la salida, para el globo y el lector: estado + guías. */
export function fraseDeSalida(estado: EstadoDeSalida, guias: readonly GuiaDelDia[]): string {
  const base = MARCA_SALIDA[estado].largo;
  if (guias.length === 0) return base;
  return `${base} · ${guias.map(textoDeGuia).join(", ")}`;
}

// ── Los chips de la semana ──────────────────────────────────────────────────

export type FiltroDeDias =
  | { eje: "origen"; valor: OrigenVisible }
  | { eje: "salida"; valor: EstadoDeSalida };

export interface ChipDeLaSemana {
  filtro: FiltroDeDias;
  dias: number;
  marca: Marca;
}

/* Primero lo que pide trabajo (por tipo, sin guía), después lo que ya está. */
const ORDEN_ORIGEN: OrigenVisible[] = [
  "por_tipo",
  "mixto",
  "por_declarar",
  "con_cubicacion",
  "cubicado",
];
const ORDEN_SALIDA: EstadoDeSalida[] = ["sin_guia", "parcial", "sin_salida", "despachado"];

export const claveDeFiltro = (f: FiltroDeDias): string => `${f.eje}:${f.valor}`;

export function coincideFiltro(os: OrigenYSalida | undefined, f: FiltroDeDias): boolean {
  if (!os) return false;
  return f.eje === "origen" ? origenVisibleDelDia(os) === f.valor : os.salida.estado === f.valor;
}

/**
 * Cuántos días de la semana hay en cada marca. Sólo los que tienen el dato:
 * un día sin clasificar (respuesta vieja) no se cuenta en ningún chip.
 */
export function chipsDeLaSemana(dias: readonly (OrigenYSalida | undefined)[]): ChipDeLaSemana[] {
  const conDato = dias.filter((d): d is OrigenYSalida => !!d);
  if (conDato.length === 0) return [];
  const chips: ChipDeLaSemana[] = [];
  for (const valor of ORDEN_ORIGEN) {
    const n = conDato.filter((d) => origenVisibleDelDia(d) === valor).length;
    if (n > 0)
      chips.push({ filtro: { eje: "origen", valor }, dias: n, marca: MARCA_ORIGEN[valor] });
  }
  for (const valor of ORDEN_SALIDA) {
    const n = conDato.filter((d) => d.salida.estado === valor).length;
    if (n > 0)
      chips.push({ filtro: { eje: "salida", valor }, dias: n, marca: MARCA_SALIDA[valor] });
  }
  return chips;
}
