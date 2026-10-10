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
  type SubvistaModulo,
} from "@/lib/admin/subvistas-modulos";
import { crearResolverDestino, type DestinoTab, type MapasDeDestino } from "@/lib/admin/destino-tab";
import { origenesDeVista } from "@/lib/admin/permiso-vista";
import { TAB_MIGRATION, VISTA_MIGRATION } from "@/app/admin/_lib/tab-migration";
import { VALID_TABS } from "@/app/admin/_lib/tabs.types";
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
  "delivery-partners": { archivo: "components/admin/unified/DeliveryPartnersModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  camaras: { archivo: "components/admin/forestal/CamarasView.tsx", extraer: idsDeArray("VISTAS") },
  "asistente-ia": { archivo: "components/admin/unified/AsistenteIAHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  "metas-logros": { archivo: "components/admin/unified/MetasLogrosModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  "analytics-pro": { archivo: "components/admin/unified/AnalisisHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
  rrhh: {
    archivo: "components/admin/unified/RecursosHumanosHubModule.tsx",
    extraer: idsDeLista("TODAS_LAS_VISTAS"),
    lista: "TODAS_LAS_VISTAS",
  },
  tareas: { archivo: "components/admin/unified/EquipoHubModule.tsx", extraer: idsDeTABS, lista: "TABS" },
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
 */
function aliasSinOrigen(
  mapas: MapasDeDestino,
  vistasDe: (tab: string) => readonly SubvistaModulo[],
  pestanas: ReadonlySet<string>,
): string[] {
  const resolver = crearResolverDestino(mapas);
  const fallas: string[] = [];
  const revisar = (desde: string, alias: string, destino: DestinoTab | null) => {
    if (!destino?.vista || destino.tab === alias || !pestanas.has(alias)) return;
    const lugar = `${desde} → ${destino.tab}:${destino.vista}`;
    const vista = vistasDe(destino.tab).find((v) => v.key === destino.vista);
    if (!vista) fallas.push(`${lugar}: la vista no está registrada`);
    else if (!origenesDeVista(destino.tab, vista).includes(alias)) fallas.push(`${lugar}: su origen no nombra «${alias}»`);
  };
  for (const id of Object.keys(mapas.alias)) revisar(id, id, resolver(id));
  for (const clave of Object.keys(mapas.vistas)) {
    const [tab, vista] = clave.split(":");
    revisar(clave, tab, resolver(tab, vista));
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
      expect(src, `${moduleId} ya usa useVistaModulo: múdalo a VISTAS_POR_MODULO`).not.toMatch(/useVistaModulo\(/);
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
    "documentos/contratos": {
      archivo: "components/admin/ContratosModule.tsx",
      constante: /const CONTRATOS_VISTAS = \[([^\]]+)\]/,
    },
    "documentos/cotizaciones": {
      archivo: "components/admin/CotizacionesModule.tsx",
      constante: /const COTIZACIONES_VISTAS = \[([^\]]+)\]/,
    },
    "documentos/drive": {
      archivo: "components/admin/documentos/DocumentosModule.tsx",
      constante: /const DRIVE_MODOS = \[([\s\S]*?)\] as const;/,
    },
    // Acá los ids no están en un array literal sino en `const TABS = [...]`
    // (VALID_TABS se deriva de él): se lee el TABS, que es la fuente.
    "pagina-inicio/pagina": {
      archivo: "app/admin/store-page/page.tsx",
      constante: /const TABS(?::\s*[^=]+)?\s*=\s*\[([\s\S]*?)\n\];/,
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
