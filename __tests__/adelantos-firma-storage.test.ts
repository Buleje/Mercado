// @vitest-environment node
/**
 * `borrarFirmasDelAdelanto` (auditoría 08-10, Ley 29733): las hojas archivadas
 * al volver a firmar quedan en `<tenant>/adelantos/<id>/` del bucket privado y
 * fuera de la columna nadie las alcanza. Borra la carpeta ENTERA del adelanto
 * (vigente + archivadas), sólo archivos con forma de hoja de ESTE adelanto, y
 * devuelve el error en vez de tirar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ storage: { from: (b: string) => (H.from(b), { list: H.list, remove: H.remove }) } }),
}));
vi.mock("@/lib/forestal/fotos-carga-storage", () => ({ BUCKET_FOTOS_CARGA: "forestal-privado", asegurarBucketFotosCarga: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { borrarFirmasDelAdelanto } from "@/lib/adelantos/firma-storage";

const hoja = (n: number) => ({ name: `${1728000000000 + n}-firma-recibo-abcdef12.webp` });

beforeEach(() => {
  vi.clearAllMocks();
  H.remove.mockResolvedValue({ data: [], error: null });
});

describe("borrarFirmasDelAdelanto", () => {
  it("borra la vigente y las archivadas de la carpeta del adelanto, y nada que no sea una hoja", async () => {
    H.list.mockResolvedValueOnce({ data: [hoja(1), hoja(2), { name: ".emptyFolderPlaceholder" }, { name: "otra-cosa.pdf" }], error: null });
    const r = await borrarFirmasDelAdelanto("t1", "a1");
    expect(r).toEqual({ ok: true, borradas: 2 });
    expect(H.from).toHaveBeenCalledWith("forestal-privado");
    expect(H.list).toHaveBeenCalledWith("t1/adelantos/a1", expect.objectContaining({ limit: 100, offset: 0 }));
    expect(H.remove).toHaveBeenCalledWith([`t1/adelantos/a1/${hoja(1).name}`, `t1/adelantos/a1/${hoja(2).name}`]);
  });

  it("pagina: junta todas las páginas ANTES de borrar y borra en tandas de 100", async () => {
    const pagina1 = Array.from({ length: 100 }, (_, i) => hoja(i));
    H.list.mockResolvedValueOnce({ data: pagina1, error: null }).mockResolvedValueOnce({ data: [hoja(500)], error: null });
    const r = await borrarFirmasDelAdelanto("t1", "a1");
    expect(r).toEqual({ ok: true, borradas: 101 });
    expect(H.list).toHaveBeenNthCalledWith(2, "t1/adelantos/a1", expect.objectContaining({ offset: 100 }));
    expect(H.remove).toHaveBeenCalledTimes(2);
    expect(H.list.mock.invocationCallOrder[1]).toBeLessThan(H.remove.mock.invocationCallOrder[0]);
  });

  it("carpeta vacía: ok sin llamar a remove", async () => {
    H.list.mockResolvedValueOnce({ data: [], error: null });
    expect(await borrarFirmasDelAdelanto("t1", "a1")).toEqual({ ok: true, borradas: 0 });
    expect(H.remove).not.toHaveBeenCalled();
  });

  it.each([["../t2", "a1"], ["t1", "a1/../../t2"], ["", "a1"]])("id raro (%s, %s) → error sin listar nada", async (t, a) => {
    expect(await borrarFirmasDelAdelanto(t, a)).toEqual({ ok: false, error: "id inválido" });
    expect(H.list).not.toHaveBeenCalled();
  });

  it("si Storage falla al listar o al borrar, lo devuelve (no tira ni dice que borró)", async () => {
    H.list.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await borrarFirmasDelAdelanto("t1", "a1")).toEqual({ ok: false, error: "boom" });
    expect(H.remove).not.toHaveBeenCalled();

    H.list.mockResolvedValueOnce({ data: [hoja(1)], error: null });
    H.remove.mockResolvedValueOnce({ data: null, error: { message: "sin permiso" } });
    expect(await borrarFirmasDelAdelanto("t1", "a1")).toEqual({ ok: false, error: "sin permiso" });
  });
});
