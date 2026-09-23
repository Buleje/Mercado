/**
 * La estructura de Mi Plata: cinco pestañas y sus secciones.
 *
 * EL PROBLEMA QUE RESUELVE (medido 2026-09-21 en la pantalla de Brandon, a
 * 1280 px). El hub tenía SEIS pestañas y CATORCE secciones repartidas en dos
 * barras apiladas: 325 px de cromo antes del primer dato en 14 de 15 vistas,
 * con ocho de esas vistas midiendo menos de 1,3 pantallas de contenido. Y en su
 * tenant real, Préstamos, Tesorería y Presupuesto tenían CERO filas: tres
 * opciones permanentes en pantalla que no contestaban nada.
 *
 * LO QUE SE AGRUPÓ Y POR QUÉ. Por la pregunta que contesta cada vista, no por
 * el componente que la dibuja:
 *
 *   · «¿cuánto gané?» es UNA pregunta aunque se mire de tres maneras
 *     (resultado, rentabilidad, comparar períodos) → Resultado con un
 *     conmutador de presentación, no tres pestañas.
 *   · «¿en qué se me va la plata?» junta gastos, la proyección de caja, la
 *     tesorería y los activos → Movimientos. El presupuesto no es una sección
 *     aparte: es el TECHO de esos mismos gastos, y separarlos obligaba a ir y
 *     volver para saber si te pasaste. Por eso vive DENTRO de Gastos (`adentro`).
 *   · «¿quién me debe?» ya estaba junto → Por cobrar.
 *
 * NADA SE BORRÓ: las quince vistas siguen existiendo y siguen teniendo
 * dirección propia (`VISTAS`), y todos los nombres viejos siguen aterrizando
 * donde corresponde (`DONDE_VIVE`).
 */

import {
  TrendingUp, TrendingDown, PieChart as PieChartIcon,
  FileBarChart, Waves, GitCompareArrows, ArrowRightLeft,
  BarChart3, CreditCard,
  Landmark, HandCoins, Banknote, Coins, Construction, Gauge,
  type LucideIcon,
} from "@buleje/design-system/icons";

export const MODULE_ID = "plata";

/** Las cinco pestañas de Mi Plata. */
export const TABS = [
  { id: "resumen" as const,     label: "Resumen",     icon: BarChart3 },
  { id: "resultado" as const,   label: "Resultado",   icon: TrendingUp },
  { id: "movimientos" as const, label: "Movimientos", icon: ArrowRightLeft },
  { id: "por-cobrar" as const,  label: "Por cobrar",  icon: CreditCard },
  { id: "reportes" as const,    label: "Reportes",    icon: FileBarChart },
];

export type TabId = (typeof TABS)[number]["id"];

/**
 * El dato que enciende una sección.
 *
 * Una sección con `dato` sólo se ofrece si ESE dato existe de verdad (lo mide
 * `use-secciones-con-datos`, con un fetch al endpoint del área). No hay lista
 * dura de «secciones que no se usan»: quien tiene préstamos los ve, y quien no,
 * no los tiene siempre en pantalla.
 */
export type ClaveDeDato = "payables" | "assets" | "fiados" | "prestamos" | "adelantos" | "presupuesto";

export interface Seccion {
  id: string;
  label: string;
  /** Etiqueta corta para el control de la fila del título (el largo va al `title`). */
  corto?: string;
  icon: LucideIcon;
  /** Qué tiene que existir para que valga la pena ofrecerla. Sin esto, siempre se ofrece. */
  dato?: ClaveDeDato;
  /** Vistas que se miran DENTRO de esta sección (siguen teniendo dirección propia). */
  adentro?: string[];
}

/**
 * Lo que vive dentro de cada pestaña. Sin entrada = la pestaña no se divide.
 *
 * `Resumen` y `Reportes` no se dividen: un control de un solo botón es ruido.
 */
