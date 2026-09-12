/**
 * La tira de días del registro, en pantalla.
 *
 * La aritmética se prueba aparte (`forestal-semana-de-registro`). Acá se fija lo
 * que el operador VE, que es de donde salen las decisiones:
 *
 *  · el día que ya tiene producción se dice en pie tablar, no en m³ (el
 *    aserradero habla en pies);
 *  · una corrida tan chica que redondea a 0 PT NO puede mostrar «0 PT» — se
 *    lee igual que «no hay nada», que es lo contrario de lo que ese casillero
 *    tiene que decir;
 *  · elegir un día que ya tiene jornada AVISA antes de registrar. No bloquea:
 *    dos turnos el mismo día son normales, repetir la misma corrida no.
 *  · y en el modal de producir con lote, la tira sólo aparece al DECLARAR: si
 *    la corrida ya existe y se la está ampliando, su fecha es la del asiento y
 *    ofrecer un selector que no cambia nada sería mentir.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CtpSemanaDeRegistro from "@/components/admin/forestal/CtpSemanaDeRegistro";
import type { JornadaDeProduccion } from "@/components/admin/forestal/hooks/use-jornadas-produccion";

const jornadas = (...filas: JornadaDeProduccion[]) => new Map(filas.map((j) => [j.dia, j]));

/** La semana del lunes 14 al domingo 20 de setiembre de 2026. */
const SEMANA = "2026-09-16";

function tira(props: Partial<React.ComponentProps<typeof CtpSemanaDeRegistro>> = {}) {
  const onElegir = vi.fn();
  const onSemana = vi.fn();
  render(
    <CtpSemanaDeRegistro
      valor="2026-09-16"
      onElegir={onElegir}
      semana={SEMANA}
      onSemana={onSemana}
      porDia={new Map()}
      {...props}
    />,
  );
  return { onElegir, onSemana };
}

afterEach(() => cleanup());

describe("los siete casilleros", () => {
  it("dibuja lunes a domingo con su fecha", () => {
    tira();
    for (const d of ["14/09", "15/09", "16/09", "17/09", "18/09", "19/09", "20/09"]) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }
    expect(screen.getByText("Lun")).toBeInTheDocument();
    expect(screen.getByText("Dom")).toBeInTheDocument();
  });

  it("elegir un día avisa con la fecha, no con un índice", () => {
    const { onElegir } = tira();
    fireEvent.click(screen.getByText("17/09").closest("button")!);
    expect(onElegir).toHaveBeenCalledWith("2026-09-17");
  });

  it("las flechas mueven la SEMANA sin cambiar el día elegido", () => {
    const { onElegir, onSemana } = tira();
    fireEvent.click(screen.getByLabelText("Semana anterior"));
    expect(onSemana).toHaveBeenCalledWith("2026-09-07");
    expect(onElegir).not.toHaveBeenCalled();
  });
});

describe("lo que ya se produjo ese día", () => {
  it("lo dice en pie tablar", () => {
    tira({ porDia: jornadas({ dia: "2026-09-17", corridas: 1, m3: 5.6, pt: 2374, piezas: 40 }) });
    expect(screen.getByText("2,374 PT")).toBeInTheDocument();
  });

  it("una corrida que redondea a 0 PT cuenta corridas, nunca dice «0 PT»", () => {
    tira({ porDia: jornadas({ dia: "2026-09-17", corridas: 1, m3: 0.001, pt: 0, piezas: 141 }) });
    expect(screen.getByText("1 corrida")).toBeInTheDocument();
    expect(screen.queryByText("0 PT")).not.toBeInTheDocument();
  });

  it("un día sin nada no inventa un cero", () => {
    tira();
    // El guion reserva el lugar para que la tira no cambie de altura.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/PT$/)).not.toBeInTheDocument();
  });
});

describe("el aviso de jornada repetida", () => {
  it("avisa cuando el día elegido YA tiene corridas, con cuántas y cuánto", () => {
    tira({
      valor: "2026-09-17",
      porDia: jornadas({ dia: "2026-09-17", corridas: 2, m3: 5.6, pt: 2374, piezas: 40 }),
    });
    /* Se ancla en una frase que sólo está en el aviso: el pie de la tira
       también habla de «los que ya tienen producción». */
    const aviso = screen.getByText(/Si es otro turno/);
    expect(aviso.textContent).toContain("2 corridas");
    expect(aviso.textContent).toContain("5.600 m³");
    expect(aviso.textContent).toMatch(/jueves 17\/09/);
  });

  it("no avisa del día de al lado: el aviso es del día ELEGIDO", () => {
    tira({
      valor: "2026-09-16",
      porDia: jornadas({ dia: "2026-09-17", corridas: 2, m3: 5.6, pt: 2374, piezas: 40 }),
    });
    expect(screen.queryByText(/Si es otro turno/)).not.toBeInTheDocument();
  });

  it("no bloquea nada: el día sigue siendo elegible", () => {
    const { onElegir } = tira({
      porDia: jornadas({ dia: "2026-09-17", corridas: 1, m3: 5.6, pt: 2374, piezas: 40 }),
    });
    fireEvent.click(screen.getByText("17/09").closest("button")!);
    expect(onElegir).toHaveBeenCalledWith("2026-09-17");
  });
});

describe("cuando el día elegido quedó fuera de la semana a la vista", () => {
  it("lo dice, en vez de dibujar siete casilleros sin ninguno marcado", () => {
    tira({ valor: "2026-08-01", semana: SEMANA });
    expect(screen.getByText(/Estás viendo otra semana/i)).toBeInTheDocument();
    expect(screen.getByText(/sábado 01\/08/)).toBeInTheDocument();
  });
});

describe("si no se pudo leer lo ya producido", () => {
  it("lo dice y deja elegir igual", () => {
    const { onElegir } = tira({ error: "El servidor respondió 500" });
    expect(screen.getByText(/No se pudo leer lo ya producido/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("17/09").closest("button")!);
    expect(onElegir).toHaveBeenCalledWith("2026-09-17");
  });
});

/* ── En el modal de producir CON lote ─────────────────────────────────────── */

describe("la tira en «Declarar producción» del lote", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ jornadas: [], codigos: [], medidas: [] }), { status: 200 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  const material = {
    especie: "Tornillo",
    piezas: 3,
    volumenM3: 10,
    permisos: ["CON-25-001"],
  };

  it("aparece al declarar por primera vez", async () => {
    const { default: Modal } = await import("@/components/admin/forestal/CtpRegistrarProduccionModal");
    render(
      <Modal
        material={material}
        fecha="2026-09-16"
        guardando={false}
        error={null}
        onConfirmar={() => {}}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText("Día del registro")).toBeInTheDocument();
  });

  it("NO aparece al ampliar: esa corrida ya tiene su fecha", async () => {
    const { default: Modal } = await import("@/components/admin/forestal/CtpRegistrarProduccionModal");
    render(
      <Modal
        material={material}
        fecha="2026-09-16"
        yaDeclaradoM3={4.2}
        guardando={false}
        error={null}
        onConfirmar={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("Día del registro")).not.toBeInTheDocument();
  });
});
