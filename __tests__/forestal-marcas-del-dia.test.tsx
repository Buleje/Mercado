/**
 * Las marcas de origen y salida de un día (ADR-445, 27-09).
 *
 * Brandon: saber en la tira qué día viene de cubicar pieza por pieza y cuál se
 * declaró por tipo, y cuál salió, con qué guía y cuál no. Se fija:
 *  · cada estado → su ícono y su frase para el lector (no sólo un color);
 *  · «con cubicación» sólo cuando lo vinculado cubre lo declarado;
 *  · sin el dato (respuesta vieja) no hay marca: no se inventa;
 *  · los chips de la semana cuentan días y resaltan los casilleros.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import type { EstadoDeSalida, OrigenDelDia, OrigenYSalida } from "@/lib/forestal/origen-y-salida-del-dia";
import {
  chipsDeLaSemana,
  MARCA_ORIGEN,
  MARCA_SALIDA,
  origenVisibleDelDia,
  type Marca,
} from "@/components/admin/forestal/marcas-del-dia";
import { MarcasDelCasillero } from "@/components/admin/forestal/ctp-casillero-marcas";
import CtpSemanaDeRegistro from "@/components/admin/forestal/CtpSemanaDeRegistro";
import type { JornadaDeProduccion } from "@/components/admin/forestal/hooks/use-jornadas-produccion";

afterEach(() => cleanup());

const os = (over: Partial<OrigenYSalida> = {}, salida: Partial<OrigenYSalida["salida"]> = {}): OrigenYSalida => ({
  origen: "cubicado",
  m3Declarado: 1,
  m3Cubicado: 1,
  m3ConCubicacion: 0,
  porDeclarar: 0,
  cubicaciones: [],
  ...over,
  salida: {
    estado: "sin_salida",
    m3Despachado: 0,
    m3Reprocesado: 0,
    m3SinGuia: 0,
    m3EnPatio: 1,
    apartados: 0,
    guias: [],
    ...salida,
  },
});

/** El nombre lucide del `<svg>` («lucide-ruler»): con eso se compara «es ESE ícono». */
const iconoDe = (svg: Element | null | undefined): string =>
  /lucide-[a-z0-9-]+/.exec(svg?.getAttribute("class") ?? "")?.[0] ?? "";
function claseDe(marca: Marca): string {
  const { container } = render(createElement(marca.Icono));
  const clase = iconoDe(container.querySelector("svg"));
  cleanup();
  return clase;
}
const clases = (el: Element) => el.className.split(/\s+/);

describe("cada origen tiene su ícono y su frase", () => {
  const ORIGENES: OrigenDelDia[] = ["cubicado", "por_tipo", "mixto", "por_declarar"];
  for (const origen of ORIGENES) {
    it(origen, () => {
      const esperado = claseDe(MARCA_ORIGEN[origen]);
      render(<MarcasDelCasillero os={os({ origen })} />);
      const marca = screen.getByRole("img", { name: `Origen: ${MARCA_ORIGEN[origen].largo}` });
      expect(iconoDe(marca.querySelector("svg"))).toBe(esperado);
      expect(marca).toHaveAttribute("title", `Origen: ${MARCA_ORIGEN[origen].largo}`);
    });
  }

  it("cubicado y por tipo se distinguen por la FORMA, no sólo por el color", () => {
    expect(claseDe(MARCA_ORIGEN.cubicado)).not.toBe(claseDe(MARCA_ORIGEN.por_tipo));
    expect(MARCA_ORIGEN.cubicado.corto).toBe("Cubicado");
    expect(MARCA_ORIGEN.por_tipo.corto).toBe("Por tipo");
  });

  it("un día por tipo con su cubicación que CUBRE lo declarado pasa a «con cubicación»", () => {
    const cub = { id: "c1", nombre: "Lote lunes", m3: 3.19, pt: 1352, piezas: 132, corridas: ["x"], soloEsteDia: true };
    const completo = os({ origen: "por_tipo", m3Declarado: 3.2, m3Cubicado: 0, m3ConCubicacion: 3.19, cubicaciones: [cub] });
    expect(origenVisibleDelDia(completo)).toBe("con_cubicacion");
    render(<MarcasDelCasillero os={completo} />);
    const marca = screen.getByRole("img", { name: /^Origen: Por tipo, con su cubicación vinculada/ });
    expect(iconoDe(marca.querySelector("svg"))).toBe(claseDe(MARCA_ORIGEN.con_cubicacion));
  });

  it("si lo vinculado NO cubre lo declarado, sigue «por tipo» (no se afirma lo que no está)", () => {
    const cub = { id: "c1", nombre: "Media", m3: 1.5, pt: 636, piezas: 60, corridas: ["x"], soloEsteDia: true };
    expect(
      origenVisibleDelDia(os({ origen: "por_tipo", m3Declarado: 3.2, m3Cubicado: 0, m3ConCubicacion: 1.5, cubicaciones: [cub] })),
    ).toBe("por_tipo");
  });
});

