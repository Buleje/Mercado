// @vitest-environment node
/**
 * __tests__/file-store-clave-inexistente.test.ts
 *
 * `readData` convertía CUALQUIER falla en «not found». Metas y tareas lo
 * trataban como lista vacía, así que un JSON corrupto terminaba reescrito con
 * una lista vacía en la escritura siguiente: se perdía todo (auditoría
 * 2026-09-14). Ahora sólo un archivo inexistente es `ClaveInexistenteError`.
 *
 * `DATA_DIR` sale de `process.cwd()` al importar: cada caso apunta a un
 * directorio temporal y reinicia los módulos.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

async function fileStore() {
  vi.resetModules();
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  return import("@/lib/file-store");
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "file-store-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("readData distingue «no existe» de «no se pudo leer»", () => {
  it("una clave que nunca se escribió es ClaveInexistenteError", async () => {
    const { readData, esClaveInexistente } = await fileStore();
    const err = await readData("goals").catch((e: unknown) => e);
    expect(esClaveInexistente(err)).toBe(true);
  });

  it("un JSON corrupto NO se confunde con «no existe»", async () => {
    mkdirSync(path.join(dir, "local-data"), { recursive: true });
    writeFileSync(path.join(dir, "local-data", "goals.json"), '{"goals": [ {"id": "a"');
    const { readData, esClaveInexistente } = await fileStore();
    const err = await readData("goals").catch((e: unknown) => e);
    expect(esClaveInexistente(err)).toBe(false);
    expect(err).toBeInstanceOf(SyntaxError);
  });

  it("CONTROL: un archivo válido se lee igual que antes", async () => {
    const { readData, writeData } = await fileStore();
    await writeData("tasks", { tasks: [{ id: "t1" }] });
    await expect(readData("tasks")).resolves.toEqual({ tasks: [{ id: "t1" }] });
  });
});
