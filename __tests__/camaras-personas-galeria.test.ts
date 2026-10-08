import { describe, expect, it } from "vitest";
import { arbolPersonas, armarGaleria, leerMetaFoto, rangoDiaLima, type CarpetaGaleria, type DocGaleria } from "@/lib/camaras/personas-galeria";

const carpetas: CarpetaGaleria[] = [
  { id: "cam", parentId: null, name: "Cámaras" },
  { id: "per", parentId: "cam", name: "Personas" },
  { id: "c1", parentId: "per", name: "Portón del patio" },
  { id: "c1d", parentId: "c1", name: "2026-10-07" },
  { id: "c2", parentId: "per", name: "Galpón viejo" },
  { id: "c2d", parentId: "c2", name: "2026-10-07" },
  { id: "otra", parentId: null, name: "Contratos" },
];
const camaras = [
  { id: "cam_1", nombre: "Portón del patio", carpeta: "Portón del patio" },
  { id: "cam_2", nombre: "Galpón", carpeta: "Galpón" },
];
const doc = (id: string, folderId: string, iso: string, name: string, meta: Record<string, unknown> | null = null): DocGaleria => ({
  id,
  folderId,
  name,
  uploadedAt: iso,
  ocrMetadata: meta,
});
// 07/10 en Lima: 07:10, 07:40, 10:05 (UTC −5)
const docs = [
  doc("a", "c1d", "2026-10-07T12:10:00.000Z", "07-10-00 · Apareció alguien · 1 persona.webp", { camaraId: "cam_1", motivo: "aparecio", personas: 1, confianza: 0.9 }),
  doc("b", "c1d", "2026-10-07T12:40:00.000Z", "07-40-00 · Llegó otra persona · 3 personas.webp", { camaraId: "cam_1", motivo: "mas_gente", personas: 3 }),
  // Sin metadata y en la carpeta vieja de una cámara renombrada: sale del nombre.
  doc("c", "c2d", "2026-10-07T15:05:00.000Z", "10-05-00 · Sigue en cuadro · 2 personas.webp"),
];

describe("galería de personas", () => {
  it("encuentra «Cámaras / Personas» y todo lo que cuelga, sin otras carpetas", () => {
    const a = arbolPersonas(carpetas);
    expect(a?.personasId).toBe("per");
    expect(new Set(a?.ids)).toEqual(new Set(["per", "c1", "c1d", "c2", "c2d"]));
    expect(arbolPersonas(carpetas.filter((c) => c.id !== "per"))).toBeNull();
  });

  it("el día de Lima va de 05:00 UTC a 05:00 UTC", () => {
    const { desde, hasta } = rangoDiaLima("2026-10-07");
    expect(desde.toISOString()).toBe("2026-10-07T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-10-08T05:00:00.000Z");
  });

  it("lee motivo y personas del nombre si falta la metadata", () => {
    expect(leerMetaFoto(docs[2])).toEqual({ motivo: "sigue", personas: 2, confianza: null, camaraId: null, cajas: null });
  });

  it("arma cifras del día, por hora y cámara con más", () => {
    const g = armarGaleria({ dia: "2026-10-07", camara: null, carpetas, personasId: "per", docs, camaras });
    expect(g.totalDia).toBe(3);
    expect(g.fotos.map((f) => f.id)).toEqual(["c", "b", "a"]);
    expect(g.fotos[0]).toMatchObject({ camara: "carpeta:c2", camaraNombre: "Galpón viejo", hora: "10:05:00" });
    expect(g.porHora).toEqual([
      { hora: 7, max: 3, fotos: 2 },
      { hora: 10, max: 2, fotos: 1 },
    ]);
    expect(g.resumen).toEqual({ fotos: 3, primera: "07:10", ultima: "10:05", camaraTop: { nombre: "Portón del patio", fotos: 2 } });
    expect(g.carpetaAbrir).toBe("per");
  });

  it("con una cámara: filtra, sin «cámara con más», y abre su carpeta del día", () => {
    const g = armarGaleria({ dia: "2026-10-07", camara: "cam_1", carpetas, personasId: "per", docs, camaras });
    expect(g.fotos.map((f) => f.id)).toEqual(["b", "a"]);
    expect(g.camaras).toHaveLength(2);
    expect(g.totalDia).toBe(3);
    expect(g.resumen.camaraTop).toBeNull();
    expect(g.carpetaAbrir).toBe("c1d");
  });
});
