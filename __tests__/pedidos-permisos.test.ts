/**
 * Qué botones de Pedidos ve cada rol (17-10): `components/admin/OrdersTab/permisos-pedidos.ts`
 * tiene que decir lo mismo que las rutas (`PATCH /api/orders/[id]` y
 * `bulk-status`: cajero, tienda_owner y gestión; `DELETE`: sólo gestión), para
 * no mostrar un botón que termina en 403.
 */
import { describe, expect, it } from "vitest";
import { permisosDePedidos, TODOS_LOS_PERMISOS } from "@/components/admin/OrdersTab/permisos-pedidos";

describe("permisosDePedidos", () => {
  it("gestión puede todo", () => {
    for (const rol of ["admin", "owner", "manager"] as const) {
      expect(permisosDePedidos(rol)).toEqual(TODOS_LOS_PERMISOS);
    }
  });

  it("cajero mueve y emite, pero no borra ni hace guía", () => {
    expect(permisosDePedidos("cajero")).toMatchObject({
      mover: true,
      borrar: false,
      comprobante: true,
      guia: false,
      notaCredito: false,
      explicacion: null,
    });
  });

  it("almacenero sólo mira y hace la guía, con la explicación de por qué", () => {
    const p = permisosDePedidos("almacenero");
    expect(p).toMatchObject({ mover: false, borrar: false, comprobante: false, guia: true });
    expect(p.explicacion).toMatch(/caja o el encargado/);
  });

  it("sin rol conocido todavía no se esconde nada (como antes)", () => {
    expect(permisosDePedidos(null)).toEqual(TODOS_LOS_PERMISOS);
  });
});
