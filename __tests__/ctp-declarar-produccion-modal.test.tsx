/**
 * «Declarar producción» en su modal aparte (ADR-429) — el camino del operario.
 *
 * Lo que fija:
 *  - el resumen sale de lo cubicado, una fila por especie (antes elegir una
 *    especie se la ponía a TODAS las piezas);
 *  - sin servicio no se registra, y «aserrío a un tercero» sin cuenta tampoco
 *    (el valor inicial nunca decide por el operador);
 *  - el precio es de SU servicio: cambiar de propia a tercero no convierte un
 *    precio de venta en un cobro de aserrío;
 *  - 409 POSIBLE_DUPLICADO → se pregunta y, si es otra jornada, se reenvía;
 *  - al registrar se VACÍA la libreta de «Producir sin lote» —el doble cobro
 *    medido en el ADR era reabrir y volver a declarar lo mismo—;
 *  - el cotejo del SNIFFS con varias especies compara sólo contra la suya;
 *  - una cuenta recién creada al lado aparece elegida sin recargar.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import CtpDeclararProduccionModal from "@/components/admin/forestal/CtpDeclararProduccionModal";
import CtpSniffsSinLote from "@/components/admin/forestal/CtpSniffsSinLote";
import CtpCobroAserrio, { type DirectorioForestal } from "@/components/admin/forestal/CtpCobroAserrio";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { TARIFARIO_VACIO } from "@/lib/forestal/tarifa-aserrio";
import type { ProduccionSinLoteInput, ProduccionSinLoteRespuesta } from "@/lib/forestal/declarar-produccion";

const { partesMock } = vi.hoisted(() => ({ partesMock: { lista: [] as unknown[] } }));

const parte = (id: string, nombre: string) => ({
  id,
  roles: ["proveedor"],
  nombre,
  categoria: null,
  docTipo: null,
  docNumero: null,
  activo: true,
  usos: 0,
  ultimoUso: null,
  adjuntos: [],
});

vi.mock("@/hooks/use-directorio-forestal", () => ({
  useDirectorioForestal: () => ({
    partes: partesMock.lista,
    vehiculos: [],
    vehiculosActivos: [],
    porRol: () => [],
    cargando: false,
    error: null,
    cargar: vi.fn(),
    guardarParte: vi.fn(),
    eliminarParte: vi.fn(),
    guardarVehiculo: vi.fn(),
    eliminarVehiculo: vi.fn(),
    marcarUso: vi.fn(),
    candidatosProveedor: [],
    conflictosProveedor: [],
    cargandoCandidatos: false,
    candidatosProveedorError: null,
    cargarCandidatosProveedor: vi.fn(),
    agregarCandidatoProveedor: vi.fn(),
  }),
}));

vi.mock("@/components/admin/forestal/hooks/use-tarifa-aserrio", () => ({
  useTarifaAserrio: () => ({
    tarifario: TARIFARIO_VACIO,
    cargando: false,
    guardando: false,
    error: null,
    guardar: vi.fn(),
    quitar: vi.fn(),
    recargar: vi.fn(),
    cargarBorrador: vi.fn(),
  }),
}));

vi.mock("@/components/admin/forestal/hooks/use-saldo-permisos", () => ({
  useSaldoPermisos: () => ({ datos: null, cargando: false, error: null, recargar: vi.fn() }),
}));

// jsdom no implementa `scrollIntoView`; el selector de cuenta lo llama al abrirse.
Element.prototype.scrollIntoView = vi.fn();

const SLUG = "qa-declarar";
const LIBRETA = `buleje-cubicacion-${SLUG}-ctp-produccion`;

const pieza = (id: string, especie: string | undefined, cantidad: number, e: number, a: number, l: number): PiezaCubicada => {
  const base = { id, cantidad, espesor: e, ancho: a, largo: l, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { ...base, especie, ...cubicarPieza(base) };
};

const MEZCLA: PiezaCubicada[] = [
  pieza("p-1-0", "Tornillo", 5, 2, 8, 10),
  pieza("p-1-1", "Cumala", 10, 1, 4, 8),
  pieza("p-1-2", "TORNILLO", 3, 1, 4, 8),
];

const respuestaOk: ProduccionSinLoteRespuesta = {
  corridas: [
    { id: "c-tor", lineNo: 31, especie: "Tornillo", pt: 100, m3: 0.2358, valorVenta: 350, aserrio: null },
    { id: "c-cum", lineNo: 32, especie: "Cumala", pt: 26.67, m3: 0.0629, valorVenta: null, aserrio: null },
  ],
  total: { pt: 126.67, m3: 0.2987, valorVenta: 350 },
};

type Respuesta = { status: number; body: unknown };
let respuestas: Respuesta[] = [];
let pedidos: ProduccionSinLoteInput[] = [];

beforeEach(() => {
  partesMock.lista = [];
  respuestas = [];
  pedidos = [];
  localStorage.clear();
  localStorage.setItem("active-tenant-slug", SLUG);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/produccion-sin-lote")) {
        pedidos.push(JSON.parse(String(init?.body)) as ProduccionSinLoteInput);
        const r = respuestas.shift() ?? { status: 500, body: { message: "sin respuesta armada" } };
        return new Response(JSON.stringify(r.body), { status: r.status });
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar(piezas: PiezaCubicada[] = MEZCLA) {
  const onRegistrado = vi.fn();
  const onCerrar = vi.fn();
  render(
    <ConfirmDialogProvider>
      <CtpDeclararProduccionModal
        abierto
        onCerrar={onCerrar}
        piezas={piezas}
        codigosEnPlanta={[]}
        fecha="2026-09-22"
        onFecha={vi.fn()}
        trozas={[]}
        onRegistrado={onRegistrado}
      />
    </ConfirmDialogProvider>,
  );
  return { onRegistrado, onCerrar };
}

const botonRegistrar = () => screen.getByRole("button", { name: /^Registrar/ });

describe("Declarar producción — el modal aparte", () => {
  it("arma el resumen por especie desde lo cubicado: TORNILLO y Tornillo son una, cada especie una corrida", () => {
    montar();
    const tabla = screen.getByRole("table", { name: /Resumen de lo que se declara/ });
    const especies = within(tabla)
      .getAllByRole("rowheader")
      .map((th) => th.textContent)
      .filter((t) => t === "Tornillo" || t === "Cumala" || t === "TORNILLO");
    expect(especies).toEqual(["Tornillo", "Cumala"]);
    expect(botonRegistrar().textContent).toMatch(/Registrar 2 corridas/);
  });

  it("sin elegir el servicio no registra", () => {
    montar();
    expect(botonRegistrar()).toHaveProperty("disabled", true);
    expect(screen.getByText(/Elige el tipo de servicio/)).toBeTruthy();
    fireEvent.click(botonRegistrar());
    expect(pedidos).toHaveLength(0);
  });

  it("aserrío a un tercero sin cuenta elegida no registra", () => {
    montar();
    fireEvent.click(screen.getByRole("radio", { name: /Servicio de aserrío a un tercero/ }));
    expect(botonRegistrar()).toHaveProperty("disabled", true);
    expect(screen.getByText(/Elige la cuenta del cliente, o créala/)).toBeTruthy();
  });

  it("el precio es de su servicio: pasar a tercero no arrastra el precio de venta", () => {
    montar();
    fireEvent.click(screen.getByRole("radio", { name: /Madera propia/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Precio de venta de Tornillo/ }), { target: { value: "3.5" } });
    fireEvent.click(screen.getByRole("radio", { name: /Servicio de aserrío a un tercero/ }));
    expect((screen.getByRole("textbox", { name: /Precio del aserrío de Tornillo/ }) as HTMLInputElement).value).toBe("");
  });

  it("409 POSIBLE_DUPLICADO: pregunta y, si es otra jornada, reenvía con confirmarDuplicado", async () => {
    respuestas = [
      { status: 409, body: { error: "POSIBLE_DUPLICADO", message: "Ya hay una del 22/09 con 0,2358 m³ de Tornillo." } },
      { status: 200, body: respuestaOk },
    ];
    const { onRegistrado } = montar();
    fireEvent.click(screen.getByRole("radio", { name: /Madera propia/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Precio de venta de Tornillo/ }), { target: { value: "3.5" } });
    fireEvent.click(botonRegistrar());

    const seguir = await screen.findByRole("button", { name: "Es otra: registrar igual" });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.confirmarDuplicado).toBeUndefined();
    fireEvent.click(seguir);

    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1]?.confirmarDuplicado).toBe(true);
    /* Un asiento por especie y el precio de la que lo tiene; la otra, `null` (nunca 0). */
    expect(pedidos[1]?.corridas.map((c) => c.especie)).toEqual(["Tornillo", "Cumala"]);
    expect(pedidos[1]?.servicio).toEqual({
      tipo: "propia",
      preciosVentaPt: [
        { especie: "Tornillo", precioPt: 3.5 },
        { especie: "Cumala", precioPt: null },
      ],
    });
  });

  it("al registrar vacía la libreta de «Producir sin lote»: reabrir no puede declarar lo mismo otra vez", async () => {
    localStorage.setItem(LIBRETA, JSON.stringify(MEZCLA));
    localStorage.setItem(`${LIBRETA}-apartados`, JSON.stringify({ "p-1-0": 1 }));
    localStorage.setItem(`${LIBRETA}-cols`, JSON.stringify(["especie"]));
    respuestas = [{ status: 200, body: respuestaOk }];
    const { onRegistrado } = montar();
    fireEvent.click(screen.getByRole("radio", { name: /Madera propia/ }));
    fireEvent.click(botonRegistrar());

    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(LIBRETA)).toBeNull();
    expect(localStorage.getItem(`${LIBRETA}-apartados`)).toBeNull();
    /* Las preferencias de quien cubica no son de la jornada: quedan. */
    expect(localStorage.getItem(`${LIBRETA}-cols`)).not.toBeNull();
    expect(String(onRegistrado.mock.calls[0]?.[0])).toMatch(/2 corridas \(Tornillo N\.º 31, Cumala N\.º 32\)/);
    expect(String(onRegistrado.mock.calls[0]?.[0])).toMatch(/Sin precio de venta: Cumala/);
  });

  it("un error del servidor se explica y la libreta NO se toca", async () => {
    localStorage.setItem(LIBRETA, JSON.stringify(MEZCLA));
    respuestas = [{ status: 409, body: { error: "PARTE_NO_EXISTE", message: "" } }];
    const { onRegistrado } = montar();
    fireEvent.click(screen.getByRole("radio", { name: /Madera propia/ }));
    fireEvent.click(botonRegistrar());
    expect(await screen.findByText(/La cuenta elegida ya no está en el Directorio/)).toBeTruthy();
    expect(onRegistrado).not.toHaveBeenCalled();
    expect(localStorage.getItem(LIBRETA)).not.toBeNull();
  });

  it("lo que no tiene especie bloquea y se le puede poner acá, sin pisar la de las demás", () => {
    montar([...MEZCLA, pieza("p-1-3", undefined, 4, 1, 6, 8)]);
    expect(screen.getByText(/4 piezas \(1 medida\) sin especie/)).toBeTruthy();
    expect(botonRegistrar()).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("combobox", { name: "Especie para las piezas que no tienen" }), {
      target: { value: "Cumala" },
    });
    expect(screen.queryByText(/sin especie: así no se puede registrar/)).toBeNull();
    const tabla = screen.getByRole("table", { name: /Resumen de lo que se declara/ });
    const especies = within(tabla)
      .getAllByRole("rowheader")
      .map((th) => th.textContent)
      .filter((t) => t === "Tornillo" || t === "Cumala");
    expect(especies).toEqual(["Tornillo", "Cumala"]);
  });

  it("la libreta que se vacía es la MISMA clave que escribe el cubicador", () => {
    const fuente = readFileSync(join(process.cwd(), "components/admin/forestal/CubicadorMadera.tsx"), "utf8");
    expect(fuente).toContain("return `buleje-cubicacion-${slug}${espacio}`;");
  });
});

