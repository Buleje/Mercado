/**
 * ADR-430 — del formulario del precio de un cliente a lo que guarda el
 * servidor, y el editor de grupos de especies de la planta. Funciones puras.
 */

import { describe, expect, it } from "vitest";
import {
  borradorDesdeTarifa,
  borradorVacio,
  resumenTarifa,
  validarBorrador,
  vistaPrevia,
  vistaPreviaResumida,
  tarifaDelBorrador,
} from "@/lib/forestal/precio-cliente-borrador";
import {
  crearGrupo,
  gruposAInput,
  gruposCambiaron,
  motivoDeGrupos,
  moverEspecie,
} from "@/lib/forestal/grupos-especies-edicion";
import type { GrupoEspecies, TarifaCliente } from "@/lib/forestal/precio-cliente";

const HOY = "2026-09-22";
const DURAS: GrupoEspecies = {
  id: "g-duras",
  nombre: "Duras",
  claves: ["shihuahuaco", "anacaspi"],
};

describe("validarBorrador", () => {
  it("Global: sólo el precio general; los grupos tipeados no viajan", () => {
    const b = { ...borradorVacio("aserrio", HOY), basePt: "0,50", grupos: { "g-duras": "1.20" } };
    const r = validarBorrador("p1", b, [DURAS]);
    expect(r.ok && r.input).toMatchObject({
      parteId: "p1",
      servicio: "aserrio",
      basePt: 0.5,
      grupos: [],
      especies: [],
      tipos: [],
    });
  });

  it("Por grupos: los grupos con precio y el general como «lo demás»; un grupo borrado de la planta no viaja", () => {
    const b = {
      ...borradorVacio("venta", HOY),
      modo: "grupos" as const,
      basePt: "0.50",
      grupos: { "g-duras": "1.2", "g-viejo": "9" },
    };
    const r = validarBorrador("p1", b, [DURAS]);
    expect(r.ok && r.input).toMatchObject({
      servicio: "venta",
      basePt: 0.5,
      grupos: [{ grupoId: "g-duras", precioPt: 1.2 }],
    });
  });

  it("por especie y por tipo, además del global", () => {
    const b = {
      ...borradorVacio("aserrio", HOY),
      basePt: "0.50",
      especies: [{ nombre: "Tornillo", precio: "0.60" }],
      tipos: [{ tipo: "Comercial" as const, precio: "0.55" }],
    };
    const r = validarBorrador("p1", b, []);
    expect(r.ok && r.input).toMatchObject({
      especies: [{ nombre: "Tornillo", precioPt: 0.6 }],
      tipos: [{ tipo: "Comercial", precioPt: 0.55 }],
    });
  });

  it("filas a medias y precios que no son número se dicen en castellano", () => {
    expect(validarBorrador("p1", { ...borradorVacio("aserrio", HOY), basePt: "abc" }, [])).toEqual({
      ok: false,
      error: "«abc» no es un precio: escribe el monto por pie, como 0.50.",
    });
    const sinPrecio = {
      ...borradorVacio("aserrio", HOY),
      especies: [{ nombre: "Tornillo", precio: "" }],
    };
    expect(validarBorrador("p1", sinPrecio, [])).toEqual({
      ok: false,
      error: "A «Tornillo» le falta el precio por pie.",
    });
    const vacio = validarBorrador("p1", borradorVacio("aserrio", HOY), []);
    expect(vacio.ok).toBe(false);
  });
});

describe("borradorDesdeTarifa", () => {
  it("parte de la vigente, pero la versión nueva rige desde hoy", () => {
    const t: TarifaCliente = {
      id: "t1",
      parteId: "p1",
      servicio: "aserrio",
      vigenteDesde: "2026-09-01",
      basePt: 0.5,
      grupos: [{ grupoId: "g-duras", precioPt: 1.2 }],
      especies: [],
      tipos: [],
      nota: "pactado",
    };
    const b = borradorDesdeTarifa(t, "aserrio", HOY);
    expect(b).toMatchObject({
      modo: "grupos",
      vigenteDesde: HOY,
      basePt: "0.50",
      grupos: { "g-duras": "1.20" },
      nota: "pactado",
    });
    expect(resumenTarifa(t, [DURAS])).toBe("Duras S/ 1.20 · lo demás S/ 0.50");
  });
});

