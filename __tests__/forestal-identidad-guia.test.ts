/**
 * ADR-504 · guía = GTF + permiso; troza = código + permiso (Brandon, 19-10-2026:
 * «permiso 1 GTF 4 / permiso 2 GTF 4 (dos talonarios)… permiso 1 código 12 /
 * permiso 2 código 12… sólo diferenciará según el número de permiso»).
 *
 * Tabla de casos de las reglas puras que usan importar y pantalla (la plata
 * sigue por N°: ADR-504 en pausa): `lib/forestal/identidad-guia.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  busquedaDeTroza,
  chocanTrozas,
  claveDeGuiaRef,
  claveDeTroza,
  decidirGuiaAlImportar,
  decidirTrozasDelArchivo,
  especiesCoinciden,
  mensajeGuiaAmbigua,
  mismaGuiaRef,
  resolverGuiaEntre,
  type IngresoDeGuia,
} from "@/lib/forestal/identidad-guia";

const ing = (p: Partial<IngresoDeGuia> & { id: string }): IngresoDeGuia => ({
  gtfNumber: "019-001-0000004",
  contratoId: null,
  originCode: null,
  titular: "COMUNIDAD NATIVA SAN LUIS",
  especies: ["Tornillo"],
  ...p,
});

describe("ADR-504 · la llave de la guía", () => {
  it("N° tramo a tramo + permiso; sin permiso = ∅", () => {
    expect(claveDeGuiaRef({ gtfNumber: "019-001-0000004", contratoId: "c1" })).toBe("19-1-4|c1");
    expect(claveDeGuiaRef({ gtfNumber: " 19 - 001 - 4 ", contratoId: null })).toBe("19-1-4|∅");
    expect(mismaGuiaRef({ gtfNumber: "019-001-0000004", contratoId: "c1" }, { gtfNumber: "19-1-4", contratoId: "c1" })).toBe(true);
    // permiso 1 GTF 4 / permiso 2 GTF 4: dos talonarios, dos guías
    expect(mismaGuiaRef({ gtfNumber: "019-001-0000004", contratoId: "c1" }, { gtfNumber: "019-001-0000004", contratoId: "c2" })).toBe(false);
    expect(mismaGuiaRef({ gtfNumber: "019-001-0000004", contratoId: "c1" }, { gtfNumber: "019-001-0000004", contratoId: null })).toBe(false);
  });
});

describe("ADR-504 · decidirGuiaAlImportar", () => {
  const llegaP1 = { gtfNumber: "19-001-4", contratoId: "c1", permiso: "P-1", titular: "COMUNIDAD NATIVA SAN LUIS", especies: ["Tornillo"] };

  it("otra: no hay guía con ese N° (otra serie tampoco cuenta)", () => {
    expect(decidirGuiaAlImportar(llegaP1, [])).toEqual({ estado: "otra" });
    expect(decidirGuiaAlImportar(llegaP1, [ing({ id: "w1", gtfNumber: "019-002-0000004" })])).toEqual({ estado: "otra" });
  });

  it("otra: el mismo N° en OTRO permiso es otro talonario", () => {
    const r = decidirGuiaAlImportar(llegaP1, [ing({ id: "w1", contratoId: "c2", originCode: "P-2" })]);
    expect(r).toEqual({ estado: "otra" });
  });

  it("misma: N° escrito distinto, mismo permiso; trae los ingresos de las dos especies", () => {
    const r = decidirGuiaAlImportar(llegaP1, [
      ing({ id: "w1", contratoId: "c1", originCode: "P-1" }),
      ing({ id: "w2", contratoId: "c1", originCode: "P-1", especies: ["Capirona"] }),
      ing({ id: "w3", contratoId: "c2", originCode: "P-2" }),
    ]);
    expect(r).toEqual({ estado: "misma", id: "w1", ids: ["w1", "w2"] });
  });

  it("asignar-permiso: la única guía con ese N° está sin permiso, nada la contradice", () => {
    const r = decidirGuiaAlImportar(llegaP1, [
      ing({ id: "w1" }),
      ing({ id: "w2", especies: ["Capirona"], tienePlata: true }),
    ]);
    expect(r).toEqual({ estado: "asignar-permiso", id: "w1", ids: ["w1", "w2"], conPlata: true });
  });

  it("asignar-permiso: la guía a medio cargar (menos especies) también es ésa", () => {
    const r = decidirGuiaAlImportar({ ...llegaP1, especies: ["Tornillo", "Capirona"] }, [ing({ id: "w1" })]);
    expect(r).toMatchObject({ estado: "asignar-permiso", ids: ["w1"], conPlata: false });
  });

  it("crear-con-aviso: la sin permiso dice OTRO permiso escrito (mismo titular: dos talonarios)", () => {
    const r = decidirGuiaAlImportar(llegaP1, [ing({ id: "w1", originCode: "P-9" })]);
    expect(r).toMatchObject({ estado: "crear-con-aviso", posible: "w1", conPlata: false });
    expect(r.estado === "crear-con-aviso" && r.aviso).toContain("«P-9»");
  });

  it("crear-con-aviso: hay otras guías con ese N° en otros permisos (no es la única)", () => {
    const r = decidirGuiaAlImportar(llegaP1, [ing({ id: "w1" }), ing({ id: "w2", contratoId: "c2", originCode: "P-2" })]);
    expect(r).toMatchObject({ estado: "crear-con-aviso", posible: "w1" });
    expect(r.estado === "crear-con-aviso" && r.aviso).toContain("P-2");
  });

  it("crear-con-aviso: dos guías sin permiso de titulares distintos, aunque el archivo sea de uno de ellos", () => {
    const r = decidirGuiaAlImportar(llegaP1, [ing({ id: "w1" }), ing({ id: "w2", titular: "MADERERA EL AGUAJAL SAC" })]);
    expect(r).toMatchObject({ estado: "crear-con-aviso", posible: "w1" });
    expect(r.estado === "crear-con-aviso" && r.aviso).toContain("más de un titular");
  });

  it("crear-con-aviso: especies que no coinciden", () => {
    const r = decidirGuiaAlImportar({ ...llegaP1, especies: ["Shihuahuaco"] }, [ing({ id: "w1" })]);
    expect(r).toMatchObject({ estado: "crear-con-aviso", posible: "w1" });
    expect(r.estado === "crear-con-aviso" && r.aviso).toContain("otras especies");
  });

  it("crear-con-aviso: otro titular y sin permiso escrito; con plata lo avisa", () => {
    const r = decidirGuiaAlImportar(llegaP1, [ing({ id: "w1", titular: "MADERERA EL AGUAJAL SAC", tienePlata: true })]);
    expect(r).toMatchObject({ estado: "crear-con-aviso", posible: "w1", conPlata: true });
    expect(r.estado === "crear-con-aviso" && r.aviso).toContain("plata");
  });

  it("ambigua: llega SIN permiso y hay 2 permisos con ese N° del mismo titular (el titular no elige)", () => {
    const r = decidirGuiaAlImportar({ gtfNumber: "019-001-0000004", contratoId: null, titular: "COMUNIDAD NATIVA SAN LUIS" }, [
      ing({ id: "w1", contratoId: "c1", originCode: "P-1" }),
      ing({ id: "w2", contratoId: "c2", originCode: "P-2" }),
    ]);
    expect(r.estado).toBe("ambigua");
    expect(r.estado === "ambigua" && r.candidatas.map((c) => c.contratoId)).toEqual(["c1", "c2"]);
  });

  it("llega SIN permiso: el permiso escrito elige entre dos; una sola con permiso = ésa; la sin permiso = ésa", () => {
    const dos = [ing({ id: "w1", contratoId: "c1", originCode: "P-1" }), ing({ id: "w2", contratoId: "c2", originCode: "P-2" })];
    expect(decidirGuiaAlImportar({ gtfNumber: "19-1-4", contratoId: null, permiso: "p-2" }, dos)).toEqual({ estado: "misma", id: "w2", ids: ["w2"] });
    expect(decidirGuiaAlImportar({ gtfNumber: "19-1-4", contratoId: null }, [dos[0]])).toEqual({ estado: "misma", id: "w1", ids: ["w1"] });
    expect(decidirGuiaAlImportar({ gtfNumber: "19-1-4", contratoId: null }, [ing({ id: "w9" }), ...dos])).toEqual({ estado: "misma", id: "w9", ids: ["w9"] });
  });

  it("llega SIN permiso y hay dos guías sin permiso de titulares distintos: ambigua", () => {
    const r = decidirGuiaAlImportar({ gtfNumber: "19-1-4", contratoId: null }, [
      ing({ id: "w1" }),
      ing({ id: "w2", titular: "MADERERA EL AGUAJAL SAC" }),
    ]);
    expect(r.estado).toBe("ambigua");
    expect(r.estado === "ambigua" && r.candidatas).toHaveLength(2);
  });

  it("especiesCoinciden: vacío no objeta, contenida sí, cruzadas no", () => {
    expect(especiesCoinciden([], ["Tornillo"])).toBe(true);
    expect(especiesCoinciden(["tornillo "], ["Tornillo", "Capirona"])).toBe(true);
    expect(especiesCoinciden(["Tornillo", "Cedro"], ["Tornillo", "Capirona"])).toBe(false);
  });
});

describe("ADR-504 · resolverGuiaEntre (lectura de una GuiaRef)", () => {
  const base = [
    ing({ id: "w1", contratoId: "c1", originCode: "P-1" }),
    ing({ id: "w2", contratoId: "c2", originCode: "P-2" }),
  ];
  it("con permiso: la de ese permiso o ninguna (la sin permiso no es ésta)", () => {
    expect(resolverGuiaEntre({ gtfNumber: "19-1-4", contratoId: "c2" }, base)).toMatchObject({ estado: "una", guia: { ingresoIds: ["w2"] } });
    expect(resolverGuiaEntre({ gtfNumber: "19-1-4", contratoId: "c3" }, [...base, ing({ id: "w3" })])).toEqual({ estado: "ninguna" });
  });
  it("sin permiso: dos permisos = ambigua (nunca la primera); uno solo = ése", () => {
    expect(resolverGuiaEntre({ gtfNumber: "19-1-4", contratoId: null }, base).estado).toBe("ambigua");
    expect(resolverGuiaEntre({ gtfNumber: "19-1-4", contratoId: null }, [base[1]])).toMatchObject({ estado: "una", guia: { contratoId: "c2" } });
  });
  it("mensajeGuiaAmbigua dice los permisos y qué hacer", () => {
    const r = resolverGuiaEntre({ gtfNumber: "19-1-4", contratoId: null }, base);
    const msg = r.estado === "ambigua" ? mensajeGuiaAmbigua("019-001-0000004", r.candidatas) : "";
    expect(msg).toBe("La guía N° 019-001-0000004 está en 2 permisos (P-1 · P-2). Elige el permiso del archivo para saber cuál es.");
  });
});

describe("ADR-504 · troza = código + permiso", () => {
  it("claveDeTroza compara como el índice ADR-436 (sin bordes, mayúsculas)", () => {
    expect(claveDeTroza(" 13/a ", "c1")).toBe("13/A|c1");
    expect(claveDeTroza("12", null)).toBe("12|∅");
    expect(claveDeTroza("  ", "c1")).toBeNull();
  });

  it("choque: P1 «12» vs P2 «12» no; contra uno sin permiso sí; mismo permiso sí", () => {
    expect(chocanTrozas({ codigo: "12", contratoId: "c1" }, { codigo: "12", contratoId: "c2" })).toBe(false);
    expect(chocanTrozas({ codigo: "12", contratoId: "c1" }, { codigo: "12", contratoId: null })).toBe(true);
    expect(chocanTrozas({ codigo: "12", contratoId: null }, { codigo: "12", contratoId: "c2" })).toBe(true);
    expect(chocanTrozas({ codigo: "12", contratoId: null }, { codigo: " 12 ", contratoId: null })).toBe(true);
    expect(chocanTrozas({ codigo: "12", contratoId: "c1" }, { codigo: "12", contratoId: "c1" })).toBe(true);
    expect(chocanTrozas({ codigo: "12", contratoId: "c1" }, { codigo: "13", contratoId: "c1" })).toBe(false);
  });

  it("contra la base: otro permiso entra; sin permiso de un lado choca", () => {
    const [a] = decidirTrozasDelArchivo([{ fila: 3, codigo: "12", contratoId: "c1" }], [{ id: "t2", codigo: "12", contratoId: "c2" }]);
    expect(a).toMatchObject({ estado: "entra", codigoOcupado: false, identicas: [] });
    const [b] = decidirTrozasDelArchivo([{ fila: 3, codigo: "12", contratoId: "c1" }], [{ id: "t0", codigo: "12", contratoId: null }]);
    expect(b).toMatchObject({ estado: "choca", con: { trozaId: "t0", contratoId: null } });
    const [c] = decidirTrozasDelArchivo([{ fila: 3, codigo: "12", contratoId: null }], [{ id: "t1", codigo: "12", contratoId: "c1" }]);
    expect(c).toMatchObject({ estado: "choca", con: { trozaId: "t1" } });
  });

  it("dos filas idénticas del mismo permiso entran las dos con aviso", () => {
    const r = decidirTrozasDelArchivo(
      [
        { fila: 4, codigo: "12", contratoId: "c1", firma: "tornillo|0.42" },
        { fila: 9, codigo: "12", contratoId: "c1", firma: "tornillo|0.42" },
      ],
      [],
    );
    expect(r).toEqual([
      { estado: "entra", fila: 4, identicas: [9], codigoOcupado: false, aviso: "Filas 4 y 9 idénticas (troza 12)." },
      { estado: "entra", fila: 9, identicas: [4], codigoOcupado: true, aviso: "Filas 4 y 9 idénticas (troza 12)." },
    ]);
  });

  it("re-subida: la fila que ya está en la base es «ya estaba»; por conteo, la 2.ª idéntica entra", () => {
    const base = [{ id: "t1", codigo: "12", contratoId: "c1" }];
    expect(decidirTrozasDelArchivo([{ fila: 4, codigo: "12", contratoId: "c1" }], base)).toEqual([
      { estado: "ya-estaba", fila: 4, trozaId: "t1", aviso: "La troza 12 ya estaba en el libro." },
    ]);
    const r = decidirTrozasDelArchivo(
      [
        { fila: 4, codigo: "12", contratoId: "c1" },
        { fila: 9, codigo: "12", contratoId: "c1" },
      ],
      base,
    );
    expect(r.map((x) => x.estado)).toEqual(["ya-estaba", "entra"]);
    expect(r[1]).toMatchObject({ codigoOcupado: true, identicas: [4] });
  });

  it("dentro del archivo: mismo código y permiso con otros datos choca; sin permiso contra con permiso choca; dos permisos no", () => {
    const distintos = decidirTrozasDelArchivo(
      [
        { fila: 4, codigo: "12", contratoId: "c1", firma: "tornillo|0.42" },
        { fila: 5, codigo: "12", contratoId: "c1", firma: "capirona|0.80" },
      ],
      [],
    );
    expect(distintos[1]).toMatchObject({ estado: "choca", con: { fila: 4 } });
    const mixto = decidirTrozasDelArchivo(
      [
        { fila: 4, codigo: "12", contratoId: "c1" },
        { fila: 5, codigo: "12", contratoId: null },
      ],
      [],
    );
    expect(mixto[1]).toMatchObject({ estado: "choca", con: { fila: 4, contratoId: "c1" } });
    const dos = decidirTrozasDelArchivo(
      [
        { fila: 4, codigo: "12", contratoId: "c1" },
        { fila: 5, codigo: "12", contratoId: "c2" },
      ],
      [],
    );
    expect(dos.map((x) => x.estado)).toEqual(["entra", "entra"]);
  });

  it("sin código entra siempre (no ocupa número)", () => {
    const r = decidirTrozasDelArchivo([{ fila: 1, codigo: null, contratoId: null }, { fila: 2, codigo: " ", contratoId: null }], [{ id: "t", codigo: null, contratoId: null }]);
    expect(r.map((x) => x.estado)).toEqual(["entra", "entra"]);
  });

  it("busquedaDeTroza: una / ninguna / varias (nunca la primera)", () => {
    expect(busquedaDeTroza([])).toEqual({ estado: "ninguna" });
    expect(busquedaDeTroza(["a"])).toEqual({ estado: "una", troza: "a" });
    expect(busquedaDeTroza(["a", "b"])).toEqual({ estado: "varias", trozas: ["a", "b"] });
  });
});
