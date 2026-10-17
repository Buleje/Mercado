/**
 * Lo que una inspección CERRADA deja en la planta: sus hallazgos graves y de
 * aviso entran a las incoherencias (origen «inspeccion») y los graves ponen el
 * semáforo en rojo. Más los candados de security del 17-10 sobre la ficha.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enlaceLibro,
  incoherenciasDeInspeccion,
  inspeccionIlegible,
  pendientesParaFicha,
} from "@/lib/superadmin/plantas-forestales/incoherencias";
import { semaforoDePlanta, type EntradaSemaforo } from "@/lib/superadmin/plantas-forestales/semaforo";
import { resolverPeriodo } from "@/lib/superadmin/plantas-forestales/periodo";
import { editarInspeccionSchema, esFotoDeInspeccion } from "@/lib/superadmin/plantas-forestales/schemas";
import type { FuenteLectura, HallazgoInspeccion } from "@/lib/superadmin/plantas-forestales/tipos";

const P = { tenantId: "planta-op-qa", nombre: "Aserradero QA" };

const hallazgo = (id: string, gravedad: HallazgoInspeccion["gravedad"], o: Partial<HallazgoInspeccion> = {}): HallazgoInspeccion => ({
  id,
  gravedad,
  categoria: "volumen",
  texto: `Hallazgo ${id}`,
  m3: null,
  fotos: [],
  referencia: null,
  ...o,
});

const CERRADA = {
  id: "insp-9",
  fecha: "2026-10-16",
  inspector: "superadmin",
  hallazgos: [
    hallazgo("h1", "error", { texto: "Faltan 12 trozas de la guía 002\nen la cancha 2", m3: 4.2, referencia: { tipo: "guia", valor: "019-001-0000002" } }),
    hallazgo("h2", "warning", { categoria: "documentos" }),
    hallazgo("h3", "info"),
  ],
};

describe("hallazgos de la última inspección cerrada → incoherencias", () => {
  it("entran los graves y los avisos; las notas no", () => {
    const r = incoherenciasDeInspeccion(P, CERRADA);
    expect(r.map((i) => i.gravedad)).toEqual(["error", "warning"]);
    expect(r.every((i) => i.origen === "inspeccion")).toBe(true);
  });

  it("título con el día y la primera línea; id con la inspección; enlace a la vista del libro", () => {
    const [grave, aviso] = incoherenciasDeInspeccion(P, CERRADA);
    expect(grave.id).toBe("planta-op-qa:inspeccion:insp-9:h1");
    expect(grave.titulo).toBe("Inspección del 16/10/2026: Faltan 12 trozas de la guía 002");
    expect(grave.detalle).toContain("inspeccionó superadmin");
    expect(grave.m3EnJuego).toBe(4.2);
    expect(grave.referencia).toEqual({ tipo: "guia", valor: "019-001-0000002" });
    expect(grave.enlaceLibro).toBe(enlaceLibro("ingresos"));
    expect(aviso.m3EnJuego).toBeNull();
    expect(aviso.enlaceLibro).toBe(enlaceLibro("ingresos"));
  });

  it("sin inspección cerrada no hay nada; ilegible = una nota, no silencio", () => {
    expect(incoherenciasDeInspeccion(P, null)).toEqual([]);
    const i = inspeccionIlegible(P);
    expect(i).toMatchObject({ origen: "inspeccion", gravedad: "info", clave: "ilegible" });
  });
});

const TODAS_OK = Object.fromEntries(
  ["saldos", "conciliacion", "disponibles", "patio", "lotes", "pendientes", "rendimiento", "cumplimiento"].map((k) => [k, "ok"]),
) as Record<FuenteLectura, "ok">;
const entrada = (o: Partial<EntradaSemaforo> = {}): EntradaSemaforo => ({
  lecturas: TODAS_OK,
  especiesNegativas: [],
  materiaPrima: { pendienteM3: 0, consumoSinOrigenM3: 0, consumoSinOrigenCount: 0, consumoSinDeclararM3: 0, consumoSinDeclararCount: 0 },
  incoherencias: { error: 0, warning: 0, info: 0 },
  ...o,
});

describe("semáforo con la inspección", () => {
  it("hallazgos graves de la última cerrada = rojo con la fecha", () => {
    const r = semaforoDePlanta(entrada({ inspeccion: { fecha: "2026-10-16", errores: 2 }, incoherencias: { error: 2, warning: 0, info: 0 } }));
    expect(r.semaforo).toBe("rojo");
    expect(r.motivo).toBe("La inspección del 16/10/2026 dejó 2 hallazgos graves");
  });

  it("una inspección sin graves no pinta rojo", () => {
    expect(semaforoDePlanta(entrada({ inspeccion: { fecha: "2026-10-16", errores: 0 } })).semaforo).toBe("verde");
  });

  it("el rojo del libro manda sobre el de la inspección", () => {
    const r = semaforoDePlanta(
      entrada({
        inspeccion: { fecha: "2026-10-16", errores: 1 },
        especiesNegativas: [{ especie: "Cumala", existenciaFinalM3: -5, movimientoM3: -5 }],
      }),
    );
    expect(r.semaforo).toBe("rojo");
    expect(r.motivo).toContain("existencia final negativa");
  });
});

describe("candados de la ficha (security 17-10)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("las deudas con proveedores viajan sin nombres ni montos (Ley 29733)", () => {
    const r = pendientesParaFicha([
      { titulo: "2 guías sin pagar a Nelly Ríos · S/ 800.00", urgencia: "atrasado", cantidad: 2 },
      { titulo: "1 guía sin pagar a Juan Pérez · S/ 120.50", urgencia: "pendiente", cantidad: 1 },
      { titulo: "Ingresos fuera de plazo", urgencia: "bloquea", cantidad: 4 },
    ]);
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/Nelly|Juan|S\//);
    expect(r).toContainEqual({ titulo: "3 guías sin pagar (2 proveedores)", urgencia: "atrasado", cantidad: 3 });
    expect(r[0].titulo).toBe("Ingresos fuera de plazo");
    expect(pendientesParaFicha(r)).toEqual(r);
  });

  it("foto de hallazgo: sólo https del Storage del proyecto o el respaldo local de dev", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
    const ruta = "/storage/v1/object/public/media/superadmin/inspecciones-planta/1760000000000-foto.webp";
    expect(esFotoDeInspeccion(`https://abcdefgh.supabase.co${ruta}`)).toBe(true);
    expect(esFotoDeInspeccion("/uploads/inspecciones-planta/inspecciones-planta_1760000000000-foto.webp")).toBe(true);
    for (const mala of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      `http://abcdefgh.supabase.co${ruta}`,
      `https://otro.supabase.co${ruta}`,
      `https://abcdefgh.supabase.co${ruta}?x=1`,
      `https://evil.com@abcdefgh.supabase.co${ruta}`,
      "https://abcdefgh.supabase.co/storage/v1/object/public/media/superadmin/banners/1-foto.webp",
      "/uploads/inspecciones-planta/../../secreto.webp",
      "//abcdefgh.supabase.co" + ruta,
    ]) {
      expect(esFotoDeInspeccion(mala), mala).toBe(false);
    }
    const r = editarInspeccionSchema.safeParse({ hallazgos: [hallazgo("h1", "error", { fotos: ["javascript:alert(1)"] })] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.find((i) => i.code === "custom")?.message).toBe("La foto tiene que subirse desde la inspección");
  });

  it("período: fecha inexistente o más de 366 días = error; un año bisiesto entero, no", () => {
    expect(resolverPeriodo({ desde: "2026-99-99" }, "2026-10-17")).toMatchObject({ ok: false });
    expect(resolverPeriodo({ desde: "2026-02-30", hasta: "2026-03-01" }, "2026-10-17")).toMatchObject({ ok: false });
    expect(resolverPeriodo({ desde: "2024-01-01", hasta: "2025-01-02" }, "2026-10-17")).toMatchObject({ ok: false });
    expect(resolverPeriodo({ desde: "2024-01-01", hasta: "2024-12-31" }, "2026-10-17")).toEqual({
      ok: true,
      periodo: { desde: "2024-01-01", hasta: "2024-12-31" },
    });
    expect(resolverPeriodo({ desde: "2026-10-10", hasta: "2026-10-01" }, "2026-10-17")).toMatchObject({ ok: false });
  });
});
