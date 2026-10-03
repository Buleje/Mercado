#!/usr/bin/env node
/**
 * sembrar-croquis-planta — carga el croquis del aserradero de Blas (Lámina 01/02
 * «Planta v8», 54 × 48 m) por la API, como lo haría la pantalla (ADR-465):
 *
 *   1. recorta la imagen al terreno (sin la leyenda ni la calle) y la sube
 *      a POST /api/admin/forestal/ctp/planta/croquis/imagen;
 *   2. PUT /api/admin/forestal/ctp/planta/croquis con medidas, versión 8,
 *      la imagen y las máquinas D1–D7 del patio de maquinaria;
 *   3. crea (o actualiza, por código) las 10 zonas del plano en METROS con
 *      POST/PATCH /api/admin/forestal/ctp/planta.
 *
 * Idempotente: correrlo dos veces actualiza las mismas zonas (no duplica).
 * Las zonas y máquinas se midieron sobre la imagen (píxel → metro); las áreas
 * las calcula el servidor con la fórmula plana.
 *
 * Uso (sesión del tenant destino en el entorno, la de `admin-auth.mjs`):
 *   node scripts/dev-helpers/admin-auth.mjs && source /tmp/bsm-auth.env
 *   node scripts/sembrar-croquis-planta.mjs [--imagen docs/forestal/croquis-blas-v8.png] [--seco]
 *
 * Para BLAS hace falta una sesión de Blas y además `--si-es-blas`: sin esa
 * bandera el script se niega (los datos reales no se tocan por accidente).
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
const IMAGEN = valor("--imagen", "docs/forestal/croquis-blas-v8.png");
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
/** El terreno dentro de la imagen de 1518 × 921 px (cerco izquierdo, línea punteada del límite). */
const TERRENO_PX = { x0: 159, y0: 46, x1: 1026, y1: 807 };
const r2 = (n) => Math.round(n * 100) / 100;
/** Píxel de la imagen → `[y, x]` en metros (origen abajo a la izquierda, y hacia arriba). */
const m = ([px, py]) => [
  r2(((TERRENO_PX.y1 - py) / (TERRENO_PX.y1 - TERRENO_PX.y0)) * ALTO_M),
  r2(((px - TERRENO_PX.x0) / (TERRENO_PX.x1 - TERRENO_PX.x0)) * ANCHO_M),
];
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/**
 * Zonas en el orden en que se crean: las grandes primero (la lista vuelve
 * ordenada de la más nueva a la más vieja). El número es el de la leyenda.
 */
const ZONAS = [
  { codigo: "AS-36", nombre: "Techo parabólico · zona de aserrío", tipo: "aserrado", n: 36,
    px: [[236, 515], [620, 515], [620, 605], [790, 605], [790, 745], [236, 745]],
    notas: "Mesas 1 y 2, coches, cinta principal, rodillos y despuntadora. El techo cubre también el acopio 14, la zona 19 y maniobras (zonas aparte)." },
  { codigo: "PP-30", nombre: "Ramada 2 · recuperación y paquetería", tipo: "patio_producto", n: 30, px: rect(797, 637, 1016, 800) },
  { codigo: "PT-35", nombre: "Patio / acopio de madera 2", tipo: "patio_trozas", n: 35, px: rect(437, 131, 699, 182),
    notas: "Tipo a confirmar: el plano dice «madera», no si es rolliza o aserrada." },
  { codigo: "PT-08", nombre: "Patio de trozas", tipo: "patio_trozas", n: 8, px: rect(163, 147, 301, 307) },
  { codigo: "PT-14", nombre: "Acopio de trozas para el coche", tipo: "patio_trozas", n: 14, px: rect(628, 537, 786, 600) },
  { codigo: "PP-05", nombre: "Madera aserrada apilada", tipo: "patio_producto", n: 5, px: rect(186, 467, 340, 505),
    notas: "El plano marca 3 puntos; este es el de la ramada de calamina (los otros dos están bajo el techo parabólico)." },
  { codigo: "PP-19", nombre: "Zona de apilado exterior", tipo: "patio_producto", n: 19,
    px: [[163, 518], [186, 518], [206, 600], [232, 662], [235, 700], [163, 700]] },
  { codigo: "MN-18", nombre: "Patio de maniobras", tipo: "otro", n: 18, px: rect(232, 748, 500, 806) },
  { codigo: "CB-24", nombre: "Zona de carbón", tipo: "otro", n: 24, px: rect(715, 120, 838, 190) },
  { codigo: "LN-29", nombre: "Leña", tipo: "otro", n: 29, px: rect(818, 522, 953, 605) },
];

/** Máquinas del patio de maquinaria (centro de cada rectángulo amarillo). */
const MAQUINAS = [
  { codigo: "D1", nombre: "Cargador frontal", px: [461, 350] },
  { codigo: "D2", nombre: "Forestal mecánico", px: [563, 350] },
  { codigo: "D3", nombre: "Forestal automático", px: [369, 280] },
  { codigo: "D4", nombre: "Camión Volvo 1", px: [383, 219] },
  { codigo: "D5", nombre: "Camión Volvo 3", px: [671, 219] },
  { codigo: "D6", nombre: "Camión Volvo 2", px: [671, 280] },
  { codigo: "D7", nombre: "Oruga", px: [660, 350] },
].map(({ px, ...r }) => {
  const [y, x] = m(px);
  return { ...r, x, y, fuera: false };
});

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

const zonasEnMetros = ZONAS.map((z) => ({ ...z, poligono: JSON.stringify(z.px.map(m)) }));
if (SECO) {
  console.log(JSON.stringify({ maquinas: MAQUINAS, zonas: zonasEnMetros.map(({ px, ...z }) => z) }, null, 2));
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
  version: 8,
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
  const previa = porCodigo.get(z.codigo);
  const cuerpo = {
    ...(previa ? { id: previa.id } : {}),
    codigo: z.codigo,
    nombre: z.nombre,
    tipo: z.tipo,
    plano: "croquis",
    poligono: z.poligono,
    notas: [`N° ${z.n} de la leyenda del plano v8.`, z.notas].filter(Boolean).join(" "),
  };
  const { zona } = await api(previa ? "PATCH" : "POST", "/api/admin/forestal/ctp/planta", cuerpo);
  console.log(`${previa ? "actualizó" : "creó"} ${zona.codigo.padEnd(6)} ${zona.tipo.padEnd(15)} ${String(zona.areaM2).padStart(8)} m²  centro [${zona.lat}, ${zona.lng}]`);
}
