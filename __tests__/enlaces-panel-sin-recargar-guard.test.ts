/**
 * Dentro del panel, ningún enlace a `/admin?tab=…` se dibuja con `<a>` pelado,
 * `<Link>` de Next ni `router.push`.
 *
 * Por qué (09-10): un `<a href>` recarga el panel entero (tarda y corta el
 * video de las cámaras) y un `<Link>` / `router.push` cambia la URL pero NO el
 * módulo: `useAdminTabs` lee la pestaña al montar y en `popstate`, y la
 * navegación suave de Next no dispara `popstate`. El camino bueno es
 * `<EnlacePanel href=…>` (`components/admin/shared/EnlacePanel.tsx`) o
 * `irAEnlace` desde un botón: navegan sin recargar y ctrl/cmd + clic sigue
 * abriendo otra pestaña.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolverDestino } from "@/lib/admin/destino-tab";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["components/admin", "app/admin/_components"];
/* Los avisos, correos y respuestas de la IA arman sus enlaces en el servidor:
   `?tab=demand-prediction` (cron de predicción) y `?tab=subscription` (correo
   del plan) caían en Inicio y nadie lo veía (09-10). */
const DIRS_CON_ENLACES = [...DIRS, "app/api", "lib"];
/* `tab` en cualquier lugar de la query, no sólo primero: el formato viejo
   `/admin?module=marketplace&tab=ordenes` (60 avisos de pedidos guardados) y
   `?module=inventario&tab=stock` (push de stock) se le escapaban (09-10). */
const TAB_EN_ENLACE = /\/admin\/?\?(?:[^"'`\s#]*?&)?tab=([a-z0-9-]+)/g;

/** Excepciones a propósito, con su razón. */
const PERMITIDOS: Record<string, string> = {
  "components/admin/billing/TrialExpiredGuard.tsx": "cobro del plan: tapa el panel y recarga a propósito",
  "components/admin/documentos/HojaCalculoEditor.tsx": "vive en /admin/documentos/[id]: otra ruta",
  "components/admin/documentos/DocumentoTextoEditor.tsx": "vive en /admin/documentos/[id]: otra ruta",
  "components/admin/forestal/PatioArmarLote.tsx": "vive en /admin/patio: otra ruta",
  "components/admin/forestal/CubicadorMadera.tsx": "más de 3.000 líneas: va en su propio carril",
  "components/admin/forestal/troza-tarjeta/ArmarLoteDesdeTarjeta.tsx": "vive en /admin/q/[id]: otra ruta",
};

const ENLACE_PELADO = /<(a|Link)\s[^>]*?\bhref=\{?\s*["'`]\/admin\?tab=/g;
const ROUTER_PUSH = /router\.(push|replace)\(\s*["'`]\/admin\?tab=/g;

function archivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function linea(texto: string, indice: number): number {
  return texto.slice(0, indice).split("\n").length;
}

describe("enlaces del panel sin recargar", () => {
  it("ningún <a>/<Link>/router.push a /admin?tab= fuera de las excepciones", () => {
    const hallazgos: string[] = [];
    for (const dir of DIRS) {
      for (const abs of archivos(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, abs).split(path.sep).join("/");
        if (PERMITIDOS[rel]) continue;
        const texto = fs.readFileSync(abs, "utf8");
        for (const re of [ENLACE_PELADO, ROUTER_PUSH]) {
          for (const m of texto.matchAll(re)) {
            hallazgos.push(`${rel}:${linea(texto, m.index ?? 0)} → usa <EnlacePanel href=…> o irAEnlace`);
          }
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });

  /* 09-10: «Ver detalles» del aviso de IA mandaba a `?tab=settings`, que no
     existe. Con `<Link>` la recarga caía en el módulo por defecto; con
     `irAEnlace` el panel queda EN BLANCO (navigateTab no tiene rama para él). */
  it("cada tab=<id> de un /admin?… escrito a mano (panel, API y lib) lleva a una rama de TabRouter", () => {
    const router = fs.readFileSync(path.join(ROOT, "app/admin/_components/TabRouter.tsx"), "utf8");
    const conRama = new Set([...router.matchAll(/tab === "([a-z0-9-]+)"/g)].map((m) => m[1]));
    // El mismo camino que el panel (ADR-490): alias → pestaña de hoy → su rama.
    const existe = (id: string) => {
      const destino = resolverDestino(id);
      return destino !== null && conRama.has(destino.tab);
    };
    const hallazgos: string[] = [];
    for (const dir of DIRS_CON_ENLACES) {
      for (const abs of archivos(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, abs).split(path.sep).join("/");
        const texto = fs.readFileSync(abs, "utf8");
        for (const m of texto.matchAll(TAB_EN_ENLACE)) {
          if (!existe(m[1])) hallazgos.push(`${rel}:${linea(texto, m.index ?? 0)} → ?tab=${m[1]} no es un módulo`);
        }
      }
    }
    expect(conRama.size).toBeGreaterThan(30);
    expect(hallazgos).toEqual([]);
  });

  it("las excepciones siguen existiendo (si se borra una, sacarla de la lista)", () => {
    const faltan = Object.keys(PERMITIDOS).filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
    expect(faltan).toEqual([]);
  });
});
