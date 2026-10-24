/**
 * __tests__/sniffs-sin-lote-cotejo.test.tsx
 *
 * «Traer del SNIFFS» dentro de «Producir sin lote»: lo pegado NO arma paquetes
 * —los m³ del Libro salen del pie tablar de lo cubicado— y en vez del cotejo
 * contra el material (que acá no existe: la corrida nace sin consumos) se
 * coteja contra lo cubicado, producto por producto.
 *
 * El camino que se prueba es el del operario: el TEXTO que sale de la pantalla
 * del SNIFFS entra por el parser de verdad, no por un objeto armado a mano.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { interpretarDetalleProduccionSniffs } from "@/lib/forestal/sniffs-produccion-parse";
import {
  cotejarSniffsSinLote,
  especieComoLaEscribeElLibro,
  lineaObservacionSniffs,
} from "@/lib/forestal/sniffs-cotejo-sin-lote";
import {
  PanelCotejoSniffs,
  type CotejoSniffsProps,
} from "@/components/admin/forestal/CtpCotejoSniffsPanel";

/** Lo que copia el portapapeles al seleccionar la tabla del SNIFFS. */
const PEGADO = `Detalle de la programacion de produccion:
N° de Lote: Fecha Inicio: Fecha Fin:
18-2026 01/08/2026 01/10/2026
Especie:
Cedrelinga cateniformis - TORNILLO
Volumen consumido: 30.000
Resumen de Produccion por PMF y Producto
Especie Producto Volumen (m3) Porcentaje aprovechado (%)
Cedrelinga cateniformis - TORNILLO MADERA ASERRADA (COMERCIAL) 6.500 21.66
Cedrelinga cateniformis - TORNILLO MADERA ASERRADA (PAQUETERIA CORTA) 3.200 10.66`;

const detalle = () => interpretarDetalleProduccionSniffs(PEGADO);

const pq = (productType: string | null, volumenM3: number) => ({ productType, volumenM3 });

describe("lo que el SNIFFS declara, contra lo cubicado", () => {
  it("lee la captura: lote, fechas, especie y consumido", () => {
    const d = detalle();
    expect(d.lote).toBe("18-2026");
    expect(d.fechaInicio).toBe("2026-08-01");
    expect(d.especieComun).toBe("TORNILLO");
    expect(d.volumenConsumidoM3).toBe(30);
    expect(d.productos).toHaveLength(2);
  });

  it("cuadra cuando lo cubicado dice lo mismo, producto por producto", () => {
    const c = cotejarSniffsSinLote(detalle(), {
      paquetes: [
        pq("MADERA ASERRADA (COMERCIAL)", 6.5),
        pq("MADERA ASERRADA (PAQUETERIA CORTA)", 3.2),
      ],
      especie: "Tornillo",
    });
    expect(c.filas.map((f) => f.estado)).toEqual(["cuadra", "cuadra"]);
    expect(c.totales).toMatchObject({
      sniffsM3: 9.7,
      cubicadoM3: 9.7,
      diferenciaM3: 0,
      cuadra: true,
    });
    expect(c.especie.estado).toBe("coincide");
    expect(c.avisos).toHaveLength(0);
  });

  it("medio litro de redondeo NO es una diferencia (el SNIFFS imprime 3 decimales)", () => {
    const c = cotejarSniffsSinLote(detalle(), {
      paquetes: [
        pq("MADERA ASERRADA (COMERCIAL)", 6.5005),
        pq("MADERA ASERRADA (PAQUETERIA CORTA)", 3.2),
      ],
      especie: "Tornillo",
    });
    expect(c.filas[0].estado).toBe("cuadra");
    expect(c.avisos).toHaveLength(0);
  });

  it("dice la diferencia de un producto y del total, sin corregir ninguno de los dos", () => {
    const c = cotejarSniffsSinLote(detalle(), {
      paquetes: [
        pq("MADERA ASERRADA (COMERCIAL)", 6.1),
        pq("MADERA ASERRADA (PAQUETERIA CORTA)", 3.2),
      ],
      especie: "Tornillo",
    });
    expect(c.filas[0]).toMatchObject({
      estado: "difiere",
      sniffsM3: 6.5,
      cubicadoM3: 6.1,
      diferenciaM3: -0.4,
    });
    expect(c.totales.cubicadoM3).toBe(9.3);
    expect(c.avisos.map((a) => a.texto).join(" ")).toMatch(/Se registra lo cubicado/);
  });

  it("marca el producto declarado que no se cubicó y el cubicado que no se declaró", () => {
    const c = cotejarSniffsSinLote(detalle(), {
      paquetes: [pq("MADERA ASERRADA (COMERCIAL)", 6.5), pq("MADERA ASERRADA (TABLA)", 1)],
      especie: "Tornillo",
    });
    expect(c.filas.find((f) => f.producto === "MADERA ASERRADA (PAQUETERIA CORTA)")?.estado).toBe(
      "falta-cubicar",
    );
    expect(c.filas.find((f) => f.producto === "MADERA ASERRADA (TABLA)")?.estado).toBe("de-mas");
    const textos = c.avisos.map((a) => a.texto).join(" ");
    expect(textos).toMatch(/no cubicaste/);
    expect(textos).toMatch(/la captura no declara/);
  });

  it("un paquete sin producto se coteja como el genérico, que es lo que se registra", () => {
    const c = cotejarSniffsSinLote(interpretarDetalleProduccionSniffs(PEGADO), {
      paquetes: [pq(null, 2)],
      especie: "Tornillo",
    });
    expect(c.filas.find((f) => f.producto === "MADERA ASERRADA")?.cubicadoM3).toBe(2);
  });

  it("la captura de OTRA especie salta como error, y nada se cambia solo", () => {
    const c = cotejarSniffsSinLote(detalle(), {
      paquetes: [
        pq("MADERA ASERRADA (COMERCIAL)", 6.5),
        pq("MADERA ASERRADA (PAQUETERIA CORTA)", 3.2),
      ],
      especie: "Copaiba",
    });
    expect(c.especie.estado).toBe("difiere");
    expect(c.avisos[0]).toMatchObject({ tono: "error" });
    expect(c.avisos[0].texto).toMatch(/TORNILLO.*Copaiba/);
  });

  it("«TORNILLO» de la captura se declara con la grafía que el libro ya usa", () => {
    expect(especieComoLaEscribeElLibro("TORNILLO", ["Cumala", "Tornillo"])).toBe("Tornillo");
    expect(especieComoLaEscribeElLibro("Marupa", ["Cumala", "Marupá"])).toBe("Marupá");
    expect(especieComoLaEscribeElLibro("QUINILLA", ["Cumala"])).toBe("QUINILLA");
  });
});

