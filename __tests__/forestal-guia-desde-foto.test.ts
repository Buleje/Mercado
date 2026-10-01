/**
 * «Leer de una foto» en la guía guardada (ADR-442, 27-09): el lector de GTF
 * devuelve el N° de registro SÓLO si tiene la forma del SNIFFS (nunca un
 * número adivinado) y la pantalla llena los huecos sin pisar lo escrito.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t-qa", role: "admin" }) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/ai/cost-control", () => ({
  aiCostGuard: { canSpend: async () => true, recordSpend: async () => undefined },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const original = { ...process.env };
const LEIDO_BASE = {
  gtfNumber: "019-001-0000004",
  gtfSeries: "",
  especie: "",
  especieCientifica: "",
  volumenM3: 0,
  proveedor: "",
  ruc: "",
  fecha: "",
  origen: "",
};

/** Lo que «leyó» el modelo (OpenAI) → lo que contesta la ruta. */
async function leer(leido: Record<string, unknown>, image = `data:image/jpeg;base64,${"A".repeat(200)}`) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...LEIDO_BASE, ...leido }) } }] }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { POST } = await import("@/app/api/admin/forestal/gtf-ocr/route");
  const res = await POST(
    new NextRequest("http://localhost/api/admin/forestal/gtf-ocr", { method: "POST", body: JSON.stringify({ image }) }),
  );
  return { res, j: (await res.json()) as Record<string, unknown>, fetchMock };
}

beforeEach(() => {
  vi.resetModules();
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

describe("gtf-ocr — N° de registro (ADR-442)", () => {
  it("devuelve el N° de registro con la forma del SNIFFS", async () => {
    const { res, j } = await leer({ numeroRegistro: "110-19-0469791" });
    expect(res.status).toBe(200);
    expect(j.numeroRegistro).toBe("110-19-0469791");
    expect(j.gtfNumber).toBe("019-001-0000004");
  });

  it("si el modelo copió el rótulo, vale el número que trae", async () => {
    const { j } = await leer({ numeroRegistro: "N° REGISTRO : 1-19-0313629" });
    expect(j.numeroRegistro).toBe("1-19-0313629");
  });

  it("la misma GTF puesta como registro sale vacía (son dos números distintos)", async () => {
    const { j } = await leer({ numeroRegistro: "019-001-0000004" });
    expect(j.numeroRegistro).toBe("");
  });

  it("lo que no tiene la forma sale vacío, nunca adivinado", async () => {
    for (const malo of ["ilegible", "12", "QR", ""]) {
      vi.resetModules();
      const { j } = await leer({ numeroRegistro: malo });
      expect(j.numeroRegistro).toBe("");
    }
  });

  it("sin el campo (respuesta vieja) no rompe: vacío", async () => {
    const { res, j } = await leer({});
    expect(res.status).toBe(200);
    expect(j.numeroRegistro).toBe("");
  });

  it("con la serie aparte, la GTF entera (serie + número) tampoco pasa como registro", async () => {
    const { j } = await leer({ gtfNumber: "0000004", gtfSeries: "019-001", numeroRegistro: "019-001-0000004" });
    expect(j.numeroRegistro).toBe("");
  });

  it("un número con forma de GTF no pasa como registro aunque no se haya leído la GTF", async () => {
    const { j } = await leer({ gtfNumber: "", numeroRegistro: "019-0000001" });
    expect(j.numeroRegistro).toBe("");
  });

  it("un null del lector no tumba la lectura (OpenAI responde JSON libre)", async () => {
    const { res, j } = await leer({ numeroRegistro: null });
    expect(res.status).toBe(200);
    expect(j.numeroRegistro).toBe("");
  });

  it("Anthropic recibe el tipo real de la imagen y pide el campo nuevo", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ content: [{ text: JSON.stringify({ ...LEIDO_BASE, numeroRegistro: "1-19-0313629" }) }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/admin/forestal/gtf-ocr/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/forestal/gtf-ocr", {
        method: "POST",
        body: JSON.stringify({ image: `data:image/png;base64,${"A".repeat(200)}` }),
      }),
    );
    expect(((await res.json()) as { numeroRegistro: string }).numeroRegistro).toBe("1-19-0313629");
    const cuerpo = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(cuerpo.messages[0].content[0].source.media_type).toBe("image/png");
    expect(cuerpo.output_config.format.schema.required).toContain("numeroRegistro");
  });
});

