/**
 * Adelantos obedece la matriz de roles (ADR-448, revisión de seguridad).
 *
 * Las rutas de `/api/adelantos` llamaban `requireAdmin(req)` sin roles: un cajero
 * o un almacenero —que en `lib/auth/role-permissions.ts` NO tienen `adelantos`—
 * creaban personas, daban adelantos con caja pasando el tope y borraban deudas
 * con una entrega libre. Dos pruebas:
 *  1. `permisoAdelantos` responde lo que dice la matriz, rol por rol;
 *  2. cada handler de cada ruta de `/api/adelantos` lo llama con la acción de su
 *     método (GET → read, POST/PATCH → write, DELETE → delete). Una ruta nueva que
 *     lo olvide hace caer este test.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { checkPermission, type Role } from "@/lib/auth/role-permissions";

describe("permisoAdelantos = la matriz", () => {
  const casos: [string, "read" | "write" | "delete", boolean][] = [
    ["admin", "read", true],
    ["admin", "write", true],
    ["admin", "delete", true],
    ["owner", "write", true],
    ["owner", "delete", true],
    ["manager", "read", true],
    ["manager", "write", true],
    ["manager", "delete", false],
    ["analista", "read", true],
    ["analista", "write", false],
    ["cajero", "read", false],
    ["cajero", "write", false],
    ["almacenero", "read", false],
    ["almacenero", "write", false],
    ["almacenero", "delete", false],
  ];
  it.each(casos)("%s · %s → %s", (role, accion, puede) => {
    expect(permisoAdelantos(role, accion) === null).toBe(puede);
    // No copia la matriz: la lee. Si la matriz cambia, esto sigue igual a ella.
    expect(checkPermission(role as Role, "adelantos", accion)).toBe(puede);
  });

  it("el 403 dice qué no puede, legible (los modales muestran `error` tal cual)", async () => {
    const r = permisoAdelantos("cajero", "write");
    expect(r?.status).toBe(403);
    expect(await r?.json()).toEqual({
      error: "Tu rol no puede registrar o cambiar adelantos.",
      message: "Tu rol no puede registrar o cambiar adelantos.",
      code: "sin_permiso_adelantos",
    });
  });
});

describe("cada ruta de /api/adelantos pregunta a la matriz", () => {
  const RAIZ = join(__dirname, "..", "app", "api", "adelantos");
  /** Las de liquidar ya exigen admin o dueño explícito (más estricto que la matriz). */
  const EXCEPCIONES = new Set(["cuentas/liquidaciones/route.ts", "cuentas/liquidaciones/[id]/route.ts", "cuentas/partidas/route.ts"]);
  const ACCION: Record<string, string> = { GET: "read", POST: "write", PATCH: "write", PUT: "write", DELETE: "delete" };

  const rutas = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? rutas(p) : n === "route.ts" ? [p] : [];
    });

  const archivos = rutas(RAIZ).map((p) => [relative(RAIZ, p).replaceAll("\\", "/"), readFileSync(p, "utf8")] as const);

  it("hay rutas que revisar (si da pocas, el recorrido se rompió)", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(10);
  });

  it("cada handler llama `permisoAdelantos` con la acción de su método", () => {
    const faltan: string[] = [];
    for (const [archivo, src] of archivos) {
      if (EXCEPCIONES.has(archivo)) continue;
      const handlers = src.split(/(?=^export (?:async function|const) (?:GET|POST|PATCH|PUT|DELETE)\b)/m).slice(1);
      for (const h of handlers) {
        const metodo = /^export (?:async function|const) (\w+)/.exec(h)?.[1] ?? "?";
        if (!h.includes(`permisoAdelantos(auth.role, "${ACCION[metodo]}")`)) faltan.push(`${archivo} ${metodo}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it("anular (PATCH cancelar) también es `delete`", () => {
    const src = archivos.find(([a]) => a === "[id]/route.ts")?.[1] ?? "";
    expect(src).toMatch(/if \(parsed\.data\.cancelar\) \{\s*const sinBorrar = permisoAdelantos\(auth\.role, "delete"\);/);
  });
});
