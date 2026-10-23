import { describe, expect, it } from "vitest";
import { entendioAlgo, interpretarBusqueda, quitarVacias, type CarpetaBuscable } from "@/lib/documentos/busqueda-natural";
import { TAG_FOTO_PERSONA } from "@/lib/camaras/personas-retencion";
import type { RangoFechas } from "@/lib/types/documents";

// Jueves 22-10-2026, 18:00 en Lima (ya es 23:00 UTC: el «hoy» tiene que seguir siendo el 22).
const AHORA = new Date("2026-10-22T23:00:00.000Z");
/** Medianoche de Lima (UTC−5): borde de la SUBIDA, que es un instante. */
const L = (ymd: string) => `${ymd}T05:00:00.000Z`;
/** Comienzo del día de calendario: borde del VENCIMIENTO, que es un día. */
const D = (ymd: string) => `${ymd}T00:00:00.000Z`;
/** ¿Ese `expiresAt` cae en el rango? Como lo haría el WHERE (`gte` / `lt`). */
const entra = (r: RangoFechas | "sin" | undefined, iso: string) => {
  if (!r || r === "sin") return false;
  const t = Date.parse(iso);
  return (r.desde === undefined || t >= Date.parse(r.desde)) && (r.hasta === undefined || t < Date.parse(r.hasta));
};

