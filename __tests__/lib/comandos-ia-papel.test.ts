import { describe, expect, it } from "vitest";
import {
  camposConReglas,
  candidatosDeCobro,
  detectarTipo,
  emparejar,
  extraerItemsFactura,
  extraerListaPrecios,
  extraerNumeroComprobante,
  extraerProveedor,
  extraerProveedorLista,
  extraerRuc,
  extraerTotal,
  extraerYape,
  faltaIA,
  jsonDeRespuesta,
  pagadorSugerido,
  parsearMonto,
  puedeGuardar,
  puntajeNombre,
  quitarDatosPersonales,
  RespuestaIASchema,
} from "@/lib/admin/comandos-ia/papel";

const FACTURA = `DISTRIBUIDORA UCAYALI S.A.C.
RUC: 20601234567
Jr. Tarapacá 123 - Pucallpa
FACTURA ELECTRÓNICA
F001-00004567
Fecha de emisión: 09/10/2026
Cant. Descripción P.Unit Importe
2 Arroz Costeño Extra 5kg 18.50 37.00
5 Azucar Rubia Cartavio 1kg 3.70 18.50
OP. GRAVADA S/ 47.03
IGV 18% S/ 8.47
IMPORTE TOTAL S/ 55.50`;

const YAPE = `¡Yapeaste!
S/ 25.00
Bodega San Martín
09 oct. 2026 | 10:42 a.m.
Nro. de celular *** *** 455
Nro. de operación 03456789`;

const LISTA = `LISTA DE PRECIOS - Distribuidora Ucayali
Arroz Costeño Extra 5kg ...... S/ 18.90
Aceite Primor Premium 1L       9,20
Sal Emsal Yodada 1kg  1.15`;

describe("parsearMonto", () => {
  it("lee los formatos que llegan del papel", () => {
    expect(parsearMonto("S/ 25")).toBe(25);
    expect(parsearMonto("1,234.50")).toBe(1234.5);
    expect(parsearMonto("1.234,50")).toBe(1234.5);
    expect(parsearMonto("3,50")).toBe(3.5);
    expect(parsearMonto("1,234")).toBe(1234);
    expect(parsearMonto("sin cifras")).toBeNull();
  });
});

describe("factura por reglas", () => {
  it("se reconoce por la palabra FACTURA y el RUC", () => {
    const d = detectarTipo(FACTURA);
    expect(d.tipo).toBe("factura");
    expect(d.confianza).toBeGreaterThanOrEqual(0.8);
  });

  it("saca RUC, número, total, proveedor e ítems", () => {
    expect(extraerRuc(FACTURA)).toBe("20601234567");
    expect(extraerNumeroComprobante(FACTURA)).toBe("F001-00004567");
    expect(extraerTotal(FACTURA)).toBe(55.5);
    expect(extraerProveedor(FACTURA)).toBe("DISTRIBUIDORA UCAYALI S.A.C.");
    expect(extraerItemsFactura(FACTURA)).toEqual([
      { nombre: "Arroz Costeño Extra 5kg", cantidad: 2, costoUnitario: 18.5 },
      { nombre: "Azucar Rubia Cartavio 1kg", cantidad: 5, costoUnitario: 3.7 },
    ]);
    expect(faltaIA("factura", camposConReglas("factura", FACTURA))).toBe(false);
  });

  it("con sólo el importe, el unitario sale de dividir", () => {
    expect(extraerItemsFactura("3 Fideos Don Vittorio 8.40")).toEqual([
      { nombre: "Fideos Don Vittorio", cantidad: 3, costoUnitario: 2.8 },
    ]);
  });

  it("un RUC que no empieza como RUC no es RUC", () => {
    expect(extraerRuc("Operación 12345678901")).toBeNull();
    expect(extraerRuc("RUC 10 4567 8901 2")).toBe("10456789012");
  });

  it("una factura pagada con Yape sigue siendo factura", () => {
    expect(detectarTipo(`${FACTURA}\nPagado con Yape`).tipo).toBe("factura");
  });
});

describe("Yape / Plin por reglas", () => {
  it("se reconoce por «Yapeaste» y el N.º de operación", () => {
    const d = detectarTipo(YAPE);
    expect(d.tipo).toBe("yape");
    expect(d.confianza).toBeGreaterThanOrEqual(0.9);
  });

  it("saca monto, nombre, operación y el final del celular", () => {
    expect(extraerYape(YAPE)).toEqual({
      monto: 25,
      nombre: "Bodega San Martín",
      operacion: "03456789",
      fecha: null,
      finCelular: "455",
    });
  });

  it("«X te yapeó» deja el nombre de quien pagó", () => {
    const y = extraerYape("Rosa Pérez te yapeó\nS/ 45.50\nN° de operación: 99887766");
    expect(y.nombre).toBe("Rosa Pérez");
    expect(y.monto).toBe(45.5);
    expect(detectarTipo("Plin exitoso\nS/ 30.00\nCódigo de operación 112233").tipo).toBe("yape");
  });
});

