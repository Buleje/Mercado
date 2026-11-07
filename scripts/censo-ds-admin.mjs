#!/usr/bin/env node
/**
 * censo-ds-admin.mjs — censo del sistema de diseño del panel (components/admin/** + app/admin/**).
 *
 * Contrato de diseño del panel (ADR-489): por familia, cuánto se usa el
 * canónico y cuánto lo hecho a mano. Mide las 10 familias (títulos, botones,
 * filtros, tablas, checks, modales, KPIs, gráficos, estructura y movimiento)
 * en una llamada (~3 s), sólo lectura.
 *
 * Cada métrica tiene un sentido:
 *   baja  lo hecho a mano — el trinquete exige que no SUBA
 *   sube  Button, Kicker, DataTable y AdminModal — el trinquete exige que no BAJE
 *   info  se informa, no se exige
 *
 * Uso:
 *   node scripts/censo-ds-admin.mjs                    # tabla de las 10 familias
 *   node scripts/censo-ds-admin.mjs --familia botones  # una familia, con los archivos que más pesan
 *   node scripts/censo-ds-admin.mjs --comparar         # contra reports/panel/censo-ds-antes.json (lo que mira el trinquete)
 *   node scripts/censo-ds-admin.mjs --json             # el censo en JSON
 *   node scripts/censo-ds-admin.mjs --escribir         # aprieta la línea base (se niega si algo empeoró; --forzar la pisa igual)
 *
 * Base: el censo de solo lectura del plan «panel unificado» (2026-10-09).
 * Trinquete: __tests__/censo-ds-trinquete.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RUTA_BASE = "reports/panel/censo-ds-antes.json";
const CARPETAS = ["components/admin", "app/admin"];

// ─── lectura ──────────────────────────────────────────────────────────────────
function recorrer(dir, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, out);
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.(test|spec|stories)\./.test(e.name)) out.push(p);
  }
  return out;
}

/** Todas las etiquetas `<nombre …>` de un texto (respeta llaves y comillas dentro de la etiqueta). */
function etiquetas(t, nombre) {
  const out = [];
  const re = new RegExp(`<${nombre}\\b`, "g");
  let m;
  while ((m = re.exec(t))) {
    let i = m.index + m[0].length;
    let llaves = 0;
    let q = null;
    for (; i < t.length && i < m.index + 4000; i++) {
      const c = t[i];
      if (q) {
        if (c === q && t[i - 1] !== "\\") q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") q = c;
      else if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === ">" && llaves === 0) break;
    }
    out.push(t.slice(m.index, i + 1));
  }
  return out;
}

function claseDe(tag) {
  const i = tag.indexOf("className=");
  if (i < 0) return null;
  const s = tag.slice(i + 10);
  if (s[0] === '"' || s[0] === "'") return s.slice(1, s.indexOf(s[0], 1));
  if (s[0] === "{") {
    let d = 0;
    let k = 0;
    for (; k < s.length; k++) {
      if (s[k] === "{") d++;
      else if (s[k] === "}") {
        d--;
        if (d === 0) break;
      }
    }
    return s.slice(0, k + 1);
  }
  return null;
}