const CARPETAS: CarpetaBuscable[] = [
  { id: "chivis", name: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", parentId: null },
  { id: "chivis-permisos", name: "Permisos 2021", parentId: "chivis" },
  { id: "contratos", name: "Contratos QA-UI", parentId: null },
  { id: "contratos-viejos", name: "Viejos", parentId: "contratos" },
  { id: "jefe", name: "Jefe - representante (DNI, actas, poderes)", parentId: null },
];

const leer = (q: string) => interpretarBusqueda(q, { ahora: AHORA, carpetas: CARPETAS });
const chips = (q: string) => leer(q).entendi.map((c) => c.texto);

describe("vencimiento (por día de calendario)", () => {
  it("«vencidos»: fecha antes de hoy (lo que vence hoy, hoy sirve)", () => {
    const r = leer("vencidos");
    expect(r.vence).toEqual({ hasta: D("2026-10-22") });
    expect(r.texto).toBe("");
    expect(r.grupos).toEqual([]);
    expect(r.entendi).toEqual([{ tipo: "vence", texto: "vencidos", sinEsto: "" }]);
    expect(r.necesitaCarpetas).toBe(false);
  });

  it("«vencidos» con los dos formatos guardados: a mano (00:00Z) y por OCR (12:00Z)", () => {
    const v = leer("vencidos").vence;
    expect(entra(v, "2026-10-21T00:00:00.000Z")).toBe(true);
    expect(entra(v, "2026-10-21T12:00:00.000Z")).toBe(true);
    expect(entra(v, "2026-10-22T00:00:00.000Z")).toBe(false);
    expect(entra(v, "2026-10-22T12:00:00.000Z")).toBe(false);
  });

  it("«vence hoy» encuentra el de hoy en los dos formatos", () => {
    const v = leer("vence hoy").vence;
    expect(v).toEqual({ desde: D("2026-10-22"), hasta: D("2026-10-23") });
    expect(entra(v, "2026-10-22T00:00:00.000Z")).toBe(true);
    expect(entra(v, "2026-10-22T12:00:00.000Z")).toBe(true);
    expect(entra(v, "2026-10-23T00:00:00.000Z")).toBe(false);
  });

  it("«ya vencieron» y «VENCÍDOS» (tildes y mayúsculas) dicen lo mismo", () => {
    expect(leer("ya vencieron").vence).toEqual({ hasta: D("2026-10-22") });
    expect(leer("VENCÍDOS").vence).toEqual({ hasta: D("2026-10-22") });
  });

  it("«por vencer»: de hoy a 30 días", () => {
    const r = leer("por vencer");
    expect(r.vence).toEqual({ desde: D("2026-10-22"), hasta: D("2026-11-22") });
    expect(chips("por vencer")).toEqual(["por vencer (próximos 30 días)"]);
  });

  it("«lo que vence este mes»: desde hoy hasta fin de mes; el 01-11 a 00:00Z ya no es de octubre", () => {
    const r = leer("lo que vence este mes");
    expect(r.vence).toEqual({ desde: D("2026-10-22"), hasta: D("2026-11-01") });
    expect(r.texto).toBe("");
    expect(r.entendi).toEqual([{ tipo: "vence", texto: "vence este mes", sinEsto: "" }]);
    expect(entra(r.vence, "2026-10-31T12:00:00.000Z")).toBe(true);
    expect(entra(r.vence, "2026-11-01T00:00:00.000Z")).toBe(false);
  });

  it("«vencen en noviembre»: el noviembre que viene, el 01-11 en los dos formatos", () => {
    const r = leer("vencen en noviembre");
    expect(r.vence).toEqual({ desde: D("2026-11-01"), hasta: D("2026-12-01") });
    expect(chips("vencen en noviembre")).toEqual(["vence en noviembre"]);
    expect(entra(r.vence, "2026-11-01T00:00:00.000Z")).toBe(true);
    expect(entra(r.vence, "2026-11-01T12:00:00.000Z")).toBe(true);
    expect(entra(r.vence, "2026-11-30T12:00:00.000Z")).toBe(true);
    expect(entra(r.vence, "2026-10-31T12:00:00.000Z")).toBe(false);
    expect(entra(r.vence, "2026-12-01T00:00:00.000Z")).toBe(false);
  });

  it("mes sin año: «vence en enero» es el próximo; «venció en noviembre», el pasado", () => {
    expect(leer("vence en enero").vence).toEqual({ desde: D("2027-01-01"), hasta: D("2027-02-01") });
    expect(leer("venció en noviembre").vence).toEqual({ desde: D("2025-11-01"), hasta: D("2025-12-01") });
  });

  it("«vence este año» cuenta desde hoy; «vence en 2027» entero", () => {
    expect(leer("vence este año").vence).toEqual({ desde: D("2026-10-22"), hasta: D("2027-01-01") });
    expect(leer("vence este ano").vence).toEqual({ desde: D("2026-10-22"), hasta: D("2027-01-01") });
    expect(leer("vence en 2027").vence).toEqual({ desde: D("2027-01-01"), hasta: D("2028-01-01") });
    expect(chips("vence en 2027")).toEqual(["vence en 2027"]);
  });

  it("«vence la próxima semana»: de lunes a domingo", () => {
    expect(leer("vence la próxima semana").vence).toEqual({ desde: D("2026-10-26"), hasta: D("2026-11-02") });
    expect(leer("vence la semana que viene").vence).toEqual({ desde: D("2026-10-26"), hasta: D("2026-11-02") });
  });

  it("«vence antes del 15 de diciembre»: de hoy a ese día", () => {
    const r = leer("vence antes del 15 de diciembre");
    expect(r.vence).toEqual({ desde: D("2026-10-22"), hasta: D("2026-12-15") });
    expect(chips("vence antes del 15 de diciembre")).toEqual(["vence antes del 15 de diciembre"]);
  });

  it("«sin vencimiento» y «sin fecha de vencimiento»", () => {
    expect(leer("sin vencimiento").vence).toBe("sin");
    expect(leer("sin fecha de vencimiento").vence).toBe("sin");
    expect(chips("sin vencimiento")).toEqual(["sin vencimiento"]);
  });

  it("«permisos que vencen este año»: tipo + vencimiento", () => {
    const r = leer("permisos que vencen este año");
    expect(r.vence).toEqual({ desde: D("2026-10-22"), hasta: D("2027-01-01") });
    expect(r.texto).toBe("");
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].enNombre).toContain("resolucion");
    expect(r.grupos[0].enNombre).toContain("permiso");
    // La carpeta que empieza con «Permisos» también cuenta.
    expect(r.grupos[0].carpetas).toEqual(["chivis-permisos"]);
    expect(chips("permisos que vencen este año")).toEqual(["permisos", "vence este año"]);
  });
});

