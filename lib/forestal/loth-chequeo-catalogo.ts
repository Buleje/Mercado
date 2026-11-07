/**
 * loth-chequeo-catalogo — el texto de cada chequeo avanzado del Libro TH
 * (26-10): sección, severidad (multa = `error`, advertencia = `warning`), lo
 * que resta del puntaje, la norma en corto y qué hacer. PURO.
 *
 * Las normas son las que el código ya cita y verificó (skill
 * `serfor-osinfor-compliance`): no se inventan artículos. Donde la regla es del
 * plan aprobado y no de un artículo, se dice así.
 *
 * Severidad y puntaje siguen la regla del CTP: multa = lo que una supervisión
 * observa tal cual; advertencia = lo que va a serlo si no se corrige. Lo que
 * no se pudo leer NO entra (no se da por bueno): lo dice `sinLeer`.
 */

import type { LothCheck, LothNavTarget, LothSeverity } from "./loth-compliance";
import type { AjustesChequeo, LothSeccion } from "./loth-chequeo-tipos";

export type ClaveChequeo =
  | "guia_repetida"
  | "guia_fuera_vigencia"
  | "despacho_sin_guia"
  | "guia_sin_transporte"
  | "bloque_excedido"
  | "talado_sin_censo"
  | "talado_bajo_dmc"
  | "bloque_excederia"
  | "talado_sin_coordenadas"
  | "plan_vencido"
  | "papeles_vencidos"
  | "plan_por_vencer"
  | "papeles_faltan"
  | "ficha_incompleta"
  | "despacho_sin_asentar"
  | "preliminar_vencida"
  | "despacho_por_asentar"
  | "preliminar_vieja"
  | "fechas_fuera_de_orden";

/** Los casos de cada chequeo. `undefined` o `null` = no se pudo leer: el chequeo no se muestra como en orden. */
export type CasosDelChequeo = Partial<Record<ClaveChequeo, string[] | null>>;

/** Cuántos casos viajan por chequeo (la cuenta es la real; la lista, un techo). */
export const TOPE_CASOS = 50;

interface Def {
  seccion: LothSeccion;
  severity: LothSeverity;
  penalty: number;
  norma: string;
  uno: string;
  varios: string;
  okTitle: string;
  description: string;
  action: string;
  navTarget: LothNavTarget;
  navigateLabel: string;
}

const LEY_GTF = "Ley 29763, art. 124 · D.S. 018-2015-MINAGRI, art. 172";
const PLAZO_15 = "RDE 264-2019: el libro se asienta en 15 días";
const PLAN_APROBADO = "Plan aprobado (D.S. 018-2015-MINAGRI)";
const VER_GUIAS = { navTarget: "gtf", navigateLabel: "Ver guías" } as const;
const VER_SECCIONES = { navTarget: "secciones", navigateLabel: "Ver secciones" } as const;
const VER_PLAN = { navTarget: "plan", navigateLabel: "Ver el plan" } as const;

