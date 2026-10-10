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
const defs = (re) => (t) => {
  let n = 0;
  for (const x of t.matchAll(DEF)) if (re.test(x[1] || x[2])) n++;
  return n;
};
/** Constantes de clase (`const BTN = "…"`). */
const constantesTexto = (re) => (t) => {
  let n = 0;
  for (const x of t.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*["'`]/g)) if (re.test(x[1])) n++;
  return n;
};
/** Constantes de objeto/array con nombre de paleta (`const COLORS = [ … ]`). */
const constantesPaleta = (re) => (t) => {
  let n = 0;
  for (const x of t.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*[[{]/g)) if (re.test(x[1])) n++;
  return n;
};
const usaRecharts = (t) => /from\s+["']recharts["']/.test(t);

/** `<button>` hecho a mano: su clase no sale de `button(…)` ni de una constante armada con `button(…)`. */
function botonesAMano(t) {
  const deFuncion = new Set([...t.matchAll(/const\s+(\w+)\s*=\s*button\(/g)].map((x) => x[1]));
  let n = 0;
  for (const tag of etiquetas(t, "button")) {
    const c = claseDe(tag) ?? "";
    if (/(?<![.\w])button\(/.test(c)) continue;
    if ([...deFuncion].some((nombre) => new RegExp(`\\b${nombre}\\b`).test(c))) continue;
    n++;
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
    rotuloAMano: m("baja", {
      nota: "clases con uppercase + tracking-* (un Kicker hecho a mano)",
      porArchivo: (t) => {
        let n = 0;
        for (const x of t.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)) {
          if (/\buppercase\b/.test(x[0]) && /\btracking-/.test(x[0])) n++;
        }
        return n;
      },
    }),
    h4AMano: m("baja", { porArchivo: (t) => etiquetas(t, "h4").filter((x) => x.includes("className=")).length }),
    titulosLocales: m("baja", { porArchivo: defs(/(Title|Titulo|Header|Encabezado|Heading|Rotulo)$/) }),
    subtituloProps: m("info", { porArchivo: cuenta(/\b(?:subtitle|description|subtitulo)=/g) }),
  },
  botones: {
    Button: m("sube", {
      nota: "<Button> del DS + llamadas a button()",
      porArchivo: (t) => etiqueta("Button")(t) + (t.match(/(?<![.\w])button\((?:\{|\))/g) || []).length,
    }),
    buttonAMano: m("baja", { porArchivo: botonesAMano }),
    constantesBtn: m("baja", {
      nota: "const BTN_*/BOTON_*/btn… = \"clases\"",
      porArchivo: constantesTexto(/^(BTN\w*|\w+_BTN\w*|btn\w*|\w+Btn\w*|BOTON\w*|boton\w*|\w*BUTTON\w*)$/),
    }),
    botonesLocales: m("baja", { porArchivo: defs(/(Button|Boton|Btn)$/) }),
    alturasBoton: m("info", {
      nota: "alturas h-* distintas en <button> a mano",
      valores: (t) =>
        etiquetas(t, "button").map((x) => elegir(tokens(claseDe(x) ?? "").filter((y) => !VARIANTE.test(y)), /^h-(\d+(\.\d+)?|\[.*\])$/)),
    }),
  },
  filtros: {
    filtrosLocales: m("baja", { porArchivo: defs(/(Filter|Filters|FilterBar|Filtro|Filtros|Search|SearchBar|Buscador|Busqueda)$/) }),
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
    tablasLocales: m("baja", { porArchivo: defs(/(Table|Tabla)$/) }),
    AdminTable: m("info", { porArchivo: etiqueta("AdminTable") }),
  },
  checks: {
    checkboxNativo: m("baja", { porArchivo: cuenta(/type=["{]?["']?checkbox/g) }),
    switchAMano: m("baja", { porArchivo: cuenta(/role=["']switch["']/g) }),
    checksLocales: m("baja", { porArchivo: defs(/(Switch|Toggle|Checkbox|Interruptor|Casilla)$/) }),
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
    kpisLocales: m("baja", { porArchivo: defs(/(Kpi|KPI|Stat|Stats|Metric|Metrica|Indicador|Tile|Cifra)$/) }),
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
    VistaHeader: m("baja", { porArchivo: etiqueta("VistaHeader") }),
    tabsLocales: m("baja", { porArchivo: defs(/(Tabs|TabBar|Pestanas|Pestañas|Subtabs|SubTabs)$/) }),
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
 * @param {{ raiz?: string, detalle?: boolean }} [opciones]
 * @returns {{ medido: string, archivos: number, familias: Record<string, Record<string, { n: number, sentido: string, top?: string[] }>> }}
 */
export function censar({ raiz = RAIZ, detalle = false } = {}) {
  const archivos = CARPETAS.flatMap((c) => recorrer(path.join(raiz, c)));
  const textos = archivos.map((f) => [path.relative(raiz, f).split(path.sep).join("/"), fs.readFileSync(f, "utf8")]);
  const familias = {};
  for (const [familia, metricas] of Object.entries(FAMILIAS)) {
    familias[familia] = {};
    for (const [nombre, def] of Object.entries(metricas)) {
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
  return { medido: new Date().toISOString(), archivos: archivos.length, familias };
}

/**
 * Lo que empeoró (o desapareció) entre la línea base y ahora, según el sentido
 * de cada métrica en la BASE. Las métricas nuevas no se exigen hasta que entren
 * a la base con `--escribir`.
 */
export function comparar(antes, ahora) {
  const empeoro = [];
  const mejoro = [];
  for (const [familia, metricas] of Object.entries(antes.familias)) {
    for (const [nombre, base] of Object.entries(metricas)) {
      const actual = ahora.familias[familia]?.[nombre];
      const fila = { familia, metrica: nombre, sentido: base.sentido, antes: base.n, ahora: actual?.n ?? null };
      if (!actual) {
        empeoro.push({ ...fila, motivo: "la métrica ya no se mide" });
        continue;
      }
      if (base.sentido === "baja" && actual.n > base.n) empeoro.push({ ...fila, motivo: "lo hecho a mano subió" });
      else if (base.sentido === "sube" && actual.n < base.n) empeoro.push({ ...fila, motivo: "el canónico bajó" });
      else if ((base.sentido === "baja" && actual.n < base.n) || (base.sentido === "sube" && actual.n > base.n)) mejoro.push(fila);
    }
  }
  return { empeoro, mejoro };
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
    const { empeoro, mejoro } = comparar(base, censo);
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
