/**
 * Las «formas» del talonario (Brandon 16-10: «cada encaje y configuración se
 * guardará independiente con su nombre… para usar varias formas en diferentes
 * permisos»): lo guardado antes (v1 y v2 por titular) se lee sin perder nada,
 * cada forma lleva un nombre automático «<permiso> · <titular>», al abrir una
 * guía se elige sola por permiso + titular, y se renombra, copia y borra.
 * También los nombres cortos que se ven encima de cada valor en pantalla.
 */
import { describe, expect, it } from "vitest";
import { disposicionDeFabrica, hojaDeFabrica, type DisposicionHoja } from "@/lib/forestal/gtf-matricial-disposicion";
import { nombreCorto } from "@/lib/forestal/gtf-matricial-nombres";
import {
  almacenVacio,
  claveDeTitular,
  ID_FORMA_EMPRESA,
  idDeClaveV2,
  MAX_FORMAS,
  nombreAutomatico,
  normalizarAlmacen,
  type AlmacenTalonario,
  type DuenoTalonario,
} from "@/lib/forestal/gtf-matricial-titulares";
import {
  borrarForma,
  crearForma,
  disposicionDe,
  formaIdSchema,
  guardarHoja,
  nombreFormaSchema,
  renombrarForma,
  resolverForma,
  resumenFormas,
} from "@/lib/forestal/gtf-matricial-formas";
import { crearTrabajo, normalizarAlmacen as normalizarCola, rutaSalida } from "@/lib/forestal/gtf-cola-monte";

const CUANDO = { en: "2026-10-16T15:00:00.000Z", por: "qaadmin" };
const DESPUES = { en: "2026-10-16T18:00:00.000Z", por: "qaadmin" };
const AGUAJAL: DuenoTalonario = { titular: "MADERERA EL AGUAJAL S.A.C.", permiso: "17-CPO/C-J-001-02", planId: null };
/** El mismo titular con OTRO permiso. */
const AGUAJAL_OTRO: DuenoTalonario = { titular: "Maderera el Aguajal SAC", permiso: "17-UCA-C-PER-001-20", planId: null };
const SANTOS: DuenoTalonario = { titular: "SANTOS MUÑOZ ROJAS", permiso: null, planId: "plan-santos" };
const SIN: DuenoTalonario = { titular: null, permiso: null, planId: null };

/** Una hoja de guía corrida `dx` mm: para distinguir de quién es cada una. */
const guiaCorrida = (dx: number): DisposicionHoja => ({ ...hojaDeFabrica("guia"), offsetXMm: dx });

