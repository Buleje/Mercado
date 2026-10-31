/**
 * El orden de «Papeles del permiso» en la pestaña (`plan-papeles/papeles-grupos`):
 * grupos por lo que pide hacer, la barra de avance y a qué carpeta va cada papel.
 */
import { describe, expect, it } from "vitest";
import { agruparPapeles, destinoDelPapel, tramosDeAvance } from "@/components/admin/forestal/plan-papeles/papeles-grupos";
import { papelesDePlan, tagPapel, type ArchivoParaPapel } from "@/lib/forestal/loth-plan-papeles";

const HOY = "2026-10-26";
const PO = { planType: "PO", titularName: "Maderera El Aguajal SAC", propietarioNombre: null, vigenciaHasta: "2027-01-14" };

const archivo = (p: Partial<ArchivoParaPapel>): ArchivoParaPapel => ({
  documentId: "d1",
  nombre: "prueba.pdf",
  mimeType: "application/pdf",
  expiresAt: null,
  uploadedAt: "2026-10-01T00:00:00Z",
  papel: null,
  casillero: null,
  carpeta: "otros",
  ...p,
});

describe("agruparPapeles", () => {
  it("sin papeles: los obligatorios en «Faltan» y el resto en «Si aplica», con lo automático al final", () => {
    const { lista } = papelesDePlan(PO, [], HOY);
    const grupos = agruparPapeles(lista);
    expect(grupos.map((g) => g.titulo)).toEqual(["Faltan", "Si aplica"]);
    const siAplica = grupos[1].papeles;
    expect(siAplica.at(-1)?.clave).toBe("gtf");
    expect(siAplica.at(-1)?.subible).toBe(false);
    // No se pierde ni se repite ninguno.
    expect(grupos.flatMap((g) => g.papeles).length).toBe(lista.length);
  });

  it("vencidos arriba, después los que faltan, por vencer (el más próximo primero) y al día", () => {
    const archivos = [
      archivo({ documentId: "a", papel: "resolucion", expiresAt: "2026-10-01T00:00:00Z" }), // vencido
      archivo({ documentId: "b", papel: "plan-aprobado", expiresAt: "2026-11-20T00:00:00Z" }), // por vencer
      archivo({ documentId: "c", papel: "titulo", expiresAt: "2026-11-02T00:00:00Z" }), // por vencer, antes
      archivo({ documentId: "d", papel: "regente" }), // al día
    ];
    const { lista } = papelesDePlan(PO, archivos, HOY);
    const grupos = agruparPapeles(lista);
    const titulos = grupos.map((g) => g.titulo);
    expect(titulos.indexOf("Vencidos")).toBe(0);
    expect(titulos.indexOf("Faltan")).toBeLessThan(titulos.indexOf("Por vencer"));
    expect(titulos.indexOf("Por vencer")).toBeLessThan(titulos.indexOf("Al día"));
    const porVencer = grupos.find((g) => g.titulo === "Por vencer")?.papeles.map((p) => p.vence) ?? [];
    expect(porVencer).toEqual([...porVencer].sort());
    expect(grupos.flatMap((g) => g.papeles).length).toBe(lista.length);
  });
});

describe("tramosDeAvance", () => {
  it("sólo los obligatorios, los que están primero", () => {
    const { lista, requeridos } = papelesDePlan(PO, [archivo({ papel: "regente" })], HOY);
    const tramos = tramosDeAvance(lista);
    expect(tramos.length).toBe(requeridos);
    if (lista.find((p) => p.clave === "regente")?.exigencia === "siempre") expect(tramos[0].estado).toBe("presente");
    expect(tramos.every((t) => t.estado !== "segun_caso")).toBe(true);
  });
});

describe("destinoDelPapel", () => {
  const carpetas = [
    { clave: "resolucion", nombre: "Resolución", casilleros: [{ clave: "resolucion-o-constancia-de-registro", nombre: "Resolución o constancia" }] },
    { clave: "jefe", nombre: "Jefe", casilleros: [{ clave: "vigencia-de-poder", nombre: "Vigencia de poder" }] },
  ];

  it("su carpeta y el casillero que lo representa", () => {
    const d = destinoDelPapel({ carpeta: "resolucion", casilleros: ["resolucion-o-constancia-de-registro"] }, carpetas);
    expect(d?.carpeta.clave).toBe("resolucion");
    expect(d?.casillero?.clave).toBe("resolucion-o-constancia-de-registro");
  });

  it("sin casillero que lo represente, va suelto; sin su carpeta, a la primera (igual que «Subir»)", () => {
    expect(destinoDelPapel({ carpeta: "jefe", casilleros: [] }, carpetas)?.casillero).toBeNull();
    expect(destinoDelPapel({ carpeta: "otros", casilleros: [] }, carpetas)?.carpeta.clave).toBe("resolucion");
    expect(destinoDelPapel({ carpeta: "otros", casilleros: [] }, [])).toBeNull();
  });

  it("la etiqueta del papel sigue siendo la de siempre", () => {
    expect(tagPapel("resolucion")).toBe("papel:resolucion");
  });
});
