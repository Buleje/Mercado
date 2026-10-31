import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Preventivo: cada `action: "…"` del union de `use-rrhh-ficha.ts` tiene que
 * aparecer en ALGÚN componente de `components/admin/rrhh/**` — si no, el
 * hook lo expone pero nadie puede tocarlo desde la pantalla (pasó con
 * `cambiar_estado`: VACACIONES/LICENCIA/SUSPENDIDO eran inalcanzables).
 *
 * No mira roles ni gating (eso lo revisa una persona) — sólo que exista un
 * PUNTO DE ENTRADA en la UI para cada acción del contrato.
 */

const ROOT = path.resolve(__dirname, "..");
const HOOK_FILE = path.join(ROOT, "hooks", "use-rrhh-ficha.ts");
const UI_DIR = path.join(ROOT, "components", "admin", "rrhh");

/**
 * Excepción DOCUMENTADA, no un permiso general: `restaurar` (ADR-414 §1)
 * revive a alguien con `deletedAt` puesto, pero F1 no tiene NINGÚN endpoint
 * que liste colaboradores eliminados (`ColaboradoresDB.listar` sólo trae
 * `deletedAt: null`; sólo `cambiarEstado`/`restaurar` en el DB class miran
 * `deletedAt: { not: null }`, sin una ruta GET que lo exponga). Sin una
 * lista, no hay id que ofrecer — construir un picker sería una pantalla que
 * simula elegir de una lista vacía. Falta la ruta de listado en el backend
 * (F2/F3) antes de que esto tenga un punto de entrada honesto.
 */
const SIN_UI_DOCUMENTADO = new Set(["restaurar"]);

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Lee los `action: "xxx"` del union `AccionColaborador` de use-rrhh-ficha.ts. */
function accionesDelContrato(): string[] {
  const src = fs.readFileSync(HOOK_FILE, "utf-8");
  const matches = [...src.matchAll(/action:\s*"([a-z_]+)"/g)];
  const acciones = [...new Set(matches.map((m) => m[1]))];
  expect(acciones.length, "no se encontraron acciones en use-rrhh-ficha.ts — regex desactualizada o archivo movido").toBeGreaterThan(0);
  return acciones;
}

describe("RRHH: toda acción de la ficha tiene un punto de entrada en la UI", () => {
  it("cada `action: \"…\"` del contrato aparece en algún componente de components/admin/rrhh", () => {
    const acciones = accionesDelContrato();
    const uiFiles = walkFiles(UI_DIR);
    const uiContent = uiFiles.map((f) => fs.readFileSync(f, "utf-8")).join("\n");

    const sinUI = acciones.filter((a) => !uiContent.includes(`"${a}"`) && !SIN_UI_DOCUMENTADO.has(a));

    expect(
      sinUI,
      `Estas acciones de use-rrhh-ficha.ts no aparecen en ningún .tsx de components/admin/rrhh — el hook las expone pero no hay botón/control que las dispare:\n${sinUI.join("\n")}`,
    ).toEqual([]);

    // Si algún día SÍ hay UI para `restaurar`, este test debe recordar que
    // hay que sacarlo del allowlist — si no, la excepción documentada se
    // vuelve una mentira silenciosa.
    for (const a of SIN_UI_DOCUMENTADO) {
      if (uiContent.includes(`"${a}"`)) {
        throw new Error(`"${a}" ya tiene UI — sacalo de SIN_UI_DOCUMENTADO en este test.`);
      }
    }
  });
});
