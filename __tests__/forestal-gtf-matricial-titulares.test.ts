/**
 * Un talonario POR TITULAR (Brandon 15-10: «una disposición por titular»):
 * la identidad del titular es la de la numeración (ADR-452), lo guardado
 * antes pasa a ser el de la empresa, y un titular nuevo arranca de ésa.
 * También los nombres cortos que se ven encima de cada valor en pantalla.
 */
import { describe, expect, it } from "vitest";
import { disposicionDeFabrica, hojaDeFabrica, type DisposicionHoja } from "@/lib/forestal/gtf-matricial-disposicion";
import { nombreCorto } from "@/lib/forestal/gtf-matricial-nombres";
import {
  almacenVacio,
  buscarTitular,
  claveDeTitular,
  disposicionDe,
  guardarHojaEnAlmacen,
  MAX_TITULARES,
  normalizarAlmacen,
  resolverDisposicion,
  resumenTitulares,
  type AlmacenTalonario,
  type DuenoTalonario,
} from "@/lib/forestal/gtf-matricial-titulares";

const CUANDO = { en: "2026-10-15T15:00:00.000Z", por: "qaadmin" };
const AGUAJAL: DuenoTalonario = { titular: "MADERERA EL AGUAJAL S.A.C.", permiso: "17-UCA-C-PER-001-20", planId: null };
const SANTOS: DuenoTalonario = { titular: "SANTOS MUÑOZ ROJAS", permiso: null, planId: "plan-santos" };
const SIN: DuenoTalonario = { titular: null, permiso: null, planId: null };

/** Una hoja de guía corrida `dx` mm: para distinguir de quién es cada una. */
const guiaCorrida = (dx: number): DisposicionHoja => ({ ...hojaDeFabrica("guia"), offsetXMm: dx });

function guardar(alm: AlmacenTalonario, dueno: DuenoTalonario, dx: number, formato: "guia" | "lista" = "guia"): AlmacenTalonario {
  const hoja = formato === "guia" ? guiaCorrida(dx) : { ...hojaDeFabrica("lista"), offsetXMm: dx };
  const r = guardarHojaEnAlmacen(alm, dueno, formato, hoja, CUANDO);
  if (!r) throw new Error("tope");
  return r.almacen;
}

describe("la clave del titular", () => {
  it("es la misma escrita como sea: puntos, tildes, «S.A.C.» y el orden de las palabras no cambian a nadie", () => {
    expect(claveDeTitular("MADERERA EL AGUAJAL S.A.C.")).toBe(claveDeTitular("Maderera  el Aguajal SAC"));
    expect(claveDeTitular("Santos Muñoz Rojas")).toBe(claveDeTitular("ROJAS SANTOS MUNOZ"));
    expect(claveDeTitular("  ")).toBeNull();
    expect(claveDeTitular(null)).toBeNull();
  });
});

describe("lo guardado antes de los titulares", () => {
  it("la disposición vieja ({ guia, lista }) pasa a ser la de la empresa, sin perder nada", () => {
    const vieja = { ...disposicionDeFabrica(), guia: guiaCorrida(3) };
    const alm = normalizarAlmacen(JSON.parse(JSON.stringify(vieja)));
    expect(alm.empresa?.guia.offsetXMm).toBe(3);
    expect(alm.porTitular).toEqual({});
    expect(normalizarAlmacen(null)).toEqual(almacenVacio());
  });

  it("un titular sin el suyo ve la de la empresa; sin empresa, la de fábrica", () => {
    const conEmpresa = normalizarAlmacen({ ...disposicionDeFabrica(), guia: guiaCorrida(3) });
    const r = resolverDisposicion(conEmpresa, AGUAJAL);
    expect(r.origen).toBe("empresa");
    expect(r.disposicion.guia.offsetXMm).toBe(3);
    expect(r.titular?.nombre).toBe("MADERERA EL AGUAJAL S.A.C.");
    expect(resolverDisposicion(almacenVacio(), AGUAJAL).origen).toBe("fabrica");
  });
});