describe("SNIFFS con varias especies", () => {
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

  it("la captura de tornillo se coteja sólo contra el tornillo, no contra la cumala del mismo lote", async () => {
    const tornillo = [
      { productType: "MADERA ASERRADA (COMERCIAL)", volumenM3: 6.5 },
      { productType: "MADERA ASERRADA (PAQUETERIA CORTA)", volumenM3: 3.2 },
    ];
    const cumala = [{ productType: "MADERA ASERRADA (COMERCIAL)", volumenM3: 2 }];
    render(
      <CtpSniffsSinLote
        paquetes={[...tornillo, ...cumala]}
        especie="Tornillo / Cumala"
        corridas={[
          { especie: "Tornillo", paquetes: tornillo },
          { especie: "Cumala", paquetes: cumala },
        ]}
        especiesConocidas={["Tornillo", "Cumala"]}
        fecha="2026-09-22"
        onUsarFecha={vi.fn()}
        onUsarEspecie={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    fireEvent.paste(document, { clipboardData: { items: [], getData: () => PEGADO } });
    await waitFor(() => expect(screen.getAllByText("Cuadra").length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText("No cuadra")).toBeNull();
  });
});

describe("Cuenta recién creada", () => {
  it("el selector usa la libreta de quien lo monta: la cuenta nueva sale elegida sin recargar", () => {
    /* La libreta propia del bloque (el hook) NO la tiene; la de afuera, sí. */
    partesMock.lista = [];
    const directorio = {
      partes: [parte("nueva", "Comunidad Nativa San Luis")],
      vehiculos: [],
      cargando: false,
      error: null,
      candidatosProveedor: [],
      conflictosProveedor: [],
      cargandoCandidatos: false,
      candidatosProveedorError: null,
      cargarCandidatosProveedor: vi.fn(),
      agregarCandidatoProveedor: vi.fn(),
    } as unknown as DirectorioForestal;
    render(
      <CtpCobroAserrio
        soloDueno
        directorio={directorio}
        fecha="2026-09-22"
        bloques={[]}
        valor={{ duenoParteId: "nueva", precioManualPt: null }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Comunidad Nativa San Luis/ })).toBeTruthy();
    /* soloDueno: el precio va por especie en el resumen, acá no se repite. */
    expect(screen.queryByText("Precio a mano")).toBeNull();
  });
});
