import { describe, expect, it } from "vitest";
import {
  AGRUPAR_MS,
  AVISO_POR_CAMARA_MS,
  CALMA_MS,
  ESTADO_AVISOS_INICIAL,
  TOPE_SIN_VER,
  marcarVisto,
  registrarSenal,
  resumenSinVer,
  soltarMensaje,
  textoMovimiento,
  type EstadoAvisos,
  type SenalCamara,
} from "@/lib/camaras/avisos-segundo-plano";

const T0 = Date.UTC(2026, 9, 10, 19, 5, 0); // 14:05 en Lima

function senal(at: number, extra: Partial<SenalCamara> = {}): SenalCamara {
  return {
    camaraId: "patio",
    nombre: "Patio de trozas",
    at,
    movimiento: true,
    aparicion: false,
    personas: 0,
    aLaVista: false,
    ...extra,
  };
}

/** Pasa una serie de señales y devuelve el estado y las decisiones. */
function correr(senales: SenalCamara[], inicial: EstadoAvisos = ESTADO_AVISOS_INICIAL, silencio = 0) {
  let estado = inicial;
  const decisiones = senales.map((s) => {
    const d = registrarSenal(estado, s, silencio);
    estado = d.estado;
    return d;
  });
  return { estado, decisiones };
}

describe("registrarSenal — movimiento", () => {
  it("una sola mirada con movimiento es un parpadeo: no cuenta", () => {
    const { estado, decisiones } = correr([senal(T0)]);
    expect(decisiones[0].evento).toBeNull();
    expect(estado.sinVer).toHaveLength(0);
  });

  it("dos miradas seguidas cuentan UN evento y avisan", () => {
    const { estado, decisiones } = correr([senal(T0), senal(T0 + 1_000)]);
    expect(decisiones[1].evento?.tipo).toBe("movimiento");
    expect(decisiones[1].mensaje?.camaras.map((c) => c.nombre)).toEqual(["Patio de trozas"]);
    expect(estado.sinVer).toHaveLength(1);
  });

  it("movimiento sostenido (una rama todo el rato) sigue siendo un solo evento", () => {
    const senales = Array.from({ length: 300 }, (_, i) => senal(T0 + i * 1_000));
    const { estado } = correr(senales);
    expect(estado.sinVer).toHaveLength(1);
  });

  it("tras la calma, el movimiento siguiente es otro evento", () => {
    const { estado } = correr([
      senal(T0),
      senal(T0 + 1_000),
      senal(T0 + 1_000 + CALMA_MS + 1),
      senal(T0 + 2_000 + CALMA_MS + 1),
    ]);
    expect(estado.sinVer).toHaveLength(2);
  });

  it("anti-spam: un mensaje por cámara cada 5 min, aunque el contador siga sumando", () => {
    const dos = (t: number) => [senal(t), senal(t + 1_000)];
    const otraVez = T0 + CALMA_MS + 10_000; // evento nuevo, pero dentro de los 5 min
    const pasados = T0 + AVISO_POR_CAMARA_MS + 5_000;
    const { estado, decisiones } = correr([...dos(T0), ...dos(otraVez), ...dos(pasados)]);
    expect(estado.sinVer).toHaveLength(3);
    expect(decisiones[1].mensaje).not.toBeNull();
    expect(decisiones[3].mensaje).toBeNull();
    expect(decisiones[5].mensaje).not.toBeNull();
  });

  it("agrupa cámaras que se mueven dentro de la ventana en un mismo mensaje", () => {
    const entrada = { camaraId: "entrada", nombre: "Entrada" };
    const { decisiones } = correr([
      senal(T0),
      senal(T0 + 1_000),
      senal(T0 + 10_000, entrada),
      senal(T0 + 11_000, entrada),
    ]);
    expect(decisiones[3].mensaje?.camaras.map((c) => c.nombre)).toEqual(["Patio de trozas", "Entrada"]);
  });

  it("fuera de la ventana de agrupar, el mensaje es nuevo", () => {
    const entrada = { camaraId: "entrada", nombre: "Entrada" };
    const t = T0 + AGRUPAR_MS + 5_000;
    const { decisiones } = correr([senal(T0), senal(T0 + 1_000), senal(t, entrada), senal(t + 1_000, entrada)]);
    expect(decisiones[3].mensaje?.camaras.map((c) => c.nombre)).toEqual(["Entrada"]);
  });

  it("silenciado: suma al contador pero no avisa", () => {
    const { estado, decisiones } = correr([senal(T0), senal(T0 + 1_000)], ESTADO_AVISOS_INICIAL, T0 + 60 * 60_000);
    expect(estado.sinVer).toHaveLength(1);
    expect(decisiones[1].mensaje).toBeNull();
  });

  it("a la vista (mosaico abierto): ni suma ni avisa, y al minimizar no salta el evento en curso", () => {
    const { estado, decisiones } = correr([
      senal(T0, { aLaVista: true }),
      senal(T0 + 1_000, { aLaVista: true }),
      senal(T0 + 2_000),
      senal(T0 + 3_000),
    ]);
    expect(decisiones.every((d) => d.evento === null && d.mensaje === null)).toBe(true);
    expect(estado.sinVer).toHaveLength(0);
  });
});

