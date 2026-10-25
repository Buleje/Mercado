import { describe, expect, it } from "vitest";
import { planDeLaRuta } from "@/components/admin/documentos/archivo/EnlacePapelesDelPlan";

const c = (name: string, tags: string[] = []) => ({ name, tags });

describe("planDeLaRuta — «Papeles del plan» en el Archivo", () => {
  it("la raíz del plan (`plan:<id>`) da su N° aunque se esté en una subcarpeta", () => {
    const ruta = [c("Libro TH"), c("Comunidad Nativa Shambo"), c("096", ["plan:p96"]), c("1. Resolución", ["plan-carpeta:resolucion"])];
    expect(planDeLaRuta(ruta)).toEqual({ planId: "p96", nombre: "096" });
  });

  it("sin carpeta de plan en el camino (o con la etiqueta vacía) no hay enlace", () => {
    expect(planDeLaRuta([])).toBeNull();
    expect(planDeLaRuta([c("Contratos"), c("2026", ["pdf"])])).toBeNull();
    expect(planDeLaRuta([c("Rara", ["plan:"])])).toBeNull();
    // `plan-carpeta:` es de una subcarpeta, no de la raíz.
    expect(planDeLaRuta([c("1. Resolución", ["plan-carpeta:resolucion"])])).toBeNull();
  });

  it("si hay dos (un plan dentro de otro), manda el más hondo", () => {
    expect(planDeLaRuta([c("A", ["plan:pa"]), c("B", ["plan:pb"])])).toEqual({ planId: "pb", nombre: "B" });
  });
});
