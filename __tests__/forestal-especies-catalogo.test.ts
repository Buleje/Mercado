import { describe, expect, it } from "vitest";
import {
  CATALOGO_VACIO,
  agregarEspecie,
  editarEspecie,
  especiesDisponibles,
  especiesOcultas,
  nombresDisponibles,
  normalizarCatalogo,
  quitarEspecie,
  restaurarEspecie,
  cientificoDeEspecie,
  especiesConVariasGrafias,
  especiesQueFaltan,
  opcionesDeEspecie,
  resumirEspeciesDelLibro,
} from "@/lib/forestal/especies-catalogo";
import { ESPECIES_MADERA } from "@/lib/forestal/cubicacion";

const ok = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

describe("el catálogo de especies del aserradero", () => {
  it("sin nada guardado ofrece las de fábrica", () => {
    expect(nombresDisponibles(CATALOGO_VACIO)).toHaveLength(ESPECIES_MADERA.length);
  });

  it("agrega una especie propia y la marca como tal", () => {
    const r = ok(
      agregarEspecie(CATALOGO_VACIO, { nombre: "Cumala blanca", cientifico: "Virola sp." }),
    );
    const fila = especiesDisponibles(r.catalogo).find((e) => e.clave === "cumala blanca");
    expect(fila).toMatchObject({
      nombre: "Cumala blanca",
      deFabrica: false,
      cientifico: "Virola sp.",
    });
  });

  it("no deja agregar dos veces la misma, aunque se escriba distinto", () => {
    const uno = ok(agregarEspecie(CATALOGO_VACIO, { nombre: "Cumala blanca" }));
    const dos = agregarEspecie(uno.catalogo, { nombre: "CUMALA  BLANCA" });
    expect(dos.ok).toBe(false);
  });

  it("no deja duplicar una de fábrica que ya está a la vista", () => {
    expect(agregarEspecie(CATALOGO_VACIO, { nombre: "tornillo" }).ok).toBe(false);
  });

  it("quitar una de fábrica la OCULTA, no la borra: se puede devolver", () => {
    const fuera = ok(quitarEspecie(CATALOGO_VACIO, "Caoba"));
    expect(nombresDisponibles(fuera.catalogo)).not.toContain("Caoba");
    expect(especiesOcultas(fuera.catalogo).map((e) => e.nombre)).toEqual(["Caoba"]);
    const vuelta = ok(restaurarEspecie(fuera.catalogo, "caoba"));
    expect(nombresDisponibles(vuelta.catalogo)).toContain("Caoba");
  });

  it("editar una de fábrica la vuelve propia, y lo dice", () => {
    const r = ok(editarEspecie(CATALOGO_VACIO, "tornillo", { nombre: "Tornillo rojo" }));
    expect(r.mensaje).toContain("propia");
    const nombres = nombresDisponibles(r.catalogo);
    expect(nombres).toContain("Tornillo rojo");
    expect(nombres).not.toContain("Tornillo");
  });

  it("editar una propia cambia su nombre en el lugar", () => {
    const creada = ok(agregarEspecie(CATALOGO_VACIO, { nombre: "Cumala blanca" }));
    const editada = ok(
      editarEspecie(creada.catalogo, "cumala blanca", { nombre: "Cumala colorada" }),
    );
    expect(editada.catalogo.agregadas).toHaveLength(1);
    expect(editada.catalogo.agregadas[0]).toMatchObject({
      nombre: "Cumala colorada",
      clave: "cumala colorada",
    });
  });

  it("una propia que corrige a una de fábrica la reemplaza en la lista, no la duplica", () => {
    // Ocultar «Cedro» y agregarlo con otra ortografía es el caso real.
    const sinCedro = ok(quitarEspecie(CATALOGO_VACIO, "Cedro"));
    const propio = ok(agregarEspecie(sinCedro.catalogo, { nombre: "Cedro colorado" }));
    const nombres = nombresDisponibles(propio.catalogo);
    expect(nombres.filter((n) => n.toLowerCase().startsWith("cedro"))).toEqual(["Cedro colorado"]);
  });

  it("quitar una propia que tapaba a una de fábrica devuelve la de fábrica", () => {
    const propia = ok(editarEspecie(CATALOGO_VACIO, "cedro", { cientifico: "Cedrela odorata" }));
    expect(nombresDisponibles(propia.catalogo)).toContain("Cedro");
    const sacada = ok(quitarEspecie(propia.catalogo, "cedro"));
    expect(nombresDisponibles(sacada.catalogo)).toContain("Cedro");
    expect(especiesOcultas(sacada.catalogo)).toHaveLength(0);
  });

  it("no deja el nombre vacío", () => {
    expect(agregarEspecie(CATALOGO_VACIO, { nombre: "   " }).ok).toBe(false);
    expect(editarEspecie(CATALOGO_VACIO, "tornillo", { nombre: " " }).ok).toBe(false);
  });

  it("normaliza lo que venga del KV sin romperse", () => {
    const c = normalizarCatalogo({
      agregadas: [{ nombre: "Cumala" }, { nombre: "  " }, { nombre: "CUMALA" }, null],
      ocultas: ["Caoba", "caoba", ""],
    });
    expect(c.agregadas.map((e) => e.clave)).toEqual(["cumala"]);
    expect(c.ocultas).toEqual(["caoba"]);
    expect(normalizarCatalogo(null)).toEqual(CATALOGO_VACIO);
  });

  it("la lista sale alfabética en español", () => {
    const con = ok(agregarEspecie(CATALOGO_VACIO, { nombre: "Añuje caspi" }));
    const nombres = nombresDisponibles(con.catalogo);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, "es")));
  });

  // ── Lo que el libro ya tiene escrito ──────────────────────────────────────

  it("junta las grafías de la misma especie y propone la mejor escrita", () => {
    const r = resumirEspeciesDelLibro(
      [
        { nombre: "TORNILLO", usos: 125 },
        { nombre: "Tornillo", usos: 10, cientifico: "Cedrelinga cateniformis" },
        { nombre: "  tornillo  ", usos: 1 },
        { nombre: "Cachimbo", usos: 16 },
      ],
      CATALOGO_VACIO,
    );
    const tornillo = r.find((e) => e.clave === "tornillo")!;
    expect(tornillo.usos).toBe(136);
    expect(tornillo.grafias).toHaveLength(3);
    /* La más usada manda: 125 contra 10, aunque esté en mayúsculas. */
    expect(tornillo.nombre).toBe("TORNILLO");
    /* El científico viaja aunque lo traiga la grafía menos usada. */
    expect(tornillo.cientifico).toBe("Cedrelinga cateniformis");
    expect(especiesConVariasGrafias(r).map((e) => e.clave)).toEqual(["tornillo"]);
  });

  it("a igualdad de uso gana la escrita como nombre propio", () => {
    const r = resumirEspeciesDelLibro(
      [
        { nombre: "CAPIRONA", usos: 7 },
        { nombre: "Capirona", usos: 7 },
      ],
      CATALOGO_VACIO,
    );
    expect(r[0].nombre).toBe("Capirona");
  });

  it("las filas sin especie no inventan una especie", () => {
    const r = resumirEspeciesDelLibro(
      [{ nombre: null, usos: 9 }, { nombre: "   ", usos: 4 }, { nombre: "Copal", usos: 8 }],
      CATALOGO_VACIO,
    );
    expect(r.map((e) => e.nombre)).toEqual(["Copal"]);
  });

  it("dice cuáles faltan en el catálogo, por clave y no por texto", () => {
    const con = ok(agregarEspecie(CATALOGO_VACIO, { nombre: "Cachimbo" }));
    const r = resumirEspeciesDelLibro(
      [{ nombre: "CACHIMBO", usos: 3 }, { nombre: "Panguana", usos: 9 }, { nombre: "Tornillo", usos: 2 }],
      con.catalogo,
    );
    /* «CACHIMBO» ya está (misma clave) y «Tornillo» es de fábrica. */
    expect(especiesQueFaltan(r).map((e) => e.nombre)).toEqual(["Panguana"]);
  });

  it("el científico sale primero del catálogo de la planta y después del código", () => {
    const con = ok(
      agregarEspecie(CATALOGO_VACIO, { nombre: "Panguana", cientifico: "Brosimum utile" }),
    );
    expect(cientificoDeEspecie("panguana", con.catalogo)).toBe("Brosimum utile");
    /* Sin nada propio, el binomio de fábrica (SERFOR) sigue valiendo. */
    expect(cientificoDeEspecie("Tornillo", CATALOGO_VACIO)).toBeTruthy();
    expect(cientificoDeEspecie("Madera que no existe", CATALOGO_VACIO)).toBeNull();
  });

  it("el picker ofrece las de fábrica y las propias, sin repetir y con «Otro» al final", () => {
    const con = ok(agregarEspecie(CATALOGO_VACIO, { nombre: "Panguana" }));
    const ops = opcionesDeEspecie(con.catalogo);
    expect(ops.filter((s) => s.commonName === "Panguana")).toHaveLength(1);
    expect(ops.at(-1)?.slug).toBe("otro");
    /* Y una que ya viene de fábrica no se puede duplicar desde el catálogo: el
       alta la rechaza, así que el picker nunca ve dos «Tornillo». */
    expect(agregarEspecie(con.catalogo, { nombre: "TORNILLO" }).ok).toBe(false);
    const claves = ops.map((x) => x.commonName.toLowerCase());
    expect(claves.filter((n) => n === "tornillo")).toHaveLength(1);
  });
});
