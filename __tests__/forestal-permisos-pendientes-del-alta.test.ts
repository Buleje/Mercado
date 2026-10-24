import { describe, it, expect, vi, afterEach } from "vitest";
import { aContratoInput, guardarPermisosPendientes, permisoVacio } from "@/components/admin/forestal/CtpPartePermisos";

/**
 * Los permisos cargados DURANTE el alta de una ficha (ADR-425).
 *
 * Mientras la ficha no existe no hay id al que colgarlos, así que quedan
 * pendientes y se crean cuando el servidor devuelve la parte. Lo que se prueba
 * acá es justo eso: que se crean **con el `titularId` recién nacido** —el
 * vínculo que estaba vacío en 6 de 6 permisos reales— y que un código repetido
 * no se traga en silencio.
 */

const pendiente = (codigo: string, extra: Record<string, string> = {}) =>
  permisoVacio({ codigo, ...extra });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("aContratoInput", () => {
  it("manda el titularId de la ficha y el documento con el que se la identifica", () => {
    const input = aContratoInput(pendiente("PER-FMC-1"), {
      id: "parte-9",
      nombre: "  COMUNIDAD NATIVA SANTA ROSA DE CHIVIS  ",
      docTipo: "RUC",
      docNumero: "20601234567",
    });
    expect(input.titularId).toBe("parte-9");
    expect(input.titularNombre).toBe("COMUNIDAD NATIVA SANTA ROSA DE CHIVIS");
    expect(input.titularDoc).toBe("20601234567");
    expect(input.titularDocTipo).toBe("RUC");
  });

  it("lo vacío viaja como null, no como cadena vacía", () => {
    const input = aContratoInput(pendiente("PER-FMC-1"), { id: null, nombre: "CCNN X" });
    expect(input.resolucionNumero).toBeNull();
    expect(input.arffs).toBeNull();
    expect(input.region).toBeNull();
    expect(input.vigenciaHasta).toBeNull();
  });

  it("un área sin cargar es null y nunca 0: cero hectáreas sería un dato falso", () => {
    expect(aContratoInput(pendiente("X-1"), { nombre: "CCNN X" }).areaHa).toBeNull();
    expect(aContratoInput(pendiente("X-1", { areaHa: "12.5" }), { nombre: "CCNN X" }).areaHa).toBe(12.5);
  });

  it("no deja el titular en blanco: sin nombre queda «Sin registrar», como el sembrado", () => {
    expect(aContratoInput(pendiente("X-1"), { nombre: "   " }).titularNombre).toBe("Sin registrar");
  });
});

describe("guardarPermisosPendientes", () => {
  it("crea uno por uno y cuenta los que entraron", async () => {
    const vistos: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      vistos.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ contrato: { id: "c1" } }), { status: 201 });
    });
    const r = await guardarPermisosPendientes({ id: "p1", nombre: "CCNN X" }, [pendiente("A-1"), pendiente("B-2")]);
    expect(r.creados).toBe(2);
    expect(r.errores).toEqual([]);
    expect(vistos).toHaveLength(2);
    expect((vistos[0] as { titularId: string }).titularId).toBe("p1");
  });

  it("un código que ya era permiso NO se duplica y se dice cuál fue", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ contrato: { id: "viejo" }, message: "ya está" }), { status: 409 }),
    );
    const r = await guardarPermisosPendientes({ id: "p1", nombre: "CCNN X" }, [pendiente("REPETIDO-1")]);
    expect(r.creados).toBe(0);
    expect(r.errores[0]).toContain("REPETIDO-1");
  });

  it("si uno falla, los demás igual entran", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n += 1;
      return n === 1
        ? new Response(JSON.stringify({ message: "código inválido" }), { status: 400 })
        : new Response(JSON.stringify({ contrato: { id: "c2" } }), { status: 201 });
    });
    const r = await guardarPermisosPendientes({ id: "p1", nombre: "CCNN X" }, [pendiente("MAL-1"), pendiente("BIEN-2")]);
    expect(r.creados).toBe(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("MAL-1");
  });

  it("una fila sin código no se manda: no existe el permiso «»", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ contrato: { id: "c" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await guardarPermisosPendientes({ id: "p1", nombre: "CCNN X" }, [pendiente("   ")]);
    expect(r.creados).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
