import { describe, it, expect } from "vitest";
import { cifrasDeArchivados } from "@/components/admin/OrdersTab/cifras-archivados";

describe("cifrasDeArchivados", () => {
  it("separa lo entregado de lo cancelado y saca ticket y tasa", () => {
    const c = cifrasDeArchivados([
      { status: "entregado", total: 30 },
      { status: "entregado", total: 50 },
      { status: "cancelado", total: 20 },
      { status: "cancelado", total: 20 },
    ]);
    expect(c).toEqual({ entregados: 2, vendido: 80, ticket: 40, cancelados: 2, perdido: 40, tasaCancelados: 50 });
  });
  it("sin entregas no inventa un ticket ni una tasa", () => {
    expect(cifrasDeArchivados([{ status: "cancelado", total: 10 }]).ticket).toBeNull();
    expect(cifrasDeArchivados([]).tasaCancelados).toBeNull();
  });
});
