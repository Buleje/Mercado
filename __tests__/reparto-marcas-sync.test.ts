/**
 * Marcas, nombre, firma y códigos del reparto de rolliza guardados por negocio
 * (Brandon, 2026-10-19: «marco en la oficina y en el monte veo lo mismo»).
 * Lo que se protege: mezcla por fila (gana la fecha mayor, no la hoja entera),
 * subida única de lo que el navegador ya tenía y códigos sin reuso entre dos
 * dispositivos que numeran a la vez.
 */

import { describe, expect, it } from "vitest";
import { fusionarRegistros, REGISTRO_VACIO, asignarCodigos, type RegistroCodigos } from "@/lib/forestal/reparto-codigos";
import {
  fusionarEstado,
  fusionarMarcas,
  marcadasDe,
  type CambioReparto,
  type EstadoReparto,
} from "@/lib/forestal/reparto-marcas-sync";
import { SyncReparto, URL_REPARTO_MARCAS } from "@/lib/forestal/reparto-sync-cliente";

const L = (bloqueId: string, tipo: string) => ({ clave: `${bloqueId}|d1|${tipo}`, bloqueId });

describe("fusionarMarcas — por fila, gana la fecha mayor", () => {
  it("una hoja vieja no pisa lo más nuevo, y filas distintas no se pisan", () => {
    const servidor = { a: { on: true, at: 100 }, b: { on: false, at: 300 } };
    const r = fusionarMarcas(servidor, { a: { on: false, at: 50 }, b: { on: true, at: 400 }, c: { on: true, at: 10 } });
    expect(r).toEqual({ a: { on: true, at: 100 }, b: { on: true, at: 400 }, c: { on: true, at: 10 } });
  });

  it("empate = se queda lo guardado; sin nada nuevo devuelve el mismo objeto", () => {
    const base = { a: { on: true, at: 100 } };
    expect(fusionarMarcas(base, { a: { on: false, at: 100 } })).toBe(base);
    expect(fusionarMarcas(base, {})).toBe(base);
  });

  it("una fecha del futuro se recorta a la hora del servidor", () => {
    const r = fusionarMarcas({}, { a: { on: true, at: 9_999_999 } }, 1_000);
    expect(r.a).toEqual({ on: true, at: 1_000 });
  });

  it("dos dispositivos tildan filas distintas a la vez: quedan las dos", () => {
    let e = fusionarEstado(null, { marcas: { x: { on: true, at: 10 } } }, 1e12);
    e = fusionarEstado(e, { marcas: { y: { on: true, at: 9 } } }, 1e12);
    expect([...marcadasDe(e)].sort()).toEqual(["x", "y"]);
    expect(e.rev).toBe(2);
    expect(fusionarEstado(e, { marcas: { y: { on: true, at: 9 } } }, 1e12)).toBe(e);
  });
});

describe("fusionarRegistros — el servidor manda y ningún código se repite", () => {
  const S = asignarCodigos(REGISTRO_VACIO, ["b1"], [L("b1", "A"), L("b1", "B")]); // 1-01, 1-02

  it("dos dispositivos dan 1-03 a líneas distintas: el segundo toma 1-04", () => {
    const deA = asignarCodigos(S, ["b1"], [L("b1", "A"), L("b1", "B"), L("b1", "X")]);
    const deB = asignarCodigos(S, ["b1"], [L("b1", "A"), L("b1", "B"), L("b1", "Y")]);
    expect(deA.lineas["b1|d1|X"]).toBe("1-03");
    expect(deB.lineas["b1|d1|Y"]).toBe("1-03");
    const tras = fusionarRegistros(fusionarRegistros(S, deA), deB);
    expect(tras.lineas["b1|d1|X"]).toBe("1-03");
    expect(tras.lineas["b1|d1|Y"]).toBe("1-04");
    expect(new Set(Object.values(tras.lineas)).size).toBe(Object.keys(tras.lineas).length);
    /* Lo siguiente sale del contador mezclado: 1-05, nunca un 1-03 o 1-04 de nuevo. */
    expect(asignarCodigos(tras, ["b1"], [L("b1", "Z")]).lineas["b1|d1|Z"]).toBe("1-05");
  });

  it("bloques nuevos con el mismo número: el segundo toma el siguiente y sus líneas lo siguen", () => {
    const deA = asignarCodigos(S, ["b1", "b2"], [L("b2", "A")]);
    const deB = asignarCodigos(S, ["b1", "b3"], [L("b3", "A"), L("b3", "B")]);
    const tras = fusionarRegistros(fusionarRegistros(S, deA), deB);
    expect(tras.bloques).toEqual({ b1: 1, b2: 2, b3: 3 });
    expect(tras.lineas["b2|d1|A"]).toBe("2-01");
    expect(tras.lineas["b3|d1|A"]).toBe("3-01");
    expect(tras.lineas["b3|d1|B"]).toBe("3-02");
  });

  it("lo que el servidor ya numeró no se mueve; sin nada nuevo devuelve el mismo objeto", () => {
    const otro: RegistroCodigos = { v: 1, bloques: { b1: 7 }, sigBloque: 7, lineas: { "b1|d1|A": "7-09" }, sigLinea: { b1: 9 } };
    const tras = fusionarRegistros(S, otro);
    expect(tras).toBe(S);
    expect(tras.lineas["b1|d1|A"]).toBe("1-01");
  });
});

/* ── Dos dispositivos contra un servidor falso (las mismas reglas que la ruta) ── */

