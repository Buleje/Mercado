import { describe, it, expect } from "vitest";
import {
  filtrarGuias,
  guiasDeDespachos,
  numerosRepetidos,
  resumirGuias,
  type FilaDespachoGuia,
} from "@/lib/forestal/guias-emitidas";

/**
 * Guías de salida emitidas (ADR-321). Se derivan de los despachos, así que lo
 * que se prueba es que la derivación no invente documentos ni esconda los que
 * quedaron a medio llenar.
 */

const GTF_COMPLETA = {
  propietario: { nombre: "Aserradero QA SAC", docTipo: "RUC", docNumero: "20512345678", direccion: "Av. 1", esElCtp: true },
  destinatario: { nombre: "Maderera Lima SAC", docTipo: "RUC", docNumero: "20999999999", direccion: "Jr. 2, Lima" },
  transportista: { nombre: "Transportes Selva", docTipo: "RUC", docNumero: "20888888888", direccion: "Av. 3", registroMtc: "" },
  vehiculo: { placa: "A2C123", marca: "Volvo", tipo: "Camión", conductor: "Juan Pérez", conductorDni: "45678912", licencia: "Q45678912" },
  traslado: { puntoPartida: "Pucallpa", puntoLlegada: "Lima", ruta: "FB", fechaInicio: "2026-07-20", fechaFin: "2026-07-25" },
  titulos: ["PMF-01"],
  citesPermiso: "",
  observaciones: "",
};

const fila = (o: Partial<FilaDespachoGuia> = {}): FilaDespachoGuia => ({
  id: "d1",
  lineNo: 7,
  entryDate: "2026-07-20T00:00:00.000Z",
  gtfNumber: "GTF-001-000009",
  docType: "GTF",
  destino: "Lima",
  productType: "MADERA ASERRADA",
  speciesCommon: "Tornillo",
  quantity: 4,
  unit: "m3",
  status: "registrado",
  gtfDatos: GTF_COMPLETA,
  serforNumeroRegistro: null,
  serforVerificadoEn: null,
  ...o,
});

describe("derivar las guías de los despachos", () => {
  it("un despacho SIN número de guía no es una guía", () => {
    expect(guiasDeDespachos([fila({ gtfNumber: null }), fila({ gtfNumber: "  " })])).toEqual([]);
  });

  it("una guía con todos sus datos queda lista", () => {
    const [g] = guiasDeDespachos([fila()]);
    expect(g).toMatchObject({ estado: "completa", faltan: 0, destinatario: "Maderera Lima SAC", placa: "A2C123" });
  });

  it("cuenta lo que falta cuando la guía está a medio llenar", () => {
    const [g] = guiasDeDespachos([fila({ gtfDatos: {} })]);
    expect(g!.estado).toBe("incompleta");
    expect(g!.faltan).toBeGreaterThan(0);
  });

  it("una guía anulada NO se cuenta como incompleta", () => {
    // Mezclarlas haría perseguir un documento que ya no vale.
    const [g] = guiasDeDespachos([fila({ status: "anulado", gtfDatos: {} })]);
    expect(g!.estado).toBe("anulada");
    expect(g!.faltan).toBe(0);
  });

  it("marca verificada sólo con número Y fecha de verificación", () => {
    const conAmbos = guiasDeDespachos([
      fila({ serforNumeroRegistro: "123", serforVerificadoEn: "2026-07-21T00:00:00.000Z" }),
    ]);
    expect(conAmbos[0]!.verificada).toBe(true);
    // Un número sin fecha no dice si sigue vigente: no alcanza.
    expect(guiasDeDespachos([fila({ serforNumeroRegistro: "123" })])[0]!.verificada).toBe(false);
  });

  it("ordena de la más reciente a la más vieja", () => {
    const g = guiasDeDespachos([
      fila({ id: "vieja", entryDate: "2026-06-01T00:00:00.000Z" }),
      fila({ id: "nueva", entryDate: "2026-07-28T00:00:00.000Z" }),
    ]);
    expect(g.map((x) => x.despachoId)).toEqual(["nueva", "vieja"]);
  });
});

describe("resumen", () => {
  it("separa completas, incompletas y anuladas", () => {
    const r = resumirGuias(
      guiasDeDespachos([
        fila({ id: "a" }),
        fila({ id: "b", gtfDatos: {} }),
        fila({ id: "c", status: "anulado" }),
      ]),
    );
    expect(r).toMatchObject({ total: 3, completas: 1, incompletas: 1, anuladas: 1 });
  });

  it("las anuladas no cuentan como sin verificar", () => {
    const r = resumirGuias(guiasDeDespachos([fila({ status: "anulado" })]));
    expect(r.sinVerificar).toBe(0);
  });
});

describe("búsqueda y duplicados", () => {
  it("busca por número, destino, destinatario o placa, sin tildes", () => {
    const guias = guiasDeDespachos([fila({ destino: "Callería" })]);
    expect(filtrarGuias(guias, "calleria")).toHaveLength(1);
    expect(filtrarGuias(guias, "a2c")).toHaveLength(1);
    expect(filtrarGuias(guias, "lima sac")).toHaveLength(1);
    expect(filtrarGuias(guias, "nada")).toHaveLength(0);
  });

  it("detecta el mismo número en dos despachos vigentes", () => {
    const guias = guiasDeDespachos([fila({ id: "a" }), fila({ id: "b" })]);
    expect(numerosRepetidos(guias)).toEqual(["GTF-001-000009"]);
  });

  it("una anulada más una vigente con el mismo número NO es duplicado", () => {
    const guias = guiasDeDespachos([fila({ id: "a" }), fila({ id: "b", status: "anulado" })]);
    expect(numerosRepetidos(guias)).toEqual([]);
  });
});
