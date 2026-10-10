#!/usr/bin/env node
/**
 * sembrar-croquis-planta — carga el croquis del aserradero de Blas («Lámina
 * única · Planta v9», 54 × 48 m) por la API, como lo haría la pantalla (ADR-465):
 *
 *   1. recorta la imagen al terreno (0–54 m × 0–48 m, sin la leyenda ni la
 *      calle) y la sube a POST /api/admin/forestal/ctp/planta/croquis/imagen;
 *   2. PUT /api/admin/forestal/ctp/planta/croquis con medidas, versión 9,
 *      la imagen y las máquinas D1–D7 del patio de maquinaria;
 *   3. crea (o actualiza, por código) las 12 zonas del plano en METROS con
 *      POST/PATCH /api/admin/forestal/ctp/planta.
 *
 * La v9 trae EJES en metros (origen 0,0 = esquina de la oficina, abajo a la
 * izquierda): las zonas y máquinas se midieron sobre esos ticks, ya no
 * estimando píxel → metro. Las áreas las calcula el servidor (fórmula plana).
 *
 * Idempotente: correrlo dos veces actualiza las mismas zonas (no duplica). Una
 * zona que cambió de código entre versiones (MN-18 → PP-18) se RENOMBRA, no se
 * duplica: así conserva lo que ya estaba ubicado en ella.
 *
 * Uso (sesión del tenant destino en el entorno, la de `admin-auth.mjs`):
 *   node scripts/dev-helpers/admin-auth.mjs && source /tmp/bsm-auth.env
 *   node scripts/sembrar-croquis-planta.mjs [--imagen docs/forestal/croquis-blas-v9.png] [--seco]
 *
 * Para BLAS hace falta una sesión de Blas y además `--si-es-blas`: sin esa
 * bandera el script se niega (los datos reales no se tocan por accidente):
 *   BSM_TENANT=inversiones-agroforestales-blas-sociedad-anonima BSM_USER=<tu usuario> BSM_PASS='<tu clave>' \
 *     node scripts/dev-helpers/admin-auth.mjs && source /tmp/bsm-auth.env
 *   node scripts/sembrar-croquis-planta.mjs --si-es-blas
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n, def) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const BASE = process.env.BSM_BASE;
const COOKIE = process.env.BSM_COOKIE;
const CSRF = process.env.BSM_CSRF;
const TENANT = process.env.BSM_TENANT ?? "";
const IMAGEN = valor("--imagen", "docs/forestal/croquis-blas-v9.png");
const VERSION = 9;
const SECO = flag("--seco");

if (!BASE || !COOKIE || !CSRF) {
  console.error("Falta la sesión: node scripts/dev-helpers/admin-auth.mjs && source /tmp/bsm-auth.env");
  process.exit(1);
}
if (/blas/i.test(TENANT) && !flag("--si-es-blas")) {
  console.error(`El tenant de la sesión es «${TENANT}». Para sembrar Blas agregá --si-es-blas.`);
  process.exit(1);
}

// ─── Medidas del plano ────────────────────────────────────────────────────
const ANCHO_M = 54;
const ALTO_M = 48;
/**
 * Ejes de la lámina v9 (1288 × 902 px), leídos en los ticks: x = 0 en 139,5 px y
 * x = 50 en 853,5 px; y = 0 en 797 px e y = 45 en 154,5 px (la y de la imagen
 * crece hacia abajo).
 */
const EJE = { x0: 139.5, pxPorMx: (853.5 - 139.5) / 50, y0: 797, pxPorMy: (797 - 154.5) / 45 };
const r2 = (n) => Math.round(n * 100) / 100;
/** El terreno (0–54 × 0–48 m) en píxeles de la imagen: es lo que se recorta. */
const TERRENO_PX = {
  x0: Math.round(EJE.x0),
  y0: Math.round(EJE.y0 - ALTO_M * EJE.pxPorMy),
  x1: Math.round(EJE.x0 + ANCHO_M * EJE.pxPorMx),
  y1: Math.round(EJE.y0),
};
/** `[x, y]` en metros del plano → `[y, x]` del croquis (CRS.Simple). */
const m = ([x, y]) => [r2(y), r2(x)];
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/**
 * Zonas en `[x, y]` metros, leídas sobre los ejes. El número es el de la
 * leyenda. No se pisan entre sí: tocar una pila del punto 2 abre ESA zona y no
 * el techo que la cubre.
 */