describe("una captura sin la tabla de productos", () => {
  const SOLO_CABECERA = `Detalle de la programacion de produccion:
N° de Lote: Fecha Inicio: Fecha Fin:
18-2026 01/08/2026 01/10/2026
Especie:
Cedrelinga cateniformis - TORNILLO
Volumen consumido: 30.000`;

  it("no pinta lo cubicado como «de más»: el que no dijo nada es el papel", () => {
    const d = interpretarDetalleProduccionSniffs(SOLO_CABECERA);
    expect(d.productos).toHaveLength(0);
    const c = cotejarSniffsSinLote(d, {
      paquetes: [pq("MADERA ASERRADA (TABLA)", 4)],
      especie: "Tornillo",
    });
    expect(c.filas).toHaveLength(0);
    expect(c.avisos.some((a) => /la captura no declara/.test(a.texto))).toBe(false);
    /* Lo que sí se leyó se sigue cotejando: el rendimiento sale del consumido. */
    expect(c.rendimiento).toMatchObject({ consumidoM3: 30, pct: 13.3 });
  });

  it("el hueco lo explica UN solo cartel, el del parser", () => {
    const d = interpretarDetalleProduccionSniffs(SOLO_CABECERA);
    const c = cotejarSniffsSinLote(d, { paquetes: [pq(null, 1)], especie: "Tornillo" });
    expect(
      c.avisos.filter((a) => /filas de producto|tabla de productos/i.test(a.texto)),
    ).toHaveLength(1);
  });
});