describe("subida (instante, medianoche de Lima)", () => {
  it("«de ayer», «de hoy», «antes de ayer»", () => {
    expect(leer("de ayer").subido).toEqual({ desde: L("2026-10-21"), hasta: L("2026-10-22") });
    expect(leer("de hoy").subido).toEqual({ desde: L("2026-10-22"), hasta: L("2026-10-23") });
    expect(leer("antes de ayer").subido).toEqual({ desde: L("2026-10-20"), hasta: L("2026-10-21") });
    expect(chips("de ayer")).toEqual(["subido ayer"]);
  });

  it("«de la semana pasada»: lunes 12 a lunes 19", () => {
    expect(leer("de la semana pasada").subido).toEqual({ desde: L("2026-10-12"), hasta: L("2026-10-19") });
  });

  it("«subidos hace 3 días»: desde ese día hasta hoy, sin «hace» suelto como texto", () => {
    const r = leer("subidos hace 3 días");
    expect(r.subido).toEqual({ desde: L("2026-10-19"), hasta: L("2026-10-23") });
    expect(r.texto).toBe("");
    expect(chips("subidos hace 3 días")).toEqual(["subido desde hace 3 días"]);
    expect(leer("lo que llegó hace una semana").subido).toEqual({ desde: L("2026-10-15"), hasta: L("2026-10-23") });
  });

  it("relleno conversado fuera: «durante», «cerca», «casi», «solo», «por favor»", () => {
    expect(leer("contratos durante octubre").texto).toBe("");
    expect(leer("solo los contratos por favor").texto).toBe("");
    expect(leer("cerca de casi el local").texto).toBe("local");
  });

  it("«facturas de octubre»: subidas este octubre, por nombre y etiquetas (no la categoría)", () => {
    const r = leer("facturas de octubre");
    expect(r.subido).toEqual({ desde: L("2026-10-01"), hasta: L("2026-11-01") });
    expect(r.vence).toBeUndefined();
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].categorias).toBeUndefined();
    expect(r.grupos[0].etiquetas).toContain("factura");
    expect(chips("facturas de octubre")).toEqual(["facturas", "subido en octubre"]);
  });

  it("«lo que llegó por WhatsApp ayer»: subida + etiqueta whatsapp", () => {
    const r = leer("lo que llegó por WhatsApp ayer");
    expect(r.subido).toEqual({ desde: L("2026-10-21"), hasta: L("2026-10-22") });
    expect(r.grupos).toEqual([{ etiquetas: ["whatsapp"] }]);
    expect(r.texto).toBe("");
    expect(chips("lo que llegó por WhatsApp ayer")).toEqual(["llegó ayer", "por WhatsApp"]);
    const sinWsp = r.entendi.find((c) => c.tipo === "origen");
    expect(sinWsp?.sinEsto).toBe("llegó ayer");
  });

  it("«whats app» en dos palabras y sin tilde: «lo que llego por whats app»", () => {
    const r = leer("lo que llego por whats app");
    expect(r.grupos).toEqual([{ etiquetas: ["whatsapp"] }]);
    expect(r.texto).toBe("");
  });

  it("«subidos en los últimos 7 días»", () => {
    expect(leer("subidos en los últimos 7 días").subido).toEqual({ desde: L("2026-10-16"), hasta: L("2026-10-23") });
  });
});

describe("año escrito: la fecha del papel, no la de subida", () => {
  it("«contratos de 2026»: tipo contrato Y (dice 2026 o vence en 2026)", () => {
    const r = leer("contratos de 2026");
    expect(r.subido).toBeUndefined();
    expect(r.vence).toBeUndefined();
    expect(r.texto).toBe("");
    expect(r.grupos).toHaveLength(2);
    expect(r.grupos[0]).toEqual({ textos: ["2026"], vence: { desde: D("2026-01-01"), hasta: D("2027-01-01") } });
    expect(r.grupos[1].categorias).toEqual(["contratos"]);
    expect(r.grupos[1].carpetas?.sort()).toEqual(["contratos", "contratos-viejos"]);
    expect(r.entendi).toEqual([
      { tipo: "tipo", texto: "contratos", sinEsto: "2026" },
      { tipo: "papel", texto: "año 2026 (fecha del papel)", sinEsto: "contratos" },
    ]);
  });

  it("«del 2021» también (Blas sube en 2026 permisos de 2021)", () => {
    const r = leer("del 2021");
    expect(r.subido).toBeUndefined();
    expect(r.grupos[0].vence).toEqual({ desde: D("2021-01-01"), hasta: D("2022-01-01") });
  });

  it("con verbo de subida el año sí es la subida: «subidos en 2025»", () => {
    expect(leer("subidos en 2025").subido).toEqual({ desde: L("2025-01-01"), hasta: L("2026-01-01") });
  });
});