describe("registrarSenal — personas", () => {
  it("«apareció alguien» cuenta al toque, sin mensaje propio (lo pone el mosaico)", () => {
    const { estado, decisiones } = correr([senal(T0, { aparicion: true, personas: 1, movimiento: false })]);
    expect(decisiones[0].evento?.tipo).toBe("persona");
    expect(decisiones[0].mensaje).toBeNull();
    expect(estado.sinVer).toHaveLength(1);
  });

  it("la persona reemplaza al mensaje de movimiento de su cámara y no hay otro de movimiento", () => {
    const { estado, decisiones } = correr([
      senal(T0),
      senal(T0 + 1_000),
      senal(T0 + 3_000, { aparicion: true, personas: 1 }),
      senal(T0 + 3_000 + CALMA_MS + 1),
      senal(T0 + 4_000 + CALMA_MS + 1),
    ]);
    expect(decisiones[2].quitarMensaje).toBe(true);
    expect(decisiones[4].evento?.tipo).toBe("movimiento");
    expect(decisiones[4].mensaje).toBeNull(); // dentro de los 5 min del aviso de la persona
    expect(estado.sinVer.map((e) => e.tipo)).toEqual(["movimiento", "persona", "movimiento"]);
  });

  it("si el mensaje agrupaba dos cámaras, la persona sólo saca la suya", () => {
    const entrada = { camaraId: "entrada", nombre: "Entrada" };
    const { decisiones } = correr([
      senal(T0),
      senal(T0 + 1_000),
      senal(T0 + 5_000, entrada),
      senal(T0 + 6_000, entrada),
      senal(T0 + 8_000, { aparicion: true, personas: 2 }),
    ]);
    expect(decisiones[4].quitarMensaje).toBe(false);
    expect(decisiones[4].mensaje?.camaras.map((c) => c.nombre)).toEqual(["Entrada"]);
  });
});

describe("mensaje cerrado o visto", () => {
  const entrada = { camaraId: "entrada", nombre: "Entrada" };

  it("tras «Ver» (marcarVisto), el próximo mensaje no repite las cámaras ya vistas", () => {
    const { estado } = correr([senal(T0), senal(T0 + 1_000)]);
    const visto = marcarVisto(estado);
    const { decisiones } = correr([senal(T0 + 5_000, entrada), senal(T0 + 6_000, entrada)], visto);
    expect(decisiones[1].mensaje?.camaras.map((c) => c.nombre)).toEqual(["Entrada"]);
  });

  it("si el mensaje se cerró solo, el siguiente arma su propio grupo", () => {
    const { estado, decisiones } = correr([senal(T0), senal(T0 + 1_000)]);
    const cerrado = soltarMensaje(estado, decisiones[1].mensaje?.at ?? 0);
    const r = correr([senal(T0 + 12_000, entrada), senal(T0 + 13_000, entrada)], cerrado);
    expect(r.decisiones[1].mensaje?.camaras.map((c) => c.nombre)).toEqual(["Entrada"]);
    expect(cerrado.sinVer).toHaveLength(1); // cerrar el mensaje no lo da por visto
  });

  it("soltarMensaje de un mensaje viejo no toca el actual", () => {
    const { estado } = correr([senal(T0), senal(T0 + 1_000)]);
    expect(soltarMensaje(estado, 123)).toBe(estado);
  });
});

describe("contador y textos", () => {
  it("marcarVisto vacía el contador; el tope evita crecer sin fin", () => {
    const muchas: SenalCamara[] = [];
    for (let i = 0; i < TOPE_SIN_VER + 10; i++) muchas.push(senal(T0 + i * 1_000, { aparicion: true, movimiento: false }));
    const { estado } = correr(muchas);
    expect(estado.sinVer).toHaveLength(TOPE_SIN_VER);
    expect(marcarVisto(estado).sinVer).toHaveLength(0);
  });

  it("textoMovimiento con 1, 2 y 3 cámaras", () => {
    expect(textoMovimiento(["Patio de trozas"])).toBe("Movimiento en Patio de trozas");
    expect(textoMovimiento(["Patio de trozas", "Entrada"])).toBe("Movimiento en Patio de trozas y Entrada");
    expect(textoMovimiento(["a", "b", "c"])).toBe("Movimiento en 3 cámaras");
  });

  it("resumenSinVer dice cuántos y el último con su hora de Lima", () => {
    const { estado } = correr([senal(T0), senal(T0 + 1_000)]);
    expect(resumenSinVer(estado.sinVer)).toBe("1 aviso sin ver · el último, movimiento en Patio de trozas a las 14:05");
    expect(resumenSinVer([])).toBeNull();
  });
});
