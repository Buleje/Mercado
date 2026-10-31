/**
 * «Recibir contando las trozas» (ADR-450 L1) — la pantalla.
 *
 * Lo que no puede fallar:
 *   1. El POST trae TODAS las trozas de la guía, en su orden, una vez cada una;
 *      la no contada va `llego:false` y sólo si se marcó «la que no conté no
 *      llegó» (si no, el botón queda apagado y el pie dice por qué).
 *   2. `medida` sólo en las que llegaron, y sólo si difiere de la guía más que
 *      la cinta; `huella` es la del GET tal cual; lo escaneado que no es de la
 *      guía va a `sobrantes` y se avisa «La 115-B no viene en esta guía».
 *   3. 409 GUIA_CAMBIO se dice con la frase fija y «Volver a abrirla» pide la
 *      guía de nuevo; recibida dice «Entraron 3: 2 llegaron, 1 no llegó».
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { huellaDeReparto } from "@/lib/forestal/conteo-guia-th";
import { smalianVolume } from "@/lib/forestal/loth-constants";
import { ingresosDesdeGuiaTh, type ItemGuiaTh, type PreparadoRecibirTh, type RecibidaTh } from "@/lib/forestal/guia-th-al-ctp";
import {
  conteoParaEnviar,
  filaDeConteo,
  leerMedidaEscrita,
  numeroEscrito,
  trozasDeLaGuia,
} from "@/components/admin/forestal/hooks/use-conteo-guia-th";
import CtpRecibirGuiaThModal from "@/components/admin/forestal/CtpRecibirGuiaThModal";

/** El m³ como lo escribe el Trozado del Libro TH (la fórmula con que se compara lo de planta). */
const item = (code: string, species: string, d1: number, d2: number, l: number, treeCode: string): ItemGuiaTh => ({
  code, treeCode, species, scientific: null, cites: false,
  diamMayorM: d1, diamMenorM: d2, lengthM: l, volumeM3: smalianVolume(d1, d2, l), pieces: 1, trozadoId: `trz-${code}`,
});

const ITEMS = [
  item("113-A", "Sapotillo", 1.0, 0.96, 4.5, "113"),
  item("113-B", "Sapotillo", 0.9, 0.86, 4.0, "113"),
  item("114-A", "Lupuna", 1.1, 1.05, 5.0, "114"),
];

function preparado(): PreparadoRecibirTh {
  const r = ingresosDesdeGuiaTh(ITEMS);
  if (!r.ok) throw new Error(r.motivo);
  return {
    guardadaId: "g1", gtfNumber: "001-0000124", gtfDate: "2026-09-28", titular: "QA TITULAR", permiso: "QA-PERM-1",
    destinatario: "MI PLANTA", vencimiento: "2026-10-05", lineas: r.lineas, totalM3: r.totalM3, trozas: r.trozas,
    avisos: [], huella: huellaDeReparto(r.lineas),
  };
}

const RECIBIDA: RecibidaTh = {
  ingresos: [{ id: "i1", libroNro: 115, especie: "Sapotillo", volumeM3: 2.8756, pieces: 2 }, { id: "i2", libroNro: 116, especie: "Lupuna", volumeM3: 2.125, pieces: 1 }],
  trozas: 3, totalM3: 5.0006, fecha: "2026-09-28", recibida: true, motivoSinRecibir: null, avisos: [],
  llegaron: 2, noLlegaron: ["114-A"], distintas: 1, m3Recibido: 2.7, brechaM3: 2.3,
  resumen: { contadas: 3, total: 3, llegaron: 2, noLlegaron: 1, sinContar: 0, distintas: 1, m3Declarado: 5.0006, m3Recibido: 2.7, m3NoLlego: 2.125, brechaM3: 2.3, porEspecie: [] },
};

let posts: unknown[];
let respuestaPost: () => Response;
let gets: number;

