/**
 * Especies del plan por bloque o zona (Brandon 24-10): «en un bloque puede haber
 * 30 árboles con su sup ha, su volumen y especie, y en el bloque dos esa misma
 * especie con diferente cantidad de árboles».
 *
 * Lo que se registra sigue siendo UNA especie por fila (la base del saldo,
 * ADR-459): la suma de todos los bloques. El reparto es el detalle.
 */
import { describe, it, expect } from "vitest";
import { textoDescuadre } from "@/components/admin/forestal/LothPlantacionBloques";
import {
  bloquesDelPlanSchema,
  cuadreConElRegistro,
  juntarPorEspecie,
  subtotalDelBloque,
  type BloqueDelPlan,
  type EspecieDelBloque,
} from "@/lib/forestal/loth-plan-bloques";
import {
  agregarBloque,
  bloqueNuevo,
  bloquesConNombreRepetido,
  bloquesParaGuardar,
  conFilasDelBloque,
  edicionDesdeRegistro,
  edicionDesdeReparto,
  especiesDeLosBloques,
  filasDelBloque,
  juntarEnUnaLista,
  partirEnBloques,
  problemaDeLosBloques,
  quitarBloque,
  subtotalDeLasFilas,
} from "@/components/admin/forestal/loth-plan-bloques-filas";
import { filaVacia, type FilaEspecie } from "@/components/admin/forestal/loth-plan-especies-api";
import { estadoDelPaso, pasosDelPlan, pasoVisible, vecinosDelPaso, PASO_DEL_ESENCIAL } from "@/lib/forestal/loth-plan-pasos";
import type { Esencial } from "@/lib/forestal/loth-plan-esenciales";

const esp = (speciesCommon: string, volumenM3: number, extra: Partial<EspecieDelBloque> = {}): EspecieDelBloque => ({
  speciesCommon,
  speciesScientific: null,
  cites: false,
  volumenM3,
  arboles: null,
  superficieHa: null,
  anioInstalacion: null,
  precioVentaSoles: null,
  ...extra,
});

const fila = (speciesCommon: string, volumenM3: string, extra: Partial<FilaEspecie> = {}): FilaEspecie => ({
  ...filaVacia(),
  speciesCommon,
  volumenM3,
  ...extra,
});

/** El ejemplo de Brandon: Bolaina en dos bloques con distintos árboles; Capirona sólo en el 2. */
const DOS_BLOQUES: BloqueDelPlan[] = [
  { nombre: "Bloque 1", especies: [esp("Bolaina", 12, { arboles: 30, superficieHa: 2.5, anioInstalacion: 2018, precioVentaSoles: 100 })] },
  {
    nombre: "Bloque 2",
    especies: [
      esp("bolaina ", 7.5, { arboles: 18, superficieHa: 1.5, anioInstalacion: 2016, precioVentaSoles: 200, speciesScientific: "Guazuma crinita" }),
      esp("Capirona", 4, { cites: true }),
    ],
  },
];

describe("juntarPorEspecie: lo que se registra es la suma de los bloques", () => {
  it("una fila por especie: m³, árboles y ha suman; el año es el más antiguo; el precio, pesado por m³", () => {
    const [bolaina, capirona] = juntarPorEspecie(DOS_BLOQUES);
    expect(bolaina).toEqual({
      speciesCommon: "Bolaina",
      speciesScientific: "Guazuma crinita",
      cites: false,
      volumenAutorizadoM3: 19.5,
      arbolesAutorizados: 48,
      anioInstalacion: 2016,
      superficieHa: 4,
      // (100·12 + 200·7,5) / 19,5 = 138,46
      precioVentaSoles: 138.46,
      bloques: 2,
    });
    expect(capirona).toMatchObject({ speciesCommon: "Capirona", cites: true, volumenAutorizadoM3: 4, bloques: 1 });
  });

  it("sin dato no es cero: si ningún bloque dice los árboles o las ha, queda null", () => {
    const [c] = juntarPorEspecie([{ nombre: "A", especies: [esp("Capirona", 4)] }, { nombre: "B", especies: [esp("Capirona", 1)] }]);
    expect(c.arbolesAutorizados).toBeNull();
    expect(c.superficieHa).toBeNull();
    expect(c.precioVentaSoles).toBeNull();
    expect(c.volumenAutorizadoM3).toBe(5);
  });

  it("el subtotal de un bloque: m³, árboles y ha de sus especies", () => {
    expect(subtotalDelBloque(DOS_BLOQUES[1]!)).toEqual({ especies: 2, m3: 11.5, arboles: 18, ha: 1.5 });
  });
});