export const SECCIONES: Partial<Record<TabId, Seccion[]>> = {
  resultado: [
    { id: "pl",           label: "Ganancias y pérdidas", corto: "Ganancias", icon: TrendingUp },
    { id: "rentabilidad", label: "Rentabilidad",                             icon: PieChartIcon },
    { id: "comparador",   label: "Comparar períodos",    corto: "Comparar",  icon: GitCompareArrows },
  ],
  movimientos: [
    /* El presupuesto va adentro: es el techo de estos mismos gastos. */
    { id: "gastos",     label: "Gastos y presupuesto", corto: "Gastos", icon: TrendingDown, adentro: ["presupuesto"] },
    { id: "flujo-caja", label: "Proyección de caja",   corto: "Caja",   icon: Waves },
    { id: "tesoreria",  label: "Tesorería",                             icon: Landmark,     dato: "payables" },
    { id: "activos",    label: "Activos",                               icon: Construction, dato: "assets" },
  ],
  "por-cobrar": [
    { id: "por-cobrar", label: "Todo lo que me deben", corto: "Todo", icon: CreditCard },
    { id: "fiados",     label: "Fiados",                              icon: HandCoins, dato: "fiados" },
    { id: "prestamos",  label: "Préstamos",                           icon: Banknote,  dato: "prestamos" },
    { id: "adelantos",  label: "Adelantos",                           icon: Coins,     dato: "adelantos" },
    { id: "scoring",    label: "Scoring",                             icon: Gauge },
  ],
};

/** La primera sección de una pestaña, o la pestaña misma si no se divide. */
export const primeraSeccion = (tab: TabId): string => SECCIONES[tab]?.[0]?.id ?? tab;

/**
 * Las vistas direccionables por `?vista=`, DERIVADAS de la estructura: cada
 * sección, cada cosa que vive dentro de una sección, y la pestaña misma cuando
 * no se divide. Derivarlas —en vez de listarlas— es lo que evita que agregar
 * una sección la deje sin dirección.
 */
export const VISTAS: readonly string[] = TABS.flatMap(
  (t) => SECCIONES[t.id]?.flatMap((s) => [s.id, ...(s.adentro ?? [])]) ?? [t.id],
);

export interface Ubicacion {
  tab: TabId;
  /** La hoja: lo que va en `?vista=`. */
  vista: string;
  /** La sección que se pinta activa en el control (una vista de `adentro` marca a su dueña). */
  seccion: string;
}

/**
 * Nombres que NO son una vista y hay que aterrizar igual: pestañas viejas,
 * pestañas nuevas y atajos del menú del panel. Cuando una vista cambia de
 * lugar se actualiza acá — es lo que evita que un enlace guardado aterrice en
 * el lugar equivocado.
 */
const ALIAS: Record<string, string> = {
  plata: "resumen",
  dashboard: "resumen",
  resultado: "pl",
  /* Pestañas que ya no existen: Gastos y Caja se fundieron en Movimientos. */
  caja: "flujo-caja",
  movimientos: "gastos",
};

/**
 * Dónde vive ahora cada nombre —viejo o nuevo—.
 *
 * El menú del panel entra a Mi Plata por seis atajos distintos (`?tab=fiados`,
 * `?tab=activos`, `?tab=scoring`, `?tab=prestamos`, `?tab=adelantos`,
 * `?tab=por-cobrar`), el buscador global apunta a `?vista=`, y hay un
 * `localStorage` con la última vista abierta. Sin esta tabla todos esos
 * caminos aterrizarían en «Resumen» y el atajo dejaría de ser un atajo.
 *
 * Se construye desde `TABS`/`SECCIONES` y no a mano: una tabla escrita a mano
 * se desincroniza el día que una vista cambia de pestaña, que es justo el día
 * en que más se la necesita.
 */
export const DONDE_VIVE: Record<string, Ubicacion> = (() => {
  const mapa: Record<string, Ubicacion> = {};
  for (const t of TABS) {
    const secciones = SECCIONES[t.id];
    if (!secciones) {
      mapa[t.id] = { tab: t.id, vista: t.id, seccion: t.id };
      continue;
    }
    for (const s of secciones) {
      mapa[s.id] = { tab: t.id, vista: s.id, seccion: s.id };
      for (const dentro of s.adentro ?? []) {
        mapa[dentro] = { tab: t.id, vista: dentro, seccion: s.id };
      }
    }
    // La pestaña sin sección cae en su primera sección. No pisa a una hoja que
    // ya se llame igual (`por-cobrar`, `gastos`): esa es más específica.
    const primera = secciones[0];
    if (primera && !mapa[t.id]) mapa[t.id] = { tab: t.id, vista: primera.id, seccion: primera.id };
  }
  for (const [viejo, nuevo] of Object.entries(ALIAS)) {
    const destino = mapa[nuevo];
    if (destino && !mapa[viejo]) mapa[viejo] = destino;
  }
  return mapa;
})();

/** Traduce cualquier nombre —viejo o nuevo, pestaña o vista— a dónde cae. */
export function ubicar(id: string | undefined): Ubicacion {
  const destino = id ? DONDE_VIVE[id] : undefined;
  return destino ?? { tab: "resumen", vista: "resumen", seccion: "resumen" };
}