/** En el orden en que se leen dentro de cada sección: multas primero. */
const DEFS: Record<ClaveChequeo, Def> = {
  guia_repetida: {
    seccion: "guias", severity: "error", penalty: 20, norma: "RDE D000014-2024-MIDAGRI-SERFOR-DE: GTF prenumerada",
    uno: "número de GTF repetido", varios: "números de GTF repetidos", okTitle: "Cada GTF tiene su propio número",
    description: "Dos guías vivas con el mismo número: en un control una de las dos no vale y la madera que ampara viaja sin documento. Una anulada y su reemisión no cuentan.",
    action: "Anula la que sobra y reemítela con su número.", ...VER_GUIAS,
  },
  guia_fuera_vigencia: {
    seccion: "guias", severity: "error", penalty: 25, norma: `${LEY_GTF} · plan vigente`,
    uno: "guía fuera de la vigencia de su plan", varios: "guías fuera de la vigencia de su plan", okTitle: "Toda guía está dentro de la vigencia de su plan",
    description: "Movilizar con un plan que todavía no empieza o que ya venció es movilizar sin autorización.",
    action: "Revisa la fecha de la guía o el plan al que la ataste.", ...VER_GUIAS,
  },
  despacho_sin_guia: {
    seccion: "guias", severity: "error", penalty: 25, norma: LEY_GTF,
    uno: "despacho sin N.º de GTF", varios: "despachos sin N.º de GTF", okTitle: "Todo despacho del libro lleva su GTF",
    description: "La madera que sale viaja amparada en una GTF: un despacho sin número no muestra cuál la ampara.",
    action: "Escribe el N.º de GTF en esas líneas.", ...VER_SECCIONES,
  },
  guia_sin_transporte: {
    seccion: "guias", severity: "warning", penalty: 5, norma: "RDE D000014-2024-MIDAGRI-SERFOR-DE: formato de la GTF (vehículo y conductor)",
    uno: "guía sin datos del transporte", varios: "guías sin datos del transporte", okTitle: "Toda guía lleva el vehículo y el conductor",
    description: "El puesto de control compara la placa y el conductor con la guía: una casilla vacía es la primera observación.",
    action: "Completa el vehículo y el conductor de esas guías.", ...VER_GUIAS,
  },
  bloque_excedido: {
    seccion: "saldos", severity: "error", penalty: 30, norma: `${PLAN_APROBADO}: volumen por bloque y especie`,
    uno: "bloque pasado de su volumen", varios: "bloques pasados de su volumen", okTitle: "Ningún bloque pasa su volumen autorizado",
    description: "Lo registrado en el libro ya pasa lo autorizado para ese bloque y especie: es aprovechar fuera del plan.",
    action: "Revisa las talas de ese bloque o corrige el reparto del plan.", ...VER_PLAN,
  },
  talado_sin_censo: {
    seccion: "saldos", severity: "error", penalty: 25, norma: `${PLAN_APROBADO}: censo comercial`,
    uno: "árbol talado fuera del censo", varios: "árboles talados fuera del censo", okTitle: "Todo árbol talado está en el censo de su plan",
    description: "OSINFOR supervisa contra el censo: un árbol talado que no figura no tiene cómo probarse autorizado. Sólo planes de bosque con censo cargado.",
    action: "Corrige el código del árbol o cárgalo en el censo si falta.", ...VER_PLAN,
  },
  talado_bajo_dmc: {
    seccion: "saldos", severity: "error", penalty: 20, norma: "RJ 458-2002-INRENA (diámetro mínimo de corta) o el DMC del plan",
    uno: "árbol talado bajo el DMC sin justificar", varios: "árboles talados bajo el DMC sin justificar", okTitle: "Ningún árbol bajo el DMC sin su justificación",
    description: "Por debajo del diámetro mínimo de corta no se aprovecha, salvo con la justificación escrita en la tala.",
    action: "Corrige el DAP en el censo o escribe la justificación en la tala.", ...VER_SECCIONES,
  },
  bloque_excederia: {
    seccion: "saldos", severity: "warning", penalty: 5, norma: `${PLAN_APROBADO}: volumen por bloque y especie`,
    uno: "bloque se pasaría con las preliminares", varios: "bloques se pasarían con las preliminares", okTitle: "Las preliminares caben en sus bloques",
    description: "Si registras las GTF preliminares pendientes, el bloque pasa lo autorizado.",
    action: "Corrige o anula esas preliminares antes de registrarlas.", ...VER_PLAN,
  },
  talado_sin_coordenadas: {
    seccion: "saldos", severity: "warning", penalty: 5, norma: `${PLAN_APROBADO}: censo con coordenadas UTM`,
    uno: "árbol talado sin coordenadas", varios: "árboles talados sin coordenadas", okTitle: "Todo árbol talado tiene su ubicación",
    description: "En la supervisión se va al tocón: sin UTM en el censo ni GPS en la tala no hay cómo ubicarlo.",
    action: "Carga la UTM del árbol en el censo.", ...VER_PLAN,
  },
  plan_vencido: {
    seccion: "plan", severity: "error", penalty: 20, norma: `${PLAN_APROBADO}: se aprovecha sólo con el plan vigente`,
    uno: "plan vencido o suspendido", varios: "planes vencidos o suspendidos", okTitle: "Ningún plan vivo está vencido",
    description: "Con el plan vencido o suspendido no se tala ni se moviliza. Si ya terminaste con él, ciérralo y deja de contar.",
    action: "Cierra el plan o carga la ampliación de su vigencia.", ...VER_PLAN,
  },
  papeles_vencidos: {
    seccion: "plan", severity: "error", penalty: 15, norma: "Papeles obligatorios del permiso (informe de ejecución: RJ 001-2018-OSINFOR)",
    uno: "plan con papeles vencidos", varios: "planes con papeles vencidos", okTitle: "Ningún papel obligatorio vencido",
    description: "Un papel obligatorio vencido es lo primero que observa una supervisión.",
    action: "Renueva el papel y sube la copia en Papeles del plan.", ...VER_PLAN,
  },
  plan_por_vencer: {
    seccion: "plan", severity: "warning", penalty: 3, norma: `${PLAN_APROBADO}: vigencia`,
    uno: "plan por vencer o sin fecha", varios: "planes por vencer o sin fecha", okTitle: "Planes con la vigencia holgada",
    description: "Te aviso desde 90 días antes para que el vencimiento no te agarre con madera en el monte. Sin fecha cargada no te puedo avisar.",
    action: "Planifica el cierre o la ampliación; carga la fecha si falta.", ...VER_PLAN,
  },
  papeles_faltan: {
    seccion: "plan", severity: "warning", penalty: 5, norma: "Papeles obligatorios del permiso",
    uno: "plan con papeles por subir", varios: "planes con papeles por subir", okTitle: "Papeles obligatorios completos",
    description: "Los papeles que la supervisión pide tienen que estar a la mano: los que faltan, súbelos antes de que te los pidan.",
    action: "Sube los que faltan en Papeles del plan.", ...VER_PLAN,
  },
  ficha_incompleta: {
    seccion: "plan", severity: "warning", penalty: 3, norma: "RDE 264-2019: datos del título habilitante en el libro",
    uno: "plan con la ficha incompleta", varios: "planes con la ficha incompleta", okTitle: "Fichas de los planes completas",
    description: "Título, resolución, titular, regente y ubicación salen en el libro impreso y en las guías.",
    action: "Completa la ficha del plan.", ...VER_PLAN,
  },
  despacho_sin_asentar: {
    seccion: "plazos", severity: "error", penalty: 20, norma: PLAZO_15,
    uno: "despacho sin asentar fuera de plazo", varios: "despachos sin asentar fuera de plazo", okTitle: "Ningún despacho sin asentar fuera de plazo",
    description: "Guías emitidas cuyo despacho todavía no está en el libro y ya pasaron los 15 días.",
    action: "Asienta esos despachos en el libro hoy.", ...VER_SECCIONES,
  },
  preliminar_vencida: {
    seccion: "plazos", severity: "error", penalty: 15, norma: PLAZO_15,
    uno: "GTF preliminar fuera de plazo", varios: "GTF preliminares fuera de plazo", okTitle: "Ninguna GTF preliminar fuera de plazo",
    description: "Guías hechas a mano, anotadas como preliminares, que pasaron los 15 días sin registrarse en el libro.",
    action: "Regístralas o anúlalas en el plan.", ...VER_PLAN,
  },
  despacho_por_asentar: {
    seccion: "plazos", severity: "warning", penalty: 5, norma: PLAZO_15,
    uno: "despacho por asentar", varios: "despachos por asentar", okTitle: "Ningún despacho esperando asiento",
    description: "Guías emitidas que el libro todavía no tiene: los 15 días ya corren.",
    action: "Asiéntalos antes de que venza el plazo.", ...VER_SECCIONES,
  },
  preliminar_vieja: {
    seccion: "plazos", severity: "warning", penalty: 3, norma: PLAZO_15,
    uno: "GTF preliminar por vencer", varios: "GTF preliminares por vencer", okTitle: "Las GTF preliminares están al día",
    description: "Preliminares pendientes desde hace varios días: regístralas antes de los 15.",
    action: "Regístralas en el libro.", ...VER_PLAN,
  },
  fechas_fuera_de_orden: {
    seccion: "libro", severity: "error", penalty: 15, norma: "RDE 264-2019: cadena tala → trozado → despacho",
    uno: "línea con la fecha fuera de orden", varios: "líneas con la fecha fuera de orden", okTitle: "Las fechas siguen la cadena tala → trozado → despacho",
    description: "Un trozado antes de la tala de su árbol, o un despacho antes del trozado de su troza: la fecha está mal escrita o el código no es ése.",
    action: "Corrige la fecha o el código de esas líneas.", ...VER_SECCIONES,
  },
};