describe("bloquesDelPlanSchema", () => {
  it("acepta el reparto y el vacío (= quitar el reparto)", () => {
    expect(bloquesDelPlanSchema.safeParse(DOS_BLOQUES).success).toBe(true);
    expect(bloquesDelPlanSchema.safeParse([]).success).toBe(true);
  });

  it("dos bloques con el mismo nombre no entran (sin importar mayúsculas)", () => {
    const r = bloquesDelPlanSchema.safeParse([DOS_BLOQUES[0], { ...DOS_BLOQUES[1], nombre: " bloque 1" }]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/está dos veces/);
  });

  it("la misma especie dos veces en el MISMO bloque no entra; en dos bloques distintos, sí", () => {
    const r = bloquesDelPlanSchema.safeParse([{ nombre: "A", especies: [esp("Bolaina", 1), esp("BOLAINA", 2)] }]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/bolaina está dos veces en «A»/i);
  });

  it("un bloque sin especies, m³ en cero o un campo de más no entran", () => {
    expect(bloquesDelPlanSchema.safeParse([{ nombre: "A", especies: [] }]).success).toBe(false);
    expect(bloquesDelPlanSchema.safeParse([{ nombre: "A", especies: [esp("Bolaina", 0)] }]).success).toBe(false);
    expect(bloquesDelPlanSchema.safeParse([{ nombre: "A", especies: [{ ...esp("Bolaina", 1), saldo: 9 }] }]).success).toBe(false);
  });
});

describe("cuadreConElRegistro", () => {
  const registro = [
    { speciesCommon: "Bolaina", volumenAutorizadoM3: "19.5000", arbolesAutorizados: 48 },
    { speciesCommon: "Capirona", volumenAutorizadoM3: 4, arbolesAutorizados: null },
  ];

  it("cuadra: nada que avisar (los Decimal llegan en texto)", () => {
    expect(cuadreConElRegistro(DOS_BLOQUES, registro)).toEqual([]);
  });

  it("sin reparto no hay nada que cuadrar", () => {
    expect(cuadreConElRegistro([], registro)).toEqual([]);
  });

  it("la tolerancia es el último decimal del m³ (0,0005), no el epsilon del float", () => {
    const casi = [{ ...registro[0]!, volumenAutorizadoM3: "19.5004" }, registro[1]!];
    expect(cuadreConElRegistro(DOS_BLOQUES, casi)).toEqual([]);
    const no = [{ ...registro[0]!, volumenAutorizadoM3: "20" }, registro[1]!];
    expect(cuadreConElRegistro(DOS_BLOQUES, no)).toEqual([
      expect.objectContaining({ especie: "Bolaina", enBloques: 19.5, registrado: 20, diferenciaM3: -0.5 }),
    ]);
  });

  it("avisa la especie que está en un solo lado y los árboles que no coinciden", () => {
    const r = cuadreConElRegistro(DOS_BLOQUES, [
      { speciesCommon: "Bolaina", volumenAutorizadoM3: 19.5, arbolesAutorizados: 50 },
      { speciesCommon: "Shihuahuaco", volumenAutorizadoM3: 3, arbolesAutorizados: null },
    ]);
    expect(r.map((d) => [d.especie, d.enBloques, d.registrado])).toEqual([
      ["Bolaina", 19.5, 19.5],
      ["Capirona", 4, null],
      ["Shihuahuaco", 0, 3],
    ]);
    expect(r[0]).toMatchObject({ arbolesEnBloques: 48, arbolesRegistrados: 50 });
  });

  it("el aviso dice sólo lo que no cuadra (QA 24-10: «19,500 m³ y 19,500 m³» tapaba los árboles)", () => {
    const [soloArboles] = cuadreConElRegistro(DOS_BLOQUES, [
      { speciesCommon: "Bolaina", volumenAutorizadoM3: 19.5, arbolesAutorizados: 50 },
      registro[1]!,
    ]);
    expect(textoDescuadre(soloArboles!)).toBe("Bolaina: 48 árboles en los bloques y 50 registrados");
    const [ambos] = cuadreConElRegistro(DOS_BLOQUES, [
      { speciesCommon: "Bolaina", volumenAutorizadoM3: 20, arbolesAutorizados: 50 },
      registro[1]!,
    ]);
    expect(textoDescuadre(ambos!)).toMatch(/^Bolaina: 19[.,]500 m³ en los bloques y 20[.,]000 m³ registrados · 48 árboles en los bloques y 50 registrados$/);
  });
});