const ZONAS = [
  { codigo: "AS-36", nombre: "Techo parabólico · zona de aserrío", tipo: "aserrado", n: 36,
    pts: [[7.4, 18.3], [29.2, 18.3], [29.2, 12.9], [39.4, 12.9], [39.4, 0.2], [20.9, 0.2], [20.9, 3.5], [7.4, 3.5]],
    notas: "Mesas 1 y 2, coches 22 y 26, cinta principal, rodillos y despuntadora. El techo cubre de 0 a 39,5 m; el acopio 14, la zona 19, las pilas 5 y el patio 18 están bajo el mismo techo como zonas aparte." },
  { codigo: "PP-30", nombre: "Ramada 2 · recuperación y paquetería", tipo: "patio_producto", n: 30, pts: rect(40.1, 0.5, 53.9, 10.6) },
  { codigo: "PT-35", nombre: "Patio / acopio de madera 2", tipo: "patio_trozas", n: 35, pts: rect(17.35, 39.5, 34, 42.65),
    notas: "Tipo a confirmar: el plano dice «madera», no si es rolliza o aserrada." },
  { codigo: "PT-08", nombre: "Patio de trozas", tipo: "patio_trozas", n: 8, pts: rect(0.2, 31.5, 8.85, 41.65),
    notas: "Inicio de la ruta 1: de acá el cargador lleva las trozas al acopio 14." },
  { codigo: "PT-14", nombre: "Acopio de trozas para el coche", tipo: "patio_trozas", n: 14, pts: rect(29.5, 13.2, 39.4, 17.1) },
  { codigo: "PP-05", nombre: "Madera aserrada apilada · bajo la ramada", tipo: "patio_producto", n: 5, pts: rect(1.5, 19, 11.4, 21.5),
    notas: "Uno de los 3 puntos de apilado; llega por la ruta 5 desde la despuntadora." },
  { codigo: "PP-05-2", nombre: "Madera aserrada apilada · punto 2", tipo: "patio_producto", n: 5, pts: rect(4, 10.2, 7.1, 14.1),
    notas: "Bajo el techo parabólico; llega por la ruta 5 desde la despuntadora." },
  { codigo: "PP-05-3", nombre: "Madera aserrada apilada · punto 3", tipo: "patio_producto", n: 5, pts: rect(0.5, 4, 3.8, 6.3),
    notas: "Junto a la oficina." },
  { codigo: "PP-19", nombre: "Zona de apilado y cubicación", tipo: "patio_producto", n: 19,
    pts: [[0.2, 18.4], [1.6, 18.4], [2.1, 16.6], [3, 14.5], [3.4, 11], [4.3, 9.2], [4.3, 6.6], [0.2, 6.6]],
    notas: "Entre el cerco y la malla raschel; acá se apila y se cubica." },
  { codigo: "PP-18", antes: "MN-18", nombre: "Patio 18 · madera corta", tipo: "patio_producto", n: 18, pts: rect(6.8, 0.2, 20.6, 3.3),
    notas: "La madera corta sale de la despuntadora por la ruta 5." },
  { codigo: "CB-24", nombre: "Zona de carbón", tipo: "otro", n: 24, pts: rect(35, 38.9, 42.75, 43.35) },
  { codigo: "LN-29", nombre: "Leña", tipo: "otro", n: 29, pts: rect(41.5, 12.8, 50, 17.8) },
];

