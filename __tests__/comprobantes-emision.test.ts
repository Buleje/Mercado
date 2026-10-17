/**
 * «Emitir comprobante» (auditoría de comprobantes p1, 17-10): qué se crea según
 * el modo SUNAT, qué pedido se puede elegir, qué pide el cliente y cómo se lee
 * cada respuesta del servidor. Todo puro: ningún test llama al emisor.
 */
import { describe, expect, it } from "vitest";
import { modoDeEmision, requisitosDeEmision } from "@/components/admin/sunat/requisitos-emision";
import {
  aPedidoElegible,
  diaYFecha,
  filtrarPedidos,
  resultadoDeEmision,
  resultadoTrasRevisar,
  validarCliente,
  type PedidoApi,
} from "@/components/admin/einvoice/emision-reglas";
import type { EDocument } from "@/components/admin/einvoice/tipos";
import { buscarVentas, type SaleDoc } from "@/components/admin/notas-credito/nc-compartido";
import type { SunatModoOficialState } from "@/lib/sunat/modo-oficial.types";

const estado = (parcial: Partial<SunatModoOficialState>): SunatModoOficialState => ({
  enabled: false,
  configReady: false,
  rucVerificado: false,
  ambiente: "beta",
  bloqueos: [],
  emisor: null,
  ...parcial,
});

const doc = (parcial: Partial<EDocument>): EDocument => ({
  id: "inv1",
  serie: "B001",
  number: "00000012",
  date: "2026-10-15",
  type: "boleta",
  status: "aceptado",
  clientName: "Rosa",
  clientRUC: "",
  subtotal: 0,
  igv: 0,
  total: 45.5,
  items: 2,
  sunatResponse: "",
  orderId: "ord_abc123",
  ...parcial,
});

const pedido: PedidoApi = {
  id: "ord_abc123",
  customer: { name: "Rosa Huamán", phone: "987 654 321" },
  items: [
    { name: "Arroz Costeño 5 kg", quantity: 1, unit: "un", price: 25.5 },
    { name: "Aceite Primor", quantity: 2, unit: "un", price: 10 },
  ],
  total: 45.5,
  status: "entregado",
  createdAt: "2026-10-15T22:00:00.000Z",
};

describe("requisitos y modo de emisión", () => {
  it("sin configuración: los tres requisitos faltan y no se emite nada", () => {
    const e = estado({ bloqueos: ["sin_config"] });
    expect(requisitosDeEmision(e).map((r) => r.ok)).toEqual([false, false, false]);
    const l = modoDeEmision(e);
    expect(l.modo).toBe("apagado");
    expect(l.puedeEmitir).toBe(false);
    expect(l.aviso).toMatch(/no se crea nada/i);
  });

  it("RUC listo pero sin token: sólo la conexión falta antes de activar", () => {
    const e = estado({ bloqueos: ["sin_token"] });
    expect(requisitosDeEmision(e).map((r) => [r.id, r.ok])).toEqual([
      ["ruc", true],
      ["conexion", false],
      ["activado", false],
    ]);
  });

  it("beta = prueba sin validez; producción = oficial", () => {
    const prueba = modoDeEmision(estado({ enabled: true, ambiente: "beta" }));
    expect(prueba.modo).toBe("prueba");
    expect(prueba.puedeEmitir).toBe(true);
    expect(prueba.accion).toMatch(/prueba/i);
    const oficial = modoDeEmision(estado({ enabled: true, ambiente: "produccion" }));
    expect(oficial.modo).toBe("produccion");
    expect(oficial.accion).toMatch(/SUNAT/);
  });

  it("estado desconocido (no cargó) no bloquea: decide el servidor", () => {
    expect(modoDeEmision(null).modo).toBe("desconocido");
  });
});

describe("pedido elegible", () => {
  it("arma código corto, cliente, líneas y día de Lima", () => {
    const p = aPedidoElegible(pedido, []);
    expect(p).not.toBeNull();
    expect(p?.codigo).toBe("#abc123");
    expect(p?.bloqueo).toBeNull();
    expect(p?.lineas).toHaveLength(2);
    expect(diaYFecha("2026-10-15T22:00:00.000Z")).toBe("jueves 15/10");
    // 01:00 UTC del 16 = 20:00 del 15 en Lima.
    expect(diaYFecha("2026-10-16T01:00:00.000Z")).toBe("jueves 15/10");
  });

  it("con comprobante vivo no se elige (el servidor devolvería el mismo)", () => {
    const p = aPedidoElegible(pedido, [doc({ status: "pendiente" })]);
    expect(p?.bloqueo).toMatch(/B001-00000012/);
  });

  it("rechazado o anulado no cuenta: se puede volver a emitir", () => {
    expect(aPedidoElegible(pedido, [doc({ status: "rechazado" })])?.bloqueo).toBeNull();
    expect(aPedidoElegible(pedido, [doc({ status: "anulado" })])?.bloqueo).toBeNull();
  });

  it("cancelado se bloquea; borrado ni aparece", () => {
    expect(aPedidoElegible({ ...pedido, status: "cancelado" }, [])?.bloqueo).toBe("Pedido cancelado");
    expect(aPedidoElegible({ ...pedido, deletedAt: "2026-10-16T00:00:00Z" }, [])).toBeNull();
  });

  it("se busca por código, cliente sin tildes, celular, monto con coma, fecha o producto", () => {
    const otro = aPedidoElegible({ ...pedido, id: "ord_zzz999", customer: { name: "Pedro" }, items: [{ name: "Leche", quantity: 1, price: 4 }], total: 4 }, []);
    const lista = [aPedidoElegible(pedido, []), otro].filter((p) => p !== null);
    const ids = (q: string) => filtrarPedidos(lista, q).map((p) => p.id);
    expect(ids("#abc123")).toEqual(["ord_abc123"]);
    expect(ids("huaman")).toEqual(["ord_abc123"]);
    expect(ids("987654321")).toEqual(["ord_abc123"]);
    expect(ids("45,50")).toEqual(["ord_abc123"]);
    expect(ids("15/10 arroz")).toEqual(["ord_abc123"]);
    expect(ids("leche")).toEqual(["ord_zzz999"]);
    expect(ids("")).toHaveLength(2);
  });
});