let n = 0;
function guardar(alm: AlmacenTalonario, dueno: DuenoTalonario, dx: number, formaId: string | null = null, formato: "guia" | "lista" = "guia", firma = CUANDO) {
  const hoja = formato === "guia" ? guiaCorrida(dx) : { ...hojaDeFabrica("lista"), offsetXMm: dx };
  const r = guardarHoja(alm, dueno, formaId, formato, hoja, firma, `f-${++n}`);
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** Lo que dejó guardado la v2 (15-10): la empresa y dos titulares. */
const V2 = {
  version: 2,
  empresa: { ...disposicionDeFabrica(), guia: guiaCorrida(3), actualizado: CUANDO },
  porTitular: {
    [claveDeTitular(AGUAJAL.titular) as string]: { nombre: AGUAJAL.titular, permiso: AGUAJAL.permiso, planId: null, ...disposicionDeFabrica(), guia: guiaCorrida(7), actualizado: CUANDO },
    [claveDeTitular(SANTOS.titular) as string]: { nombre: SANTOS.titular, permiso: null, planId: "plan-santos", ...disposicionDeFabrica(), guia: guiaCorrida(-2), actualizado: DESPUES },
  },
  perfiles: { monte: { id: "monte", nombre: "Monte", corrimientoXmm: 1.5 } },
};

describe("la clave del titular y el nombre automático", () => {
  it("la clave es la misma escrita como sea: puntos, tildes, «S.A.C.» y el orden no cambian a nadie", () => {
    expect(claveDeTitular("MADERERA EL AGUAJAL S.A.C.")).toBe(claveDeTitular("Maderera  el Aguajal SAC"));
    expect(claveDeTitular("Santos Muñoz Rojas")).toBe(claveDeTitular("ROJAS SANTOS MUNOZ"));
    expect(claveDeTitular("  ")).toBeNull();
  });
  it("«<N° de permiso> · <titular>»; sin permiso, el titular; sin nada, «La empresa»; hasta 60 letras", () => {
    expect(nombreAutomatico(AGUAJAL)).toBe("17-CPO/C-J-001-02 · MADERERA EL AGUAJAL S.A.C.");
    expect(nombreAutomatico(SANTOS)).toBe("SANTOS MUÑOZ ROJAS");
    expect(nombreAutomatico(SIN)).toBe("La empresa");
    expect(nombreAutomatico({ permiso: "P".repeat(40), titular: "T".repeat(40) }).length).toBeLessThanOrEqual(60);
  });
});

describe("lo guardado antes se lee sin perder nada", () => {
  it("la v2 (empresa + por titular): cada una pasa a ser una forma con su encaje, su referencia y las impresoras", () => {
    const alm = normalizarAlmacen(JSON.parse(JSON.stringify(V2)));
    expect(alm.version).toBe(3);
    expect(Object.keys(alm.formas)).toHaveLength(3);
    expect(alm.formas[ID_FORMA_EMPRESA]).toMatchObject({ nombre: "La empresa", permiso: null, titular: null, guia: { offsetXMm: 3 } });
    const aguajal = alm.formas[idDeClaveV2(claveDeTitular(AGUAJAL.titular) as string)];
    expect(aguajal).toMatchObject({ nombre: nombreAutomatico(AGUAJAL), permiso: AGUAJAL.permiso, titular: AGUAJAL.titular, guia: { offsetXMm: 7 }, creada: CUANDO });
    expect(alm.perfiles.monte?.corrimientoXmm).toBe(1.5);
  });
  it("dos lecturas dan los mismos ids (la v2 sigue guardada hasta la primera escritura)", () => {
    expect(Object.keys(normalizarAlmacen(V2.porTitular ? JSON.parse(JSON.stringify(V2)) : null).formas)).toEqual(Object.keys(normalizarAlmacen(JSON.parse(JSON.stringify(V2))).formas));
  });
  it("la v2 migrada abre lo mismo que abría: cada titular la suya, uno nuevo la de la empresa", () => {
    const alm = normalizarAlmacen(JSON.parse(JSON.stringify(V2)));
    expect(resolverForma(alm, AGUAJAL)?.disposicion.guia.offsetXMm).toBe(7);
    expect(resolverForma(alm, SANTOS)?.disposicion.guia.offsetXMm).toBe(-2);
    expect(resolverForma(alm, { titular: "OTRO SAC", permiso: "X-1", planId: null })).toMatchObject({ origen: "empresa", forma: null, disposicion: { guia: { offsetXMm: 3 } } });
  });
  it("la v1 ({ guia, lista } sueltas) pasa a la forma «La empresa»; nada guardado = vacío", () => {
    const alm = normalizarAlmacen(JSON.parse(JSON.stringify({ ...disposicionDeFabrica(), guia: guiaCorrida(4) })));
    expect(alm.formas[ID_FORMA_EMPRESA]?.guia.offsetXMm).toBe(4);
    expect(normalizarAlmacen(null)).toEqual(almacenVacio());
    expect(resolverForma(almacenVacio(), AGUAJAL)?.origen).toBe("fabrica");
  });
  it("la v3 vuelve igual (ida y vuelta por JSON)", () => {
    const alm = guardar(normalizarAlmacen(JSON.parse(JSON.stringify(V2))), SANTOS, 9).almacen;
    expect(normalizarAlmacen(JSON.parse(JSON.stringify(alm)))).toEqual(alm);
  });
});

describe("elegir sola la forma de la guía", () => {
  it("permiso Y titular primero; si no, el mismo titular con otro permiso; si no, nueva con el nombre automático", () => {
    let alm = guardar(almacenVacio(), AGUAJAL, 7).almacen;
    expect(resolverForma(alm, AGUAJAL)).toMatchObject({ coincide: "exacta", forma: { nombre: nombreAutomatico(AGUAJAL) } });
    expect(resolverForma(alm, AGUAJAL_OTRO)).toMatchObject({ coincide: "titular", disposicion: { guia: { offsetXMm: 7 } } });
    expect(resolverForma(alm, SANTOS)).toMatchObject({ forma: null, nueva: { nombre: "SANTOS MUÑOZ ROJAS" } });
    alm = guardar(alm, AGUAJAL_OTRO, -4).almacen;
    expect(resolverForma(alm, AGUAJAL_OTRO)).toMatchObject({ coincide: "exacta", disposicion: { guia: { offsetXMm: -4 } } });
    expect(resolverForma(alm, AGUAJAL)?.disposicion.guia.offsetXMm).toBe(7);
  });
  it("el titular escrito en otro orden es el mismo; con otro titular, el mismo permiso la encuentra igual; por plan, también", () => {
    const alm = guardar(guardar(almacenVacio(), AGUAJAL, 7).almacen, SANTOS, -2).almacen;
    expect(resolverForma(alm, { titular: "AGUAJAL MADERERA", permiso: AGUAJAL.permiso, planId: null })?.coincide).toBe("exacta");
    expect(resolverForma(alm, { titular: "FORESTAL SAN JUAN EIRL", permiso: AGUAJAL.permiso, planId: null })?.coincide).toBe("permiso");
    expect(resolverForma(alm, { titular: "Santos Munoz Rojas", permiso: null, planId: "plan-santos" })?.coincide).toBe("exacta");
  });
  it("la elegida a mano manda (aunque sea de otro); una que no existe = null (la salida no cae a otra)", () => {
    const r = guardar(guardar(almacenVacio(), AGUAJAL, 7).almacen, SANTOS, -2);
    expect(resolverForma(r.almacen, AGUAJAL, r.forma.id)).toMatchObject({ coincide: "elegida", disposicion: { guia: { offsetXMm: -2 } } });
    expect(resolverForma(r.almacen, AGUAJAL, "f-no-existe")).toBeNull();
  });
  it("la lista pone arriba las del dueño de la guía", () => {
    const alm = guardar(guardar(almacenVacio(), SANTOS, -2).almacen, AGUAJAL, 7).almacen;
    expect(resumenFormas(alm, AGUAJAL).map((f) => [f.nombre, f.coincide])).toEqual([
      [nombreAutomatico(AGUAJAL), "exacta"],
      ["SANTOS MUÑOZ ROJAS", null],
    ]);
  });
});

describe("guardar en una forma", () => {
  it("sin forma, el primer Guardar la crea con el nombre automático y arranca de la de la empresa", () => {
    const alm = normalizarAlmacen(JSON.parse(JSON.stringify({ ...disposicionDeFabrica(), lista: { ...hojaDeFabrica("lista"), offsetXMm: 5 } })));
    const r = guardar(alm, AGUAJAL, 7);
    expect(r).toMatchObject({ creada: true, forma: { nombre: nombreAutomatico(AGUAJAL), permiso: AGUAJAL.permiso, guia: { offsetXMm: 7 }, lista: { offsetXMm: 5 } } });
    expect(r.almacen.formas[ID_FORMA_EMPRESA]?.guia.offsetXMm).toBe(0);
  });
  it("guardar de nuevo (la lista, otra PC) va a la misma: no crea una segunda", () => {
    const a = guardar(almacenVacio(), AGUAJAL, 7);
    const b = guardar(a.almacen, AGUAJAL, 2, null, "lista");
    expect(b.creada).toBe(false);
    expect(b.forma.id).toBe(a.forma.id);
    expect(Object.keys(b.almacen.formas)).toHaveLength(1);
    expect(b.forma.guia.offsetXMm).toBe(7);
  });
  it("con el mismo titular y OTRO permiso, guardar sin elegir crea la del permiso (no pisa la del otro)", () => {
    const a = guardar(almacenVacio(), AGUAJAL, 7);
    const b = guardar(a.almacen, AGUAJAL_OTRO, -4);
    expect(b.creada).toBe(true);
    expect(b.almacen.formas[a.forma.id].guia.offsetXMm).toBe(7);
  });
  it("con la forma elegida guarda en ésa; una que ya no existe da no_existe", () => {
    const a = guardar(almacenVacio(), SANTOS, -2);
    const b = guardar(a.almacen, AGUAJAL, 9, a.forma.id);
    expect(b).toMatchObject({ creada: false, forma: { id: a.forma.id, titular: SANTOS.titular, guia: { offsetXMm: 9 } } });
    expect(guardarHoja(a.almacen, AGUAJAL, "f-borrada", "guia", guiaCorrida(1), CUANDO, "f-x")).toEqual({ ok: false, error: "no_existe" });
  });
  it(`con el tope de ${MAX_FORMAS} formas no se crea otra (y guardar en una que ya está, sí)`, () => {
    let alm = almacenVacio();
    for (let i = 0; i < MAX_FORMAS; i++) alm = guardar(alm, { titular: `TITULAR ${i}`, permiso: `P-${i}`, planId: null }, i).almacen;
    expect(guardarHoja(alm, { titular: "UNO MÁS", permiso: "P-X", planId: null }, null, "guia", guiaCorrida(1), CUANDO, "f-x")).toEqual({ ok: false, error: "tope" });
    expect(guardarHoja(alm, { titular: "TITULAR 3", permiso: "P-3", planId: null }, null, "guia", guiaCorrida(1), CUANDO, "f-x").ok).toBe(true);
    expect(crearForma(alm, AGUAJAL, { guia: {}, lista: {} }, CUANDO, "f-x")).toEqual({ ok: false, error: "tope" });
  });
});

describe("nueva, renombrar, borrar y copiar", () => {
  it("nueva (copia de esta): con las hojas que se ven y la referencia de la guía; nombre repetido = «(2)» si es automático, error si es pedido", () => {
    const a = guardar(almacenVacio(), AGUAJAL, 7);
    const c = crearForma(a.almacen, AGUAJAL, { guia: guiaCorrida(1), lista: {} }, DESPUES, "f-copia");
    expect(c).toMatchObject({ ok: true, forma: { id: "f-copia", nombre: `${nombreAutomatico(AGUAJAL)} (2)`, permiso: AGUAJAL.permiso, guia: { offsetXMm: 1 } } });
    expect(crearForma(a.almacen, SANTOS, { nombre: nombreAutomatico(AGUAJAL).toLowerCase(), guia: {}, lista: {} }, CUANDO, "f-y")).toEqual({ ok: false, error: "nombre_repetido" });
    /* La más reciente de las dos «exactas» es la que se abre sola. */
    if (c.ok) expect(resolverForma(c.almacen, AGUAJAL)?.forma?.id).toBe("f-copia");
  });
  it("renombrar cambia sólo el nombre (la fecha es la de su encaje); repetido = error; vacío no cambia", () => {
    const a = guardar(guardar(almacenVacio(), AGUAJAL, 7).almacen, SANTOS, -2);
    const r = renombrarForma(a.almacen, a.forma.id, "  Monte Santos  ");
    expect(r).toMatchObject({ ok: true, forma: { nombre: "Monte Santos", actualizado: CUANDO } });
    expect(renombrarForma(a.almacen, a.forma.id, nombreAutomatico(AGUAJAL))).toEqual({ ok: false, error: "nombre_repetido" });
    expect(renombrarForma(a.almacen, "f-nada", "X")).toEqual({ ok: false, error: "no_existe" });
    if (r.ok) expect(resolverForma(r.almacen, SANTOS)?.forma?.nombre).toBe("Monte Santos");
  });
  it("borrar: la guía pasa a la siguiente que coincide (o a la de la empresa); la otra queda", () => {
    const a = guardar(almacenVacio(), AGUAJAL_OTRO, -4);
    const b = guardar(a.almacen, AGUAJAL, 7);
    const sin = borrarForma(b.almacen, b.forma.id);
    expect(sin.ok).toBe(true);
    if (!sin.ok) return;
    expect(resolverForma(sin.almacen, AGUAJAL)).toMatchObject({ coincide: "titular", forma: { id: a.forma.id } });
    expect(borrarForma(sin.almacen, b.forma.id)).toEqual({ ok: false, error: "no_existe" });
  });
  it("copiar de otra: por id, por «empresa» o por la clave de un titular de la v2; lo que no existe = null", () => {
    const alm = normalizarAlmacen(JSON.parse(JSON.stringify(V2)));
    expect(disposicionDe(alm, ID_FORMA_EMPRESA)?.guia.offsetXMm).toBe(3);
    expect(disposicionDe(alm, claveDeTitular(SANTOS.titular) as string)?.guia.offsetXMm).toBe(-2);
    expect(disposicionDe(almacenVacio(), ID_FORMA_EMPRESA)?.guia.offsetXMm).toBe(0);
    expect(disposicionDe(alm, "f-no-existe")).toBeNull();
  });
  it("la API valida el id corto y el nombre (1 a 60 letras)", () => {
    expect(formaIdSchema.safeParse("f-0a1b2c3d4e").success).toBe(true);
    expect(formaIdSchema.safeParse("../otro").success).toBe(false);
    expect(formaIdSchema.safeParse("x".repeat(40)).success).toBe(false);
    expect(nombreFormaSchema.safeParse("   ").success).toBe(false);
    expect(nombreFormaSchema.safeParse("n".repeat(61)).success).toBe(false);
  });
});

describe("la cola del monte lleva la forma", () => {
  const DATOS = { gtfId: "g1", numeroGuia: "025-001-0971772", titular: "Blas", hojas: ["guia"] as const, perfilId: "monte" };
  it("el envío guarda la forma elegida; reenviar sin ella la quita; la salida la pide", () => {
    const r = crearTrabajo({ contacto: null, trabajos: [] }, { ...DATOS, formaId: "f-0a1b2c3d4e" }, CUANDO, "t1");
    expect(r).toMatchObject({ ok: true, trabajo: { formaId: "f-0a1b2c3d4e" } });
    if (!r.ok) return;
    expect(normalizarCola(JSON.parse(JSON.stringify(r.almacen))).trabajos[0].formaId).toBe("f-0a1b2c3d4e");
    const otra = crearTrabajo(r.almacen, DATOS, DESPUES, "t2");
    expect(otra.ok && otra.trabajo.formaId).toBeUndefined();
    expect(rutaSalida({ gtfId: "g1", formato: "pdf", perfilId: "monte", hoja: "guia", formaId: "f-0a1b2c3d4e" })).toContain("forma=f-0a1b2c3d4e");
    expect(rutaSalida({ gtfId: "g1", formato: "pdf", perfilId: "monte", hoja: "guia" })).not.toContain("forma=");
  });
});

describe("nombres en la hoja de la pantalla", () => {
  it("cortos para los casilleros conocidos y la etiqueta del catálogo para el resto", () => {
    expect(nombreCorto("guia", "campo", "7")).toBe("(7) Titular");
    expect(nombreCorto("guia", "campo", "5:permiso")).toBe("Permiso");
    expect(nombreCorto("lista", "columna", "d1")).toBe("D1");
    expect(nombreCorto("lista", "columna", "vol")).toBe("Vol.");
    expect(nombreCorto("guia", "campo", "no-existe")).toBe("no-existe");
  });
});

describe("claves que se parecen a las del lenguaje", () => {
  it("«constructor», «toString» y «__proto__» no son formas: null, no {}", () => {
    const alm = normalizarAlmacen({ version: 3, formas: {} });
    for (const de of ["constructor", "toString", "__proto__"]) expect(disposicionDe(alm, de)).toBeNull();
    expect(resolverForma(alm, AGUAJAL, "constructor")).toBeNull();
  });
  it("un «__proto__» guardado en la base (v2) queda como una forma más y no cambia el objeto", () => {
    const alm = normalizarAlmacen(JSON.parse('{"version":2,"porTitular":{"__proto__":{"nombre":"Raro","guia":{},"lista":{}}}}'));
    expect(Object.getPrototypeOf(alm.formas)).toBeNull();
    expect(Object.values(alm.formas).map((f) => f.nombre)).toEqual(["Raro"]);
    expect(disposicionDe(alm, "toString")).toBeNull();
  });
});
