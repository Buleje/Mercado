import { describe, expect, it } from "vitest";
import { esAClientes, estadoAviso, linkWhatsApp, paraQuien, pasaFiltro, pedidoDesdeApi, rotuloTipo, type Aviso } from "@/components/admin/avisos/tipos";

describe("Avisos por pedido — cómo se lee el historial", () => {
  it("lee el cliente en las DOS formas de /api/orders (plano con limit, anidado sin limit)", () => {
    expect(pedidoDesdeApi({ id: "ord-1", total: "7.2", status: "entregado", customerName: "Ana", customerPhone: "916409675" }))
      .toEqual({ id: "ord-1", nombre: "Ana", celular: "916409675", total: 7.2, status: "entregado" });
    expect(pedidoDesdeApi({ id: "ord-2", total: 3, status: "confirmado", customer: { name: "Luis", phone: "987654321" } }))
      .toMatchObject({ nombre: "Luis", celular: "987654321" });
    expect(pedidoDesdeApi({ id: "ord-3", total: 1, status: "cancelado", customerName: "QA", customerPhone: null }))
      .toMatchObject({ nombre: "QA", celular: null });
    expect(pedidoDesdeApi({ total: 1 })).toBeNull();
  });

  it("separa avisos a clientes de alertas al dueño y nombra los tipos crudos", () => {
    expect(esAClientes("order_cancelado")).toBe(true);
    expect(esAClientes("promotion")).toBe(true);
    expect(esAClientes("low_stock")).toBe(false);
    expect(esAClientes("reporte_diario:cmuit:whatsapp")).toBe(false);
    expect(rotuloTipo("order_en_camino")).toBe("Pedido en camino");
    expect(rotuloTipo("reporte_diario:cmuitaetz00004cvzj4qpwpwn:email")).toBe("Reporte diario por correo");
    expect(rotuloTipo("ctp_plazos_whatsapp")).toBe("Plazos del libro CTP por WhatsApp");
    expect(rotuloTipo("dead_stock_weekly")).toBe("Productos sin venta");
  });

  it("los filtros suman el total: a clientes + alertas = todos; «fallaron» es por estado", () => {
    const base = { id: "x", recipient: "admin", message: "", orderId: null, createdAt: "2026-10-10T10:00:00Z" };
    const avisos: Aviso[] = [
      { ...base, type: "order_cancelado", status: "link" },
      { ...base, type: "low_stock", status: "sent" },
      { ...base, type: "reporte_diario:a:whatsapp", status: "failed" },
    ];
    const n = (f: Parameters<typeof pasaFiltro>[1]) => avisos.filter((a) => pasaFiltro(a, f)).length;
    expect(n("clientes") + n("alertas")).toBe(n("todos"));
    expect(n("error")).toBe(1);
    expect(estadoAviso("link").rotulo).toBe("Link listo");
  });

  it("celular legible y link de WhatsApp con el 51 una sola vez", () => {
    expect(paraQuien("916409675")).toBe("916 409 675");
    expect(paraQuien("51916409675")).toBe("+51 916 409 675");
    expect(paraQuien("admin")).toBe("Tú");
    expect(linkWhatsApp("51916409675", "hola")).toBe("https://wa.me/51916409675?text=hola");
    expect(linkWhatsApp("916409675", "a b")).toBe("https://wa.me/51916409675?text=a%20b");
    expect(linkWhatsApp("admin", "x")).toBeNull();
  });
});