describe("el rendimiento es un DERIVADO del consumido que declara la captura", () => {
  const conCubicado = (m3: number) =>
    cotejarSniffsSinLote(detalle(), {
      paquetes: [pq("MADERA ASERRADA (COMERCIAL)", m3)],
      especie: "Tornillo",
    });

  it("bajo el tope del 56 % no dice nada del rendimiento", () => {
    const c = conCubicado(16);
    expect(c.rendimiento).toMatchObject({
      consumidoM3: 30,
      topeM3: 16.8,
      excede: false,
      imposible: false,
    });
    expect(c.avisos.some((a) => /tope del 56/.test(a.texto))).toBe(false);
  });

  it("por encima del 56 % avisa lo que va a pasar al vincularle la materia prima", () => {
    const c = conCubicado(20);
    expect(c.rendimiento).toMatchObject({ pct: 66.7, excede: true, imposible: false });
    const aviso = c.avisos.find((a) => /tope del 56/.test(a.texto));
    expect(aviso?.tono).toBe("aviso");
    expect(aviso?.texto).toMatch(/cuando le vincules su materia prima/);
  });

  it("más producto que madera consumida es imposible: error", () => {
    const c = conCubicado(31);
    expect(c.rendimiento?.imposible).toBe(true);
    expect(c.avisos[0]).toMatchObject({ tono: "error" });
  });

  it("sin consumido en la captura no hay rendimiento que inventar", () => {
    const sinConsumido = interpretarDetalleProduccionSniffs(
      PEGADO.replace("Volumen consumido: 30.000", "Volumen consumido:"),
    );
    expect(sinConsumido.volumenConsumidoM3).toBeNull();
    expect(
      cotejarSniffsSinLote(sinConsumido, { paquetes: [pq(null, 5)], especie: "Tornillo" })
        .rendimiento,
    ).toBeNull();
  });
});

describe("el panel: lo que puede bajar al formulario, y lo que no", () => {
  const armar = (extra: Partial<CotejoSniffsProps> = {}) => {
    const d = detalle();
    const onUsarFecha = vi.fn();
    const onUsarEspecie = vi.fn();
    const onAnotar = vi.fn();
    const props: CotejoSniffsProps = {
      detalle: d,
      cotejo: cotejarSniffsSinLote(d, {
        paquetes: [pq("MADERA ASERRADA (COMERCIAL)", 6.5)],
        especie: null,
      }),
      fecha: "2026-09-14",
      especiesConocidas: ["Cumala", "Tornillo"],
      onUsarFecha,
      onUsarEspecie,
      onAnotar,
      onDescartar: vi.fn(),
      ...extra,
    };
    render(<PanelCotejoSniffs {...props} />);
    return { onUsarFecha, onUsarEspecie, onAnotar };
  };

  it("NO ofrece agregar paquetes: la tabla del Libro sale de lo cubicado", () => {
    armar();
    expect(screen.queryByRole("button", { name: /agregar/i })).toBeNull();
    expect(screen.getByText(/no agrega paquetes/i)).toBeTruthy();
  });

  it("ofrece la fecha leída, con un botón", () => {
    const { onUsarFecha } = armar();
    fireEvent.click(screen.getByRole("button", { name: /Usar 01\/08\/2026 como fecha/ }));
    expect(onUsarFecha).toHaveBeenCalledWith("2026-08-01");
  });

  it("no ofrece la fecha cuando el formulario ya la tiene", () => {
    armar({ fecha: "2026-08-01" });
    expect(screen.queryByRole("button", { name: /como fecha/ })).toBeNull();
  });

  it("ofrece declarar la especie leída con la grafía del libro", () => {
    const { onUsarEspecie } = armar();
    fireEvent.click(screen.getByRole("button", { name: /Declarar Tornillo como especie/ }));
    expect(onUsarEspecie).toHaveBeenCalledWith("Tornillo");
  });

  it("no ofrece la especie cuando el asiento ya declara una", () => {
    const d = detalle();
    armar({ cotejo: cotejarSniffsSinLote(d, { paquetes: [pq(null, 1)], especie: "Tornillo" }) });
    expect(screen.queryByRole("button", { name: /como especie/ })).toBeNull();
  });

  it("deja el rastro en las observaciones sólo si se lo pide", () => {
    const { onAnotar } = armar();
    expect(onAnotar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Anotarlo en observaciones/ }));
    expect(onAnotar).toHaveBeenCalledTimes(1);
    expect(String(onAnotar.mock.calls[0]?.[0])).toMatch(/programación 18-2026/);
    expect(screen.getByRole("button", { name: /Anotado/ })).toBeTruthy();
  });

  it("dice que el consumido de la captura no tiene contra qué cotejarse acá", () => {
    armar();
    expect(screen.getByText(/esta corrida nace sin consumos/i)).toBeTruthy();
  });
});

describe("la línea que queda en el asiento", () => {
  it("dice de qué programación salió y los dos volúmenes", () => {
    const d = detalle();
    const c = cotejarSniffsSinLote(d, {
      paquetes: [pq("MADERA ASERRADA (COMERCIAL)", 6.5)],
      especie: "Tornillo",
    });
    const linea = lineaObservacionSniffs(d, c);
    expect(linea).toMatch(/programación 18-2026/);
    expect(linea).toMatch(/consumido 30/);
    expect(linea).toMatch(/cubicado 6/);
  });
});