describe("lo leído → el formulario", () => {
  it("limpia cada dato: RUC de 8/11 dígitos, fecha real, sin «N°» delante de la GTF", async () => {
    const { lecturaDe } = await import("@/hooks/use-guia-desde-foto");
    expect(
      lecturaDe({ numeroRegistro: "1-19-0313629", gtfNumber: "N° 019-0000003", fecha: "17/12/2024", proveedor: " CN SAN LUIS ", ruc: "RUC: 20156701263" }),
    ).toEqual({ numeroRegistro: "1-19-0313629", gtfNumber: "019-0000003", fecha: "2024-12-17", titular: "CN SAN LUIS", ruc: "20156701263" });
    const malo = lecturaDe({ fecha: "2026-02-31", ruc: "123" });
    expect(malo.fecha).toBe("");
    expect(malo.ruc).toBe("");
  });

  it("llena sólo lo vacío: lo escrito manda sobre la foto", async () => {
    const { formConLectura } = await import("@/hooks/use-guia-desde-foto");
    const { FORM_VACIO } = await import("@/components/admin/forestal/guia-guardada-form");
    const f = formConLectura(
      { ...FORM_VACIO, titularNombre: "LO QUE ESCRIBÍ", notas: "llega el lunes" },
      { numeroRegistro: "", gtfNumber: "019-999-4420442", fecha: "2026-09-21", titular: "DE LA FOTO", ruc: "20123456789" },
    );
    expect(f).toMatchObject({
      gtfNumber: "019-999-4420442",
      gtfDate: "2026-09-21",
      titularNombre: "LO QUE ESCRIBÍ",
      titularDoc: "20123456789",
      notas: "llega el lunes",
    });
  });

  it("la foto que dice OTRA GTF no se sube sola; la misma con la serie aparte, sí", async () => {
    const { fotoDiceOtraGtf, fotoSinGtfLeida } = await import("@/hooks/use-guia-desde-foto");
    const l = { numeroRegistro: "110-19-0469791", gtfNumber: "019-001-0000999", fecha: "", titular: "", ruc: "" };
    expect(fotoDiceOtraGtf(l, "019-001-0000004")).toBe(true);
    expect(fotoDiceOtraGtf({ ...l, gtfNumber: "019 001 0000004" }, "019-001-0000004")).toBe(false);
    expect(fotoDiceOtraGtf({ ...l, gtfNumber: "0000004" }, "019-001-0000004")).toBe(false);
    /* Sin GTF leída no hay con qué comparar: un dígito mal leído del registro
       traería otra guía de SERFOR. No se sube sola: se pide confirmar. */
    expect(fotoSinGtfLeida({ ...l, gtfNumber: "" })).toBe(true);
    expect(fotoSinGtfLeida(l)).toBe(false);
  });

  it("une la serie y el número, y quita cualquier rótulo antes del primer dígito", async () => {
    const { lecturaDe } = await import("@/hooks/use-guia-desde-foto");
    expect(lecturaDe({ gtfNumber: "0000004", gtfSeries: "019-001" }).gtfNumber).toBe("019-001-0000004");
    expect(lecturaDe({ gtfNumber: "NRO 019-001-0000004", gtfSeries: "019-001" }).gtfNumber).toBe("019-001-0000004");
    expect(lecturaDe({ gtfNumber: "GTF N° 019-0000003" }).gtfNumber).toBe("019-0000003");
  });
});
