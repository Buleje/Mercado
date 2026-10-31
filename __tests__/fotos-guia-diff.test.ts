/**
 * fotos-guia-diff (auditoría de seguridad 2026-09-25): `WoodEntriesDB.fotosGuia`
 * reemplaza la lista entera de fotos — acá vive PURA la decisión de qué se
 * agregó/quitó, quién puede quitar, y la línea de auditoría.
 */
import { describe, expect, it } from "vitest";
import { detalleDeFotosGuia, diffFotosGuia, motivoSiNoPuedeGuardar, nombreDeFoto } from "@/lib/forestal/fotos-guia-diff";

const A = "https://x.supabase.co/storage/v1/object/public/media/t/forestal/1-a.webp";
const B = "https://x.supabase.co/storage/v1/object/public/media/t/forestal/2-b.webp";
const C = "https://x.supabase.co/storage/v1/object/public/media/t/forestal/3-c.webp";

describe("diffFotosGuia", () => {
  it("sin cambios: agregadas y quitadas vacías", () => {
    expect(diffFotosGuia([A, B], [A, B])).toEqual({ agregadas: [], quitadas: [] });
  });

  it("agregar sin quitar nada", () => {
    expect(diffFotosGuia([A], [A, B])).toEqual({ agregadas: [B], quitadas: [] });
  });

  it("quitar todo — el caso que antes auditaba «Guardó 0 fotos»", () => {
    expect(diffFotosGuia([A, B, C], [])).toEqual({ agregadas: [], quitadas: [A, B, C] });
  });

  it("agregar y quitar a la vez", () => {
    expect(diffFotosGuia([A, B], [B, C])).toEqual({ agregadas: [C], quitadas: [A] });
  });

  it("el orden no importa, sólo el contenido", () => {
    expect(diffFotosGuia([A, B], [B, A])).toEqual({ agregadas: [], quitadas: [] });
  });
});

describe("motivoSiNoPuedeGuardar — sólo QUITAR está restringido, y sólo para almacenero", () => {
  it("agregar (quitadas vacío) nunca se bloquea, sea cual sea el rol", () => {
    expect(motivoSiNoPuedeGuardar([], "almacenero")).toBeNull();
    expect(motivoSiNoPuedeGuardar([], undefined)).toBeNull();
  });

  it("admin y owner SÍ pueden quitar", () => {
    expect(motivoSiNoPuedeGuardar([A], "admin")).toBeNull();
    expect(motivoSiNoPuedeGuardar([A], "owner")).toBeNull();
  });

  it("almacenero NO puede quitar — motivo legible, no un 500 mudo", () => {
    const motivo = motivoSiNoPuedeGuardar([A], "almacenero");
    expect(motivo).not.toBeNull();
    expect(motivo).toMatch(/no.*quitarlas|admin/i);
  });
});

describe("nombreDeFoto", () => {
  it("el último tramo de la URL, no la URL entera", () => {
    expect(nombreDeFoto(A)).toBe("1-a.webp");
  });
});

describe("detalleDeFotosGuia — narra antes→después, agregó y quitó", () => {
  it("borrar todo lo dice explícito, no «Guardó 0 fotos»", () => {
    const diff = diffFotosGuia([A, B], []);
    const detalle = detalleDeFotosGuia("001-0000201", 1, [A, B], [], diff);
    expect(detalle).toContain("2 → 0");
    expect(detalle).toContain("quitó 1-a.webp, 2-b.webp");
    expect(detalle).not.toContain("agregó");
  });

  it("agregar dos fotos nuevas sobre cero", () => {
    const diff = diffFotosGuia([], [A, B]);
    const detalle = detalleDeFotosGuia("001-0000201", 2, [], [A, B], diff);
    expect(detalle).toContain("0 → 2");
    expect(detalle).toContain("agregó 1-a.webp, 2-b.webp");
    expect(detalle).not.toContain("quitó");
  });
});