describe("lista de precios por reglas", () => {
  it("se reconoce y saca nombre + costo por fila", () => {
    expect(detectarTipo(LISTA).tipo).toBe("lista-precios");
    expect(extraerListaPrecios(LISTA)).toEqual([
      { nombre: "Arroz Costeño Extra 5kg", costo: 18.9 },
      { nombre: "Aceite Primor Premium 1L", costo: 9.2 },
      { nombre: "Sal Emsal Yodada 1kg", costo: 1.15 },
    ]);
  });

  it("el proveedor sale de la cabecera, no de una fila con precio", () => {
    expect(extraerProveedorLista(LISTA)).toBe("Distribuidora Ucayali");
  });

  it("un texto suelto no decide: va a la IA", () => {
    expect(detectarTipo("Reunión con el contador el jueves").tipo).toBeNull();
  });
});

describe("datos personales fuera de la IA", () => {
  it("quita celular, RUC y DNI pero deja la serie del comprobante", () => {
    const t = quitarDatosPersonales("Cel 987 654 321 · RUC 10456789012 · DNI 45678901 · F001-00004567");
    expect(t).not.toMatch(/987|10456789012|45678901/);
    expect(t).toContain("F001-00004567");
  });
});

describe("emparejar con el catálogo", () => {
  const catalogo = [
    { id: 1, nombre: "Arroz Costeño Extra 5kg" },
    { id: 2, nombre: "Azúcar Rubia Cartavio 1kg" },
    { id: 3, nombre: "Aceite Primor Premium 1L" },
  ];

  it("tolera mayúsculas, tildes y errores de OCR", () => {
    expect(puntajeNombre("ARROZ COSTENO EXTRA 5 KG", "Arroz Costeño Extra 5kg")).toBe(1);
    expect(emparejar("Azucar Rubla Cartavio 1kg", catalogo)[0].id).toBe(2);
    expect(emparejar("Aceite Primor 1 lt", catalogo)[0].id).toBe(3);
  });

  it("no inventa: un nombre ajeno no empareja", () => {
    expect(emparejar("Detergente Opal 900g", catalogo)).toEqual([]);
  });
});

describe("respuesta de la IA", () => {
  it("toma el JSON aunque venga envuelto y descarta lo que no valida", () => {
    const crudo = jsonDeRespuesta('```json\n{"tipo":"carta","items":"x","total":"12.5","titulo":"Aviso de corte"}\n```');
    const r = RespuestaIASchema.safeParse(crudo);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tipo).toBe("otro");
      expect(r.data.items).toEqual([]);
      expect(r.data.total).toBe(12.5);
      expect(r.data.titulo).toBe("Aviso de corte");
    }
    expect(jsonDeRespuesta("no hay json")).toBeNull();
  });
});

describe("quién puede guardar", () => {
  it("compra = admin/almacenero; cobro = admin/cajero; gerencia siempre", () => {
    expect(puedeGuardar("almacenero", "compra")).toBe(true);
    expect(puedeGuardar("cajero", "compra")).toBe(false);
    expect(puedeGuardar("cajero", "cobro")).toBe(true);
    expect(puedeGuardar("almacenero", "cobro")).toBe(false);
    expect(puedeGuardar("owner", "precios")).toBe(true);
    expect(puedeGuardar(null, "documento")).toBe(false);
  });
});

describe("quién pagó un Yape", () => {
  const deudor = { telefono: "+51900004455", nombre: "Cliente 4455", saldo: 150, conDeuda: true };
  const ana = { telefono: "+51911122233", nombre: "Ana Torres Rengifo", saldo: 40, conDeuda: true };
  const sinDeuda = { telefono: "+51955566677", nombre: "Pedro Ríos", saldo: 0, conDeuda: false };

  it("un nombre sin parecido NO sugiere al deudor: queda en la lista para elegirlo a mano", () => {
    const cands = candidatosDeCobro({ nombre: "Zzyzx Quuxbar Plimpton", finCelular: null }, [deudor, sinDeuda]);
    expect(cands.map((c) => c.nombre)).toEqual(["Cliente 4455"]);
    expect(cands[0].puntaje).toBe(0);
    expect(pagadorSugerido(cands)).toBeNull();
  });

  it("el nombre parecido sube primero y se sugiere", () => {
    const cands = candidatosDeCobro({ nombre: "Ana Torres R.", finCelular: null }, [deudor, ana]);
    expect(cands[0].nombre).toBe("Ana Torres Rengifo");
    expect(pagadorSugerido(cands)?.nombre).toBe("Ana Torres Rengifo");
  });

  it("el final del celular suma aunque el nombre no se lea", () => {
    const cands = candidatosDeCobro({ nombre: null, finCelular: "233" }, [deudor, ana]);
    expect(cands[0]).toMatchObject({ nombre: "Ana Torres Rengifo", puntaje: 0.4 });
    expect(pagadorSugerido(cands)?.nombre).toBe("Ana Torres Rengifo");
  });

  it("sin deuda y sin parecido no entra; un teléfono que no es celular no se devuelve", () => {
    const raro = { telefono: "cli_abc", nombre: "Pedro Ríos", saldo: 10, conDeuda: true };
    const cands = candidatosDeCobro({ nombre: "Pedro Rios", finCelular: null }, [sinDeuda, raro]);
    expect(cands).toHaveLength(2);
    expect(cands.find((c) => c.saldo === 10)?.telefono).toBeNull();
    expect(candidatosDeCobro({ nombre: "Zzyzx", finCelular: null }, [sinDeuda])).toEqual([]);
  });
});
