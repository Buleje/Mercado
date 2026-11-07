import { describe, expect, it } from "vitest";
import {
  nombreDeVinculo, rotuloDeMarca, vinculosConMarca, vinculosDeCarpetaSistema, type CarpetaParaVinculo,
} from "@/lib/documentos/vinculos-sistema";

const c = (id: string, name: string, parentId: string | null = null, tags: string[] = []): CarpetaParaVinculo => ({ id, name, parentId, tags });
const mapa = (...cs: CarpetaParaVinculo[]) => new Map(cs.map((x) => [x.id, x]));

describe("vínculos con el sistema de una carpeta", () => {
  it("lo ligado a mano lleva su página y la dirección de la ficha", () => {
    const f = c("a", "CCNN Santa Rosa", null, ["parte:abc123", "marca:esencial"]);
    const [v] = vinculosDeCarpetaSistema(f, mapa(f));
    expect(v).toMatchObject({ clave: "parte:abc123", tipo: "comunidad", origen: "ligado", modulo: "Libro CTP" });
    expect(v.pagina).toEqual(["Forestal", "Libro CTP", "Directorio"]);
    expect(v.href).toContain("tab=ctp-libro-operaciones");
  });

  it("«Otro» no tiene ficha: sin dirección", () => {
    const f = c("a", "Notaría", null, ["otro:notaria-perez"]);
    expect(vinculosDeCarpetaSistema(f, mapa(f))[0].href).toBeNull();
  });

  it("la subcarpeta de un módulo lo hereda en la ventana, pero no lleva marca", () => {
    const raiz = c("r", "Guías forestales (GTF)");
    const hija = c("h", "001-2026", "r");
    const v = vinculosDeCarpetaSistema(hija, mapa(raiz, hija));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ tipo: "guias", origen: "modulo", heredadoDe: "Guías forestales (GTF)" });
    expect(vinculosConMarca(hija)).toHaveLength(0);
    expect(vinculosConMarca(raiz)).toHaveLength(1);
  });

  it("gana la ruta más larga: Por permiso es de Contratos, no de Ingresos", () => {
    const raiz = c("r", "Guías forestales (GTF)");
    const permiso = c("p", "Por permiso", "r");
    expect(vinculosDeCarpetaSistema(permiso, mapa(raiz, permiso))[0]).toMatchObject({ tipo: "permisos", heredadoDe: null });
  });

  it("la raíz de un plan no repite el «Libro TH» heredado", () => {
    const th = c("t", "Libro TH");
    const plan = c("p", "19-SEC-2026", "t", ["plan:xyz"]);
    const v = vinculosDeCarpetaSistema(plan, mapa(th, plan));
    expect(v.map((x) => x.tipo)).toEqual(["plan"]);
    expect(vinculosConMarca(plan)[0].nombreFijo).toBe("19-SEC-2026");
  });

  it("un nombre igual fuera de la raíz no es del módulo (sin falsos positivos)", () => {
    const madre = c("m", "Varios");
    const f = c("f", "Guías forestales (GTF)", "m");
    expect(vinculosDeCarpetaSistema(f, mapa(madre, f))).toHaveLength(0);
    expect(vinculosConMarca(f)).toHaveLength(0);
  });

  it("el alias gana al nombre real y entra en el rótulo de la marca", () => {
    const f = c("a", "CCNN", null, ["parte:abc123"]);
    const v = vinculosConMarca(f);
    const nombres = { "parte:abc123": { nombre: "COMUNIDAD NATIVA SANTA ROSA", alias: "Santa Rosa" } };
    expect(nombreDeVinculo(v[0], nombres)).toBe("Santa Rosa");
    expect(rotuloDeMarca(v, nombres)).toBe("Ligada a: Santa Rosa (Libro CTP)");
    expect(nombreDeVinculo(v[0], {})).toBe("Comunidad o titular sin ficha");
  });
});
