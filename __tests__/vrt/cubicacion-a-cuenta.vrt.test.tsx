/**
 * ADR-484 · «lo que el adelanto no cubre va a su cuenta», renderizado de
 * verdad (Vitest 4 Browser Mode): la vista previa de una VENTA que el adelanto
 * cubre a medias y la cubicación ya aplicada (lo que quedó en su cuenta y el
 * valor de venta del despacho). El `fetch` devuelve DTOs fijos.
 *
 * La 1ª corrida crea las baselines en `__screenshots__/` (falla by design).
 * Correr con `npm run test:vrt -- __tests__/vrt/cubicacion-a-cuenta.vrt.test.tsx`.
 */
import "@/app/globals.css";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import ValorizarCubicacionModal from "@/components/admin/forestal/cubicador-trozas-valorizar";

const BASE = {
  id: "c1", codigo: "CUB-2026-0022", fecha: "2026-10-08", formula: "tablar", diametros: 2, unidad: "PT",
  beneficiarioId: "b1", parteId: "p1", personaNombre: "Maderera El Aguajal SAC", sentido: "venta", gtfNumber: null, contratoId: null,
  nTrozas: 0, volumen: 300, porEspecie: null, monto: null, moneda: "PEN", estado: "borrador", version: 1, aplicadaAt: null, aplicadaPor: null,
  imputacion: null, aCuenta: null, valorVenta: null, anuladaAt: null, anuladaPor: null, motivoAnulacion: null, notas: null,
  createdBy: "qaadmin", createdAt: "2026-10-08T22:00:00.000Z", updatedAt: "2026-10-08T22:00:00.000Z",
  material: "aserrada", origen: "despacho", origenId: "d1", modo: "total", volumenBruto: null, descuentos: null, referenciaSmalianM3: null, cubicacionRefId: null,
  trozas: [], lineas: [{ n: 1, especie: "Tornillo", pt: 300, m3: null, piezas: null, volumen: 300 }],
};
const APLICADA = {
  ...BASE, estado: "aplicada", monto: 1500, aplicadaAt: "2026-10-08T22:05:00.000Z", aplicadaPor: "qaadmin",
  porEspecie: [{ clave: "tornillo", nombre: "Tornillo", n: 0, volumen: 300, precio: 5, monto: 1500 }],
  imputacion: [{ adelantoId: "a1", codigoOperacion: "ADL-2026-0047", monto: 500, volumen: 100, excedido: false, entregaId: "e1" }],
  aCuenta: { tipo: "cuenta", parteId: "p1", parteNombre: "Maderera El Aguajal SAC", monto: 1000, volumen: 200, sentido: "venta", movIds: ["m1", "m2"] },
  valorVenta: { tipo: "valorVenta", estado: "puesto", lineas: [{ despachoId: "d1", valor: 1500 }], previo: null, diferencia: null },
};
const ADELANTO = {
  id: "a1", codigoOperacion: "ADL-2026-0047", direccion: "RECIBIDO", status: "ABIERTO", moneda: "PEN", modalidad: "CUENTA_CORRIENTE",
  fechaAdelanto: "2026-10-08T15:00:00.000Z", saldoPendiente: 500, montoAdelantado: 1000, entregasPactadas: [],
};

let detalle: Record<string, unknown> = BASE;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    const cuerpo = u.includes("/api/adelantos?") ? [ADELANTO]
      : u.includes("/cubicaciones-trozas/c1") ? { cubicacion: detalle, cuenta: { parteId: "p1", nombre: "Maderera El Aguajal SAC", saldo: 0 } }
      : u.includes("/cubicaciones-trozas?") ? { cubicaciones: [] }
      : {};
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

const montar = (tema: "light" | "dark") => {
  document.documentElement.classList.toggle("dark", tema === "dark");
  return render(
    <div data-testid="cub-a-cuenta" style={{ width: 900, minHeight: 680 }}>
      <ValorizarCubicacionModal id="c1" puedeAplicar onCerrar={() => {}} />
    </div>,
  );
};

for (const tema of ["light", "dark"] as const) {
  test(`venta que el adelanto cubre a medias — ${tema}: el resto, a su cuenta (te debe)`, async () => {
    detalle = BASE;
    const screen = await montar(tema);
    await screen.getByRole("textbox", { name: /Precio general/i }).fill("5");
    await expect.element(screen.getByText(/Lo que no cubre, a su cuenta/i)).toBeVisible();
    await expect.element(screen.getByText(/te debe S\/\s?1,000\.00/)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /Aplicar S\/\s?1,500\.00/ })).toBeVisible();
    await expect(screen.getByTestId("cub-a-cuenta")).toMatchScreenshot(`cubicacion-a-cuenta-previa-${tema}`);
  });
}

test("aplicada — light: lo que quedó en su cuenta y de dónde salió el valor de venta", async () => {
  detalle = APLICADA;
  const screen = await montar("light");
  await expect.element(screen.getByText(/Quedó en la cuenta de Maderera El Aguajal SAC/)).toBeVisible();
  await expect.element(screen.getByText(/salió de CUB-2026-0022/)).toBeVisible();
  await expect(screen.getByTestId("cub-a-cuenta")).toMatchScreenshot("cubicacion-a-cuenta-aplicada-light");
});