describe("vistaPrevia", () => {
  it("dice el precio y de dónde sale, con la función del cobro", () => {
    const b = {
      ...borradorVacio("aserrio", HOY),
      basePt: "0.50",
      especies: [{ nombre: "Tornillo", precio: "0.60" }],
    };
    const lineas = vistaPrevia(
      tarifaDelBorrador(b, []),
      [],
      ["Tornillo", "Cedro"],
      "Comercial",
    ).map((l) => l.texto);
    expect(lineas).toEqual([
      "Tornillo comercial → S/ 0.60 por pie (precio del cliente para Tornillo)",
      "Cedro comercial → S/ 0.50 por pie (precio general del cliente)",
    ]);
    const sinGeneral = vistaPrevia(
      tarifaDelBorrador(borradorVacio("aserrio", HOY), []),
      [],
      ["Cedro"],
      "Tabla",
    );
    expect(sinGeneral[0]!.texto).toBe(
      "Cedro tabla → sin precio del cliente: rige la tarifa de la planta",
    );
  });
});

describe("vistaPreviaResumida", () => {
  it("un renglón por especie o grupo con precio; el resto junto, sin cortar al Tornillo", () => {
    const b = {
      ...borradorVacio("aserrio", HOY),
      modo: "grupos" as const,
      basePt: "0.50",
      grupos: { "g-duras": "1.20" },
    };
    const catalogo = ["Bolaina", "Caoba", "Cedro", "Shihuahuaco", "Tornillo"];
    const lineas = vistaPreviaResumida(
      tarifaDelBorrador(b, [DURAS]),
      [DURAS],
      catalogo,
      "Comercial",
    ).map((l) => l.texto);
    expect(lineas).toEqual([
      "Shihuahuaco comercial → S/ 1.20 por pie (precio del cliente para el grupo Duras)",
      "Las demás en comercial (Bolaina, Caoba, Cedro y 1 más) → S/ 0.50 por pie (precio general del cliente)",
    ]);
    const todo = vistaPreviaResumida(
      tarifaDelBorrador({ ...borradorVacio("aserrio", HOY), basePt: "0.5" }, []),
      [],
      ["Cedro", "Tornillo"],
      "Comercial",
    );
    expect(todo.map((l) => l.texto)).toEqual([
      "Toda especie en comercial → S/ 0.50 por pie (precio general del cliente)",
    ]);
  });
});

describe("grupos de especies", () => {
  it("mover una especie la saca del grupo donde estaba", () => {
    const blandas: GrupoEspecies = { id: "g-blandas", nombre: "Blandas", claves: [] };
    const r = moverEspecie([DURAS, blandas], "g-blandas", "Anacaspi");
    expect(r.desde?.nombre).toBe("Duras");
    expect(r.grupos.find((g) => g.id === "g-duras")!.claves).toEqual(["shihuahuaco"]);
    expect(r.grupos.find((g) => g.id === "g-blandas")!.claves).toEqual(["anacaspi"]);
    const enDos = r.grupos.flatMap((g) => g.claves).filter((k) => k === "anacaspi");
    expect(enDos).toHaveLength(1);
  });

  it("nombres: vacío, repetido y el input con nombres de especie", () => {
    expect(crearGrupo([DURAS], "  duras ").error).toBe("Ya hay un grupo «Duras».");
    const nuevo = crearGrupo([DURAS], "Blandas", () => "abc");
    expect(nuevo.id).toBe("g-abc");
    expect(motivoDeGrupos([{ ...DURAS, nombre: " " }])).toBe(
      "Hay un grupo sin nombre: ponle uno o bórralo.",
    );
    expect(gruposAInput([DURAS], (k) => ({ shihuahuaco: "Shihuahuaco" })[k])).toEqual([
      { id: "g-duras", nombre: "Duras", especies: ["Shihuahuaco", "anacaspi"] },
    ]);
    expect(gruposCambiaron([DURAS], [{ ...DURAS, claves: ["anacaspi", "shihuahuaco"] }])).toBe(
      false,
    );
  });
});
