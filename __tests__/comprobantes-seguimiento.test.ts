import { describe, expect, it } from "vitest";
import { esDia, rangoDeParams, rangoDePeriodo, textoRango, limitesDelRango } from "@/lib/comprobantes/periodo";
import { interpretarBusqueda } from "@/lib/comprobantes/busqueda";
import { resumenDesdeGrupos } from "@/lib/comprobantes/resumen";
import { armarPendientes, clasificarRespuesta, type EntradaPendientes } from "@/lib/comprobantes/pendientes";
import { conciliar, type EntradaConciliacion } from "@/lib/comprobantes/conciliacion";
import { armarExpediente, type EntradaExpediente, type OperacionCruda } from "@/lib/comprobantes/expediente";

// Viernes 17/10/2026, 22:00 en Pucallpa = sábado 18 03:00 UTC.
const NOCHE_LIMA = Date.parse("2026-10-18T03:00:00Z");

describe("período de comprobantes", () => {
  it("cuenta desde el día de Pucallpa, no el de UTC", () => {
    expect(rangoDePeriodo("mes", NOCHE_LIMA)).toEqual({ desde: "2026-10-01", hasta: "2026-10-17" });
    expect(rangoDePeriodo("7d", NOCHE_LIMA)).toEqual({ desde: "2026-10-11", hasta: "2026-10-17" });
    expect(rangoDePeriodo("todo", NOCHE_LIMA)).toEqual({ desde: null, hasta: null });
  });

  it("el mes pasado de enero es diciembre del año anterior", () => {
    expect(rangoDePeriodo("mes-pasado", Date.parse("2027-01-10T15:00:00Z"))).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
  });

  it("dice el corte con día de la semana", () => {
    expect(textoRango({ desde: "2026-10-01", hasta: "2026-10-17" })).toBe("Del jueves 01/10 al sábado 17/10");
    expect(textoRango({ desde: null, hasta: null })).toBe("Desde el primer documento");
  });

  it("corta el día con la hora de Lima", () => {
    const { gte, lte } = limitesDelRango({ desde: "2026-10-01", hasta: "2026-10-01" });
    expect(gte?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(lte?.toISOString()).toBe("2026-10-02T04:59:59.999Z");
  });

  it("rechaza fechas inválidas o al revés", () => {
    expect(esDia("2026-02-30")).toBe(false);
    expect(rangoDeParams(new URLSearchParams("desde=2026-10-10&hasta=2026-10-01"))).toBeNull();
    expect(rangoDeParams(new URLSearchParams("desde=ayer"))).toBeNull();
    expect(rangoDeParams(new URLSearchParams(""))).toEqual({ desde: null, hasta: null });
  });
});

describe("búsqueda global", () => {
  it("entiende serie-número con o sin ceros y espacios", () => {
    expect(interpretarBusqueda("b001-123")).toMatchObject({ serie: "B001", numero: 123 });
    expect(interpretarBusqueda("F001 - 00045")).toMatchObject({ serie: "F001", numero: 45 });
  });

  it("un importe con decimales o soles es importe", () => {
    expect(interpretarBusqueda("118,50")).toMatchObject({ importe: 118.5 });
    expect(interpretarBusqueda("S/ 25")).toMatchObject({ importe: 25 });
  });

  it("un número corto puede ser número o importe; un RUC queda como texto", () => {
    expect(interpretarBusqueda("123")).toMatchObject({ numero: 123, importe: 123, texto: "123" });
    const ruc = interpretarBusqueda("20123456789");
    expect(ruc?.texto).toBe("20123456789");
    expect(ruc?.numero).toBeUndefined();
  });

  it("#código busca el pedido; palabras de estado y tipo filtran", () => {
    expect(interpretarBusqueda("#A1B2C3")).toMatchObject({ pedido: "a1b2c3" });
    expect(interpretarBusqueda("rechazados")?.estados).toEqual(["rejected"]);
    expect(interpretarBusqueda("Facturas")?.tipos).toEqual(["factura"]);
    expect(interpretarBusqueda("  ")).toBeNull();
  });
});

describe("indicadores con base", () => {
  it("emitido sin anulados ni rechazados; notas restan; tasa sin muestra = null", () => {
    const r = resumenDesdeGrupos([
      { type: "boleta", sunatStatus: "accepted", cantidad: 2, total: 100, igv: 15.25 },
      { type: "factura", sunatStatus: "pending", cantidad: 1, total: 118, igv: 18 },
      { type: "boleta", sunatStatus: "voided", cantidad: 1, total: 50, igv: 7.63 },
      { type: "factura", sunatStatus: "rejected", cantidad: 1, total: 20, igv: 3.05 },
      { type: "nota_credito", sunatStatus: "accepted", cantidad: 1, total: 18, igv: 2.75 },
    ]);
    expect(r.emitido).toBe(218);
    expect(r.aceptado).toBe(100);
    expect(r.neto).toBe(200);
    expect(r.pendientes).toBe(1);
    expect(r.documentos).toBe(6);
    expect(r.tasaAceptacion).toBeCloseTo(3 / 4);
    expect(resumenDesdeGrupos([{ type: "boleta", sunatStatus: "pending", cantidad: 3, total: 9, igv: 1 }]).tasaAceptacion).toBeNull();
  });
});

describe("bandeja de pendientes", () => {
  it("distingue respuesta desconocida, error de captura y rechazo", () => {
    expect(clasificarRespuesta("rejected", "ETIMEDOUT al llamar a Nubefact").tipo).toBe("desconocida");
    expect(clasificarRespuesta("rejected", "El RUC del receptor no existe").grupo).toBe("Datos del cliente");
    expect(clasificarRespuesta("rejected", "Algo raro").tipo).toBe("rechazo");
    const espera = clasificarRespuesta("retrying", null);
    expect(espera.tipo).toBe("desconocida");
    expect(espera.sugerencia).toMatch(/No emitas otro/);
  });

  const base: EntradaPendientes = {
    ahora: NOCHE_LIMA,
    comprobantes: [
      { id: "c1", orderId: "o1", type: "boleta", series: "B001", number: 7, customerName: "Ana", total: 30, sunatStatus: "pending", errorMessage: null, sentAt: "2026-10-17T20:00:00Z", createdAt: "2026-10-17T20:00:00Z" },
      { id: "c2", orderId: null, type: "factura", series: "F001", number: 3, customerName: "Ferretería", total: 118, sunatStatus: "rejected", errorMessage: "RUC no válido", sentAt: null, createdAt: "2026-10-15T15:00:00Z" },
    ],
    notas: [{ id: "n1", numero: "NC-0001", orderId: null, saleId: null, status: "EMITIDA", total: 10, motivoDesc: "Devolución", createdBy: "qaadmin", createdAt: "2026-10-10T15:00:00Z" }],
    guias: [],
    cotizaciones: [
      { id: "k1", numero: "COT-1", clienteNombre: "Luis", total: 500, status: "ENVIADA", validoHasta: "2026-10-19T23:59:59.999-05:00", createdBy: "qaadmin", createdAt: "2026-10-01T15:00:00Z" },
      { id: "k2", numero: "COT-2", clienteNombre: "Rosa", total: 80, status: "ENVIADA", validoHasta: "2026-11-30T23:59:59.999-05:00", createdBy: "qaadmin", createdAt: "2026-10-01T15:00:00Z" },
    ],
    pedidosSinComprobante: { cantidad: 4, importe: 220, desde: "2026-09-20T15:00:00Z" },
  };

  it("lo rechazado va arriba, la cotización lejana no entra y el pedido se agrupa en una fila", () => {
    const lista = armarPendientes(base);
    expect(lista[0].causa).toBe("rechazado");
    expect(lista.map((p) => p.id)).not.toContain("cotizacion-por-vencer:k2");
    expect(lista.filter((p) => p.causa === "pedidos-sin-comprobante")).toHaveLength(1);
    expect(lista.find((p) => p.id === "cotizacion-por-vencer:k1")?.siguiente).toMatch(/^Vence en 2 días/);
  });

  it("los ids son estables: recargar no multiplica avisos", () => {
    expect(armarPendientes(base).map((p) => p.id)).toEqual(armarPendientes(base).map((p) => p.id));
  });

  it("un comprobante sin respuesta no se da por confirmado ni sugiere emitir", () => {
    const p = armarPendientes(base).find((x) => x.id === "sin-respuesta:c1");
    expect(p?.confirmado).toBe(false);
    expect(p?.siguiente).not.toMatch(/emite de nuevo/i);
    expect(p?.ir).toEqual({ vista: "facturas", params: { buscar: "B001-7" } });
  });
});

describe("conciliación documental", () => {
  const entrada: EntradaConciliacion = {
    rango: { desde: "2026-10-01", hasta: "2026-10-17" },
    comprobantes: [
      { id: "c1", orderId: "o1", type: "boleta", series: "B001", number: 1, customerName: "Ana", total: 50, sunatStatus: "accepted", createdAt: "2026-10-02T15:00:00Z" },
      { id: "c2", orderId: "o2", type: "boleta", series: "B001", number: 2, customerName: "Beto", total: 30, sunatStatus: "accepted", createdAt: "2026-10-03T15:00:00Z" },
      { id: "c3", orderId: null, type: "factura", series: "F001", number: 1, customerName: "Suelto", total: 100, sunatStatus: "pending", createdAt: "2026-10-04T15:00:00Z" },
      { id: "c4", orderId: "o5", type: "boleta", series: "B001", number: 3, customerName: "Eva", total: 40, sunatStatus: "voided", createdAt: "2026-10-04T15:00:00Z" },
    ],
    notas: [
      { id: "n1", numero: "NC-1", orderId: "o1", saleId: null, status: "EMITIDA", motivoCodigo: "07", motivoDesc: "Devolución por ítem", total: 5 },
      { id: "n2", numero: "NC-2", orderId: null, saleId: null, status: "BORRADOR", motivoCodigo: "01", motivoDesc: "Anulación", total: 9 },
    ],
    pedidos: [
      { id: "o1", customerName: "Ana", total: 50, status: "entregado", deuda: false, createdAt: "2026-10-02T14:00:00Z" },
      { id: "o3", customerName: "Caro", total: 70, status: "entregado", deuda: true, createdAt: "2026-10-05T14:00:00Z" },
      { id: "o4", customerName: "Dani", total: 20, status: "pendiente", deuda: false, createdAt: "2026-10-06T14:00:00Z" },
    ],
    pedidosConComprobante: new Set(["o1"]),
    pedidosDeComprobantes: new Map([
      ["o1", { total: 50, status: "entregado", customerName: "Ana" }],
      ["o2", { total: 35, status: "cancelado", customerName: "Beto" }],
    ]),
    pedidosConNota: new Set(["o1"]),
    ventasMostrador: [{ tipo: null, cantidad: 3, total: 45 }, { tipo: "ticket", cantidad: 1, total: 5 }, { tipo: "boleta", cantidad: 2, total: 60 }],
  };

  it("emitido, neto y pedidos por estado", () => {
    const c = conciliar(entrada);
    expect(c.comprobantes.emitido).toEqual({ cantidad: 3, importe: 180 });
    expect(c.comprobantes.anulado.cantidad).toBe(1);
    expect(c.neto).toBe(175);
    expect(c.pedidos.sinComprobante).toEqual({ cantidad: 1, importe: 70 });
    expect(c.pedidos.enCurso.cantidad).toBe(1);
    expect(c.pedidos.fiados.importe).toBe(70);
    expect(c.notas.porMotivo).toEqual([{ codigo: "07", descripcion: "Devolución por ítem", cantidad: 1, importe: 5 }]);
    expect(c.mostrador[0]).toMatchObject({ tipo: "boleta", cantidad: 2 });
    expect(c.mostrador.find((m) => m.tipo === "ticket")).toMatchObject({ cantidad: 4, importe: 50 });
  });

  it("cada diferencia trae su fila", () => {
    const c = conciliar(entrada);
    expect(c.porTipoDiferencia).toEqual({ "comprobante-sin-operacion": 1, "cancelado-con-comprobante": 1, "pedido-sin-comprobante": 1 });
    expect(c.totalDiferencias).toBe(c.diferencias.length);
  });

  it("el importe distinto sale fuera de la tolerancia", () => {
    const c = conciliar({ ...entrada, pedidosDeComprobantes: new Map([["o1", { total: 50.2, status: "entregado", customerName: "Ana" }]]), comprobantes: [entrada.comprobantes[0]] });
    expect(c.porTipoDiferencia["importe-distinto"]).toBe(1);
  });
});

describe("expediente de la operación", () => {
  const pedido = (cambios: Partial<OperacionCruda> = {}): OperacionCruda => ({
    clase: "pedido", id: "ord-abc123", cliente: "Ana", telefono: null, fecha: "2026-10-10T15:00:00Z", estado: "entregado", total: 50,
    lineas: [], cobro: { medio: "yape", operacionYape: null, fiado: false, aprobacion: null, cuotas: [], pagado: null, vuelto: null, caja: [] },
    cancelacion: null, documentoInterno: null, ...cambios,
  });
  const vacio: Omit<EntradaExpediente, "operacion"> = { comprobantes: [], notas: [], guias: [], cotizaciones: [], historial: [] };

  it("un pedido entregado sin comprobante pide emitir", () => {
    const x = armarExpediente({ ...vacio, operacion: pedido() });
    expect(x.faltantes[0]).toMatchObject({ id: "sin-comprobante", gravedad: "alta", accion: "emitir" });
    expect(x.operacion?.codigo).toBe("Pedido #abc123");
  });

  it("si espera a SUNAT no pide emitir otro", () => {
    const x = armarExpediente({
      ...vacio, operacion: pedido(),
      comprobantes: [{ id: "c1", type: "boleta", series: "B001", number: 9, customerName: "Ana", customerRuc: null, total: 50, sunatStatus: "retrying", errorMessage: null, pdfUrl: null, acceptedAt: null, createdAt: "2026-10-10T16:00:00Z" }],
    });
    expect(x.faltantes.map((f) => f.id)).toEqual(["espera:c1"]);
    expect(x.documentos[0].confirmado).toBe(false);
    expect(x.importes.diferencia).toBe(0);
  });

  it("cancelado con comprobante vigente pide nota; fiado dice que emitido no es cobrado", () => {
    const comprobantes: EntradaExpediente["comprobantes"] = [{ id: "c1", type: "boleta", series: "B001", number: 9, customerName: "Ana", customerRuc: null, total: 50, sunatStatus: "accepted", errorMessage: null, pdfUrl: null, acceptedAt: "2026-10-10T16:01:00Z", createdAt: "2026-10-10T16:00:00Z" }];
    expect(armarExpediente({ ...vacio, comprobantes, operacion: pedido({ estado: "cancelado" }) }).faltantes[0].accion).toBe("notas");
    const fiado = armarExpediente({ ...vacio, comprobantes, operacion: pedido({ cobro: { ...pedido().cobro, fiado: true } }) });
    expect(fiado.faltantes.map((f) => f.id)).toEqual(["fiado"]);
    expect(fiado.eventos.map((e) => e.titulo)).toEqual(["Pedido recibido", "Boleta B001-9 emitida", "SUNAT aceptó B001-9"]);
  });
});
