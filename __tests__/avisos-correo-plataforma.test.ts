/**
 * Correos de la plataforma (23-10): el interruptor `avisos-correo:plataforma`.
 *   - sin fila = todo encendido; pausado apaga todo; apagar un tipo apaga sólo ése
 *   - Json corrupto = por defecto; lectura que falla = el correo sale (fail-open)
 *   - destino de cada tipo según las variables de entorno; «¿qué le llega a este correo?»
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ get: vi.fn(), actualizar: vi.fn(), warn: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: m.warn, error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: { getCacheandoAusencia: m.get, actualizar: m.actualizar } }));
vi.mock("@/lib/db/avisos-correo.db", () => ({ AvisosCorreoDB: { filas: vi.fn(), tiendasPorCorreo: vi.fn() } }));

import {
  armarDetalleCorreosPlataforma,
  avisoCorreoPlataformaActivo,
  correoPlataformaSale,
  CorreosPlataformaPatchSchema,
  destinoCorreoPlataforma,
  guardarCorreosPlataforma,
  leerCorreosPlataformaGuardados,
} from "@/lib/avisos-correo-plataforma";
import { CORREO_PLATAFORMA_INFO, TIPOS_CORREO_PLATAFORMA } from "@/lib/avisos-correo-plataforma-tipos";

beforeEach(() => vi.clearAllMocks());

describe("tipos", () => {
  it("cada tipo tiene nombre y descripción", () => {
    for (const t of TIPOS_CORREO_PLATAFORMA) {
      expect(CORREO_PLATAFORMA_INFO[t].nombre.length).toBeGreaterThan(3);
      expect(CORREO_PLATAFORMA_INFO[t].descripcion.length).toBeGreaterThan(10);
    }
  });
});

describe("lectura del estado", () => {
  it("sin fila = todo encendido", () => {
    const g = leerCorreosPlataformaGuardados(null);
    expect(g).toEqual({ pausado: false, apagados: [] });
    expect(TIPOS_CORREO_PLATAFORMA.every((t) => correoPlataformaSale(g, t))).toBe(true);
  });
  it("pausado apaga todo; un tipo apagado apaga sólo ése", () => {
    expect(correoPlataformaSale({ pausado: true, apagados: [] }, "cacao")).toBe(false);
    const g = leerCorreosPlataformaGuardados({ pausado: false, apagados: ["cacao", "inventado"] });
    expect(g.apagados).toEqual(["cacao"]);
    expect(correoPlataformaSale(g, "cacao")).toBe(false);
    expect(correoPlataformaSale(g, "carritos")).toBe(true);
  });
  it("json corrupto = por defecto y se avisa", () => {
    expect(leerCorreosPlataformaGuardados({ pausado: "sí" })).toEqual({ pausado: false, apagados: [] });
    expect(m.warn).toHaveBeenCalled();
  });
});

describe("avisoCorreoPlataformaActivo", () => {
  it("lee el interruptor", async () => {
    m.get.mockResolvedValue({ pausado: false, apagados: ["resumen"] });
    expect(await avisoCorreoPlataformaActivo("resumen")).toBe(false);
    expect(await avisoCorreoPlataformaActivo("cacao")).toBe(true);
  });
  it("fail-open: si la lectura falla, el correo sale", async () => {
    m.get.mockRejectedValue(new Error("db caída"));
    expect(await avisoCorreoPlataformaActivo("cacao")).toBe(true);
    expect(m.warn).toHaveBeenCalled();
  });
});

describe("destinos", () => {
  const env = { SMTP_USER: "smtp@x.com", NOTIFY_EMAIL: "", CACAO_DIGEST_EMAIL: "", SUPERADMIN_NOTIFY_EMAIL: "" } as unknown as NodeJS.ProcessEnv;
  it("caen a SMTP_USER y el cacao tiene su correo por defecto", () => {
    expect(destinoCorreoPlataforma("resumen", env)).toBe("smtp@x.com");
    expect(destinoCorreoPlataforma("superadmin", env)).toBe("smtp@x.com");
    expect(destinoCorreoPlataforma("cacao", env)).toBe("bulejelauea@gmail.com");
  });
  it("las variables mandan", () => {
    const e = { ...env, NOTIFY_EMAIL: "n@x.com", SUPERADMIN_NOTIFY_EMAIL: "s@x.com", CACAO_DIGEST_EMAIL: "c@x.com" } as unknown as NodeJS.ProcessEnv;
    expect(destinoCorreoPlataforma("caja", e)).toBe("n@x.com");
    expect(destinoCorreoPlataforma("superadmin", e)).toBe("s@x.com");
    expect(destinoCorreoPlataforma("cacao", e)).toBe("c@x.com");
  });
  it("sin SMTP_USER ni variables, el destino es null (salvo cacao)", () => {
    expect(destinoCorreoPlataforma("stock", {} as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("¿qué le llega a este correo?", () => {
  const env = { SMTP_USER: "Smtp@x.com" } as unknown as NodeJS.ProcessEnv;
  it("cruza por destino sin distinguir mayúsculas", () => {
    const d = armarDetalleCorreosPlataforma({ pausado: false, apagados: ["caja"] }, "SMTP@x.com", [], { cambiadoPor: null, cambiadoEn: null }, env);
    expect(d.tiposALaConsulta).toContain("resumen");
    expect(d.tiposALaConsulta).not.toContain("cacao");
    expect(d.tipos.find((t) => t.tipo === "caja")?.activo).toBe(false);
  });
});

describe("PATCH", () => {
  it("el schema acepta general o tipo, y rechaza lo demás", () => {
    expect(CorreosPlataformaPatchSchema.safeParse({ pausado: true }).success).toBe(true);
    expect(CorreosPlataformaPatchSchema.safeParse({ tipo: "cacao", activo: false }).success).toBe(true);
    expect(CorreosPlataformaPatchSchema.safeParse({ tipo: "otro", activo: false }).success).toBe(false);
    expect(CorreosPlataformaPatchSchema.safeParse({ pausado: true, extra: 1 }).success).toBe(false);
  });
  it("guardar apaga un tipo y conserva los demás", async () => {
    m.actualizar.mockImplementation(async (_k: string, fn: (a: unknown) => { resultado: unknown }) => fn({ pausado: false, apagados: ["caja"] }).resultado);
    const r = await guardarCorreosPlataforma({ tipo: "cacao", activo: false }, "brandon");
    expect(r).toEqual({ pausado: false, apagados: ["cacao", "caja"] });
    const r2 = await guardarCorreosPlataforma({ tipo: "caja", activo: true }, "brandon");
    expect(r2.apagados).toEqual([]);
    expect(m.actualizar.mock.calls[0][0]).toBe("avisos-correo:plataforma");
  });
});
