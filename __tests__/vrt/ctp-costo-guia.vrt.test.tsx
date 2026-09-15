/**
 * El modal que pide el costo de la guía, renderizado de verdad (Vitest 4
 * Browser Mode). Un modal de plata no se da por bueno con `tsc`: lo que hay que
 * ver es que la sugerencia se lea, que los dos campos convivan y que el reparto
 * entre asientos se entienda — en claro y en oscuro.
 *
 * La 1ª corrida crea las baselines en `__screenshots__/` (falla by design).
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import CtpCostoGuiaModal from "@/components/admin/forestal/CtpCostoGuiaModal";
import type { IngresoValorizable } from "@/lib/forestal/costo-sugerido";

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

async function montar(tema: "light" | "dark") {
  document.documentElement.classList.toggle("dark", tema === "dark");
  return render(
    <div data-testid="costo-guia" style={{ width: 900, minHeight: 560 }}>
      <CtpCostoGuiaModal
        guia={GUIA}
        historial={HISTORIAL}
        onGuardar={async () => true}
        onClose={() => {}}
      />
    </div>,
  );
}

for (const tema of ["light", "dark"] as const) {
  test(`CtpCostoGuiaModal — ${tema}: sugerencia + los dos campos + reparto`, async () => {
    const screen = await montar(tema);
    // El total dispara el reparto entre los 2 asientos: sin eso el modal se ve
    // a medias y la baseline no probaría lo que importa.
    const total = screen.getByLabelText(/Total pagado/i);
    await total.fill("9900");
    await expect
      .element(screen.getByText(/Se reparte entre los 2 asientos/i))
      .toBeVisible();
    await expect(screen.getByTestId("costo-guia")).toMatchScreenshot(`ctp-costo-guia-${tema}`);
  });
}
