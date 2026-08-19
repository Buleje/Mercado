import { describe, expect, it } from "vitest";
import {
  DIAS_PATIO_ANEJO,
  diasEnPatio,
  estaLibreEnPatio,
  filtrarPatio,
  libresDelPatio,
  opcionesDePatio,
  resumenPatio,
} from "@/lib/forestal/patio-resumen";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const AHORA = new Date("2026-08-06T12:00:00.000Z");

function troza(over: Partial<TrozaConsumible> = {}): TrozaConsumible {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    woodEntryId: "w1",
    codificacion: "C-1",
    especieComun: "Capirona",
    volumenM3: 1,
    ...over,
  };
}

describe("estaLibreEnPatio — el criterio que comparten Lotes y Consumos", () => {
  it("la madera de una guía que sigue en la bandeja NO está libre", () => {
    // El bug real: Lotes contaba 47 libres y el picker ofrecía 30. Las 17 de
    // diferencia eran piezas de guías sin recepcionar (ADR-339).
    expect(estaLibreEnPatio(troza({ guiaRecepcionada: false }))).toBe(false);
    expect(estaLibreEnPatio(troza({ guiaRecepcionada: true }))).toBe(true);
    // Sin el dato, la pieza cuenta: los ingresos viejos no lo traen.
    expect(estaLibreEnPatio(troza({ guiaRecepcionada: undefined }))).toBe(true);
  });

  it("tampoco la consumida, la apartada en un lote ni la bloqueada", () => {
    expect(estaLibreEnPatio(troza({ consumidaEnId: "c1" }))).toBe(false);
    expect(estaLibreEnPatio(troza({ loteAserrioId: "L1" }))).toBe(false);
    expect(estaLibreEnPatio(troza({ retrozos: 2 }))).toBe(false);
    expect(estaLibreEnPatio(troza({ volumenM3: null }))).toBe(false);
  });

  it("el conteo de la vista Lotes coincide con el `libres` del resumen del patio", () => {
    const pila = [
      troza({ id: "a" }),
      troza({ id: "b", guiaRecepcionada: false }),
      troza({ id: "c", loteAserrioId: "L1" }),
      troza({ id: "d", descarte: true }),
      troza({ id: "e" }),
    ];
    // La vista de Lotes recibe la pila entera; la de Consumos ya la acota a las
    // recepcionadas y sin consumir. Las dos tienen que decir el mismo número.
    const delPatio = pila.filter((t) => t.guiaRecepcionada !== false && !t.consumidaEnId);
    expect(libresDelPatio(pila).length).toBe(resumenPatio(delPatio, AHORA).libres);
    expect(libresDelPatio(pila).length).toBe(2);
  });

  /**
   * El bug de la pestaña Producción (2026-08-06): al elegir un lote con sus
   * piezas ya apartadas, la cabecera decía «6 pza · 23.9220 m³ a consumir» y la
   * tabla debajo «Ninguna troza coincide con el filtro». «Libre» es relativo al
   * lote que se está cargando.
   */
  it("una pieza apartada en EL lote que se carga está disponible para ÉL", () => {
    const t = troza({ loteAserrioId: "LA-3" });
    expect(estaLibreEnPatio(t)).toBe(false);
    expect(estaLibreEnPatio(t, { loteId: "LA-3" })).toBe(true);
    // …pero no para otro lote: esa madera ya tiene dueño.
    expect(estaLibreEnPatio(t, { loteId: "LA-9" })).toBe(false);
  });

  it("el contexto del lote no salta los otros bloqueos", () => {
    const opts = { loteId: "LA-3" };
    expect(estaLibreEnPatio(troza({ loteAserrioId: "LA-3", consumidaEnId: "c1" }), opts)).toBe(false);
    expect(estaLibreEnPatio(troza({ loteAserrioId: "LA-3", guiaRecepcionada: false }), opts)).toBe(false);
    expect(estaLibreEnPatio(troza({ loteAserrioId: "LA-3", retrozos: 2 }), opts)).toBe(false);
    expect(estaLibreEnPatio(troza({ loteAserrioId: "LA-3", volumenM3: null }), opts)).toBe(false);
  });

  it("`libresDelPatio` con lote suma las apartadas de ese lote y sólo de ese", () => {
    const pila = [
      troza({ id: "a" }),
      troza({ id: "b", loteAserrioId: "LA-3" }),
      troza({ id: "c", loteAserrioId: "LA-9" }),
    ];
    expect(libresDelPatio(pila).map((t) => t.id)).toEqual(["a"]);
    expect(libresDelPatio(pila, { loteId: "LA-3" }).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("resumenPatio", () => {
  it("separa libres, apartadas y bloqueadas", () => {
    const r = resumenPatio(
      [
        troza({ id: "a" }),
        troza({ id: "b", loteAserrioId: "L1" }),
        troza({ id: "c", descarte: true }),
        troza({ id: "d", volumenM3: 0 }), // sin volumen = bloqueada
      ],
      AHORA,
    );
    expect(r.piezas).toBe(4);
    expect(r.libres).toBe(1);
    expect(r.apartadas).toBe(1);
    expect(r.bloqueadas).toBe(2);
  });

  it("el volumen libre es sólo el de lo que se puede mandar hoy a la sierra", () => {
    const r = resumenPatio(
      [troza({ volumenM3: 2 }), troza({ volumenM3: 3, loteAserrioId: "L1" })],
      AHORA,
    );
    expect(r.volumenM3).toBe(5);
    expect(r.volumenLibreM3).toBe(2);
  });

  it("el pie tablar sale del volumen total y el promedio de todas las piezas", () => {
    const r = resumenPatio([troza({ volumenM3: 1 }), troza({ volumenM3: 2 })], AHORA);
    expect(r.pieTablar).toBe(Math.round(3 * 423.78));
    expect(r.promedioM3).toBe(1.5);
    expect(r.mayorM3).toBe(2);
  });

  it("ordena las especies por volumen y reparte el porcentaje sobre el volumen", () => {
    const r = resumenPatio(
      [
        troza({ especieComun: "Bolaina", volumenM3: 0.5 }),
        troza({ especieComun: "Bolaina", volumenM3: 0.5 }),
        troza({ especieComun: "Shihuahuaco", volumenM3: 3 }),
      ],
      AHORA,
    );
    expect(r.especies).toBe(2);
    expect(r.porEspecie[0]).toMatchObject({ especie: "Shihuahuaco", piezas: 1, volumenM3: 3, pctVolumen: 75 });
    expect(r.porEspecie[1]).toMatchObject({ especie: "Bolaina", piezas: 2, pctVolumen: 25 });
  });

  it("cuenta guías, permisos y proveedores distintos ignorando los vacíos", () => {
    const r = resumenPatio(
      [
        troza({ gtfNumber: "001-1", permiso: "P-1", proveedor: "Juan" }),
        troza({ gtfNumber: "001-1", permiso: "P-2", proveedor: "  " }),
        troza({ gtfNumber: null, permiso: null, proveedor: null }),
      ],
      AHORA,
    );
    expect(r.guias).toBe(1);
    expect(r.permisos).toBe(2);
    expect(r.proveedores).toBe(1);
  });

  it("la espera sale de la recepción, y el asiento es el respaldo", () => {
    const conRecepcion = troza({
      fechaRecepcion: "2026-08-01T00:00:00.000Z",
      fechaIngreso: "2026-01-01T00:00:00.000Z",
    });
    expect(diasEnPatio(conRecepcion, AHORA)).toBe(5);

    const soloAsiento = troza({ fechaRecepcion: null, fechaIngreso: "2026-08-04T00:00:00.000Z" });
    expect(diasEnPatio(soloAsiento, AHORA)).toBe(2);

    expect(diasEnPatio(troza({ fechaRecepcion: null, fechaIngreso: null }), AHORA)).toBeNull();
    expect(diasEnPatio(troza({ fechaRecepcion: "no-es-fecha" }), AHORA)).toBeNull();
  });

  it("una fecha futura no da días negativos", () => {
    expect(diasEnPatio(troza({ fechaRecepcion: "2026-12-01T00:00:00.000Z" }), AHORA)).toBe(0);
  });

  it("cuenta las añejas con el umbral del negocio, no del float", () => {
    const justo = new Date(AHORA.getTime() - DIAS_PATIO_ANEJO * 86_400_000).toISOString();
    const antes = new Date(AHORA.getTime() - (DIAS_PATIO_ANEJO - 1) * 86_400_000).toISOString();
    const r = resumenPatio(
      [troza({ fechaRecepcion: justo }), troza({ fechaRecepcion: antes })],
      AHORA,
    );
    expect(r.anejas).toBe(1);
    expect(r.esperaMaxDias).toBe(DIAS_PATIO_ANEJO);
  });

  it("un patio vacío no inventa promedios", () => {
    const r = resumenPatio([], AHORA);
    expect(r).toMatchObject({
      piezas: 0,
      volumenM3: 0,
      promedioM3: null,
      mayorM3: null,
      esperaMaxDias: null,
      anejas: 0,
    });
    expect(r.porEspecie).toEqual([]);
  });
});

describe("filtrarPatio / opcionesDePatio", () => {
  const pila = [
    troza({ id: "a", especieComun: "Capirona", gtfNumber: "001-1", permiso: "P-1", resolucion: "R-1", proveedor: "Juan", codigoPlanta: "CP-01" }),
    troza({ id: "b", especieComun: "Tornillo", gtfNumber: "001-2", permiso: "P-2", resolucion: null, proveedor: "Ana", codificacion: "T-99" }),
    troza({ id: "c", especieComun: "Capirona", gtfNumber: "001-2", permiso: "P-1", resolucion: "R-1", proveedor: "Ana" }),
  ];

  it("filtra por cada campo y combina", () => {
    expect(filtrarPatio(pila, { especie: "Capirona" }).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filtrarPatio(pila, { guia: "001-2" }).map((t) => t.id)).toEqual(["b", "c"]);
    expect(filtrarPatio(pila, { permiso: "P-1", proveedor: "Ana" }).map((t) => t.id)).toEqual(["c"]);
    expect(filtrarPatio(pila, { resolucion: "R-1" }).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("el texto busca sin tildes ni mayúsculas y por los dos códigos", () => {
    expect(filtrarPatio(pila, { texto: "capirona" }).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filtrarPatio(pila, { texto: "CP-01" }).map((t) => t.id)).toEqual(["a"]);
    expect(filtrarPatio(pila, { texto: "t-99" }).map((t) => t.id)).toEqual(["b"]);
    expect(filtrarPatio(pila, { texto: "  " }).length).toBe(3);
  });

  it("las opciones salen de la pila entera, ordenadas y sin vacíos", () => {
    const o = opcionesDePatio(pila);
    expect(o.especies).toEqual(["Capirona", "Tornillo"]);
    expect(o.guias).toEqual(["001-1", "001-2"]);
    expect(o.permisos).toEqual(["P-1", "P-2"]);
    expect(o.resoluciones).toEqual(["R-1"]);
    expect(o.proveedores).toEqual(["Ana", "Juan"]);
  });
});
