/**
 * «Plata de la guía» (ADR-437), renderizado de verdad (Vitest 4 Browser Mode).
 * Un modal de plata no se da por bueno con `tsc`: lo que hay que ver es que la
 * sugerencia se lea, que los dos campos convivan y que el reparto entre
 * asientos se entienda — en claro y en oscuro. El modal lee su plata del
 * servidor: acá el `fetch` devuelve un DTO fijo.
 *
 * La 1ª corrida crea las baselines en `__screenshots__/` (falla by design).
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import CtpCostoGuiaModal from "@/components/admin/forestal/CtpCostoGuiaModal";
import type { IngresoValorizable } from "@/lib/forestal/costo-sugerido";
import type { PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";

const HISTORIAL: IngresoValorizable[] = [
  {
    id: "h1",
    speciesCommonName: "Tornillo",
    providerName: "Maderera Blas SAC",
    volumeM3: 18.4,
    costoTotal: 6624,
    entryDate: "2026-08-14T00:00:00.000Z",
  },
];

const GUIA = {
  gtfNumber: "GTF-0000123",
  providerName: "Maderera Blas SAC",
  especie: "Tornillo",
  volumenM3: 24.75,
  lineas: [
    { id: "a1", volumeM3: 15.5 },
    { id: "a2", volumeM3: 9.25 },
  ],
};

const linea = (id: string, especie: string, m3: number) => ({
  id, speciesCommonName: especie, productType: "rolliza", volumeM3: m3, pieces: 10, status: "validado",
  entryDate: "2026-09-20", costoTotal: null, costoDetalle: null, ptDerivado: Math.round(m3 * 237), congelado: false, periodoCerrado: false,
  ptPago: { pt: Math.round(m3 * 237), fuente: "estimado" as const, estimado: Math.round(m3 * 237), oxapampa: null, cubicadas: 0, total: 10, noLlegaron: 0 },
});

const DTO: PlataDeGuiaDTO = {
  gtfNumber: GUIA.gtfNumber, tipo: "compra",
  lineas: [linea("a1", "Tornillo", 15.5), linea("a2", "Cachimbo", 9.25)],
  mezclada: false, dueno: null, duenoSugerido: null, contrato: null, proveedor: null,
  totalMadera: null, sinCosto: 2, cuenta: null, pago: null, persona: null, fletes: [], gastos: [],
  costoPuesto: { madera: null, fletes: 0, fletesSinMonto: 0, fletesDelProveedor: 0, gastos: 0, total: 0, incompleto: true, faltantes: ["el costo de la madera"], porM3: null },
  ptGuia: { pt: Math.round(24.75 * 237), fuente: "estimado", estimado: Math.round(24.75 * 237), oxapampa: null, cubicadas: 0, total: 20, noLlegaron: 0 },
  bloqueo: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const cuerpo = String(url).includes("/guias/plata") ? DTO : { partes: [], vehiculos: [] };
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

async function montar(tema: "light" | "dark") {
  document.documentElement.classList.toggle("dark", tema === "dark");
  return render(
    <div data-testid="costo-guia" style={{ width: 900, minHeight: 560 }}>
      <CtpCostoGuiaModal
        guia={GUIA}
        historial={HISTORIAL}
        onGuardado={() => {}}
        onClose={() => {}}
      />
    </div>,
  );
}

for (const tema of ["light", "dark"] as const) {
  test(`Plata de la guía — ${tema}: sugerencia + los dos campos + reparto`, async () => {
    const screen = await montar(tema);
    // El total dispara el reparto entre los 2 asientos: sin eso el modal se ve
    // a medias y la baseline no probaría lo que importa.
    /* Por rol: el ⓘ de al lado se llama «Información: Total pagado» y un
       getByLabelText encontraba los dos (2026-09-24). */
    await screen.getByRole("radio", { name: "Un total" }).click();
    const total = screen.getByRole("spinbutton", { name: /Total de la factura/i });
    await total.fill("9900");
    await expect
      .element(screen.getByText(/Repartido por volumen/i))
      .toBeVisible();
    await expect(screen.getByTestId("costo-guia")).toMatchScreenshot(`ctp-costo-guia-${tema}`);
  });
}
