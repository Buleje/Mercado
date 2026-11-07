/**
 * El camino entero: propuesta → armar el lote → vincular, dentro del modal.
 *
 * Es el tramo que faltaba. Medido el 2026-09-15 en
 * `inversiones-agroforestales-blas-sociedad-anonima`: 160 trozas sin
 * `loteAserrioId` y ningún lote abierto con piezas libres, así que el
 * desplegable de lotes salía SIEMPRE vacío y las 14 corridas de producción
 * seguían sin materia prima. Acá se afirma que desde el propio modal se puede
 * abrir el lote —con los dos endpoints de siempre— y confirmar la vinculación.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import CtpVincularMateriaPrimaModal from "@/components/admin/forestal/CtpVincularMateriaPrimaModal";
import { recordarCodigosDeCorrida } from "@/lib/forestal/codigos-de-corrida";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";

const GUIA = "019-001-0000013";
const PERMISO = "19-SEC/REG-PLT-2018-020";
const PERMISO_2021 = "19-SEC/REG-PLT-2021-017";
const CORRIDA_ID = "corrida-20";
const LOTE_NUEVO = "L-nuevo";

const trozaPatio = (id: string, codificacion: string, volumenM3: number, extra: Record<string, unknown> = {}) => ({
  id,
  woodEntryId: "we-13",
  codificacion,
  codigoPlanta: null,
  especieComun: "Tornillo",
  volumenM3,
  largoM: 8.5,
  gtfNumber: GUIA,
  permiso: PERMISO,
  guiaRecepcionada: true,
  /* Antes de la corrida: si entrara después, la regla de fechas la frenaría. */
  fechaIngreso: "2026-07-20",
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  consumidaEnId: null,
  despachadaEnId: null,
  loteAserrioId: null,
  loteAserrioCode: null,
  ...extra,
});

/** El lote que el servidor devuelve DESPUÉS de armarlo, con sus dos trozas. */
const LOTE_ARMADO: LoteAserrio = {
  id: LOTE_NUEVO,
  code: "LA-2026-001",
  speciesCommon: "Tornillo",
  speciesScientific: null,
  status: "abierto",
  notes: "Armado desde los códigos del cubicado de la corrida N° 20",
  permiso: PERMISO,
  fechaApertura: "2026-09-15",
  fechaConsumo: null,
  produccionEntryId: null,
  piezas: 2,
  volumenM3: 4.961,
  trozas: [
    { id: "t1", codificacion: "115-A", codigoPlanta: null, volumenM3: 2.808, largoM: 8.5, gtfNumber: GUIA, consumidaEnId: null },
    { id: "t2", codificacion: "115-B", codigoPlanta: null, volumenM3: 2.153, largoM: 8.5, gtfNumber: GUIA, consumidaEnId: null },
  ],
};

/** Lo que cada llamada mandó, para poder afirmar QUÉ se escribió. */
let enviados: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

const mockFetch = (patio: ReturnType<typeof trozaPatio>[]) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    enviados.push({ url: u, method, body });

    if (u.includes("/trozas/patio")) return { ok: true, status: 200, json: async () => ({ trozas: patio }) };
    if (u.includes("/forestal/ctp?entryId")) return { ok: true, status: 200, json: async () => ({ entry: { paquetes: [] } }) };
    if (u.includes("/lotes-aserrio")) {
      if (method === "POST") {
        return { ok: true, status: 201, json: async () => ({ lote: { id: LOTE_NUEVO, code: "LA-2026-001" } }) };
      }
      if (method === "PATCH" && body?.accion === "agregar") {
        return { ok: true, status: 200, json: async () => ({ agregadas: 2, rechazadas: [] }) };
      }
      if (method === "PATCH" && body?.accion === "sumar-corrida") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            piezas: 2,
            volumenM3: 4.961,
            volumenTotalM3: 4.961,
            loteCerrado: true,
            /* 2,6 / 4,961 = 52,41 %: el número lo calcula y lo guarda el servidor. */
            rendimientoPct: 52.41,
            sobreElTope: false,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ lotes: [LOTE_ARMADO] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("active-tenant-slug", "inversiones-agroforestales-blas-sociedad-anonima");
  /* El caché de `ctpGet` vive 8 s por URL: sin esto, el patio del test anterior
     se reusa y la propuesta sale de datos que no son los de este caso. */
  invalidarCtp();
  enviados = [];
});

const abrir = (opts: { lotes?: LoteAserrio[]; tieneMateriaPrima?: boolean; onListo?: (m: string) => void } = {}) =>
  render(
    <CtpVincularMateriaPrimaModal
      corrida={{
        id: CORRIDA_ID,
        lineNo: 20,
        especie: "Tornillo",
        producidoM3: 2.6,
        largoMaxPiezaM: null,
        fecha: "2026-08-01",
        tieneMateriaPrima: opts.tieneMateriaPrima ?? false,
      }}
      lotes={opts.lotes ?? []}
      onCerrar={() => {}}
      onListo={opts.onListo ?? (() => {})}
    />,
  );