beforeEach(() => {
  posts = [];
  gets = 0;
  respuestaPost = () => new Response(JSON.stringify({ recibida: RECIBIDA }), { status: 201 });
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return respuestaPost();
    }
    gets += 1;
    return new Response(JSON.stringify({ preparado: preparado() }), { status: 200 });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const escanear = (texto: string) => {
  const campo = screen.getByPlaceholderText("Escanear o tipear código");
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.keyDown(campo, { key: "Enter" });
};
const fila = (codigo: string) => document.querySelector(`[data-conteo-fila="${codigo}"]`) as HTMLElement;

describe("conteo · lo puro", () => {
  const lineas = preparado().lineas;
  const piezas = trozasDeLaGuia(lineas);

  it("lee coma y punto; lo vacío es null y la basura NaN", () => {
    expect(numeroEscrito("4,20")).toBe(4.2);
    expect(numeroEscrito(" ")).toBeNull();
    expect(Number.isNaN(numeroEscrito("abc") as number)).toBe(true);
    expect(leerMedidaEscrita({ d1: "500", d2: "", largo: "" }).error).toMatch(/cm/);
    expect(leerMedidaEscrita({ d1: "", d2: "", largo: "31" }).error).toMatch(/metros/);
  });

  it("sin contar no se manda; con la casilla va todo, en orden, la no contada llego:false", () => {
    const sinCasilla = piezas.map((p) => filaDeConteo(p.troza, p.especie, undefined, false));
    expect(conteoParaEnviar(sinCasilla)).toBeNull();
    const conCasilla = piezas.map((p, i) =>
      filaDeConteo(p.troza, p.especie, i === 0 ? { estado: "llego", como: "escaneada", medida: null } : undefined, true),
    );
    const e = conteoParaEnviar(conCasilla);
    expect(e?.conteo.map((c) => [c.orden, c.llego])).toEqual([[1, true], [2, false], [3, false]]);
    expect(e?.confirmaFaltantes).toBe(true);
    expect(e?.conteo.every((c) => c.llego || c.medida === undefined)).toBe(true);
  });

  it("una medida dentro de la tolerancia de la cinta no viaja; una distinta sí", () => {
    const { troza, especie } = piezas[0];
    const igual = filaDeConteo(troza, especie, { estado: "llego", como: "a_mano", medida: { d1: "100.5", d2: "96", largo: "4.52" } }, false);
    expect(igual.final).toBeNull();
    const corta = filaDeConteo(troza, especie, { estado: "llego", como: "a_mano", medida: { d1: "100", d2: "96", largo: "4,2" } }, false);
    expect(corta.final?.largoM).toBe(4.2);
    expect(corta.diferenciaM3).toBeLessThan(0);
    const e = conteoParaEnviar([igual, corta]);
    expect(e?.conteo[0].medida).toBeUndefined();
    expect(e?.conteo[1].medida).toEqual({ d1Cm: 100, d2Cm: 96, largoM: 4.2 });
  });
});

describe("CtpRecibirGuiaThModal · contar al bajar", () => {
  it("escanea, marca una distinta, avisa la sobrante y manda el conteo completo", async () => {
    const onRecibida = vi.fn();
    render(<CtpRecibirGuiaThModal guardadaId="g1" gtfNumber="001-0000124" onClose={() => {}} onRecibida={onRecibida} />);
    await screen.findByTestId("contar-al-bajar");
    const enviar = screen.getByTestId("recibir-th-enviar") as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    expect(screen.getByText("Cuenta las trozas que bajaron del camión.")).toBeTruthy();

    escanear("TROZA 113-A");
    await waitFor(() => expect(fila("113-A").dataset.estado).toBe("llego"));
    expect(within(fila("113-A")).getByText("Llegó · escaneada")).toBeTruthy(); // el largo; el corto va oculto por CSS
    expect(screen.getByTestId("conteo-th-cuenta").textContent).toMatch(/1 de 3 contadas · 2 sin contar/);

    /* El QR grande de OTRA troza, al toque de la anterior: no es «el resto de la ficha». */
    escanear("TROZA 115-B");
    expect(await screen.findByText("La 115-B no viene en esta guía.")).toBeTruthy();
    escanear("/verificar/115-B");
    expect(screen.getByTestId("conteo-th-sobrantes").textContent).toMatch(/115-B/);

    fireEvent.click(within(fila("113-B")).getByRole("button", { name: /llegó con otra medida/ }));
    const largo = document.getElementById("conteo-th-2-largo") as HTMLInputElement;
    expect(largo.value).toBe("4");
    fireEvent.change(largo, { target: { value: "3,5" } });
    await waitFor(() => expect(within(fila("113-B")).getByText(/En planta/)).toBeTruthy());
    expect(within(fila("113-B")).getByText(/^−/)).toBeTruthy();

    /* Queda una sin contar: el botón sigue apagado hasta la casilla. */
    expect(enviar.disabled).toBe(true);
    expect(enviar.textContent).toBe("Recibir 2 de 3 trozas");
    fireEvent.click(screen.getByTestId("recibir-th-resto-no-llego"));
    await waitFor(() => expect(enviar.disabled).toBe(false));
    fireEvent.click(enviar);

    await screen.findByTestId("guia-th-recibida");
    expect(screen.getByText("Entraron 3: 2 llegaron, 1 no llegó")).toBeTruthy();
    expect(onRecibida).toHaveBeenCalledTimes(1);
    const body = posts[0] as Record<string, unknown>;
    expect(body.huella).toBe(preparado().huella);
    expect(body.confirmaFaltantes).toBe(true);
    expect(body.sobrantes).toEqual(["115-B"]);
    expect(body.conteo).toEqual([
      { orden: 1, llego: true, como: "escaneada" },
      { orden: 2, llego: true, como: "a_mano", medida: { d1Cm: 90, d2Cm: 86, largoM: 3.5 } },
      { orden: 3, llego: false },
    ]);
  });

  it("«Llegaron todas» recibe sin confirmar faltantes", async () => {
    render(<CtpRecibirGuiaThModal guardadaId="g1" gtfNumber="001-0000124" onClose={() => {}} onRecibida={() => {}} />);
    await screen.findByTestId("contar-al-bajar");
    fireEvent.click(screen.getByRole("button", { name: /Llegaron todas/ }));
    const enviar = screen.getByTestId("recibir-th-enviar") as HTMLButtonElement;
    await waitFor(() => expect(enviar.textContent).toBe("Recibir las 3 trozas"));
    expect(screen.queryByTestId("recibir-th-resto-no-llego")).toBeNull();
    fireEvent.click(enviar);
    await waitFor(() => expect(posts).toHaveLength(1));
    const body = posts[0] as { conteo: { llego: boolean }[]; confirmaFaltantes?: boolean };
    expect(body.conteo.every((c) => c.llego)).toBe(true);
    expect(body.confirmaFaltantes).toBeUndefined();
  });

  it("409 GUIA_CAMBIO: la frase fija y «Volver a abrirla» pide la guía otra vez", async () => {
    respuestaPost = () => new Response(JSON.stringify({ error: "GUIA_CAMBIO", message: "Guía 001-0000124: la lista cambió" }), { status: 409 });
    render(<CtpRecibirGuiaThModal guardadaId="g1" gtfNumber="001-0000124" onClose={() => {}} onRecibida={() => {}} />);
    await screen.findByTestId("contar-al-bajar");
    fireEvent.click(screen.getByRole("button", { name: /Llegaron todas/ }));
    fireEvent.click(screen.getByTestId("recibir-th-enviar"));
    expect(await screen.findByTestId("recibir-th-cambio")).toBeTruthy();
    expect(screen.getByText("La guía cambió en tu Libro TH, vuelve a abrirla.")).toBeTruthy();
    expect((screen.getByTestId("recibir-th-enviar") as HTMLButtonElement).disabled).toBe(true);
    const antes = gets;
    fireEvent.click(screen.getByRole("button", { name: /Volver a abrirla/ }));
    await waitFor(() => expect(gets).toBe(antes + 1));
    await waitFor(() => expect(screen.queryByTestId("recibir-th-cambio")).toBeNull());
  });
});