const tokens = (cls) => cls.split(/[\s"'`{}(),?:]+/).filter(Boolean);
const elegir = (tk, re) => tk.filter((x) => re.test(x)).sort().join(" ") || "—";
const VARIANTE = /^(dark|hover|sm|md|lg|xl|focus|group|active|disabled|aria|data):/;

// ─── métricas ─────────────────────────────────────────────────────────────────
/**
 * Una métrica cuenta por archivo: `porArchivo(texto, rel) → número`. Las de
 * «distintos» juntan valores en un Set: `valores(texto, rel) → string[]`.
 */
const m = (sentido, def) => ({ sentido, ...def });
const cuenta = (re) => (t) => (t.match(re) || []).length;
const etiqueta = (nombre) => cuenta(new RegExp(`<${nombre}\\b`, "g"));

/** Definiciones de componentes cuyo nombre cumple `re` (function X( / const X = (…) =>). */
const DEF = /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+([A-Z]\w*)\s*[(<]|const\s+([A-Z]\w*)\s*(?::\s*[\w.<>, ]+)?=\s*(?:React\.)?(?:memo\(|forwardRef|\(|function|async\s*\())/g;

/*
 * ─── «local» = hecho a mano, mirado por el CUERPO (23-10) ──────────────────────
 * Antes se contaba por NOMBRE (`*Tabla`, `*Toggle`, `*Kpi`…): una `XTabla` que
 * sólo rinde `<DataTable>` contaba igual que una con `<table>` crudo, y la salida
 * fácil era renombrarla («Lista», «Listado») — el censo bajaba y la pantalla
 * seguía igual. Ahora una definición con nombre de la familia NO cuenta si su
 * cuerpo COMPONE el canónico (directo, por alias `Casilla as CasillaDS`, o a
 * través de un envoltorio que a su vez lo compone: `LothEmbudoKpi` → `CtpKpi` →
 * `StatCard`) y no trae nada hecho a mano de esa familia (`<table>`, checkbox
 * nativo, `role="switch"`, `<button>` con clases propias…). Lo que no compone
 * nada sigue contando: una grilla de `<div>` llamada `XTabla` es una tabla a mano.
 */

/** Las implementaciones canónicas COMPARTIDAS que viven en el panel (ADR-489, adenda 23-10). */
export const CANONICOS = [
  {
    ruta: "components/admin/shared/AdminTabBar.tsx",
    nombre: "AdminTabBar",
    familias: ["estructura"],
    porque: "ADR-489 §2: es EL canónico de estructura de pestaña; su tablist es el único permitido",
  },
  {
    ruta: "components/admin/shared/cabecera-con-pestanas.tsx",
    nombre: "CabeceraConPestanas",
    familias: ["estructura", "titulos"],
    porque: "la cabecera única título + pestañas del panel (32 usos): componerla es usar el canónico",
  },
  {
    ruta: "components/admin/shared/pestanas-mas.tsx",
    nombre: "MedidorDePestanas",
    familias: ["estructura"],
    porque: "mide qué pestañas caben y manda el resto a «Más»; lo comparten AdminTabBar y la cabecera",
  },
  {
    ruta: "components/admin/shared/FiltrosEnBoton.tsx",
    nombre: "FiltrosEnBoton",
    familias: ["filtros", "botones"],
    porque: "la barra de filtros plegada en un botón (5 pantallas): el filtro compartido, no uno local",
  },
  {
    ruta: "components/admin/shared/module-primitives.tsx",
    nombre: "VistaHeader",
    familias: ["estructura", "titulos"],
    porque: "la cabecera del riel de los libros forestales que pidió Brandon el 17-10 (11+ usos)",
  },
];

/**
 * Lo que el nombre manda a una familia pero NO es de ella (con su porqué, a la
 * vista en el diff). Va acá en vez de renombrarlo para esquivar el censo.
 */
export const NO_ES_DE_LA_FAMILIA = [
  {
    ruta: "components/admin/forestal/gtf-matricial-filas.tsx",
    nombre: "FilasDeLaTabla",
    familias: ["tablas"],
    porque: "ajusta en mm las filas de la tabla IMPRESA de la GTF (campos numéricos); no dibuja una tabla",
  },
  {
    ruta: "components/admin/buscador/PieBuscador.tsx",
    nombre: "PieBuscador",
    familias: ["filtros"],
    porque: "pie de atajos de teclado del buscador global (Ctrl+K), partido de GlobalSearch; el buscador se cuenta una vez, en GlobalSearch",
  },
  {
    ruta: "components/admin/buscador/ResultadosBuscador.tsx",
    nombre: "ResultadosBuscador",
    familias: ["filtros"],
    porque: "lista de resultados del buscador global (Ctrl+K), partida de GlobalSearch; no es una barra de filtros",
  },
];

/** Las definiciones de un archivo con su cuerpo (hasta la próxima declaración de nivel superior). */
const LIMITE = /\n(?=(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\b)/g;
const cacheDefs = new Map();
function definiciones(t) {
  let out = cacheDefs.get(t);
  if (out) return out;
  const cortes = [...t.matchAll(LIMITE)].map((x) => x.index);
  out = [];
  for (const x of t.matchAll(DEF)) {
    const inicio = x.index;
    const fin = cortes.find((c) => c > inicio + 1) ?? t.length;
    const cuerpo = t.slice(inicio, fin);
    out.push({
      nombre: x[1] || x[2],
      cuerpo,
      exportada: /\bexport\b/.test(x[0]),
      porDefecto: /\bdefault\b/.test(x[0]),
      tags: [...cuerpo.matchAll(/<([A-Z]\w*)/g)].map((y) => y[1]),
    });
  }
  cacheDefs.set(t, out);
  return out;
}

/** `import { A as B }` → B→A; `import X from "…/Y"` → X→Y (el nombre del archivo). */
function aliasDe(t) {
  const out = new Map();
  for (const x of t.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const parte of x[1].split(",")) {
      const [a, b] = parte.trim().split(/\s+as\s+/);
      if (a && b) out.set(b.trim(), a.trim());
    }
  }
  for (const x of t.matchAll(/import\s+([A-Z]\w*)\s*(?:,\s*\{[^}]*\})?\s*from\s*["']([^"']+)["']/g)) {
    out.set(x[1], x[2].split("/").pop().replace(/\.(tsx?|mjs|js)$/, ""));
  }
  return out;
}

const listaDe = (lista, familia) => new Set(lista.filter((x) => x.familias.includes(familia)).map((x) => `${x.ruta}#${x.nombre}`));

/**
 * Locales de una familia mirando el cuerpo. `canonicos` = nombres (regex) de los
 * canónicos; `aMano(cuerpo, texto)` = lo hecho a mano de la familia; `compone`
 * (opcional) = otra forma de componer el canónico (la función `button()`).
 */
function localesPorCuerpo(familia, re, { canonicos, aMano, compone }) {
  const propios = CANONICOS.filter((x) => x.familias.includes(familia)).map((x) => x.nombre);
  const canon = new RegExp(`^(?:${[...canonicos, ...propios].join("|")})$`);
  const exentos = new Set([...listaDe(CANONICOS, familia), ...listaDe(NO_ES_DE_LA_FAMILIA, familia)]);
  let componen = new Map();
  return {
    preparar(textos) {
      componen = new Map();
      const globales = new Set();
      const info = textos.map(([rel, t]) => ({ rel, t, ds: definiciones(t), alias: aliasDe(t), base: rel.split("/").pop().replace(/\.(tsx?)$/, "") }));
      for (const { rel } of info) componen.set(rel, new Set());
      for (let vuelta = 0, cambio = true; cambio && vuelta < 8; vuelta++) {
        cambio = false;
        for (const { rel, t, ds, alias, base } of info) {
          const locales = componen.get(rel);
          const definidas = new Set(ds.map((d) => d.nombre));
          for (const d of ds) {
            if (locales.has(d.nombre) || aMano(d.cuerpo, t)) continue;
            const usaCanonico = d.tags.some((crudo) => {
              if (crudo === d.nombre) return false;
              if (definidas.has(crudo)) return locales.has(crudo); // un local que tapa al canónico
              const n = alias.get(crudo) ?? crudo;
              /* `import ActionMenu from "…/action-menu"`: el default se llama como su archivo. */
              const mismoArchivo = canon.test(crudo) && n.replace(/[-_]/g, "").toLowerCase() === crudo.toLowerCase();
              return canon.test(n) || globales.has(n) || mismoArchivo;
            });
            if (!usaCanonico && !compone?.(d.cuerpo, t)) continue;
            locales.add(d.nombre);
            if (d.exportada) globales.add(d.nombre);
            if (d.porDefecto) globales.add(base);
            cambio = true;
          }
        }
      }
    },
    porArchivo(t, rel) {
      const set = componen.get(rel);
      return definiciones(t).filter((d) => re.test(d.nombre) && !set?.has(d.nombre) && !exentos.has(`${rel}#${d.nombre}`)).length;
    },
  };
}

const CONTROLES_A_MANO = /<(?:input|select|textarea|button)\b|role=["']tablist["']/;
/** Constantes de clase (`const BTN = "…"`). */
const constantesTexto = (re) => (t) => {
  let n = 0;
  for (const x of t.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*["'`]/g)) if (re.test(x[1])) n++;
  return n;
};
/** Desde `{`/`[` en `i`, el bloque balanceado (ignora lo que hay entre comillas). */
function bloque(t, i) {
  let d = 0;
  let q = null;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (q) {
      if (c === q && t[k - 1] !== "\\") q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "{" || c === "[") d++;
    else if (c === "}" || c === "]") {
      d--;
      if (d === 0) return t.slice(i, k + 1);
    }
  }
  return t.slice(i);
}
/**
 * Color escrito a mano: hex, rgb()/hsl()/oklch() o la paleta cruda de Tailwind
 * (`bg-emerald-100`). Un `var(--data-*)`, `--accent`… o `SERIES[0]` es token.
 */
const COLOR_A_MANO =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(|\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
/**
 * Constantes de objeto/array con nombre de paleta (`const COLORS = [ … ]`) que
 * escriben colores a mano. Por el CUERPO (23-10): un mapa de puros tokens o de
 * nombres («Azul», «Verde») no es una paleta local, se llame como se llame.
 */
const constantesPaleta = (re) => (t) => {
  let n = 0;
  for (const x of t.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*[[{]/g)) {
    if (re.test(x[1]) && COLOR_A_MANO.test(bloque(t, x.index + x[0].length - 1))) n++;
  }
  return n;
};
const usaRecharts = (t) => /from\s+["']recharts["']/.test(t);

/** `<button>` hecho a mano: su clase no sale de `button(…)` ni de una constante armada con `button(…)`. */
function botonesAMano(t, contexto = t) {
  const deFuncion = new Set([...contexto.matchAll(/const\s+(\w+)\s*=\s*button\(/g)].map((x) => x[1]));
  let n = 0;
  for (const tag of etiquetas(t, "button")) {
    const c = claseDe(tag) ?? "";
    if (/(?<![.\w])button\(/.test(c)) continue;
    if ([...deFuncion].some((nombre) => new RegExp(`\\b${nombre}\\b`).test(c))) continue;
    n++;
  }
  return n;
}

/** Cadenas de clase con uppercase + tracking-* (un Kicker hecho a mano). */
function rotulosAMano(t) {
  let n = 0;
  for (const x of t.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)) {
    if (/\buppercase\b/.test(x[0]) && /\btracking-/.test(x[0])) n++;
  }
  return n;
}

const SALTAR_INPUT = /type=["'{]+(checkbox|radio|hidden|file|range|color)/;

export const FAMILIAS = {
  titulos: {
    SectionTitle: m("info", { porArchivo: etiqueta("SectionTitle") }),
    CardTitle: m("info", { porArchivo: etiqueta("CardTitle") }),
    BlockTitle: m("info", { porArchivo: etiqueta("BlockTitle") }),
    Kicker: m("sube", { porArchivo: etiqueta("Kicker") }),
    InfoTip: m("info", { porArchivo: etiqueta("InfoTip") }),
    rotuloAMano: m("baja", { nota: "clases con uppercase + tracking-* (un Kicker hecho a mano)", porArchivo: rotulosAMano }),
    h4AMano: m("baja", { porArchivo: (t) => etiquetas(t, "h4").filter((x) => x.includes("className=")).length }),
    titulosLocales: m("baja", {
      nota: "no cuenta el que compone SectionTitle/CardTitle/BlockTitle/Kicker/Field sin <h*> ni rótulo a mano",
      ...localesPorCuerpo("titulos", /(Title|Titulo|Header|Encabezado|Heading|Rotulo)$/, {
        canonicos: ["PageTitle", "SectionTitle", "CardTitle", "BlockTitle", "Kicker", "Field", "AdminTabBar", "AdminModuleHeader"],
        aMano: (c) => etiquetas(c, "h[1-6]").some((x) => x.includes("className=")) || rotulosAMano(c) > 0,
      }),
    }),
    subtituloProps: m("info", { porArchivo: cuenta(/\b(?:subtitle|description|subtitulo)=/g) }),
  },
  botones: {
    Button: m("sube", {
      nota: "<Button> del DS + llamadas a button()",
      porArchivo: (t) => etiqueta("Button")(t) + (t.match(/(?<![.\w])button\((?:\{|\))/g) || []).length,
    }),
    buttonAMano: m("baja", { porArchivo: (t) => botonesAMano(t) }),
    constantesBtn: m("baja", {
      nota: "const BTN_*/BOTON_*/btn… = \"clases\"",
      porArchivo: constantesTexto(/^(BTN\w*|\w+_BTN\w*|btn\w*|\w+Btn\w*|BOTON\w*|boton\w*|\w*BUTTON\w*)$/),
    }),
    botonesLocales: m("baja", {
      nota: "no cuenta el que compone Button/button()/IconAction/ActionMenu sin <button> con clases propias",
      ...localesPorCuerpo("botones", /(Button|Boton|Btn)$/, {
        canonicos: ["Button", "IconAction", "BotonIconoTip", "ActionMenu"],
        aMano: (c, t) => botonesAMano(c, t) > 0,
        /* sin <button> a mano: los que hay salen de button() (o de una constante armada con button()) */
        compone: (c) => /(?<![.\w])button\(/.test(c) || etiquetas(c, "button").length > 0,
      }),
    }),
    alturasBoton: m("info", {
      nota: "alturas h-* distintas en <button> a mano",
      valores: (t) =>
        etiquetas(t, "button").map((x) => elegir(tokens(claseDe(x) ?? "").filter((y) => !VARIANTE.test(y)), /^h-(\d+(\.\d+)?|\[.*\])$/)),
    }),
  },
  filtros: {
    filtrosLocales: m("baja", {
      nota: "no cuenta el que compone la barra canónica (SegmentedControl/ActionMenu/CampoBuscar/FiltroColumna*/FiltrosEnBoton) sin controles propios",
      ...localesPorCuerpo("filtros", /(Filter|Filters|FilterBar|Filtro|Filtros|Search|SearchBar|Buscador|Busqueda)$/, {
        /* ADR-489 §2: la barra única es buscador + SegmentedControl + filtro de fecha + filtros-columna. */
        canonicos: ["SegmentedControl", "ActionMenu", "CampoBuscar", "FiltroColumna\\w*"],
        aMano: (c) => CONTROLES_A_MANO.test(c),
      }),
    }),
    alturasInput: m("baja", {
      nota: "alturas h-* distintas en <input>/<select> a mano",
      valores: (t) =>
        [...etiquetas(t, "input").filter((x) => !SALTAR_INPUT.test(x)), ...etiquetas(t, "select")].map((x) =>
          elegir(tokens(claseDe(x) ?? "").filter((y) => !VARIANTE.test(y)), /^h-(\d+(\.\d+)?|\[.*\])$/),
        ),
    }),
    inputs: m("info", { porArchivo: (t) => etiquetas(t, "input").filter((x) => !SALTAR_INPUT.test(x)).length }),
    selects: m("info", { porArchivo: etiqueta("select") }),
    filtrosColumna: m("info", { porArchivo: cuenta(/from ["'][^"']*filtros-columna[^"']*["']/g) }),
    SegmentedControl: m("info", { porArchivo: etiqueta("SegmentedControl") }),
  },
  tablas: {
    DataTable: m("sube", { porArchivo: etiqueta("DataTable") }),
    tableAMano: m("baja", {
      nota: "<table className=…> en JSX (las de impresión, en texto HTML, no cuentan)",
      porArchivo: cuenta(/<table\s+className=/g),
    }),
    thEstilos: m("baja", {
      nota: "estilos distintos de <th> (tamaño + mayúsculas + peso)",
      valores: (t) =>
        etiquetas(t, "th").map((x) => {
          const tk = tokens(claseDe(x) ?? "").filter((y) => !VARIANTE.test(y));
          return `${elegir(tk, /^text-(xs|sm|base|\[)/)}+${elegir(tk, /^(uppercase|normal-case)$/)}+${elegir(tk, /^font-/)}`;
        }),
    }),
    tablasLocales: m("baja", {
      nota: "no cuenta el que compone DataTable (o sólo rinde filas/celdas de una tabla de otro lado) sin <table> propio",
      ...localesPorCuerpo("tablas", /(Table|Tabla)$/, {
        canonicos: ["DataTable"],
        aMano: (c) => /<table\b|role=["'](?:table|grid)["']/.test(c),
        /* filas y celdas sueltas: la tabla que las aloja se mide donde está (tableAMano). */
        compone: (c) => /<t(?:r|d|h|head|body|foot)\b/.test(c),
      }),
    }),
    AdminTable: m("info", { porArchivo: etiqueta("AdminTable") }),
  },
  checks: {
    checkboxNativo: m("baja", { porArchivo: cuenta(/type=["{]?["']?checkbox/g) }),
    switchAMano: m("baja", { porArchivo: cuenta(/role=["']switch["']/g) }),
    checksLocales: m("baja", {
      nota: "no cuenta el que compone Casilla/Interruptor sin checkbox nativo ni role=switch propio",
      ...localesPorCuerpo("checks", /(Switch|Toggle|Checkbox|Interruptor|Casilla)$/, {
        canonicos: ["Casilla", "Interruptor", "Toggle"],
        aMano: (c) => /type=["{]?["']?checkbox|role=["'](?:switch|checkbox)["']/.test(c),
      }),
    }),
    Interruptor: m("info", { porArchivo: (t) => etiqueta("Interruptor")(t) + etiqueta("Toggle")(t) }),
    Casilla: m("info", { porArchivo: etiqueta("Casilla") }),
  },
  modales: {
    AdminModal: m("sube", { porArchivo: etiqueta("AdminModal") }),
    overlayAMano: m("baja", {
      nota: "archivos con `fixed inset-0` y sin modal del DS",
      porArchivo: (t) => (/fixed inset-0/.test(t) && !/<(AdminModal|Modal|Dialog|ConfirmModal|BottomSheet)\b/.test(t) ? 1 : 0),
    }),
    ModalViejo: m("baja", { porArchivo: etiqueta("Modal") }),
    ModalFooterDuplicado: m("baja", {
      nota: "ModalFooter importado de components/Modal (el del panel es admin/shared)",
      porArchivo: (t) => (/import[^;]*\bModalFooter\b[^;]*from ["']@\/components\/Modal["']/.test(t) ? 1 : 0),
    }),
    ModalFooter: m("info", { porArchivo: etiqueta("ModalFooter") }),
    useModalAccesible: m("info", { porArchivo: cuenta(/useModalAccesible\(/g) }),
  },
  kpis: {
    StatCard: m("info", { porArchivo: etiqueta("StatCard") }),
    KpiTile: m("baja", { nota: "decisión 09-10: los KpiTile pasan a StatCard", porArchivo: etiqueta("KpiTile") }),
    kpisLocales: m("baja", {
      nota: "no cuenta el que compone StatCard (directo o por un envoltorio como CtpKpi)",
      ...localesPorCuerpo("kpis", /(Kpi|KPI|Stat|Stats|Metric|Metrica|Indicador|Tile|Cifra)$/, {
        canonicos: ["StatCard"],
        aMano: (c) => /<KpiTile\b/.test(c),
      }),
    }),
  },
  graficos: {
    hexEnGraficos: m("baja", {
      nota: "hex entre comillas en archivos que importan recharts",
      porArchivo: (t) => (usaRecharts(t) ? (t.match(/["'`]#[0-9a-fA-F]{3,8}["'`]/g) || []).length : 0),
    }),
    paletasLocales: m("baja", {
      porArchivo: constantesPaleta(/(COLOR|COLORS|COLORES|PALETTE|PALETA|Colors|Palette|Paleta|Colores|SERIES_COLORS|CHART_)/),
    }),
    tooltipsPropios: m("baja", {
      nota: "<Tooltip content=…> de recharts que no es el ChartTooltip de admin/shared",
      porArchivo: (t) => {
        if (!usaRecharts(t)) return 0;
        const canonico = /from ["']@\/components\/admin\/shared\/ChartTooltip["']/.test(t);
        return etiquetas(t, "Tooltip").filter((x) => /\bcontent=/.test(x) && !(canonico && /content=\{\s*<ChartTooltip\b/.test(x))).length;
      },
    }),
    ejesDistintos: m("baja", {
      nota: "tamaños de letra de eje distintos (tick fontSize literal)",
      valores: (t) => (usaRecharts(t) ? [...t.matchAll(/tick=\{\{[^}]*fontSize:\s*(\d+)/g)].map((x) => x[1]) : []),
    }),
    recharts: m("info", { porArchivo: (t) => (usaRecharts(t) ? 1 : 0) }),
    COLOR_CONCEPTO: m("info", { porArchivo: cuenta(/\bCOLOR_CONCEPTO\b/g) }),
    chartPalette: m("info", { porArchivo: cuenta(/from ["'][^"']*chart-palette["']/g) }),
  },
  estructura: {
    AdminTabBar: m("info", { porArchivo: etiqueta("AdminTabBar") }),
    AdminModuleHeader: m("info", { porArchivo: etiqueta("AdminModuleHeader") }),
    VistaHeader: m("info", {
      nota: "canónica de los libros forestales desde el 23-10 (ADR-489, adenda): era «baja»",
      porArchivo: etiqueta("VistaHeader"),
    }),
    tabsLocales: m("baja", {
      nota: "no cuenta el que compone AdminTabBar/PestanasDeVista/CabeceraConPestanas sin tablist propio",
      ...localesPorCuerpo("estructura", /(Tabs|TabBar|Pestanas|Pestañas|Subtabs|SubTabs)$/, {
        canonicos: ["AdminTabBar", "PestanasDeVista"],
        aMano: (c) => /role=["']tablist["']/.test(c),
      }),
    }),
    PestanasDeVista: m("info", { nota: "2.º nivel de los libros forestales (regla R4)", porArchivo: etiqueta("PestanasDeVista") }),
    detailsNativo: m("baja", { nota: "<details> → Plegable", porArchivo: etiqueta("details") }),
    Plegable: m("info", { porArchivo: etiqueta("Plegable") }),
    useVistaModulo: m("info", { porArchivo: cuenta(/useVistaModulo\(/g) }),
    spinnerBloqueAMano: m("baja", {
      nota: "animate-spin de bloque (h-6 o más) → LoadingSpinner",
      porArchivo: cuenta(/\bh-(?:6|7|8|9|10|12|16)\b[^"'`\n]*\banimate-spin\b|\banimate-spin\b[^"'`\n]*\bh-(?:6|7|8|9|10|12|16)\b/g),
    }),
  },
  movimiento: {
    duracionesLiterales: m("baja", { nota: "duration: 0.2 en framer → DURATION.*", porArchivo: cuenta(/\bduration:\s*\d*\.?\d+\b/g) }),
    easingsLiterales: m("baja", { nota: "ease: [ … ] → EASE.*", porArchivo: cuenta(/\bease:\s*\[/g) }),
    durationSinToken: m("baja", {
      nota: "duration-200 / duration-[300ms] → duration-[var(--dur-*)]",
      porArchivo: cuenta(/(?<![\w:-])duration-(?:\d+|\[\d[^\]]*\])(?![\w-])/g),
    }),
    transitionAll: m("baja", { porArchivo: cuenta(/\btransition-all\b/g) }),
    durationToken: m("info", { porArchivo: cuenta(/duration-\[var\(--dur-/g) }),
    mTags: m("info", { porArchivo: cuenta(/<m\.\w+/g) }),
    motionTags: m("info", { porArchivo: cuenta(/<motion\.\w+/g) }),
  },
};

// ─── censo ────────────────────────────────────────────────────────────────────
/**
 * El censo sobre textos ya leídos (`[[ruta relativa, texto]]`): lo usa `censar`
 * y los tests del trinquete con archivos de juguete.
 * @param {Array<[string, string]>} textos
 * @param {{ detalle?: boolean }} [opciones]
 */
export function censarTextos(textos, { detalle = false } = {}) {
  const familias = {};
  for (const [familia, metricas] of Object.entries(FAMILIAS)) {
    familias[familia] = {};
    for (const [nombre, def] of Object.entries(metricas)) {
      def.preparar?.(textos);
      const fila = { n: 0, sentido: def.sentido };
      const porArchivo = [];
      if (def.valores) {
        const set = new Set();
        for (const [rel, t] of textos) {
          const v = def.valores(t, rel);
          v.forEach((x) => set.add(x));
          if (detalle && v.length) porArchivo.push([rel, new Set(v).size]);
        }
        fila.n = set.size;
        if (detalle) fila.valores = [...set].sort();
      } else {
        for (const [rel, t] of textos) {
          const n = def.porArchivo(t, rel);
          fila.n += n;
          if (detalle && n) porArchivo.push([rel, n]);
        }
      }
      if (detalle) {
        porArchivo.sort((a, b) => b[1] - a[1]);
        fila.top = porArchivo.slice(0, 5).map(([r, n]) => `${r}:${n}`);
        if (def.nota) fila.nota = def.nota;
      }
      familias[familia][nombre] = fila;
    }
  }
  return { medido: new Date().toISOString(), archivos: textos.length, familias };
}

/**
 * @param {{ raiz?: string, detalle?: boolean }} [opciones]
 * @returns {{ medido: string, archivos: number, familias: Record<string, Record<string, { n: number, sentido: string, top?: string[] }>> }}
 */
export function censar({ raiz = RAIZ, detalle = false } = {}) {
  const archivos = CARPETAS.flatMap((c) => recorrer(path.join(raiz, c)));
  const textos = archivos.map((f) => [path.relative(raiz, f).split(path.sep).join("/"), fs.readFileSync(f, "utf8")]);
  return censarTextos(textos, { detalle });
}

/**
 * Lo que empeoró (o desapareció) entre la línea base y ahora. Manda el sentido
 * que el script declara HOY (una métrica que pasó a `info` con su nota, p. ej.
 * VistaHeader al volverse canónica); cada cambio de sentido sale en
 * `reclasificadas` para que se vea en la revisión. Las métricas nuevas no se
 * exigen hasta que entren a la base con `--escribir`.
 */
export function comparar(antes, ahora) {
  const empeoro = [];
  const mejoro = [];
  const reclasificadas = [];
  for (const [familia, metricas] of Object.entries(antes.familias)) {
    for (const [nombre, base] of Object.entries(metricas)) {
      const actual = ahora.familias[familia]?.[nombre];
      if (!actual) {
        empeoro.push({ familia, metrica: nombre, sentido: base.sentido, antes: base.n, ahora: null, motivo: "la métrica ya no se mide" });
        continue;
      }
      const sentido = actual.sentido ?? base.sentido;
      const fila = { familia, metrica: nombre, sentido, antes: base.n, ahora: actual.n };
      if (sentido !== base.sentido) reclasificadas.push({ ...fila, era: base.sentido, nota: actual.nota ?? "" });
      if (sentido === "baja" && actual.n > base.n) empeoro.push({ ...fila, motivo: "lo hecho a mano subió" });
      else if (sentido === "sube" && actual.n < base.n) empeoro.push({ ...fila, motivo: "el canónico bajó" });
      else if ((sentido === "baja" && actual.n < base.n) || (sentido === "sube" && actual.n > base.n)) mejoro.push(fila);
    }
  }
  return { empeoro, mejoro, reclasificadas };
}

export function leerBase(raiz = RAIZ) {
  return JSON.parse(fs.readFileSync(path.join(raiz, RUTA_BASE), "utf8"));
}

/** Para el JSON de la base: sin detalle, sólo n y sentido. */
function paraGuardar(censo) {
  const familias = {};
  for (const [f, ms] of Object.entries(censo.familias)) {
    familias[f] = {};
    for (const [k, v] of Object.entries(ms)) familias[f][k] = { n: v.n, sentido: v.sentido };
  }
  return {
    medido: censo.medido,
    nota:
      "Línea base del trinquete (ADR-489). baja = lo hecho a mano, no puede subir; " +
      "sube = Button, Kicker, DataTable y AdminModal, no pueden bajar; info = no se exige. " +
      "Se aprieta con: node scripts/censo-ds-admin.mjs --escribir",
    archivos: censo.archivos,
    familias,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
function principal(argv) {
  const arg = (k) => argv.includes(k);
  const valor = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const familia = valor("--familia");
  const censo = censar({ detalle: !!familia });

  if (arg("--json")) {
    console.log(JSON.stringify(familia ? censo.familias[familia] : censo, null, 2));
    return 0;
  }

  if (arg("--escribir")) {
    const ruta = path.join(RAIZ, RUTA_BASE);
    if (fs.existsSync(ruta) && !arg("--forzar")) {
      const { empeoro } = comparar(leerBase(), censo);
      if (empeoro.length) {
        console.error(`No escribo la base: empeoraron ${empeoro.length} cifras (--comparar para verlas, --forzar para pisarla igual).`);
        return 1;
      }
    }
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, JSON.stringify(paraGuardar(censo), null, 2) + "\n");
    console.log(`Base escrita: ${RUTA_BASE} (${censo.archivos} archivos).`);
    return 0;
  }

  const base = fs.existsSync(path.join(RAIZ, RUTA_BASE)) ? leerBase() : null;
  console.log(`# censo DS del panel — ${censo.archivos} archivos${base ? ` · base ${base.medido.slice(0, 16)}` : ""}`);
  for (const [f, ms] of Object.entries(censo.familias)) {
    if (familia && f !== familia) continue;
    console.log(`\n## ${f}`);
    for (const [k, v] of Object.entries(ms)) {
      const b = base?.familias[f]?.[k]?.n;
      const delta = b === undefined || b === v.n ? "" : ` (${v.n - b > 0 ? "+" : ""}${v.n - b})`;
      const extra = v.top?.length ? `  ← ${v.top.join(", ")}` : "";
      const nota = v.nota ? `  [${v.nota}]` : "";
      console.log(`  ${v.sentido.padEnd(4)} ${k.padEnd(22)} ${String(v.n).padStart(5)}${delta}${nota}${extra}`);
      if (v.valores && familia) console.log(`       valores: ${v.valores.join(" | ")}`);
    }
  }
  if (arg("--comparar")) {
    if (!base) {
      console.error(`\nNo hay base (${RUTA_BASE}): corré --escribir.`);
      return 1;
    }
    const { empeoro, mejoro, reclasificadas } = comparar(base, censo);
    for (const x of reclasificadas) console.log(`\nRECLASIFICADA: ${x.familia}.${x.metrica} ${x.era}→${x.sentido} (${x.nota || FAMILIAS[x.familia]?.[x.metrica]?.nota || "sin nota"})`);
    console.log(`\nMejoró: ${mejoro.map((x) => `${x.familia}.${x.metrica} ${x.antes}→${x.ahora}`).join(", ") || "nada"}`);
    if (empeoro.length) {
      console.log(`EMPEORÓ: ${empeoro.map((x) => `${x.familia}.${x.metrica} ${x.antes}→${x.ahora} (${x.motivo})`).join(", ")}`);
      return 1;
    }
    console.log("Trinquete: nada empeoró.");
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(principal(process.argv.slice(2)));
}