describe("cada salida tiene su ícono y dice sus guías", () => {
  const SALIDAS: EstadoDeSalida[] = ["sin_salida", "parcial", "despachado", "sin_guia"];
  for (const estado of SALIDAS) {
    it(estado, () => {
      const esperado = claseDe(MARCA_SALIDA[estado]);
      render(<MarcasDelCasillero os={os({}, { estado })} />);
      const marca = screen.getByRole("img", { name: `Salida: ${MARCA_SALIDA[estado].largo}` });
      expect(iconoDe(marca.querySelector("svg"))).toBe(esperado);
    });
  }

  it("las cuatro salidas tienen cuatro íconos distintos", () => {
    const clases = new Set((Object.keys(MARCA_SALIDA) as EstadoDeSalida[]).map((e) => claseDe(MARCA_SALIDA[e])));
    expect(clases.size).toBe(4);
  });

  it("despachado dice el N° de GTF, y un borrador su N.º de línea", () => {
    render(
      <MarcasDelCasillero
        os={os(
          {},
          {
            estado: "despachado",
            m3Despachado: 1,
            m3EnPatio: 0,
            guias: [
              { despachoEntryId: "d1", lineNo: 95120, gtfNumber: "001-0000203", fecha: "2026-09-24", m3: 0.6, paquetes: ["PQ-1"] },
              { despachoEntryId: "d2", lineNo: 95121, gtfNumber: null, fecha: "2026-09-25", m3: 0.4, paquetes: [] },
            ],
          },
        )}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Salida: Salió todo con guía · GTF 001-0000203, Borrador N.º 95121" }),
    ).toBeInTheDocument();
  });

  it("lo pendiente (en patio, por declarar) lleva borde punteado: se lee sin color", () => {
    render(<MarcasDelCasillero os={os({ origen: "por_declarar" })} />);
    for (const m of screen.getAllByRole("img")) expect(m.className).toContain("border-dashed");
  });
});

describe("en la tira", () => {
  const SEMANA = "2026-09-16";
  const jornada = (dia: string, o?: OrigenYSalida): JornadaDeProduccion => ({
    dia,
    corridas: 1,
    m3: 1,
    pt: 424,
    piezas: 10,
    origenYSalida: o,
  });
  const tira = (porDia: Map<string, JornadaDeProduccion>) =>
    render(
      <CtpSemanaDeRegistro valor="2026-09-16" onElegir={() => {}} semana={SEMANA} onSemana={() => {}} porDia={porDia} />,
    );

  it("sin el dato del servidor no hay marca ni chips", () => {
    tira(new Map([["2026-09-15", jornada("2026-09-15")]]));
    expect(screen.queryByRole("img", { name: /^Origen:/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Resaltar días de la semana" })).toBeNull();
  });

  it("el casillero dice origen y salida; el chip cuenta días y resalta los suyos", () => {
    tira(
      new Map([
        ["2026-09-14", jornada("2026-09-14", os({ origen: "por_tipo", m3Cubicado: 0 }))],
        ["2026-09-15", jornada("2026-09-15", os({ origen: "por_tipo", m3Cubicado: 0 }, { estado: "sin_guia", m3SinGuia: 1, m3EnPatio: 0 }))],
        ["2026-09-17", jornada("2026-09-17", os({}, { estado: "despachado", m3Despachado: 1, m3EnPatio: 0 }))],
      ]),
    );
    const lunes = screen.getByText("14/09").closest("button")!;
    expect(within(lunes).getByRole("img", { name: /^Origen: Por tipo/ })).toBeInTheDocument();
    expect(within(lunes).getByRole("img", { name: /^Salida: Sin salida/ })).toBeInTheDocument();

    const chips = screen.getByRole("group", { name: "Resaltar días de la semana" });
    const porTipo = within(chips).getByRole("button", { name: "2 por tipo" });
    expect(within(chips).getByRole("button", { name: "1 sin guía" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "1 despachado" })).toBeInTheDocument();

    fireEvent.click(porTipo);
    expect(porTipo).toHaveAttribute("aria-pressed", "true");
    expect(clases(lunes)).toContain("ring-2");
    const jueves = screen.getByText("17/09").closest("button")!;
    expect(clases(jueves)).toContain("opacity-40");
    /* Otra vez: se suelta. */
    fireEvent.click(porTipo);
    expect(porTipo).toHaveAttribute("aria-pressed", "false");
    expect(clases(jueves)).not.toContain("opacity-40");
  });

  it("chipsDeLaSemana pone primero lo que pide trabajo", () => {
    const chips = chipsDeLaSemana([
      os(),
      os({ origen: "por_tipo" }, { estado: "sin_guia" }),
      undefined,
      os({}, { estado: "despachado" }),
    ]);
    expect(chips.map((c) => `${c.dias} ${c.dias === 1 ? c.marca.uno : c.marca.varios}`)).toEqual([
      "1 por tipo",
      "2 cubicados",
      "1 sin guía",
      "1 en patio",
      "1 despachado",
    ]);
  });
});
