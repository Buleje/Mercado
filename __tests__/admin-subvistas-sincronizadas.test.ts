import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANIDADAS_POR_MODULO,
  CTP_VISTAS,
  LOTH_VISTAS,
  VISTAS_LOCALES_POR_MODULO,
  VISTAS_POR_MODULO,
  vistasDelModulo,
  type SubvistaAnidada,
  type SubvistaModulo,
} from "@/lib/admin/subvistas-modulos";
import { crearResolverDestino, type DestinoTab, type MapasDeDestino } from "@/lib/admin/destino-tab";
import {
  SIN_FILTRO,
  estadoDelOrigen,
  idsDelPlan,
  idsDelRol,
  origenesDeVista,
  vistaPermitida,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import type { PlanTier } from "@/lib/billing/plan-tiers";
import { TAB_MIGRATION, VISTA_MIGRATION } from "@/app/admin/_lib/tab-migration";
import { PLANES, ROLES } from "../scripts/matriz-pestanas.mjs";
import { VALID_TABS, type Tab } from "@/app/admin/_lib/tabs.types";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";

/**
 * `VISTAS_POR_MODULO` es un espejo: declara las sub-vistas de cada módulo para
 * que el buscador global pueda ofrecerlas SIN importar el módulo (que es lazy y
 * arrastraría medio panel a su chunk).
 *
 * Un espejo se desincroniza solo. Sin este test, renombrar una pestaña deja al
 * buscador ofreciendo un destino que ya no existe —click y no pasa nada— y
 * agregar una la deja invisible. Se lee el SOURCE de cada módulo y se comparan
 * los ids: es feo, y es el precio de no poder importarlos.
 */

const RAIZ = join(__dirname, "..");

/**
 * Dónde vive cada módulo y de dónde salen sus ids. `lista` = la constante con
 * `{ id, label }` que dibuja las pestañas: con ella se comparan también las
 * etiquetas (Cámaras y Recetas no tienen: sus rótulos salen de otro lado).
 */
const MODULOS: Record<string, { archivo: string; extraer: (src: string) => string[]; lista?: string }> = {
  "ventas-caja": { archivo: "components/admin/unified/POSCajaModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  compras: { archivo: "components/admin/unified/ComprasModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  inventario: { archivo: "components/admin/unified/InventarioAlmacenesModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  clientes: { archivo: "components/admin/unified/CRMClientesModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  recetas: { archivo: "components/admin/RecetasModule.tsx", extraer: idsDeRecetas },
  "pagina-inicio": { archivo: "components/admin/unified/MiTiendaHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  config: { archivo: "components/admin/settings/secciones.ts", extraer: idsDeTABS, lista: "TABS" },
  // Mi Plata es de dos niveles: las vistas direccionables son las HOJAS (la
  // sección dentro de la pestaña), no las pestañas.
  plata: { archivo: "components/admin/unified/finanzas/estructura.ts", extraer: idsDeFinanzas },
  // Hubs registrados en la ola 1 del plan «panel unificado» (2026-10-09).
  "whatsapp-inbox": { archivo: "components/admin/unified/MensajesHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  campanas: { archivo: "components/admin/unified/CrecimientoHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  camaras: { archivo: "components/admin/forestal/CamarasView.tsx", extraer: idsDeArray("VISTAS") },
  "asistente-ia": { archivo: "components/admin/unified/AsistenteIAHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  "metas-logros": { archivo: "components/admin/unified/MetasLogrosModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  // Plan de la empresa (ADR-497).
  planificacion: { archivo: "components/admin/unified/PlanificacionModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  "analytics-pro": { archivo: "components/admin/unified/AnalisisHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  // Agenda del negocio (ADR-501, 18-10): Tareas y Notas se mudaron acá desde Equipo.
  administracion: { archivo: "components/admin/unified/AdministracionModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  rrhh: {
    archivo: "components/admin/unified/RecursosHumanosHubModule.tsx",
    extraer: idsDeLista("TODAS_LAS_VISTAS"),
    lista: "TODAS_LAS_VISTAS",
  },
  // Ola 2 (2026-10-10). `tareas` y `delivery-partners` ya no registran vistas:
  // son vistas de Equipo y de Pedidos y reparto (el buscador las ofrecía dos veces).
  pedidos: { archivo: "components/admin/OrdersTab/index.tsx", extraer: idsDeLista("VISTAS"), lista: "VISTAS" },
  "forestal-herramientas": {
    archivo: "components/admin/forestal/herramientas-grupos.ts",
    extraer: idsDeArray("VISTAS_HERRAMIENTAS"),
  },
  // Ola 3 (2026-10-10): Comprobantes es su propio hub y Documentos queda con el
  // Archivo y Contratos.
  facturacion: { archivo: "components/admin/unified/ComprobantesHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  documentos: { archivo: "components/admin/unified/DocumentosHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  // Estado local (useState), por eso va en VISTAS_LOCALES_POR_MODULO.
  marketplace: { archivo: "components/admin/unified/MarketplaceModule.tsx", extraer: idsDeTABS, lista: "TABS" },
};

/** El bloque `const <nombre> = [...]` (con o sin anotación de tipo). */
function bloqueDe(src: string, nombre: string): string | null {
  const m = src.match(new RegExp(`const ${nombre}(?::\\s*[^=]+)?\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  return m ? m[1] : null;
}

/** Los `id: "..."` del bloque `const <nombre> = [...]`. */
function idsDeLista(nombre: string): (src: string) => string[] {
  return (src) => [...(bloqueDe(src, nombre) ?? "").matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Los `id: "..."` del bloque `const TABS = [...]`. */
function idsDeTABS(src: string): string[] {
  return idsDeLista("TABS")(src);
}

/** Las cadenas de `const <nombre> = ["a", "b"] as const;` (Cámaras). */
function idsDeArray(nombre: string): (src: string) => string[] {
  return (src) => {
    const m = src.match(new RegExp(`const ${nombre} = \\[([^\\]]+)\\] as const`));
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  };
}

/**
 * Las vistas a las que lleva un alias sin nombrarlo en su `origen`. Un alias que
 * lleva a una vista es una pestaña que se fundió en otra (receta §6.2 del plan:
 * `TAB_MIGRATION[A] = { tab: B, vista: a }`, o un par de `VISTA_MIGRATION`), y
 * sin `origen` la vista hereda el permiso de B: Delivery (Enterprise/Max)
 * dentro de Pedidos (Básico) quedaría para Básico. Sólo cuentan los alias que
 * son pestañas de hoy; un nombre viejo que nunca lo fue no puede ser origen.
 *
 * Una vista que ya tenía su propio `origen` y se muda entera de pestaña lleva
 * ESE permiso, no el de la pestaña de antes: Equipo › Tareas pedía la pestaña
 * `tareas`, así que en Administración tiene que nombrar `tareas`, no `rrhh`
 * (nombrar `rrhh` le regalaría Tareas a quien ve Equipo y nunca la tuvo).
 */
const ORIGEN_ANTES_DE_MUDARSE: Record<string, readonly string[]> = {
  // ADR-501 (18-10): en Equipo las dos tenían origen `tareas`.
  "rrhh:tareas": ["tareas"],
  "rrhh:notas": ["tareas"],
};

/** Rol × plan del panel (los de `matriz-pestanas.mjs`), sin plantilla ni rubro. */
const COMBINACIONES: { nombre: string; ctx: ContextoPermiso }[] = ROLES.flatMap((rol: string) =>
  PLANES.map((plan: string) => ({
    nombre: `${rol}/${plan}`,
    ctx: { ...SIN_FILTRO, rol: idsDelRol(rol, null), plan: idsDelPlan(plan as PlanTier) },
  })),
);

function aliasSinOrigen(
  mapas: MapasDeDestino,
  vistasDe: (tab: string) => readonly SubvistaModulo[],
  pestanas: ReadonlySet<string>,
  anidadasDe: (tab: string) => readonly SubvistaAnidada[] = (tab) => ANIDADAS_POR_MODULO[tab] ?? [],
): string[] {
  const resolver = crearResolverDestino(mapas);
  const fallas: string[] = [];
  const revisar = (desde: string, alias: string, destino: DestinoTab | null) => {
    if (!destino?.vista || destino.tab === alias || !pestanas.has(alias)) return;
    const lugar = `${desde} → ${destino.tab}:${destino.vista}${destino.sub ? `:${destino.sub}` : ""}`;
    const vista = vistasDe(destino.tab).find((v) => v.key === destino.vista);
    const pedidos = ORIGEN_ANTES_DE_MUDARSE[desde] ?? [alias];
    if (!vista) {
      fallas.push(`${lugar}: la vista no está registrada`);
      return;
    }
    const deLaVista = origenesDeVista(destino.tab, vista);
    const seccion = destino.sub ? anidadasDe(destino.tab).find((a) => a.vista === destino.vista && a.key === destino.sub) : undefined;
    if (!seccion?.origen?.length) {
      for (const o of pedidos) if (!deLaVista.includes(o)) fallas.push(`${lugar}: su origen no nombra «${o}»`);
      return;
    }
    /* Un alias que entra a una SECCIÓN (`?sub=`) con origen propio (18-10:
       `plata:cierres` → Caja › Cierres del día) tiene que cumplir DOS cosas:
       la sección nombra el permiso viejo (si no, se la escondemos a quien la
       tenía) y quien tenía ese permiso llega a la vista que la contiene (si no,
       la sección existe pero nadie de ellos puede abrirla). Lo segundo se mira
       en cada rol × plan, porque el origen de la vista puede no nombrarlo. */
    for (const o of pedidos) if (!(seccion.origen as readonly string[]).includes(o)) fallas.push(`${lugar}: la sección no nombra «${o}»`);
    for (const { nombre, ctx } of COMBINACIONES) {
      const loTenia = pedidos.some((o) => estadoDelOrigen(ctx, o) === "visible");
      if (loTenia && !vistaPermitida(ctx, deLaVista)) {
        fallas.push(`${lugar}: ${nombre} tenía «${pedidos.join("», «")}» y no llega a ${destino.tab}:${destino.vista}`);
      }
    }
  };
  for (const id of Object.keys(mapas.alias)) revisar(id, id, resolver(id));
  /* También las claves finas `tab:vista:sub` (una sección que se muda sola). */
  for (const clave of Object.keys(mapas.vistas)) {
    const [tab, vista, sub] = clave.split(":");
    revisar(clave, tab, resolver(tab, vista, sub));
  }
  return fallas;
}

function idsDeRecetas(src: string): string[] {
  const bloque = src.match(/const RECETAS_VISTAS = \[([^\]]+)\]/);
  if (!bloque) return [];
  return [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Las hojas de Mi Plata: la sección de cada pestaña, o la pestaña misma cuando
 * no se divide. Es la misma cuenta que hace `VISTAS` en la estructura.
 *
 * La estructura se mudó de `FinanzasModule.tsx` a `finanzas/estructura.ts` y el
 * bloque pasó de llamarse `SUBS` a `SECCIONES` cuando Mi Plata se unificó de
 * 6 pestañas + 14 sub-vistas a 5 (ADR de la ronda de «Plata compacta»). Este
 * test fue el que lo cazó: el buscador global seguía ofreciendo sub-vistas que
 * ya no existían.
 */
function idsDeFinanzas(src: string): string[] {
  const tabs = idsDeTABS(src);
  const bloque = src.match(/const SECCIONES[^=]*=\s*\{([\s\S]*?)\n\};/);
  const subsPorTab = new Map<string, string[]>();
  if (bloque) {
    // Cada entrada cierra con `\n  ],` — incluida la última. Un lookahead por
    // "la próxima clave" se comía el último bloque (perdía `activos`).
    for (const m of bloque[1].matchAll(/"?([\w-]+)"?:\s*\[([\s\S]*?)\n\s{2}\],/g)) {
      subsPorTab.set(m[1], [...m[2].matchAll(/\bid:\s*"([^"]+)"/g)].map((x) => x[1]));
    }
  }
  return tabs.flatMap((t) => subsPorTab.get(t) ?? [t]);
}

describe("VISTAS_POR_MODULO refleja las pestañas reales de cada módulo", () => {
  it("declara todos los módulos que dice cubrir", () => {
    const declarados = [...Object.keys(VISTAS_POR_MODULO), ...Object.keys(VISTAS_LOCALES_POR_MODULO)];
    expect(declarados.sort()).toEqual(Object.keys(MODULOS).sort());
  });

  /**
   * El buscador global lee `VISTAS_POR_MODULO` y manda a `?vista=`. Un módulo
   * que cambia de vista con `useState` ignora ese parámetro: ofrecerlo llevaría
   * a la vista por defecto sin decir nada. Por eso esos van aparte, y el día que
   * el módulo gane `?vista=` tienen que mudarse (si no, nadie los puede buscar).
   */
  it("los de estado local no leen ?vista= y no se repiten en el registro del buscador", () => {
    for (const moduleId of Object.keys(VISTAS_LOCALES_POR_MODULO)) {
      expect(Object.hasOwn(VISTAS_POR_MODULO, moduleId), moduleId).toBe(false);
      const src = readFileSync(join(RAIZ, MODULOS[moduleId].archivo), "utf8");
      expect(src, `${moduleId} ya usa useVistaModulo: múdalo a VISTAS_POR_MODULO`).not.toMatch(/useVistaModulo(<[^>]*>)?\(/);
    }
  });

  /** `origen` (plan «panel unificado», regla R2) sólo puede nombrar pestañas que existen. */
  it("el origen de cada vista nombra pestañas reales", () => {
    const ids = new Set<string>(ALL_TABS.map((t) => t.id));
    const todas = [
      ...Object.values(VISTAS_POR_MODULO).flat(),
      ...Object.values(VISTAS_LOCALES_POR_MODULO).flat(),
      ...CTP_VISTAS,
      ...LOTH_VISTAS,
    ];
    for (const v of todas) {
      for (const o of v.origen ?? []) expect(ids.has(o), `${v.key} ← ${o}`).toBe(true);
    }
  });

  it("toda vista a la que lleva un alias nombra ese alias en su origen", () => {
    const mapas: MapasDeDestino = { alias: TAB_MIGRATION, vistas: VISTA_MIGRATION, validas: VALID_TABS };
    expect(aliasSinOrigen(mapas, vistasDelModulo, new Set(ALL_TABS.map((t) => t.id)))).toEqual([]);
  });

  it("el chequeo de alias atrapa una fusión sin origen", () => {
    const pestanas = new Set(["pedidos", "delivery-partners"]);
    const mapas: MapasDeDestino = {
      alias: { "delivery-partners": { tab: "pedidos", vista: "reparto" } },
      vistas: {},
      validas: VALID_TABS,
    };
    const lista: SubvistaModulo = { key: "lista", label: "Lista", hint: "Los pedidos" };
    const reparto: SubvistaModulo = { key: "reparto", label: "Reparto", hint: "Quién lleva qué" };
    const con = (vistas: SubvistaModulo[]) => (tab: string) => (tab === "pedidos" ? vistas : []);
    expect(aliasSinOrigen(mapas, con([lista, reparto]), pestanas)).toEqual([
      "delivery-partners → pedidos:reparto: su origen no nombra «delivery-partners»",
    ]);
    expect(aliasSinOrigen(mapas, con([lista]), pestanas)).toEqual([
      "delivery-partners → pedidos:reparto: la vista no está registrada",
    ]);
    expect(aliasSinOrigen(mapas, con([lista, { ...reparto, origen: ["delivery-partners"] }]), pestanas)).toEqual([]);
    // Un par de VISTA_MIGRATION que cambia de pestaña también tiene que traer su origen.
    const mudada: MapasDeDestino = { alias: {}, vistas: { "plata:fiados": { tab: "pedidos", vista: "reparto" } }, validas: VALID_TABS };
    expect(aliasSinOrigen(mudada, con([lista, reparto]), new Set(["pedidos", "plata"]))).toEqual([
      "plata:fiados → pedidos:reparto: su origen no nombra «plata»",
    ]);
    // Una clave fina `tab:vista:sub` que entra a una sección con origen propio: las dos condiciones.
    const fina: MapasDeDestino = { alias: {}, vistas: { "plata:cobrar:ruta": { tab: "pedidos", vista: "reparto", sub: "ruta" } }, validas: VALID_TABS };
    const ruta = (origen: Tab[]) => (tab: string): SubvistaAnidada[] =>
      tab === "pedidos" ? [{ vista: "reparto", key: "ruta", label: "Ruta", hint: "Por dónde va", origen }] : [];
    const ambas = new Set(["pedidos", "plata"]);
    // La sección no nombra el permiso viejo.
    expect(aliasSinOrigen(fina, con([lista, reparto]), ambas, ruta(["pedidos"]))).toContain(
      "plata:cobrar:ruta → pedidos:reparto:ruta: la sección no nombra «plata»",
    );
    // La sección lo nombra, pero la vista que la contiene pide un permiso que nadie tiene.
    const sinLlegar = aliasSinOrigen(fina, con([lista, { ...reparto, origen: ["no-existe" as Tab] }]), ambas, ruta(["plata"]));
    expect(sinLlegar.length).toBeGreaterThan(0);
    for (const f of sinLlegar) expect(f).toMatch(/^plata:cobrar:ruta → pedidos:reparto:ruta: \S+ tenía «plata» y no llega a pedidos:reparto$/);
    // Las dos: la sección lo nombra y la vista lo deja pasar.
    expect(aliasSinOrigen(fina, con([lista, { ...reparto, origen: ["pedidos", "plata"] }]), ambas, ruta(["plata"]))).toEqual([]);
  });

  /**
   * EL guard que faltaba. `GlobalSearch` indexa por id de TAB, y el MODULE_ID
   * del componente no siempre lo es: los ocho hubs (`documentos-hub`,
   * `equipo-hub`…) no son tabs, sólo se llega por alias. Declarados con su
   * MODULE_ID, sus vistas no rompían nada — simplemente no se indexaban nunca,
   * y buscarlas no devolvía resultados. No lo atrapó ni tsc ni el lint ni la
   * verificación en navegador, que probó `inventario` (donde sí coinciden).
   */
  it("todas las claves son tabs reales, o el buscador no las lee", () => {
    for (const clave of [
      ...Object.keys(VISTAS_POR_MODULO),
      ...Object.keys(VISTAS_LOCALES_POR_MODULO),
      ...Object.keys(ANIDADAS_POR_MODULO),
    ]) {
      expect(VALID_TABS, `"${clave}" no es un tab del panel`).toContain(clave);
    }
  });

  for (const [moduleId, { archivo, extraer }] of Object.entries(MODULOS)) {
    it(`${moduleId} — los ids coinciden con ${archivo.split("/").pop()}`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");
      const reales = extraer(src);

      // Si la extracción falla, el test tiene que caerse — no dar por bueno un
      // array vacío, que compararía "nada contra nada" y pasaría siempre.
      expect(reales.length, `no se pudieron extraer los ids de ${archivo}`).toBeGreaterThan(0);

      const declaradas = vistasDelModulo(moduleId).map((v) => v.key);
      expect([...declaradas].sort()).toEqual([...reales].sort());
    });
  }

  /**
   * Y las ETIQUETAS también: el buscador tiene que ofrecer la pestaña con el
   * nombre que la persona va a leer cuando llegue. Escribí "Kardex", "Arqueo" y
   * "Reseñas" de memoria y en pantalla dicen "Entradas y Salidas", "Cuadrar
   * Caja" y "Opiniones" — buscar por el nombre real no encontraba nada.
   */
  for (const [moduleId, { archivo, lista }] of Object.entries(MODULOS)) {
    if (!lista) continue; // sólo los que dibujan `{ id, label }`
    it(`${moduleId} — las etiquetas son las que se ven en pantalla`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");
      const bloque = bloqueDe(src, lista) ?? "";
      const reales = new Map(
        [...bloque.matchAll(/\bid:\s*"([^"]+)"(?:\s*as const)?\s*,\s*label:\s*"([^"]+)"/g)].map(
          (m) => [m[1], m[2]] as const,
        ),
      );
      expect(reales.size).toBeGreaterThan(0);
      for (const v of vistasDelModulo(moduleId)) {
        expect(v.label, `${moduleId}/${v.key}`).toBe(reales.get(v.key));
      }
    });
  }

  /**
   * Los destinos de segundo nivel apuntan a módulos ANIDADOS (Contratos dentro
   * de Documentos, el drive y sus modos). Si una `key` no existe allá, el
   * buscador manda a un `?sub=` que el módulo descarta y la persona aterriza en
   * el default sin entender por qué.
   */
  const ANIDADOS: Record<string, { archivo: string; constante: RegExp }> = {
    "asistente-ia/comandos": {
      archivo: "components/admin/comandos-ia/ComandosIA.tsx",
      constante: /const SUBS = \[([^\]]+)\]/,
    },
    // Análisis (11-10): Predicción y Alertas.
    "analytics-pro/forecast": {
      archivo: "components/admin/forecasting/prediccion-ayuda.ts",
      constante: /export const SECCIONES_PREDICCION = \[([^\]]+)\]/,
    },
    "analytics-pro/inteligencia": {
      archivo: "components/admin/analisis/InteligenciaTab.tsx",
      constante: /const SECCIONES = \[([^\]]+)\]/,
    },
    // Mi Plata (11-10): secciones de Gastos, Proyección e Impuestos.
    "plata/gastos": {
      archivo: "components/admin/unified/finanzas/GastosConPresupuesto.tsx",
      constante: /export const SUBS_GASTOS = \[([^\]]+)\]/,
    },
    "plata/flujo-caja": {
      archivo: "components/admin/finance/CashflowRollingTable.tsx",
      constante: /export const SUBS_PROYECCION = \[([^\]]+)\]/,
    },
    "plata/impuestos": {
      archivo: "components/admin/TaxTab.tsx",
      constante: /const CLAVES: readonly Seccion\[\] = \[([^\]]+)\]/,
    },
    "documentos/contratos": {
      archivo: "components/admin/ContratosModule.tsx",
      constante: /const CONTRATOS_VISTAS = \[([^\]]+)\]/,
    },
    // Ola 3: Cotizaciones se mudó de Documentos a Comprobantes (`facturacion`).
    "facturacion/cotizaciones": {
      archivo: "components/admin/CotizacionesModule.tsx",
      constante: /const COTIZACIONES_VISTAS = \[([^\]]+)\]/,
    },
    "facturacion/seguimiento": {
      archivo: "components/admin/einvoice/seguimiento/SeguimientoModule.tsx",
      constante: /export const SECCIONES_SEGUIMIENTO = \[([^\]]+)\]/,
    },
    "documentos/drive": {
      archivo: "components/admin/documentos/DocumentosModule.tsx",
      constante: /const DRIVE_MODOS = \[([\s\S]*?)\] as const;/,
    },
    // Acá los ids no están en un array literal sino en `const TABS = [...]`
    // (VALID_TABS se deriva de él): se lee el TABS, que es la fuente.
    "pagina-inicio/contenido": {
      archivo: "app/admin/store-page/page.tsx",
      constante: /const TABS(?::\s*[^=]+)?\s*=\s*\[([\s\S]*?)\n\];/,
    },
    // Ola 2 del panel unificado (2026-10-10).
    "pagina-inicio/apariencia": {
      archivo: "components/admin/StoreCustomizer.tsx",
      constante: /const TAB_IDS_CUSTOMIZER[^=]*=\s*\[([^\]]+)\]/,
    },
    "config/sistema": {
      archivo: "components/admin/sistema/subvistas-sistema.ts",
      constante: /export const SUBVISTAS_SISTEMA[^=]*=\s*\[([\s\S]*?)\n\];/,
    },
    "pedidos/reparto": {
      archivo: "components/admin/unified/DeliveryPartnersModule.tsx",
      constante: /const SECCIONES_REPARTO = \[([^\]]+)\]/,
    },
    "ctp-libro-operaciones/ingresos": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_INGRESOS = \[([^\]]+)\]/,
    },
    "ctp-libro-operaciones/tablero": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_TABLERO = \[([^\]]+)\]/,
    },
    "ctp-libro-operaciones/despacho": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_DESPACHO = \[([^\]]+)\]/,
    },
    // Compactación del Libro CTP (17-10): 22 → 16 vistas.
    "ctp-libro-operaciones/lotes": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_LOTES = \[([^\]]+)\]/,
    },
    "ctp-libro-operaciones/disponibles": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_DISPONIBLES = \[([^\]]+)\]/,
    },
    "ctp-libro-operaciones/saldos": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_SALDOS = \[([^\]]+)\]/,
    },
    "ctp-libro-operaciones/cumplimiento": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_CUMPLIMIENTO = \[([^\]]+)\]/,
    },
    "ctp-libro-operaciones/directorio": {
      archivo: "components/admin/forestal/ctp-vistas-fusionadas.ts",
      constante: /export const SUBS_DIRECTORIO = \[([\s\S]*?)\]/,
    },
    // Ola 3 del panel unificado (2026-10-10).
    "ventas-caja/caja-registradora": {
      archivo: "components/admin/caja/tipos.ts",
      constante: /export const SUBS_CAJA = \[([^\]]+)\]/,
    },
    "ventas-caja/cuentas-cobrar": {
      archivo: "components/admin/fiados/tipos.ts",
      constante: /export const FIADO_VISTAS = \[([^\]]+)\]/,
    },
    "inventario/kardex": {
      archivo: "components/admin/inventario/movimientos/secciones.ts",
      constante: /export const SUBS_MOVIMIENTOS = \[([^\]]+)\]/,
    },
    "inventario/conteo": {
      archivo: "components/admin/inventario/ConteoFisicoVista.tsx",
      constante: /export const SUBS_CONTEO = \[([^\]]+)\]/,
    },
    "inventario/ofertas": {
      archivo: "components/admin/inventario/OfertasYCuponesVista.tsx",
      constante: /export const SUBS_OFERTAS = \[([^\]]+)\]/,
    },
    "compras/ordenes-compra": {
      archivo: "components/admin/compras/OrdenesYRecepcion.tsx",
      constante: /export const SECCIONES_ORDENES = \[([^\]]+)\]/,
    },
    "compras/proveedores": {
      archivo: "components/admin/compras/ProveedoresVista.tsx",
      constante: /export const SECCIONES_PROVEEDORES = \[([^\]]+)\]/,
    },
    // Compras › Por pagar se mudó a Mi Plata › Lo que debo (18-10).
    "plata/por-pagar": {
      archivo: "components/admin/unified/finanzas/por-pagar/secciones-lo-que-debo.ts",
      constante: /export const SECCIONES_LO_QUE_DEBO = \[([^\]]+)\]/,
    },
    "loth-libro-operaciones/tablero": {
      archivo: "components/admin/forestal/loth-vistas-fusionadas.ts",
      constante: /export const SUBS_CONTROL = \[([^\]]+)\]/,
    },
    // Compactación del Libro TH (17-10): 10 → 7 vistas.
    "loth-libro-operaciones/gtf": {
      archivo: "components/admin/forestal/loth-vistas-fusionadas.ts",
      constante: /export const SUBS_GTF = \[([^\]]+)\]/,
    },
    "loth-libro-operaciones/cumplimiento": {
      archivo: "components/admin/forestal/loth-vistas-fusionadas.ts",
      constante: /export const SUBS_CUMPLIMIENTO_TH = \[([^\]]+)\]/,
    },
    // Clientes › Opiniones (19-10): «Moderar» era Marketplace › Reseñas.
    "clientes/resenas": {
      archivo: "components/admin/NPSTab.tsx",
      constante: /export const SECCIONES_OPINIONES = \[([^\]]+)\]/,
    },
    // Crecimiento › Mandar mensaje (19-10): uno por uno y automático.
    "campanas/campanas": {
      archivo: "components/admin/mandar-mensaje/use-modos-mandar-mensaje.ts",
      constante: /export const MODOS_MANDAR_MENSAJE = \[([^\]]+)\]/,
    },
  };

  it("los destinos anidados existen en el módulo al que apuntan", () => {
    for (const [moduleId, anidadas] of Object.entries(ANIDADAS_POR_MODULO)) {
      for (const a of anidadas) {
        const ref = ANIDADOS[`${moduleId}/${a.vista}`];
        expect(ref, `sin fuente declarada para ${moduleId}/${a.vista}`).toBeTruthy();
        const src = readFileSync(join(RAIZ, ref.archivo), "utf8");
        const bloque = src.match(ref.constante);
        expect(bloque, `no se pudo leer la lista de ${ref.archivo}`).toBeTruthy();
        const ids = [...bloque![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(0);
        expect(ids, `${moduleId} ▸ ${a.vista} ▸ ${a.key}`).toContain(a.key);
      }
    }
  });

  it("ninguna vista se declara sin etiqueta ni pista", () => {
    for (const [moduleId, vistas] of [
      ...Object.entries(VISTAS_POR_MODULO),
      ...Object.entries(VISTAS_LOCALES_POR_MODULO),
    ]) {
      for (const v of vistas) {
        expect(v.label.trim(), `${moduleId}/${v.key}`).not.toBe("");
        expect(v.hint.trim(), `${moduleId}/${v.key}`).not.toBe("");
      }
    }
  });
});
