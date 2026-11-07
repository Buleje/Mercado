/**
 * La franja «N árboles sin coordenadas» del mapa del Libro TH y su editor (30-09).
 *
 * Se fija lo que ve quien abre el mapa: el titular con el conteo, la lista
 * (código, especie, estado), quién ve «Cargar coordenadas» (mismo array que el
 * PATCH), que el editor manda SÓLO las coordenadas por el PATCH existente del
 * censo, que un dato malo no sale del navegador, que un rechazo del servidor
 * no se disfraza de «listo» y que al guardar el árbol entra al mapa y se centra.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const R = vi.hoisted(() => ({ rol: "admin" as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => R.rol }));

import LothMapaSinCoordenadasPanel from "@/components/admin/forestal/LothMapaSinCoordenadasPanel";
import { LISTA_ABIERTA_HASTA } from "@/components/admin/forestal/LothMapaSinCoordenadas";
import { toCenso, type CensusTreeDTO } from "@/components/admin/forestal/loth-mapa-shared";

const arbol = (id: string, extra: Partial<CensusTreeDTO> = {}): CensusTreeDTO => ({
  id,
  treeCode: id,
  speciesCommon: "Tornillo",
  estado: "en_pie",
  utmZona: "18S",
  utmX: "521961",
  utmY: "8918254",
  ...extra,
});

const CENSO: CensusTreeDTO[] = [
  arbol("111"),
  arbol("9-TOR", { speciesCommon: "Tornillo", utmX: null, utmY: null }),
  arbol("85-CAT", { speciesCommon: "Catahua", estado: "talado", utmX: null, utmY: null }),
];

let fetchMock: ReturnType<typeof vi.fn>;
const guardadoOk = (extra: Partial<CensusTreeDTO> = {}) =>
  new Response(JSON.stringify({ tree: { ...CENSO[1], utmX: "521922", utmY: "8918151", utmZona: "18S", ...extra } }), { status: 200 });

beforeEach(() => {
  R.rol = "admin";
  fetchMock = vi.fn().mockResolvedValue(guardadoOk());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar(trees: CensusTreeDTO[] = CENSO) {
  const onGuardado = vi.fn();
  const onCentrar = vi.fn();
  const r = render(<LothMapaSinCoordenadasPanel trees={trees} onGuardado={onGuardado} onCentrar={onCentrar} />);
  return { ...r, onGuardado, onCentrar };
}
const cuerpo = () => JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const abrir = (codigo: string) => fireEvent.click(screen.getByRole("button", { name: `Cargar coordenadas del árbol ${codigo}` }));

describe("la franja — qué dice", () => {
  it("cuenta los que no salen y lista código, especie y estado", () => {
    montar();
    expect(screen.getByRole("button", { name: /2 árboles sin coordenadas: no salen en el mapa/ })).toBeInTheDocument();
    const fila = screen.getByText("85-CAT").closest("li") as HTMLElement;
    expect(within(fila).getByText("Catahua")).toBeInTheDocument();
    expect(within(fila).getByText("Talado")).toBeInTheDocument();
    expect(within(fila).getByText("Sin Este ni Norte")).toBeInTheDocument();
    /* El que sí tiene coordenadas no está en la lista. */
    expect(screen.queryByText("111")).toBeNull();
  });

  it("en singular", () => {
    montar([CENSO[0], CENSO[1]]);
    expect(screen.getByText("1 árbol sin coordenadas: no sale en el mapa")).toBeInTheDocument();
  });

  it("con el censo completo no dibuja nada", () => {
    const { container } = montar([CENSO[0]]);
    expect(container.querySelector("[data-sin-coordenadas]")).toBeNull();
  });

  it(`con más de ${LISTA_ABIERTA_HASTA} la lista arranca plegada y se abre con el titular`, () => {
    const muchos = Array.from({ length: LISTA_ABIERTA_HASTA + 1 }, (_, i) => arbol(`${i + 1}-X`, { utmX: null, utmY: null }));
    montar(muchos);
    const titular = screen.getByRole("button", { name: /árboles sin coordenadas/ });
    expect(titular).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("1-X")).toBeNull();
    fireEvent.click(titular);
    expect(titular).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("1-X")).toBeInTheDocument();
  });
});

