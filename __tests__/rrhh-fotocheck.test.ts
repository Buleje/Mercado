/**
 * __tests__/rrhh-fotocheck.test.ts
 *
 * Del dato de la ficha a la tarjeta (ADR-416). Lo que importa: el QR lleva a
 * la ficha en el panel (pide iniciar sesión), no a una página pública con los
 * datos de la persona; y lo que la ficha no tiene no se inventa en la tarjeta.
 */
import { describe, expect, it } from "vitest";
import { archivoDeFotocheck, personaParaFotocheck, urlDeLaFicha } from "@/components/admin/rrhh/personal/fotocheck";
import { CAJA_GRUPO, DORSO, DORSO_FIRMA } from "@/lib/rrhh/fotocheck-pdf";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";

const ANA: ColaboradorDTO = {
  grupoSanguineo: null,
  alergias: null,
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

  it("lleva los datos de seguridad al dorso: grupo y alergias (ADR-417)", () => {
    const p = personaParaFotocheck({ ...ANA, grupoSanguineo: "O+", alergias: "Penicilina" }, "https://x");
    expect(p.grupoSanguineo).toBe("O+");
    expect(p.alergias).toBe("Penicilina");
  });

  it("sin grupo ni alergias no rompe y no inventa: van en null, no en «Ninguna»", () => {
    const p = personaParaFotocheck(ANA, "https://x");
    expect(p.grupoSanguineo).toBeNull();
    expect(p.alergias).toBeNull();
    // Alergias en blanco («   ») es lo mismo que no saber: el dorso no imprime la etiqueta vacía.
    expect(personaParaFotocheck({ ...ANA, alergias: "   " }, "https://x").alergias).toBeNull();
  });

  it("nombre del archivo", () => {
    expect(archivoDeFotocheck([ANA])).toBe("fotocheck-ana-quispe-rios");
    expect(archivoDeFotocheck([ANA, { ...ANA, id: "c2" }])).toBe("fotochecks-2-personas");
  });
});

/**
 * La tarjeta CR80 mide 85,6 mm y ya estaba llena: la caja del grupo entra
 * moviendo los bloques de abajo. Esto verifica que ninguno se pise con el
 * siguiente ni con la línea de firma, que es fija.
 */
describe("dorso del fotocheck: el reparto vertical no se pisa (ADR-417)", () => {
  const AIRE = 1.4; // mm mínimos entre la última línea de un bloque y el siguiente

  it("con datos de seguridad, la caja del grupo entra entre el QR y el bloque de emergencia", () => {
    const r = DORSO.conCuidados;
    expect(r.qrTop + r.qr).toBeLessThanOrEqual(r.leyenda - AIRE);
    expect(r.leyenda).toBeLessThanOrEqual(r.cuidados - AIRE);
    expect(r.cuidados + CAJA_GRUPO.alto).toBeLessThanOrEqual(r.emergencia - AIRE);
  });

  it("emergencia, «devuélvelo a» y la firma no se pisan en ninguno de los dos repartos", () => {
    for (const r of [DORSO.conCuidados, DORSO.sinCuidados]) {
      expect(r.qrTop + r.qr).toBeLessThanOrEqual(r.leyenda - AIRE);
      // Del título de emergencia cuelgan el nombre (+4) y el celular (+7,5).
      expect(r.emergencia + 7.5).toBeLessThanOrEqual(r.devolver - AIRE);
      // De «devuélvelo a», el negocio (+3,6) y el contacto (+7).
      expect(r.devolver + 7).toBeLessThanOrEqual(DORSO_FIRMA.linea - AIRE);
      expect(DORSO_FIRMA.leyenda).toBeLessThan(DORSO_FIRMA.alto);
    }
  });
});
