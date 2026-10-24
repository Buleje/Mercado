import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePlanDocumentos } from "@/components/admin/forestal/hooks/use-plan-documentos";
import { foto, pdf, servidorFalso } from "./helpers/plan-documentos-fixtures";

/**
 * use-plan-documentos (ADR-467) — el plan YA guardado: todo va al servidor en
 * el momento.
 *
 * 1. La vista se lee sola; una ruta que no existe (404 sin cuerpo) o un rol que
 *    no la ve (403) apagan la sección en vez de mostrar un error.
 * 2. Subir a un plan sin preparar: primero se crean las carpetas, después se
 *    sube a la carpeta REAL y se etiqueta con el casillero.
 * 3. Un negocio que nunca preparó un plan ve las carpetas sugeridas.
 */

afterEach(() => vi.unstubAllGlobals());

const PLAN = "plan-qa-2";

describe("usePlanDocumentos", () => {
  it("lee la vista y arma las carpetas en orden", async () => {
    const srv = servidorFalso(PLAN);
    vi.stubGlobal("fetch", srv.fetchMock);
    const { result } = renderHook(() => usePlanDocumentos({ planId: PLAN }));
    await waitFor(() => expect(result.current.vista).not.toBeNull());
    expect(result.current.carpetas.map((c) => c.clave)).toEqual(["resolucion", "jefe"]);
    expect(result.current.disponible).toBe(true);
    expect(srv.llamadas[0].ruta).toBe(`/api/admin/forestal/plan/documentos?planId=${PLAN}`);
  });

  it("sin la ruta (404 sin cuerpo) o sin permiso (403) la sección se apaga, no muestra un error", async () => {
    for (const status of [404, 403]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(status === 404 ? "<html>" : JSON.stringify({ error: "forbidden" }), { status })));
      const { result, unmount } = renderHook(() => usePlanDocumentos({ planId: PLAN }));
      await waitFor(() => expect(result.current.disponible).toBe(false));
      expect(result.current.error).toBeNull();
      unmount();
    }
  });

  it("la primera subida prepara las carpetas, sube a la carpeta real y la pone en su casillero", async () => {
    const srv = servidorFalso(PLAN);
    vi.stubGlobal("fetch", srv.fetchMock);
    const { result } = renderHook(() => usePlanDocumentos({ planId: PLAN }));
    await waitFor(() => expect(result.current.vista?.preparada).toBe(false));

    const jefe = result.current.carpetas.find((c) => c.clave === "jefe");
    if (!jefe) throw new Error("falta la carpeta del jefe");
    expect(jefe.folderId).toBeNull();
    await act(async () => {
      await result.current.subir([foto("dni-frente.jpg"), foto("dni-dorso.jpg")], jefe, jefe.casilleros[0]);
    });

    const orden = srv.llamadas.map((l) => `${l.metodo} ${l.ruta.split("?")[0]}`);
    expect(orden.indexOf("POST /api/admin/forestal/plan/documentos/preparar")).toBeLessThan(orden.indexOf("POST /api/admin/documents"));
    const subidas = srv.de("POST", "/api/admin/documents").filter((l) => l.ruta === "/api/admin/documents");
    expect(subidas.map((l) => (l.cuerpo as FormData).get("folderId"))).toEqual(["f-jefe", "f-jefe"]);
    expect(srv.de("PATCH", "/api/admin/documents/").map((l) => l.cuerpo)).toEqual([
      { tags: ["imagen", "campo:c-dni"] },
      { tags: ["imagen", "campo:c-dni"] },
    ]);
    // Terminado: sin filas de progreso colgadas y sin «ocupado».
    expect(result.current.subidas).toEqual([]);
    expect(result.current.ocupado).toBe(false);
  });

  it("un archivo que el Drive rechaza queda en su casillero con el motivo, y los demás suben", async () => {
    const srv = servidorFalso(PLAN, (l) =>
      l.cuerpo instanceof FormData && (l.cuerpo.get("file") as File).name === "pesado.pdf" ? { status: 413, json: {} } : undefined,
    );
    vi.stubGlobal("fetch", srv.fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => usePlanDocumentos({ planId: PLAN }));
    await waitFor(() => expect(result.current.vista).not.toBeNull());
    const res = result.current.carpetas[0];
    await act(async () => {
      await result.current.subir([pdf("pesado.pdf"), pdf("resolucion.pdf")], res, res.casilleros[0]);
    });
    expect(result.current.subidas).toEqual([
      expect.objectContaining({ nombre: "pesado.pdf", estado: "error", motivo: "pesa más de lo permitido", casilleroClave: "resolucion-o-constancia-de-registro" }),
    ]);
    expect(srv.de("PATCH", "/api/admin/documents/")).toHaveLength(1);
    act(() => result.current.descartarSubida(result.current.subidas[0].key));
    expect(result.current.subidas).toEqual([]);
  });

  it("un negocio que nunca preparó un plan ve las carpetas sugeridas (provisionales)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            vista: { planId: PLAN, planType: "PO", carpetaRaizId: null, rutaRaiz: "Libro TH/X/PO-1", preparada: false, carpetas: [], resumen: { esperados: 0, cargados: 0, faltan: 0, vencenPronto: 0, vencidos: 0 }, delPlan: { resolucionNumber: null, resolucionDate: null, representanteLegal: null, propietarioNombre: null } },
          }),
          { status: 200 },
        ),
      ),
    );
    const { result } = renderHook(() => usePlanDocumentos({ planId: PLAN }));
    await waitFor(() => expect(result.current.carpetas.length).toBeGreaterThan(0));
    expect(result.current.carpetas.map((c) => c.clave)).toEqual(["resolucion", "jefe", "titulos", "otros"]);
    expect(result.current.carpetas.every((c) => c.provisional && c.folderId == null)).toBe(true);
  });
});
