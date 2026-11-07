import { describe, expect, it } from "vitest";
import {
  coordenadasDelSello,
  fechaHoraDelSello,
  hrefAbsolutoDeFoto,
  lineasDelSello,
  MARGEN_UBICACION_MS,
  momentoDeLaFoto,
  pieDeFoto,
  ubicacionVale,
  urlMapaDeFoto,
} from "@/lib/forestal/sello-foto";
import { hojaFotosDeLaCarga, MAX_FOTOS_EN_PAPEL } from "@/lib/forestal/ctp-fotos-papel";

// 2026-09-25 19:32 UTC = viernes 25/09/2026 14:32 en Lima (UTC-5, sin horario de verano).
const VIERNES = "2026-09-25T19:32:00.000Z";

describe("sello de la foto de la carga", () => {
  it("fecha y hora salen en hora de Lima, con el día de la semana", () => {
    expect(fechaHoraDelSello(VIERNES)).toBe("viernes 25/09/2026 · 14:32");
  });

  it("de noche en Lima NO salta al día siguiente (UTC ya es otro día)", () => {
    // 03:10 UTC del 26 = 22:10 del 25 en Lima.
    expect(fechaHoraDelSello("2026-09-26T03:10:00.000Z")).toBe("viernes 25/09/2026 · 22:10");
  });

  it("fecha inválida → null, no «Invalid Date»", () => {
    expect(fechaHoraDelSello("no-es-fecha")).toBeNull();
    expect(fechaHoraDelSello(null)).toBeNull();
  });

  it("tres líneas: cuándo, quién + GTF, dónde con precisión", () => {
    expect(
      lineasDelSello({ tomadaEn: VIERNES, por: "Brandon Buleje", gtf: "001-0012345", lat: -8.379123, lng: -74.553214, precisionM: 11.6 }),
    ).toEqual([
      "viernes 25/09/2026 · 14:32 (hora de Lima)",
      "Brandon Buleje · GTF 001-0012345",
      "-8.37912, -74.55321 ±12 m",
    ]);
  });

  it("sin permiso de ubicación dice «Sin ubicación», nunca un 0,0", () => {
    const [, , donde] = lineasDelSello({ tomadaEn: VIERNES, por: "Ana" });
    expect(donde).toBe("Sin ubicación");
  });

  it("sin nombre ni GTF no deja huecos ni «undefined»", () => {
    const [, quien] = lineasDelSello({ tomadaEn: VIERNES, por: "  ", gtf: null });
    expect(quien).toBe("Usuario sin nombre");
  });

  it("latitud 0 es un lugar real (no se confunde con «sin dato»)", () => {
    expect(coordenadasDelSello(0, -74.5, null)).toBe("0.00000, -74.50000");
  });

  it("la ubicación sólo vale para una foto recién sacada", () => {
    const ahora = Date.parse(VIERNES);
    expect(ubicacionVale(ahora - 60_000, ahora)).toBe(true);
    expect(ubicacionVale(ahora - MARGEN_UBICACION_MS - 1, ahora)).toBe(false);
  });

  it("el momento de la foto es el del archivo si es creíble; si viene del futuro, ahora", () => {
    const ahora = Date.parse(VIERNES);
    expect(momentoDeLaFoto(ahora - 3_600_000, ahora)).toBe(ahora - 3_600_000);
    expect(momentoDeLaFoto(ahora + 10 * 60_000, ahora)).toBe(ahora);
    expect(momentoDeLaFoto(0, ahora)).toBe(ahora);
  });

  it("pie de la miniatura: fecha·hora·quién; usa la subida si no hay toma", () => {
    expect(pieDeFoto({ tomadaEn: VIERNES, por: "Ana" })).toBe("viernes 25/09/2026 · 14:32 · Ana");
    expect(pieDeFoto({ subidaEn: VIERNES })).toBe("viernes 25/09/2026 · 14:32");
    expect(pieDeFoto({})).toBe("Sin fecha registrada");
  });

  it("link al mapa sólo con lat y lng", () => {
    expect(urlMapaDeFoto({ lat: -8.3, lng: -74.5 })).toContain("query=-8.300000,-74.500000");
    expect(urlMapaDeFoto({ lat: -8.3 })).toBeNull();
  });

  it("URL relativa de foto privada → con dominio; https legado queda igual", () => {
    expect(hrefAbsolutoDeFoto("/api/admin/forestal/fotos/ver?p=x", "https://blas.buleje.pe")).toBe(
      "https://blas.buleje.pe/api/admin/forestal/fotos/ver?p=x",
    );
    expect(hrefAbsolutoDeFoto("https://cdn/x.webp", "https://blas.buleje.pe")).toBe("https://cdn/x.webp");
  });
});

describe("hoja «Fotos de la carga» del documento de la guía", () => {
  const foto = (i: number) => ({
    url: `priv:t1/forestal-carga/f${i}.webp`,
    tomadaEn: VIERNES,
    por: "Ana",
    lat: -8.3,
    lng: -74.5,
    precisionM: 9,
    sellada: true,
  });

  it("sin fotos no hay hoja (una vacía haría pensar que se perdieron)", () => {
    expect(hojaFotosDeLaCarga({ gtf: "001", emisor: "X", fotos: [] })).toBeUndefined();
  });

  it(`hasta ${MAX_FOTOS_EN_PAPEL} fotos, con URL same-origin absoluta y pie; avisa las que quedan fuera`, () => {
    const hoja = hojaFotosDeLaCarga({
      gtf: "001-99",
      emisor: "Comunidad Nativa Santa Rosa",
      fotos: Array.from({ length: 8 }, (_, i) => foto(i)),
      origen: "http://localhost:3000",
    });
    expect(hoja).toBeDefined();
    const html = hoja!.html;
    expect(html.match(/<img /g)?.length).toBe(MAX_FOTOS_EN_PAPEL);
    expect(html).toContain('src="http://localhost:3000/api/admin/forestal/fotos/ver?p=t1%2Fforestal-carga%2Ff0.webp"');
    expect(html).toContain("viernes 25/09/2026 · 14:32 · Ana");
    expect(html).toContain("Lugar: -8.30000, -74.50000 ±9 m");
    expect(html).toContain("Hay 2 fotos más en el libro.");
    // De a dos por renglón: 6 fotos = 3 renglones que `paginar` puede cortar.
    expect(html.match(/class="fc-fila"/g)?.length).toBe(3);
  });

  it("una foto legado (sólo URL) lo dice en vez de inventar fecha", () => {
    const hoja = hojaFotosDeLaCarga({ gtf: "1", emisor: "X", fotos: [{ url: "https://x/y.jpg" }] });
    expect(hoja!.html).toContain("anterior al sello: sin fecha ni lugar registrados");
  });
});