describe("las filas del alta repartidas por bloque", () => {
  it("«Por bloques o zonas»: lo escrito va al Bloque 1 y se abre el Bloque 2 vacío", () => {
    const { bloques, filas } = partirEnBloques([fila("Bolaina", "12"), filaVacia()]);
    expect(bloques).toHaveLength(2);
    expect(filasDelBloque(filas, bloques, bloques[0]!.uid).map((f) => f.speciesCommon)).toEqual(["Bolaina"]);
    expect(filasDelBloque(filas, bloques, bloques[1]!.uid)).toHaveLength(1);
    expect(filasDelBloque(filas, bloques, bloques[1]!.uid)[0]!.speciesCommon).toBe("");
  });

  it("una fila sin bloque (la que agrega la constancia) cae en el primero", () => {
    const b = [bloqueNuevo(), bloqueNuevo()];
    const filas = [fila("Bolaina", "1", { bloque: b[1]!.uid }), fila("Capirona", "2")];
    expect(filasDelBloque(filas, b, b[0]!.uid).map((f) => f.speciesCommon)).toEqual(["Capirona"]);
  });

  it("cambiar las filas de un bloque no toca las del otro", () => {
    const b = [bloqueNuevo(), bloqueNuevo()];
    const filas = [fila("Bolaina", "1", { bloque: b[0]!.uid }), fila("Capirona", "2", { bloque: b[1]!.uid })];
    const nuevas = conFilasDelBloque(filas, b, b[1]!.uid, [fila("Capirona", "3"), fila("Bolaina", "4")]);
    expect(filasDelBloque(nuevas, b, b[0]!.uid).map((f) => [f.speciesCommon, f.volumenM3])).toEqual([["Bolaina", "1"]]);
    expect(filasDelBloque(nuevas, b, b[1]!.uid).map((f) => [f.speciesCommon, f.volumenM3])).toEqual([["Capirona", "3"], ["Bolaina", "4"]]);
  });

  it("agregar y quitar bloques: quitar el último vuelve a la lista simple", () => {
    const uno = bloqueNuevo();
    const r = agregarBloque([fila("Bolaina", "1", { bloque: uno.uid })], [uno]);
    expect(r.bloques.map((b) => b.uid)).toEqual([uno.uid, r.nuevo.uid]);
    const sinUno = quitarBloque(r.filas, r.bloques, uno.uid);
    expect(sinUno.bloques?.map((b) => b.uid)).toEqual([r.nuevo.uid]);
    expect(sinUno.filas.map((f) => f.speciesCommon)).toEqual([""]);
    const nada = quitarBloque(sinUno.filas, sinUno.bloques!, r.nuevo.uid);
    expect(nada.bloques).toBeNull();
    expect(nada.filas).toHaveLength(1);
  });

  it("«Sin bloques»: todas las filas escritas en una lista, sin su bloque", () => {
    const b = [bloqueNuevo(), bloqueNuevo()];
    const lista = juntarEnUnaLista([fila("Bolaina", "1", { bloque: b[0]!.uid }), { ...filaVacia(), bloque: b[1]!.uid }, fila("Capirona", "2", { bloque: b[1]!.uid })]);
    expect(lista.map((f) => [f.speciesCommon, f.bloque])).toEqual([["Bolaina", undefined], ["Capirona", undefined]]);
  });

  it("lo que se guarda: sólo filas escritas, «Bloque N» si no tiene nombre, y la suma por especie para el POST", () => {
    const b = [bloqueNuevo(""), bloqueNuevo("Zona alta"), bloqueNuevo("Vacío")];
    const filas = [
      fila("Bolaina", "12", { arboles: "30", superficieHa: "2.5", bloque: b[0]!.uid }),
      fila("Bolaina", "7,5", { arboles: "18", superficieHa: "1.5", bloque: b[1]!.uid }),
      { ...filaVacia(), bloque: b[1]!.uid },
      { ...filaVacia(), bloque: b[2]!.uid },
    ];
    const guardables = bloquesParaGuardar(filas, b);
    expect(guardables.map((x) => [x.nombre, x.especies.length])).toEqual([["Bloque 1", 1], ["Zona alta", 1]]);
    expect(guardables[1]!.especies[0]).toMatchObject({ speciesCommon: "Bolaina", volumenM3: 7.5, arboles: 18, superficieHa: 1.5 });
    expect(bloquesDelPlanSchema.safeParse(guardables).success).toBe(true);
    expect(especiesDeLosBloques(filas, b)).toEqual([
      expect.objectContaining({ speciesCommon: "Bolaina", volumenAutorizadoM3: 19.5, arbolesAutorizados: 48, superficieHa: 4 }),
    ]);
    expect(especiesDeLosBloques(filas, b)[0]).not.toHaveProperty("bloques");
    expect(subtotalDeLasFilas(filasDelBloque(filas, b, b[1]!.uid))).toEqual({ especies: 1, m3: 7.5, arboles: 18, ha: 1.5 });
  });

  it("problemas en palabras: nombre repetido (también contra el «Bloque N» por omisión) y especie dos veces en un bloque", () => {
    const b = [bloqueNuevo(""), bloqueNuevo("bloque 1")];
    expect(bloquesConNombreRepetido(b)).toEqual(new Set([b[0]!.uid, b[1]!.uid]));
    expect(problemaDeLosBloques([], b)).toMatch(/Hay dos bloques que se llaman «Bloque 1»/);

    const c = [bloqueNuevo("A"), bloqueNuevo("B")];
    const enDos = [fila("Bolaina", "1", { bloque: c[0]!.uid }), fila("Bolaina", "2", { bloque: c[1]!.uid })];
    expect(problemaDeLosBloques(enDos, c)).toBeNull();
    const enUno = [...enDos, fila("bolaina", "3", { bloque: c[1]!.uid })];
    expect(problemaDeLosBloques(enUno, c)).toMatch(/está dos veces en «B»/);
  });
});

