#!/usr/bin/env node
/**
 * rol-probe — la MISMA lista de rutas probada con cada rol, en una llamada.
 *
 * Por qué (2026-10-04): cada revisión de `security` armaba a mano el login de
 * cajero y admin y repetía curl por curl (~40 turnos; 2 de 4 revisiones
 * llegaron al límite). Un hueco de permisos se ve en una tabla: la fila donde
 * el cajero recibe 200 y no debería.
 *
 * Uso:
 *   node scripts/dev-helpers/rol-probe.mjs --preset drive
 *   node scripts/dev-helpers/rol-probe.mjs "GET /api/admin/documents" "GET /api/api-keys"
 *   node scripts/dev-helpers/rol-probe.mjs --rutas rutas.txt     (una por línea: MÉTODO /ruta [json])
 *   node scripts/dev-helpers/rol-probe.mjs --escribir "POST /api/x {\"a\":1}"
 *   node scripts/dev-helpers/rol-probe.mjs --preset drive --json
 *
 * Roles (por defecto admin y cajero de QA en `main`):
 *   BSM_ROLES="admin:qaadmin:Qa-admin-1234,cajero:qacajero:Qa-cajero-1234,almacenero:<usuario>:<clave>"
 *   BSM_TENANT=<slug>   BSM_BASE=http://localhost:3000
 *
 * Sin `--escribir` sólo se mandan GET/HEAD: un POST/PATCH/DELETE de prueba con
 * un rol que SÍ puede escribir cambia datos reales. Con `--escribir`, limpiar
 * después es tarea de quien lo corre.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const PRESETS = {
  // Lecturas del Drive que deben respetar el rol por toda la cadena de carpetas.
  drive: [
    "GET /api/admin/documents",
    "GET /api/admin/documents?expiring=30",
    "GET /api/admin/documents/folders",
    "GET /api/admin/documents/tags",
    "GET /api/admin/documents/duplicates",
    "GET /api/admin/documents/activity",
    "GET /api/api-keys",
  ],
  // Lo que sólo admin y dueño deberían ver.
  claves: ["GET /api/api-keys", "GET /api/admin/documents/sync"],
};

function rutasPedidas() {
  const lista = [];
  const preset = valor("--preset");
  if (preset) {
    if (!PRESETS[preset]) throw new Error(`preset desconocido: ${preset} (hay: ${Object.keys(PRESETS).join(", ")})`);
    lista.push(...PRESETS[preset]);
  }
  const archivo = valor("--rutas");
  if (archivo) lista.push(...readFileSync(archivo, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  const saltar = new Set([valor("--preset"), valor("--rutas")].filter(Boolean));
  for (const a of args) if (!a.startsWith("--") && !saltar.has(a)) lista.push(a);
  return lista.map((linea) => {
    const m = linea.match(/^(GET|HEAD|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\s+(.+))?$/i);
    if (!m) throw new Error(`ruta mal escrita: «${linea}» (MÉTODO /ruta [json])`);
    return { metodo: m[1].toUpperCase(), ruta: m[2], cuerpo: m[3] ?? null, linea };
  });
}

function rolesPedidos() {
  const crudo = process.env.BSM_ROLES || "admin:qaadmin:Qa-admin-1234,cajero:qacajero:Qa-cajero-1234";
  return crudo.split(",").map((r) => {
    const [rol, usuario, clave] = r.split(":");
    if (!rol || !usuario || !clave) throw new Error(`BSM_ROLES mal escrito: «${r}» (rol:usuario:clave)`);
    return { rol, usuario, clave };
  });
}

function iniciarSesion({ usuario, clave }) {
  const out = execFileSync(process.execPath, [join(AQUI, "admin-auth.mjs"), "--json"], {
    env: { ...process.env, BSM_USER: usuario, BSM_PASS: clave },
    encoding: "utf8",
    timeout: 60_000,
  });
  const j = JSON.parse(out.trim().split("\n").pop());
  if (!j.ok) throw new Error(`no pudo entrar ${usuario}`);
  return j;
}

/** Una línea que diga qué volvió: cuántos ítems si es una lista, si no los bytes. */
function resumen(texto) {
  try {
    const j = JSON.parse(texto);
    if (Array.isArray(j)) return `${j.length} ítems`;
    const lista = Object.values(j).find(Array.isArray);
    if (lista) return `${lista.length} ítems`;
    if (j && typeof j === "object" && "error" in j) return String(j.error).slice(0, 30);
    return "objeto";
  } catch {
    return `${texto.length} B`;
  }
}

async function main() {
  const rutas = rutasPedidas();
  if (rutas.length === 0) {
    console.error("Sin rutas. Ej.: --preset drive  o  \"GET /api/admin/documents\"");
    process.exit(2);
  }
  const escribir = flag("--escribir");
  const bloqueadas = rutas.filter((r) => !["GET", "HEAD"].includes(r.metodo));
  if (bloqueadas.length && !escribir) {
    console.error(`Hay ${bloqueadas.length} ruta(s) que escriben (${bloqueadas[0].linea}…): agregá --escribir si de verdad querés mandarlas.`);
    process.exit(2);
  }
  const roles = rolesPedidos();
  const sesiones = roles.map((r) => ({ ...r, s: iniciarSesion(r) }));

  const filas = [];
  for (const r of rutas) {
    const fila = { ruta: r.linea, por: {} };
    for (const { rol, s } of sesiones) {
      const res = await fetch(s.base + r.ruta, {
        method: r.metodo,
        headers: {
          cookie: s.cookieHeader,
          "x-csrf-token": s.csrf,
          "x-tenant-id": s.tenant,
          ...(r.cuerpo ? { "content-type": "application/json" } : {}),
        },
        body: r.cuerpo ?? undefined,
        redirect: "manual",
      }).catch((err) => ({ status: 0, text: async () => String(err) }));
      fila.por[rol] = { status: res.status, resumen: resumen(await res.text()) };
    }
    // «Igual» = mismo estado Y mismo resumen: 200 con 24 ítems vs 200 con 21 es
    // justamente el filtro por rol funcionando.
    const respuestas = new Set(Object.values(fila.por).map((x) => `${x.status} ${x.resumen}`));
    fila.distinto = respuestas.size > 1;
    filas.push(fila);
  }

  if (flag("--json")) {
    console.log(JSON.stringify({ roles: roles.map((r) => r.rol), filas }, null, 1));
    return;
  }
  const ancho = Math.max(...filas.map((f) => f.ruta.length), 10);
  console.log(`${"ruta".padEnd(ancho)}  ${roles.map((r) => r.rol.padEnd(22)).join("")}`);
  for (const f of filas) {
    const celdas = roles.map(({ rol }) => `${f.por[rol].status} ${f.por[rol].resumen}`.slice(0, 21).padEnd(22)).join("");
    console.log(`${f.ruta.padEnd(ancho)}  ${celdas}${f.distinto ? "" : "  ← misma respuesta para todos"}`);
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
