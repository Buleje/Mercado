/**
 * Los 4 casos que el revisor escribió el 23-09 para DOCUMENTAR los bugs del
 * arreglo «el trato empieza después» (pasaban con el código de entonces), con
 * la expectativa invertida: ahora prueban que el bug ya no está.
 *
 * Original: scratchpad `r430v-trato.test.tsx`. Adaptaciones mínimas: la línea
 * recibe `parteId` (es lo que la arregla) y el `fetch` falso contesta el GET de
 * la propuesta además del POST.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CtpLineaDelTrato from "@/components/admin/forestal/CtpLineaDelTrato";
import { proponerArreglo, cuantoSubio, type CorridaDelTrato } from "@/lib/forestal/trato-sin-cobrar";
import type { TarifaCliente } from "@/lib/forestal/precio-cliente";

const trato = (vigenteDesde: string, p: Partial<TarifaCliente> = {}): TarifaCliente => ({
  id: "tc-14", parteId: "wasaco", servicio: "aserrio", vigenteDesde, basePt: 0.5,
  grupos: [], especies: [], tipos: [], nota: null, ...p,
});
const corrida = (id: string, fecha: string, p: Partial<CorridaDelTrato> = {}): CorridaDelTrato => ({
  id, lineNo: 1, fecha, especie: "Tornillo", importeActual: null, manual: false, pt: 100, importeConTrato: 50, ...p,
});
const listo = (tarifas: TarifaCliente[]) => ({ tarifas, cargando: false, error: null, recargar: async () => {} });

/** GET → una propuesta para la fecha pedida (con plata); POST → `post`. */
function servidor(post: unknown, parteId = "wasaco") {
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return { ok: true, status: 200, json: async () => post };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        parteId,
        parteNombre: "WASACO",
        desde: new URL(url, "http://x").searchParams.get("desde"),
        arreglo: proponerArreglo(parteId, [trato("2026-09-14", { parteId })], [corrida("c0", "2026-09-07")], {
          desde: new URL(url, "http://x").searchParams.get("desde"),
        }),
      }),
    };
  }) as unknown as typeof fetch;
}
const posts = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([, i]) => i?.method === "POST");

describe("R1 — si el adelanto se corta a mitad, las cobradas con la planta en la ventana VUELVEN al aviso", () => {
  it("antes de mover: sale en cambian; después de mover (reintento): sigue saliendo", () => {
    const c = corrida("c1", "2026-09-07", { importeActual: 100, importeConTrato: 50 });
    const antes = proponerArreglo("wasaco", [trato("2026-09-14")], [c, corrida("c0", "2026-09-07")]);
    expect(antes?.cambian.map((x) => x.id)).toEqual(["c1"]);
    // El trato ya se movió al 07/09 pero la recotización de c1 no llegó (tope de 20 s / error).
    const reintento = proponerArreglo("wasaco", [trato("2026-09-07")], [c]);
    expect(reintento).not.toBeNull();
    expect(reintento?.cambian.map((x) => x.id)).toEqual(["c1"]);
  });
});

describe("R2 — la línea del trato NO conserva el «Listo» al cambiar de cliente", () => {
  it("el mensaje de WASACO no queda bajo el trato de OTRO", async () => {
    servidor({
      parteNombre: "WASACO", movio: { tarifaId: "tc-14", de: "2026-09-14", a: "2026-09-07" }, arreglo: null,
      cobro: { resultados: [{ id: "c30", lineNo: 30, cobrado: true, importe: 10, parteNombre: "WASACO", motivo: null, accion: "crear" }],
        resumen: { cobradas: 1, importeTotal: 10, sinCambio: 0, sinCobrar: 0, dadasDeBaja: 0, importeDadoDeBaja: 0 } },
    });
    const { rerender } = render(<CtpLineaDelTrato trato={listo([trato("2026-09-14")])} servicio="aserrio" fecha="2026-09-07" grupos={[]} nombre="WASACO" parteId="wasaco" />);
    const boton = screen.getByRole("button", { name: "Empezar el trato el 07/09" });
    await waitFor(() => expect(boton).not.toBeDisabled());
    await userEvent.click(boton);
    await waitFor(() => expect(posts()).toHaveLength(1));
    rerender(<CtpLineaDelTrato trato={listo([trato("2026-09-01", { id: "otro", parteId: "otro" })])} servicio="aserrio" fecha="2026-09-07" grupos={[]} nombre="OTRO CLIENTE" parteId="otro" />);
    expect(screen.getByText(/Precio pactado/)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Listo: el trato con WASACO/);
  });
});

describe("R3 — la línea SÍ muestra plata antes del clic", () => {
  it("el importe que se cargará, antes de tocar el botón", async () => {
    servidor(null);
    const { container } = render(<CtpLineaDelTrato trato={listo([trato("2026-09-14")])} servicio="aserrio" fecha="2026-09-07" grupos={[]} nombre="WASACO" parteId="wasaco" />);
    await waitFor(() => expect(container.textContent).toMatch(/S\/\s?50[.,]00/));
    expect(posts()).toHaveLength(0);
  });
});

describe("R4 — una recotización que BAJA la deuda se lee con su signo, no «+S/ -40» ni «sin precio»", () => {
  it("cuantoSubio negativo y el texto de la línea", async () => {
    const r = {
      parteNombre: "WASACO", movio: { tarifaId: "tc-14", de: "2026-09-14", a: "2026-09-07" },
      arreglo: { cambian: [{ id: "c1", lineNo: 1, fecha: "2026-09-08", especie: null, pt: 100, importeActual: 100, importeConTrato: 60 }] },
      cobro: { resultados: [{ id: "c1", lineNo: 1, cobrado: true, importe: 60, parteNombre: "WASACO", motivo: null, accion: "actualizar" }],
        resumen: { cobradas: 1, importeTotal: 60, sinCambio: 0, sinCobrar: 0, dadasDeBaja: 0, importeDadoDeBaja: 0 } },
    };
    expect(cuantoSubio(r as never)).toBe(-40);
    servidor(r);
    const { rerender } = render(<CtpLineaDelTrato trato={listo([trato("2026-09-14")])} servicio="aserrio" fecha="2026-09-07" grupos={[]} nombre="WASACO" parteId="wasaco" />);
    const boton = screen.getByRole("button", { name: "Empezar el trato el 07/09" });
    await waitFor(() => expect(boton).not.toBeDisabled());
    await userEvent.click(boton);
    await waitFor(() => expect(posts()).toHaveLength(1));
    rerender(<CtpLineaDelTrato trato={listo([trato("2026-09-07")])} servicio="aserrio" fecha="2026-09-07" grupos={[]} nombre="WASACO" parteId="wasaco" />);
    const t = await waitFor(() => {
      const x = screen.getByRole("status").textContent ?? "";
      expect(x).toMatch(/^Listo/);
      return x;
    });
    expect(t).not.toMatch(/\+S\/\s?-/);
    expect(t).not.toMatch(/sin precio/);
    expect(t).toBe("Listo: el trato con WASACO rige desde el lunes 07/09. Además, 1 corrida ya cobrada con la tarifa de la planta pasó al trato (−S/ 40.00).");
  });
});