describe("guardar por titular", () => {
  it("cada titular abre la suya; la de la empresa no cambia al guardar la de un titular", () => {
    let alm = normalizarAlmacen({ ...disposicionDeFabrica(), guia: guiaCorrida(3) });
    alm = guardar(alm, AGUAJAL, 7);
    alm = guardar(alm, SANTOS, -2);
    expect(resolverDisposicion(alm, AGUAJAL)).toMatchObject({ origen: "titular", disposicion: { guia: { offsetXMm: 7 } } });
    expect(resolverDisposicion(alm, SANTOS)).toMatchObject({ origen: "titular", disposicion: { guia: { offsetXMm: -2 } } });
    expect(alm.empresa?.guia.offsetXMm).toBe(3);
  });

  it("un titular nuevo arranca de la de la empresa: guardar su guía no le resetea la lista", () => {
    let alm = guardar(almacenVacio(), SIN, 4, "lista");
    expect(alm.empresa?.lista.offsetXMm).toBe(4);
    alm = guardar(alm, AGUAJAL, 9, "guia");
    const r = resolverDisposicion(alm, AGUAJAL).disposicion;
    expect(r.guia.offsetXMm).toBe(9);
    expect(r.lista.offsetXMm).toBe(4);
  });

  it("encuentra al titular escrito distinto o por su título habilitante (la vara de la numeración)", () => {
    const alm = guardar(almacenVacio(), AGUAJAL, 7);
    expect(buscarTitular(alm, { titular: "Maderera El Aguajal SAC", permiso: null, planId: null })?.entrada.guia.offsetXMm).toBe(7);
    expect(buscarTitular(alm, { titular: "OTRO NOMBRE", permiso: "17-UCA-C-PER-001-20", planId: null })?.entrada.guia.offsetXMm).toBe(7);
    expect(buscarTitular(alm, { titular: "OTRO NOMBRE", permiso: null, planId: null })).toBeNull();
  });

  it("guardar de nuevo al mismo titular escrito distinto no crea un segundo talonario", () => {
    let alm = guardar(almacenVacio(), AGUAJAL, 7);
    alm = guardar(alm, { titular: "MADERERA EL AGUAJAL SAC", permiso: AGUAJAL.permiso, planId: null }, 8);
    expect(Object.keys(alm.porTitular)).toHaveLength(1);
    expect(resolverDisposicion(alm, AGUAJAL).disposicion.guia.offsetXMm).toBe(8);
  });

  it("con el tope de titulares, uno nuevo no se guarda (y uno que ya está, sí)", () => {
    let alm = almacenVacio();
    const porTitular: AlmacenTalonario["porTitular"] = {};
    for (let i = 0; i < MAX_TITULARES; i++) {
      const d = disposicionDeFabrica();
      porTitular[`T${i}`] = { nombre: `TITULAR ${i}`, permiso: null, planId: null, guia: d.guia, lista: d.lista, actualizado: null };
    }
    alm = { ...alm, porTitular };
    expect(guardarHojaEnAlmacen(alm, AGUAJAL, "guia", guiaCorrida(1), CUANDO)).toBeNull();
    expect(guardarHojaEnAlmacen(alm, { titular: "TITULAR 5", permiso: null, planId: null }, "guia", guiaCorrida(1), CUANDO)).not.toBeNull();
  });
});

describe("copiar de otro titular", () => {
  it("trae la de un titular por su clave, o la de la empresa; una clave que no existe da null", () => {
    let alm = guardar(almacenVacio(), SIN, 3);
    alm = guardar(alm, SANTOS, -2);
    const clave = claveDeTitular(SANTOS.titular) ?? "";
    expect(disposicionDe(alm, clave)?.guia.offsetXMm).toBe(-2);
    expect(disposicionDe(alm, "empresa")?.guia.offsetXMm).toBe(3);
    expect(disposicionDe(alm, "NADIE")).toBeNull();
  });

  it("la lista de titulares con su talonario va por nombre, con la fecha en que se guardó", () => {
    let alm = guardar(almacenVacio(), SANTOS, 1);
    alm = guardar(alm, AGUAJAL, 2);
    expect(resumenTitulares(alm).map((r) => r.nombre)).toEqual(["MADERERA EL AGUAJAL S.A.C.", "SANTOS MUÑOZ ROJAS"]);
    expect(resumenTitulares(alm)[0].actualizado).toBe(CUANDO.en);
  });
});

describe("nombres en la hoja de la pantalla", () => {
  it("cortos para los casilleros conocidos y la etiqueta del catálogo para el resto", () => {
    expect(nombreCorto("guia", "campo", "7")).toBe("(7) Titular");
    expect(nombreCorto("guia", "campo", "5:permiso")).toBe("Permiso");
    expect(nombreCorto("lista", "columna", "d1")).toBe("D1");
    expect(nombreCorto("lista", "columna", "vol")).toBe("Vol.");
    expect(nombreCorto("guia", "campo", "no-existe")).toBe("no-existe");
  });
});

describe("claves que se parecen a las del lenguaje (revisión 15-10)", () => {
  it("«constructor», «toString» y «__proto__» no son titulares: null, no {}", () => {
    const alm = normalizarAlmacen({ version: 2, porTitular: {} });
    for (const de of ["constructor", "toString", "__proto__"]) expect(disposicionDe(alm, de)).toBeNull();
  });
  it("un «__proto__» guardado en la base queda como un titular más y no cambia el objeto", () => {
    const alm = normalizarAlmacen(JSON.parse('{"version":2,"porTitular":{"__proto__":{"nombre":"Raro","guia":{},"lista":{}}}}'));
    expect(Object.getPrototypeOf(alm.porTitular)).toBeNull();
    expect(disposicionDe(alm, "toString")).toBeNull();
  });
});