describe("datos del cliente", () => {
  it("factura pide RUC de 11 dígitos", () => {
    expect(validarCliente({ tipo: "factura", nombre: "Bodega SAC", documento: "2060" }, 50)?.campo).toBe("documento");
    expect(validarCliente({ tipo: "factura", nombre: "Bodega SAC", documento: "20601234567" }, 50)).toBeNull();
  });

  it("boleta de hasta S/ 700 sin DNI pasa; de más, lo pide", () => {
    expect(validarCliente({ tipo: "boleta", nombre: "Rosa", documento: "" }, 700)).toBeNull();
    expect(validarCliente({ tipo: "boleta", nombre: "Rosa", documento: "" }, 700.01)?.mensaje).toMatch(/DNI/);
  });

  it("DNI escrito tiene que tener 8 dígitos; el nombre, al menos 2 letras", () => {
    expect(validarCliente({ tipo: "boleta", nombre: "Rosa", documento: "1234" }, 10)?.campo).toBe("documento");
    expect(validarCliente({ tipo: "boleta", nombre: "Rosa", documento: "12345678" }, 10)).toBeNull();
    expect(validarCliente({ tipo: "boleta", nombre: "R", documento: "" }, 10)?.campo).toBe("nombre");
  });
});

describe("respuesta del servidor", () => {
  const ok = { ok: true, invoice: { serie: "B001", número: "00000013" }, pdfUrl: "https://x/p.pdf" };

  it("200 aceptado / enviado / ya existía", () => {
    expect(resultadoDeEmision(200, { ...ok, sunatAccepted: true })).toMatchObject({ tipo: "aceptado", titulo: "B001-00000013 emitido", pdfUrl: "https://x/p.pdf" });
    expect(resultadoDeEmision(200, { ...ok, sunatAccepted: false }).tipo).toBe("enviado");
    expect(resultadoDeEmision(200, ok).tipo).toBe("ya_existia");
  });

  it("202 es cola, no error (B7), y no ofrece reintentar", () => {
    const r = resultadoDeEmision(202, { status: "retrying" });
    expect(r.tipo).toBe("en_cola");
    expect(r.puedeReintentar).toBe(false);
  });

  it("502 rechazado deja corregir; red caída obliga a revisar antes (B3)", () => {
    expect(resultadoDeEmision(502, { status: "rejected", error: "RUC no existe" })).toMatchObject({ tipo: "rechazado", detalle: "RUC no existe", puedeReintentar: true });
    const sinRed = resultadoDeEmision(null, {});
    expect(sinRed.tipo).toBe("sin_confirmar");
    expect(sinRed.revisarAntes).toBe(true);
    expect(sinRed.puedeReintentar).toBe(false);
  });

  it("403 distingue modo apagado de rol sin permiso", () => {
    expect(resultadoDeEmision(403, { error: "Modo SUNAT Oficial está desactivado" }).titulo).toMatch(/modo oficial/i);
    expect(resultadoDeEmision(403, { error: "Forbidden" }).titulo).toMatch(/usuario/i);
  });

  it("400 nombra el campo que falta", () => {
    expect(resultadoDeEmision(400, { issues: [{ path: ["clienteDocumento"] }] }).detalle).toMatch(/DNI o RUC/);
  });

  it("500 no se da por fallido: hay que revisar", () => {
    expect(resultadoDeEmision(500, {}).revisarAntes).toBe(true);
  });

  it("tras revisar: lo que quedó, o que se puede reintentar sin duplicar", () => {
    expect(resultadoTrasRevisar(doc({ status: "pendiente" }))).toMatchObject({ tipo: "en_cola", titulo: "Sí quedó: B001-00000012" });
    expect(resultadoTrasRevisar(null)).toMatchObject({ puedeReintentar: true });
  });
});

describe("buscar la venta de origen de una nota de crédito (B5)", () => {
  const venta = (parcial: Partial<SaleDoc>): SaleDoc => ({
    id: "sale_000001",
    número: "000001",
    comprobanteTipo: "boleta",
    comprobanteNumero: "B001-00000731",
    fecha: "2026-10-15T15:00:00.000Z",
    total: 120,
    clienteNombre: "José Pérez",
    clienteDocumento: "45678912",
    telefono: "912345678",
    items: [],
    ...parcial,
  });
  const ventas = [venta({}), venta({ id: "sale_000002", número: "000002", comprobanteNumero: "", comprobanteTipo: "ticket", clienteNombre: "Ana", clienteDocumento: "", telefono: "", total: 8.5 })];
  const ids = (q: string) => buscarVentas(ventas, q).map((v) => v.id);

  it("por serie, DNI, celular, nombre sin tilde, monto y fecha", () => {
    expect(ids("B001-00000731")).toEqual(["sale_000001"]);
    expect(ids("45678912")).toEqual(["sale_000001"]);
    expect(ids("912345678")).toEqual(["sale_000001"]);
    expect(ids("jose perez")).toEqual(["sale_000001"]);
    expect(ids("8,50")).toEqual(["sale_000002"]);
    expect(ids("15/10")).toHaveLength(2);
    expect(ids("#000002")).toEqual(["sale_000002"]);
  });
});