describe("desde lo guardado (Registro y saldo)", () => {
  it("el reparto guardado vuelve a filas por bloque y se guarda igual (ida y vuelta)", () => {
    const { bloques, filas } = edicionDesdeReparto(DOS_BLOQUES);
    expect(bloques.map((b) => b.nombre)).toEqual(["Bloque 1", "Bloque 2"]);
    const vuelta = bloquesParaGuardar(filas, bloques);
    expect(juntarPorEspecie(vuelta)).toEqual(juntarPorEspecie(DOS_BLOQUES));
  });

  it("sin reparto: lo registrado entra entero al Bloque 1 (la suma arranca cuadrando)", () => {
    const registradas = [
      { id: "s1", speciesCommon: "Bolaina", speciesScientific: null, cites: false, volumenAutorizadoM3: "19.5", arbolesAutorizados: 48, superficieHa: "4", precioVentaSoles: null },
    ];
    const { bloques, filas } = edicionDesdeRegistro(registradas);
    expect(bloques).toHaveLength(1);
    const guardables = bloquesParaGuardar(filas, bloques);
    expect(cuadreConElRegistro(guardables, [{ speciesCommon: "Bolaina", volumenAutorizadoM3: "19.5", arbolesAutorizados: 48 }])).toEqual([]);
    expect(edicionDesdeRegistro([]).filas).toHaveLength(1);
  });
});

describe("los pasos del alta", () => {
  const esencial = (campo: Esencial["campo"], lleno: boolean) => ({ campo, lleno }) as Esencial;

  it("las especies sólo en una plantación; los rótulos hablan de su documento", () => {
    expect(pasosDelPlan(true).map((p) => p.id)).toEqual(["tipo", "documento", "especies", "titular", "area", "mas", "archivos"]);
    expect(pasosDelPlan(false).map((p) => p.corto)).toEqual(["Tipo", "Documento", "Titular y regente", "Dónde y vigencia", "Costeo y más", "Archivos"]);
  });

  it("cada esencial vive en un paso que existe", () => {
    const ids = new Set(pasosDelPlan(true).map((p) => p.id));
    for (const paso of Object.values(PASO_DEL_ESENCIAL)) expect(ids.has(paso)).toBe(true);
  });

  it("estado: completo, pendiente antes de intentar, falta después, opcional si no tiene esenciales", () => {
    const es = [esencial("titularName", true), esencial("regenteName", false), esencial("planNumber", true)];
    expect(estadoDelPaso("tipo", es, false)).toBe("completo");
    expect(estadoDelPaso("documento", es, false)).toBe("completo");
    expect(estadoDelPaso("titular", es, false)).toBe("pendiente");
    expect(estadoDelPaso("titular", es, true)).toBe("falta");
    expect(estadoDelPaso("mas", es, true)).toBe("opcional");
  });

  it("vecinos y paso visible (de plantación a PO estando en Especies → Titular)", () => {
    const pasos = pasosDelPlan(true);
    expect(vecinosDelPaso(pasos, "tipo")).toEqual({ anterior: null, siguiente: pasos[1] });
    expect(vecinosDelPaso(pasos, "archivos").siguiente).toBeNull();
    expect(pasoVisible(pasosDelPlan(false), "especies")).toBe("titular");
    expect(pasoVisible(pasos, "especies")).toBe("especies");
  });
});
