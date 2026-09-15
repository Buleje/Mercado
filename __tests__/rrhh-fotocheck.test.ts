/**
 * __tests__/rrhh-fotocheck.test.ts
 *
 * Del dato de la ficha a la tarjeta (ADR-416). Lo que importa: el QR lleva a
 * la ficha en el panel (pide iniciar sesión), no a una página pública con los
 * datos de la persona; y lo que la ficha no tiene no se inventa en la tarjeta.
 */
import { describe, expect, it } from "vitest";
import { archivoDeFotocheck, negocioDelPanel, personaParaFotocheck, urlDeLaFicha } from "@/components/admin/rrhh/personal/fotocheck";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";

const ANA: ColaboradorDTO = {
  id: "c1",
  nombre: "Ana Quispe Ríos",
  apodo: null,
  puesto: { id: "p1", nombre: "Aserrador" },
  estado: "ACTIVO",
  fechaIngreso: "2026-09-01",
  fechaCese: null,
  tipoDocumento: "DNI",
  documento: "70123456",
  celular: null,
  direccion: null,
  contactoEmergencia: { nombre: "Rosa Ríos", celular: "987654321" },
  observaciones: null,
  motivoCese: null,
  fotoUrl: "https://proyecto.supabase.co/storage/v1/object/public/imagenes/t1/rrhh/1-ana.webp",
  beneficiarioId: null,
  adminUserId: null,
  creadoEn: "2026-09-01T00:00:00.000Z",
  actualizadoEn: "2026-09-01T00:00:00.000Z",
};

describe("fotocheck — de la ficha a la tarjeta (ADR-416)", () => {
  it("el QR lleva a la ficha de la persona en el panel, no a una página pública", () => {
    expect(urlDeLaFicha("https://blas.buleje.com", "c1")).toBe("https://blas.buleje.com/admin?tab=rrhh&vista=personal&persona=c1");
  });

  it("arma la tarjeta con documento, puesto, ingreso, foto y contacto de emergencia", () => {
    const p = personaParaFotocheck(ANA, "https://blas.buleje.com");
    expect(p).toMatchObject({
      nombre: "Ana Quispe Ríos",
      puesto: "Aserrador",
      documento: "DNI 70123456",
      fotoUrl: ANA.fotoUrl,
      emergencia: { nombre: "Rosa Ríos", celular: "987654321" },
      urlFicha: "https://blas.buleje.com/admin?tab=rrhh&vista=personal&persona=c1",
    });
    expect(p.ingreso).toBeTruthy();
  });

  it("sin documento, puesto ni ingreso no inventa nada", () => {
    const p = personaParaFotocheck({ ...ANA, documento: null, tipoDocumento: null, puesto: null, fechaIngreso: null, fotoUrl: null }, "https://x");
    expect(p.documento).toBeNull();
    expect(p.puesto).toBeNull();
    expect(p.ingreso).toBeNull();
    expect(p.fotoUrl).toBeNull();
  });

  it("nombre del archivo y datos del negocio", () => {
    expect(archivoDeFotocheck([ANA])).toBe("fotocheck-ana-quispe-rios");
    expect(archivoDeFotocheck([ANA, { ...ANA, id: "c2" }])).toBe("fotochecks-2-personas");
    expect(negocioDelPanel({ businessName: " Aserradero Blas ", storeTheme: { phone: "987 000 111" } })).toEqual({ nombre: "Aserradero Blas", contacto: "987 000 111" });
    expect(negocioDelPanel({ businessName: "", storeTheme: null })).toEqual({ nombre: null, contacto: null });
    expect(negocioDelPanel(null)).toEqual({ nombre: null, contacto: null });
  });
});