function servidorFalso() {
  let estado: EstadoReparto | null = null;
  let puts = 0;
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    expect(url).toBe(URL_REPARTO_MARCAS);
    if (init?.method === "PUT") {
      puts += 1;
      const { cambio } = JSON.parse(String(init.body)) as { cambio: CambioReparto };
      estado = fusionarEstado(estado, cambio, Date.now());
    }
    return new Response(JSON.stringify({ estado }), { status: 200 });
  };
  return { fetch, leer: () => estado, puts: () => puts };
}

function navegador(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const BASE = "buleje-cubicacion-qa";

describe("SyncReparto — oficina y monte", () => {
  it("sube UNA vez lo que el navegador ya tenía y otro dispositivo lo ve igual", async () => {
    const srv = servidorFalso();
    const codigos = asignarCodigos(REGISTRO_VACIO, ["b1"], [L("b1", "A"), L("b1", "B")]);
    const oficina = new SyncReparto(BASE, {
      fetch: srv.fetch,
      almacen: navegador({
        [`${BASE}-rolliza-marcas`]: JSON.stringify(["b1|d1|A"]),
        [`${BASE}-rolliza-sin-marcar-nombre`]: "Lote del lunes",
        [`${BASE}-rolliza-codigos`]: JSON.stringify(codigos),
      }),
    });
    await oficina.traer();
    expect(srv.puts()).toBe(1);
    expect([...marcadasDe(srv.leer()!)]).toEqual(["b1|d1|A"]);
    expect(srv.leer()!.nombreSinMarcar?.valor).toBe("Lote del lunes");

    /* Abrir otra vez no vuelve a subir: el servidor ya tiene lo del negocio. */
    await oficina.traer();
    expect(srv.puts()).toBe(1);

    /* El celular (sin nada en el navegador) ve lo mismo. */
    const monte = new SyncReparto(BASE, { fetch: srv.fetch, almacen: navegador() });
    await monte.traer();
    const visto = monte.estado()!;
    expect([...marcadasDe(visto)]).toEqual(["b1|d1|A"]);
    expect(visto.nombreSinMarcar?.valor).toBe("Lote del lunes");
    expect(visto.codigos.lineas).toEqual({ "b1|d1|A": "1-01", "b1|d1|B": "1-02" });
    expect(srv.puts()).toBe(1);
  });

  it("si el servidor ya tiene datos, lo viejo del navegador no se sube encima", async () => {
    const srv = servidorFalso();
    const a = new SyncReparto(BASE, { fetch: srv.fetch, almacen: navegador() });
    await a.traer();
    a.encolar({ marcas: { "b1|d1|A": { on: false, at: Date.now() } } });
    await a.vaciar();
    const b = new SyncReparto(BASE, {
      fetch: srv.fetch,
      almacen: navegador({ [`${BASE}-rolliza-marcas`]: JSON.stringify(["b1|d1|A"]) }),
    });
    await b.traer();
    expect(marcadasDe(b.estado()!).has("b1|d1|A")).toBe(false);
  });

  it("dos dispositivos marcan y numeran a la vez: nada se pisa y ningún código se repite", async () => {
    const srv = servidorFalso();
    const S = asignarCodigos(REGISTRO_VACIO, ["b1"], [L("b1", "A"), L("b1", "B")]);
    const oficina = new SyncReparto(BASE, { fetch: srv.fetch, almacen: navegador() });
    await oficina.traer();
    oficina.encolar({ codigos: S });
    await oficina.vaciar();
    const monte = new SyncReparto(BASE, { fetch: srv.fetch, almacen: navegador() });
    await monte.traer();

    /* Los dos ven la misma hoja y cada uno agrega una línea nueva sin ver al otro. */
    const t = Date.now();
    oficina.encolar({ marcas: { "b1|d1|A": { on: true, at: t } }, codigos: asignarCodigos(oficina.estado()!.codigos, ["b1"], [L("b1", "X")]) });
    monte.encolar({ marcas: { "b1|d1|B": { on: true, at: t } }, codigos: asignarCodigos(monte.estado()!.codigos, ["b1"], [L("b1", "Y")]) });
    await oficina.vaciar();
    await monte.vaciar();
    await oficina.traer();

    for (const d of [oficina, monte]) {
      const e = d.estado()!;
      expect([...marcadasDe(e)].sort()).toEqual(["b1|d1|A", "b1|d1|B"]);
      expect(e.codigos.lineas["b1|d1|X"]).toBe("1-03");
      expect(e.codigos.lineas["b1|d1|Y"]).toBe("1-04");
    }
    expect(oficina.porMandar()).toEqual({});
    expect(monte.porMandar()).toEqual({});
  });

  it("sin señal la cola queda guardada en el navegador y sale al volver", async () => {
    const srv = servidorFalso();
    const almacen = navegador();
    let señal = true;
    const fetch = (url: string, init?: RequestInit) => (señal ? srv.fetch(url, init) : Promise.reject(new Error("offline")));
    const monte = new SyncReparto(BASE, { fetch, almacen });
    await monte.traer();
    señal = false;
    monte.encolar({ marcas: { "b1|d1|A": { on: true, at: Date.now() } } });
    await monte.vaciar();
    expect(srv.leer()).toBeNull();
    expect(almacen.getItem(`${BASE}-rolliza-sync-pend`)).toContain("b1|d1|A");

    /* Otra visita (la pestaña se cerró): la cola se lee del navegador y sale. */
    señal = true;
    const otraVisita = new SyncReparto(BASE, { fetch, almacen });
    await otraVisita.traer();
    expect([...marcadasDe(srv.leer()!)]).toEqual(["b1|d1|A"]);
    expect(almacen.getItem(`${BASE}-rolliza-sync-pend`)).toBeNull();
  });
});