export const CLAVES_CHEQUEO = Object.keys(DEFS) as ClaveChequeo[];

/** Lo que depende de los ajustes de la persona (la licencia, los días de aviso). */
function ajustar(clave: ClaveChequeo, d: Def, a: AjustesChequeo): Def {
  if (clave === "guia_sin_transporte" && a.pedirLicencia) {
    return { ...d, okTitle: "Toda guía lleva el vehículo, el conductor y su licencia", action: "Completa el vehículo, el conductor y la licencia de esas guías." };
  }
  if (clave === "preliminar_vieja") {
    return { ...d, description: `Preliminares pendientes desde hace ${a.diasPreliminar} días o más: regístralas antes de los 15.` };
  }
  return d;
}

/** Los chequeos avanzados, listos para `computeLothCompliance({ extra })`. */
export function armarChequeos(casos: CasosDelChequeo, ajustes: AjustesChequeo): LothCheck[] {
  const out: LothCheck[] = [];
  for (const clave of CLAVES_CHEQUEO) {
    const lista = casos[clave];
    if (!lista) continue;
    const d = ajustar(clave, DEFS[clave], ajustes);
    const n = lista.length;
    out.push({
      key: clave,
      count: n,
      severity: d.severity,
      penalty: d.penalty,
      title: `${n.toLocaleString("es-PE")} ${n === 1 ? d.uno : d.varios}`,
      okTitle: d.okTitle,
      description: d.description,
      action: d.action,
      navTarget: d.navTarget,
      navigateLabel: d.navigateLabel,
      seccion: d.seccion,
      norma: d.norma,
      casos: lista.slice(0, TOPE_CASOS),
    });
  }
  return out;
}