/** Máquinas del patio de maquinaria: el centro de cada rectángulo amarillo, en `[x, y]` metros. */
const MAQUINAS = [
  { codigo: "D1", nombre: "Cargador frontal", xy: [18.95, 28.75] },
  { codigo: "D2", nombre: "Forestal mecánico", xy: [25.35, 28.75] },
  { codigo: "D3", nombre: "Forestal automático", xy: [13.15, 33.2] },
  { codigo: "D4", nombre: "Camión Volvo 1", xy: [14.05, 37] },
  { codigo: "D5", nombre: "Camión Volvo 3", xy: [32.2, 37] },
  { codigo: "D6", nombre: "Camión Volvo 2", xy: [32.2, 33.2] },
  { codigo: "D7", nombre: "Oruga", xy: [31.5, 28.75] },
].map(({ xy, ...r }) => ({ ...r, x: xy[0], y: xy[1], fuera: false }));

// ─── API ──────────────────────────────────────────────────────────────────
const headers = (extra = {}) => ({ Cookie: COOKIE, "x-csrf-token": CSRF, "x-tenant-id": TENANT, ...extra });
async function api(metodo, ruta, body) {
  const esForm = body instanceof FormData;
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: headers(esForm || body === undefined ? {} : { "Content-Type": "application/json" }),
    body: esForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${metodo} ${ruta} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const zonasEnMetros = ZONAS.map((z) => ({ ...z, poligono: JSON.stringify(z.pts.map(m)) }));
if (SECO) {
  console.log(JSON.stringify({ terrenoPx: TERRENO_PX, maquinas: MAQUINAS, zonas: zonasEnMetros.map(({ pts, ...z }) => z) }, null, 2));
  process.exit(0);
}

// 1. Imagen recortada al terreno.
const original = await readFile(IMAGEN);
const recorte = await sharp(original)
  .extract({ left: TERRENO_PX.x0, top: TERRENO_PX.y0, width: TERRENO_PX.x1 - TERRENO_PX.x0, height: TERRENO_PX.y1 - TERRENO_PX.y0 })
  .png()
  .toBuffer();
const form = new FormData();
form.append("file", new Blob([recorte], { type: "image/png" }), "croquis-planta.png");
const subida = await api("POST", "/api/admin/forestal/ctp/planta/croquis/imagen", form);
console.log(`imagen: ${subida.ancho}×${subida.alto} px, ${subida.bytes} bytes → ${subida.imagenRef}`);

// 2. Croquis: medidas, versión del plano, imagen y máquinas.
const { croquis } = await api("PUT", "/api/admin/forestal/ctp/planta/croquis", {
  version: VERSION,
  anchoM: ANCHO_M,
  altoM: ALTO_M,
  imagenRef: subida.imagenRef,
  maquinas: MAQUINAS,
});
console.log(`croquis v${croquis.version}: ${croquis.anchoM}×${croquis.altoM} m, ${croquis.maquinas.length} máquinas, imagen ${croquis.imagenUrl}`);

// 3. Zonas (upsert por código entre las del croquis).
const { zonas: existentes } = await api("GET", "/api/admin/forestal/ctp/planta?plano=croquis");
const porCodigo = new Map(existentes.filter((z) => z.plano === "croquis").map((z) => [z.codigo, z]));
for (const z of zonasEnMetros) {
  const previa = porCodigo.get(z.codigo) ?? (z.antes ? porCodigo.get(z.antes) : undefined);
  const cuerpo = {
    ...(previa ? { id: previa.id } : {}),
    codigo: z.codigo,
    nombre: z.nombre,
    tipo: z.tipo,
    plano: "croquis",
    poligono: z.poligono,
    notas: [`N° ${z.n} de la leyenda del plano v${VERSION}.`, z.notas].filter(Boolean).join(" "),
  };
  const { zona } = await api(previa ? "PATCH" : "POST", "/api/admin/forestal/ctp/planta", cuerpo);
  const accion = !previa ? "creó" : previa.codigo !== z.codigo ? `renombró ${previa.codigo} →` : "actualizó";
  console.log(`${accion} ${zona.codigo.padEnd(7)} ${zona.tipo.padEnd(15)} ${String(zona.areaM2).padStart(8)} m²  centro [${zona.lat}, ${zona.lng}]`);
}