describe("tipos", () => {
  it("«dni del jefe»: DNI + (carpeta del jefe o el texto «jefe»)", () => {
    const r = leer("dni del jefe");
    expect(r.texto).toBe("");
    expect(r.grupos).toHaveLength(2);
    expect(r.grupos[0].etiquetas).toContain("dni");
    expect(r.grupos[1]).toEqual({ carpetas: ["jefe"], textos: ["jefe"] });
    expect(r.entendi[0]).toEqual({ tipo: "tipo", texto: "DNI", sinEsto: "jefe" });
    expect(r.entendi[1].tipo).toBe("carpeta");
    expect(r.entendi[1].sinEsto).toBe("dni");
  });

  it("misma familia se suma, familias distintas se cruzan: «facturas y boletas en pdf»", () => {
    const r = leer("facturas y boletas en pdf");
    expect(r.grupos).toHaveLength(2);
    expect(r.grupos[0].etiquetas).toEqual(expect.arrayContaining(["factura", "boleta"]));
    expect(r.grupos[1]).toEqual({ mimes: ["application/pdf"] });
    expect(r.texto).toBe("");
  });

  it("frases de varias palabras: hoja de cálculo, guía de transporte forestal", () => {
    expect(leer("hoja de cálculo").grupos[0].mimes).toContain("text/csv");
    expect(chips("guía de transporte forestal")).toEqual(["guía de transporte forestal"]);
    expect(leer("guías forestales").grupos[0].etiquetas).toContain("gtf");
    // «hoja» sola no es Excel.
    expect(leer("hoja").texto).toBe("hoja");
  });

  it("fotos de las cámaras: imagen + etiqueta de las cámaras", () => {
    const r = leer("fotos de las cámaras");
    expect(r.grupos).toEqual(expect.arrayContaining([{ etiquetas: [TAG_FOTO_PERSONA] }, { mimes: ["image/"] }]));
    expect(r.texto).toBe("");
  });

  it("favoritos", () => {
    const r = leer("mis favoritos");
    expect(r.favoritos).toBe(true);
    expect(chips("mis favoritos")).toEqual(["favoritos"]);
  });
});

describe("carpetas y texto", () => {
  it("«en Contratos»: esa carpeta y sus subcarpetas, no el tipo", () => {
    const r = leer("en Contratos");
    expect(r.carpetas?.sort()).toEqual(["contratos", "contratos-viejos"]);
    expect(r.grupos).toEqual([]);
    expect(chips("en Contratos")).toEqual(["carpeta Contratos QA-UI"]);
  });

  it("«de Chivis»: la carpeta (con subcarpetas) o el texto", () => {
    const r = leer("de Chivis");
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].carpetas?.sort()).toEqual(["chivis", "chivis-permisos"]);
    expect(r.grupos[0].textos).toEqual(["Chivis"]);
    expect(r.entendi[0].sinEsto).toBe("");
  });

  it("«papeles del local»: sólo queda «local» como texto (antes la IA sumaba «del», «papeles»)", () => {
    const r = leer("papeles del local");
    expect(r.texto).toBe("local");
    expect(r.grupos).toEqual([]);
    expect(entendioAlgo(r)).toBe(false);
    expect(r.soloRelleno).toBe(false);
  });

  it("frase toda de relleno («de la», «lo que llegó»): nada que buscar", () => {
    for (const q of ["de la", "lo que llegó", "papeles", "lo que hay"]) {
      const r = leer(q);
      expect(r.soloRelleno, q).toBe(true);
      expect(r.texto, q).toBe("");
      expect(r.entendi, q).toEqual([]);
    }
    expect(leer("").soloRelleno).toBe(false);
    expect(leer("vencidos").soloRelleno).toBe(false);
  });

  it("sin la lista de carpetas avisa que conviene pedirla", () => {
    expect(interpretarBusqueda("papeles del local", { ahora: AHORA }).necesitaCarpetas).toBe(true);
    expect(interpretarBusqueda("contratos de 2026", { ahora: AHORA }).necesitaCarpetas).toBe(true);
    expect(interpretarBusqueda("vencidos", { ahora: AHORA }).necesitaCarpetas).toBe(false);
  });

  it("lo que sobra va como texto, con todas sus palabras: «contrato alquiler vencido»", () => {
    const r = leer("contrato alquiler vencido");
    expect(r.texto).toBe("alquiler");
    expect(r.vence).toEqual({ hasta: D("2026-10-22") });
  });

  it("la ✕ de un chip deja el resto de la búsqueda", () => {
    const r = leer("permisos que vencen este año");
    expect(r.entendi.find((c) => c.tipo === "vence")?.sinEsto).toBe("permisos");
    expect(r.entendi.find((c) => c.tipo === "tipo")?.sinEsto).toBe("vencen este año");
  });
});

describe("quitarVacias (términos de la IA)", () => {
  it("saca «que», «este», «lo que» y deja lo que distingue", () => {
    expect(quitarVacias(["lo que", "que", "este", "local", "alquiler del local"])).toEqual(["local", "alquiler del local"]);
  });
});