describe("la franja — quién ve «Cargar coordenadas»", () => {
  it.each(["almacenero", "cajero"])("sin permiso no hay botón (rol %s), y dice quién puede", (rol) => {
    R.rol = rol;
    montar();
    expect(screen.getByText("9-TOR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cargar coordenadas del árbol/ })).toBeNull();
    expect(screen.getByText(/lo hace el dueño o el administrador/)).toBeInTheDocument();
  });

  it("con el rol todavía cargando no hay botón, pero tampoco afirma que falte permiso", () => {
    R.rol = null;
    montar();
    expect(screen.queryByRole("button", { name: /Cargar coordenadas del árbol/ })).toBeNull();
    expect(screen.queryByText(/lo hace el dueño o el administrador/)).toBeNull();
  });

  it.each(["admin", "owner", "manager"])("%s sí lo ve", (rol) => {
    R.rol = rol;
    montar();
    expect(screen.getByRole("button", { name: "Cargar coordenadas del árbol 9-TOR" })).toBeInTheDocument();
  });
});

describe("el editor — cargar las coordenadas de ESE árbol", () => {
  it("abre con el árbol, sin coordenadas y con la zona que más usa el censo", () => {
    montar();
    abrir("9-TOR");
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/9-TOR · Tornillo/)).toBeInTheDocument();
    expect(campo("Este (m)").value).toBe("");
    expect(campo("Norte (m)").value).toBe("");
    expect(campo("Zona UTM").value).toBe("18S");
  });

  it("guarda SÓLO las coordenadas por el PATCH del censo, mete el árbol al mapa y lo centra", async () => {
    const { onGuardado, onCentrar } = montar();
    abrir("9-TOR");
    fireEvent.change(campo("Este (m)"), { target: { value: "521 922" } });
    fireEvent.change(campo("Norte (m)"), { target: { value: "8.918.151" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar coordenadas" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/forestal/plan/census");
    expect(init.method).toBe("PATCH");
    expect(cuerpo()).toEqual({ id: "9-TOR", utmX: 521922, utmY: 8918151, utmZona: "18S" });
    expect(onGuardado).toHaveBeenCalledTimes(1);
    const guardado = onGuardado.mock.calls[0][0] as CensusTreeDTO;
    expect(guardado).toMatchObject({ id: "9-TOR", utmX: "521922", utmY: "8918151" });
    /* Centra donde el mapa dibuja el árbol, no en otra proyección. */
    const esperado = toCenso([guardado])[0];
    expect(onCentrar).toHaveBeenCalledWith([esperado.lat, esperado.lng]);
  });

  it("un dato malo no sale del navegador: marca el campo y dice por qué", () => {
    montar();
    abrir("9-TOR");
    /* Este y Norte cambiados de lugar. */
    fireEvent.change(campo("Este (m)"), { target: { value: "8918151" } });
    fireEvent.change(campo("Norte (m)"), { target: { value: "521922" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar coordenadas" }));
    expect(screen.getByText(/Este 8918151 fuera del rango UTM/)).toBeInTheDocument();
    expect(campo("Este (m)")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("vacío no se guarda: dice que falta el Este y el Norte", () => {
    montar();
    abrir("9-TOR");
    fireEvent.click(screen.getByRole("button", { name: "Guardar coordenadas" }));
    expect(screen.getByText("Falta el Este.")).toBeInTheDocument();
    expect(screen.getByText("Falta el Norte.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el servidor lo rechaza, el editor sigue abierto con el motivo y el mapa no se toca", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "El plan está cerrado." }), { status: 422 }));
    const { onGuardado, onCentrar } = montar();
    abrir("9-TOR");
    fireEvent.change(campo("Este (m)"), { target: { value: "521922" } });
    fireEvent.change(campo("Norte (m)"), { target: { value: "8918151" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar coordenadas" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("El plan está cerrado."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onGuardado).not.toHaveBeenCalled();
    expect(onCentrar).not.toHaveBeenCalled();
  });

  it("cada árbol abre en blanco: no hereda lo tipeado en el anterior", () => {
    montar();
    abrir("85-CAT");
    fireEvent.change(campo("Este (m)"), { target: { value: "521922" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    abrir("9-TOR");
    expect(campo("Este (m)").value).toBe("");
  });
});