describe("armar el lote sin salir del modal de vincular", () => {
  it("con el patio suelto: arma el lote, lo deja elegido y la vinculación se puede confirmar", async () => {
    vi.stubGlobal("fetch", mockFetch([
      trozaPatio("t1", "115-A", 2.808),
      trozaPatio("t2", "115-B", 2.153),
      /* Las 49 de codificación «-» del patio real no se proponen. */
      ...Array.from({ length: 49 }, (_, i) => trozaPatio(`g${i}`, "-", 1.2)),
    ]));
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }, { codigo: "115-B" }]);
    const avisos: string[] = [];
    abrir({ onListo: (m) => avisos.push(m) });

    /* El callejón de antes: sin lotes, el desplegable no ofrece nada. */
    await waitFor(() => expect(screen.getByText(/Lo que proponen los códigos/i)).toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: /Lote de aserrío/i })).toHaveValue("");

    const boton = await screen.findByRole("button", { name: /Armar el lote con estas 2 trozas/i });
    fireEvent.click(boton);

    await waitFor(() => expect(screen.getByText(/quedó con 2 trozas/i)).toBeInTheDocument());

    /* 1 · abrió el lote con la especie y el permiso derivados de las trozas. */
    const post = enviados.find((e) => e.method === "POST");
    expect(post?.body).toMatchObject({ modo: "abierto", speciesCommon: "Tornillo", permiso: PERMISO });
    expect(String(post?.body?.notes)).toContain("corrida N° 20");
    /* 2 · y le guardó las dos trozas por la acción de siempre. */
    const agregar = enviados.find((e) => e.body?.accion === "agregar");
    expect(agregar?.body).toMatchObject({ loteId: LOTE_NUEVO, trozaIds: ["t1", "t2"] });

    /* El lote queda elegido y sus trozas tildadas: se puede firmar. */
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: /Lote de aserrío/i }) as HTMLSelectElement).value).toBe(LOTE_NUEVO),
    );
    /* Las trozas del lote se tildan en un render POSTERIOR al del combo: sin
       esperar, bajo la carga del hook de commit (~840 archivos) la aserción
       llegaba antes y fallaba (medido el 22-09; aislado pasaba siempre). */
    await waitFor(() =>
      expect((screen.getByLabelText(/Elegir la troza 115-A/i) as HTMLInputElement).checked).toBe(true),
    );
    const vincular = screen.getByRole("button", { name: /Vincular al lote/i });
    await waitFor(() => expect(vincular).not.toBeDisabled());

    fireEvent.click(vincular);
    await waitFor(() => expect(avisos).toHaveLength(1));
    /* El rendimiento que se muestra es el que ESCRIBIÓ el servidor. */
    expect(avisos[0]).toMatch(/rendimiento 52[.,]41 %/);
    const sumar = enviados.find((e) => e.body?.accion === "sumar-corrida");
    expect(sumar?.body).toMatchObject({ loteId: LOTE_NUEVO, corridaId: CORRIDA_ID, trozaIds: ["t1", "t2"] });
  });

  it("dos títulos habilitantes: no ofrece armar nada y dice cuáles son (ADR-393)", async () => {
    vi.stubGlobal("fetch", mockFetch([
      trozaPatio("t1", "115-A", 2.808),
      trozaPatio("t2", "220-C", 3.1, { permiso: PERMISO_2021, gtfNumber: "019-001-0000003" }),
    ]));
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }, { codigo: "220-C" }]);
    abrir();

    await waitFor(() => expect(screen.getByText(new RegExp("Un lote es de un permiso", "i"))).toBeInTheDocument());
    /* Aparece en el origen legal y otra vez nombrado en el impedimento. */
    expect(screen.getAllByText(new RegExp(PERMISO_2021.replace(/[/]/g, "."), "i")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Armar el lote/i })).not.toBeInTheDocument();
    expect(enviados.some((e) => e.method === "POST")).toBe(false);
  });

  it("a una corrida que ya tiene materia prima no se le arma nada (ADR-364)", async () => {
    vi.stubGlobal("fetch", mockFetch([trozaPatio("t1", "115-A", 2.808)]));
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }]);
    abrir({ tieneMateriaPrima: true });

    await waitFor(() => expect(screen.getByRole("dialog", { name: /Vincular materia prima/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Armar el lote/i })).not.toBeInTheDocument();
    expect(enviados.some((e) => e.url.includes("/trozas/patio"))).toBe(false);
  });

  it("si el servidor rechaza una troza, se dice cuál y por qué", async () => {
    const fetchMock = mockFetch([trozaPatio("t1", "115-A", 2.808), trozaPatio("t2", "115-B", 2.153)]);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      if (body?.accion === "agregar") {
        enviados.push({ url: String(url), method: "PATCH", body });
        return {
          ok: true,
          status: 200,
          json: async () => ({ agregadas: 1, rechazadas: [{ id: "t2", codigo: "115-B", motivo: "ya está en otro lote" }] }),
        };
      }
      return fetchMock(url, init);
    }));
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }, { codigo: "115-B" }]);
    abrir();

    fireEvent.click(await screen.findByRole("button", { name: /Armar el lote/i }));
    await waitFor(() => expect(screen.getByText(/no entró: ya está en otro lote/i)).toBeInTheDocument());
    expect(screen.getAllByText("115-B").length).toBeGreaterThan(0);
  });
});
