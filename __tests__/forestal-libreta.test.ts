/**
 * La libreta de la guía (lib/forestal/libreta.ts) y los dos arreglos de la
 * revisión del 15-10-2026 que la acompañan:
 *  (a) «Es mi planta» ya no arrastra el (22) N° de autorización del destinatario anterior.
 *  (b) «Guardar en la libreta» guarda TODO lo escrito: el (18), el encargado,
 *      el teléfono, la referencia y el ubigeo, no sólo nombre/documento/dirección.
 *  (c) Revisión 16-10: guardar un establecimiento no pisa la ficha de su mismo
 *      RUC (domicilio fiscal, ubigeo, (18), contacto) y una partida sin RUC no
 *      se duplica en cada guardado.
 */
import { describe, expect, it } from "vitest";
import type { Parte, Vehiculo } from "@/lib/forestal/directorio";
import { destinatarioDeMiPlanta, type PlantaPropia } from "@/lib/forestal/guia-th-al-ctp";
import {
  categoriasVisibles,
  coincide,
  entradasDeCategoria,
  fichaDeParte,
  fichaDeVehiculo,
  ordenarLibreta,
  parteInputDesdeValor,
  planGuardado,
  rolParaFicha,
  usoEnBloque,
  type EntradaLibreta,
  type ValorParte,
} from "@/lib/forestal/libreta";

function parte(over: Partial<Parte> = {}): Parte {
  return {
    id: "p1",
    roles: ["destinatario"],
    nombre: "Maderera del Oriente SAC",
    categoria: "empresa",
    codigoCtp: null,
    docTipo: "RUC",
    docNumero: "20156698963",
    direccion: "Jr. Tacna 123",
    region: "Ucayali",
    provincia: "Coronel Portillo",
    distrito: "Callería",
    zona: null,
    ubigeo: null,
    telefono: null,
    email: null,
    registroMtc: null,
    licencia: null,
    tituloHabilitante: null,
    resolucion: null,
    planManejo: null,
    arffs: null,
    representante: null,
    representanteDni: null,
    notas: null,
    activo: true,
    usos: 0,
    ultimoUso: null,
    logo: null,
    adjuntos: [],
    ...over,
  };
}

function vehiculo(over: Partial<Vehiculo> = {}): Vehiculo {
  return {
    id: "v1",
    placa: "ABC123",
    placaRemolque: null,
    marca: "Volvo",
    tipo: "Camión",
    configuracion: null,
    capacidadM3: null,
    transportistaId: null,
    transportistaNombre: null,
    notas: null,
    activo: true,
    usos: 0,
    ultimoUso: null,
    ...over,
  };
}

const deP = (p: Parte): EntradaLibreta => ({ tipo: "parte", id: p.id, nombre: p.nombre, usos: p.usos, ultimoUso: p.ultimoUso, parte: p });

// ── (a) «Es mi planta» ─────────────────────────────────────────────────────

describe("destinatarioDeMiPlanta (a)", () => {
  const otro = {
    nombre: "Comprador Lejano EIRL",
    docTipo: "RUC" as const,
    docNumero: "20999999991",
    direccion: "Av. del Otro 900",
    departamento: "Lima",
    provincia: "Lima",
    distrito: "Ate",
    zona: "Sector 9",
    autorizacion: "AUT-OTRO",
  };
  const planta: PlantaPropia = {
    ruc: "20600000001",
    nombre: "Inversiones Blas SA",
    direccion: "Carretera Federico Basadre km 12",
    departamento: "Ucayali",
    provincia: "Coronel Portillo",
    distrito: "Yarinacocha",
  };

  it("con otro destinatario NO arrastra su (22), ni su dirección ni su sector", () => {
    const d = destinatarioDeMiPlanta(otro, { ...planta, direccion: "", departamento: "", provincia: "", distrito: "" });
    expect(d.autorizacion).toBe("");
    expect(d.direccion).toBe("");
    expect(d.distrito).toBe("");
    expect(d.zona).toBe("");
    expect(d.docNumero).toBe("20600000001");
    expect(d.nombre).toBe("Inversiones Blas SA");
  });

  it("el (22) es el código de CTP de la Ficha cuando lo tiene", () => {
    const d = destinatarioDeMiPlanta(otro, { ...planta, autorizacion: " CTP-UCA-0042 " });
    expect(d.autorizacion).toBe("CTP-UCA-0042");
    expect(d.direccion).toBe(planta.direccion);
    expect(d.distrito).toBe("Yarinacocha");
  });

  it("si ya era tu planta, respeta lo escrito donde la Ficha no dice nada", () => {
    const mio = { ...otro, docNumero: "20600000001", autorizacion: "TIPEADO-A-MANO", zona: "Km 12" };
    const d = destinatarioDeMiPlanta(mio, planta);
    expect(d.autorizacion).toBe("TIPEADO-A-MANO");
    expect(d.zona).toBe("Km 12");
  });
});

// ── (b) «Guardar en la libreta» guarda todo ────────────────────────────────

describe("parteInputDesdeValor (b)", () => {
  it("la partida guarda (18), encargado, teléfono, referencia y ubigeo", () => {
    const input = parteInputDesdeValor(
      {
        nombre: "  Aserradero  San Juan  ",
        docTipo: "RUC",
        docNumero: "20-1234567-89",
        direccion: "Jr. Loreto 45",
        departamento: "Ucayali",
        provincia: "Coronel Portillo",
        distrito: "Manantay",
        autorizacion: "17-UCA/AUT-CTP-2023-001",
        encargado: "Rosa Pérez",
        telefono: "961 222 333",
        referencia: "Frente al puerto",
      },
      "establecimiento",
    );
    expect(input).toMatchObject({
      roles: ["establecimiento"],
      nombre: "Aserradero San Juan",
      docNumero: "20123456789",
      direccion: "Jr. Loreto 45",
      region: "Ucayali",
      provincia: "Coronel Portillo",
      distrito: "Manantay",
      codigoCtp: "17-UCA/AUT-CTP-2023-001",
      contactoNombre: "Rosa Pérez",
      telefono: "961 222 333",
      acopioReferencia: "Frente al puerto",
    });
  });

  it("lo vacío y «NO APLICA» no viajan (sin id el Directorio escribe sólo lo que trae valor)", () => {
    const input = parteInputDesdeValor(
      { nombre: "Juan Ríos", docTipo: "DNI", docNumero: "", direccion: " ", autorizacion: "NO APLICA", encargado: "", licencia: "Q12345678" },
      "conductor",
    );
    expect(input).toEqual({ roles: ["conductor"], nombre: "Juan Ríos", docTipo: "DNI", licencia: "Q12345678" });
  });
});

// ── Categorías, búsqueda y orden ───────────────────────────────────────────

describe("categorías de la libreta", () => {
  const partes = [
    parte({ id: "d", roles: ["destinatario"] }),
    parte({ id: "t", roles: ["transportista", "conductor"] }),
    parte({ id: "x", roles: [] }),
  ];

  it("la del bloque va primero; vehículos sólo si se pasan; «Sin papel» sólo si hay alguien", () => {
    const c = categoriasVisibles({ tipo: "parte", rol: "conductor" }, partes, null);
    expect(c[0]).toBe("conductores");
    expect(c).not.toContain("vehiculos");
    expect(c).toContain("sinPapel");
    expect(categoriasVisibles({ tipo: "parte", rol: "conductor" }, [partes[0]], [])).not.toContain("sinPapel");
  });

  it("sin partes a mano (null) el bloque del vehículo muestra sólo vehículos", () => {
    expect(categoriasVisibles({ tipo: "vehiculo" }, null, [])).toEqual(["vehiculos"]);
  });

  it("una parte con dos papeles sale en las dos categorías", () => {
    expect(entradasDeCategoria("transportistas", partes, null).map((e) => e.id)).toEqual(["t"]);
    expect(entradasDeCategoria("conductores", partes, null).map((e) => e.id)).toEqual(["t"]);
    expect(entradasDeCategoria("sinPapel", partes, null).map((e) => e.id)).toEqual(["x"]);
  });

  it("busca por nombre sin tildes, RUC, dirección y placa", () => {
    const p = deP(parte({ nombre: "Maderera Piña" }));
    expect(coincide(p, "pina")).toBe(true);
    expect(coincide(p, "20156698963")).toBe(true);
    expect(coincide(p, "tacna")).toBe(true);
    expect(coincide(p, "lejano")).toBe(false);
    const [v] = entradasDeCategoria("vehiculos", null, [vehiculo({ placaRemolque: "XYZ987" })]);
    expect(coincide(v, "abc-123")).toBe(true);
    expect(coincide(v, "xyz9")).toBe(true);
  });

  it("recientes = la marca del navegador gana a la del Directorio; empate → A → Z", () => {
    const a = deP(parte({ id: "a", nombre: "Alfa", ultimoUso: "2026-10-01T10:00:00Z", usos: 9 }));
    const b = deP(parte({ id: "b", nombre: "Beta", ultimoUso: null, usos: 1 }));
    const c = deP(parte({ id: "c", nombre: "Ceta", ultimoUso: null }));
    const marcas = { b: "2026-10-15T10:00:00Z" };
    expect(ordenarLibreta([c, a, b], "recientes", marcas).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(ordenarLibreta([c, b, a], "usados", marcas).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(ordenarLibreta([c, b, a], "az", marcas).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});

// ── La ficha ───────────────────────────────────────────────────────────────

describe("ficha antes de usar", () => {
  it("destinatario: sellos con casillero, (22) vacío = «No aplica», interno sin sello de guía", () => {
    const f = fichaDeParte(parte({ contactoNombre: "Rosa", telefono: "961" }), "destinatario");
    const campos = f.grupos.flatMap((g) => g.campos);
    const de = (k: string) => campos.find((c) => c.clave === k);
    expect(de("nombre")).toMatchObject({ sello: "guia", casillero: "(21)" });
    expect(de("autorizacion")).toMatchObject({ sello: "guia", casillero: "(22)", noAplica: true });
    expect(de("encargado")?.sello).toBe("interno");
    expect(f.faltan).toEqual([]);
  });

  it("partida: falta el (18) y el ubigeo incompleto se avisa", () => {
    const f = fichaDeParte(parte({ roles: ["establecimiento"], distrito: null }), "establecimiento");
    expect(f.faltan).toContain("el N° de autorización");
    expect(f.faltan).toContain("el ubigeo (departamento, provincia y distrito)");
    const ubigeo = f.grupos.flatMap((g) => g.campos).find((c) => c.clave === "ubigeo");
    expect(ubigeo?.valor).toMatch(/incompleto/);
  });

  it("vehículo sin tipo: le falta el tipo", () => {
    expect(fichaDeVehiculo(vehiculo({ tipo: null })).faltan).toContain("el tipo");
    expect(fichaDeVehiculo(vehiculo()).faltan).toEqual([]);
  });
});

// ── Cómo se usa en el bloque ───────────────────────────────────────────────

describe("uso en el bloque que abrió la libreta", () => {
  const dest = deP(parte({ id: "d" }));
  const [v] = entradasDeCategoria("vehiculos", null, [vehiculo()]);

  it("con su papel se usa directo; con otro, se usa y le suma el papel", () => {
    expect(usoEnBloque({ tipo: "parte", rol: "destinatario" }, dest, new Set(["d"]))).toEqual({ usable: true, sumarRol: false, nota: null });
    const u = usoEnBloque({ tipo: "parte", rol: "conductor" }, dest, new Set());
    expect(u.usable && u.sumarRol).toBe(true);
    expect(u.nota).toMatch(/conductor/);
  });

  it("un vehículo no va en el bloque de una persona, ni una persona en el del vehículo", () => {
    expect(usoEnBloque({ tipo: "parte", rol: "destinatario" }, v, new Set()).usable).toBe(false);
    expect(usoEnBloque({ tipo: "vehiculo" }, dest, new Set(["d"])).usable).toBe(false);
    expect(usoEnBloque({ tipo: "vehiculo" }, v, new Set()).usable).toBe(true);
  });

  it("la ficha se lee con el papel del bloque en su categoría, y con el de la categoría en otra", () => {
    expect(rolParaFicha({ tipo: "parte", rol: "cliente" }, "destinatarios")).toBe("cliente");
    expect(rolParaFicha({ tipo: "parte", rol: "establecimiento" }, "transportistas")).toBe("transportista");
    expect(rolParaFicha({ tipo: "vehiculo" }, "vehiculos")).toBeNull();
    expect(rolParaFicha({ tipo: "parte", rol: "proveedor" }, "sinPapel")).toBe("proveedor");
  });
});

// ── (c) Guardar sin pisar otra ficha ───────────────────────────────────────

describe("planGuardado: «Guardar en la libreta» no pisa la ficha de otro local", () => {
  /** La partida tal como la manda LothGuiaPartida: un depósito de la misma empresa. */
  const deposito = (over: Partial<ValorParte> = {}): ValorParte => ({
    nombre: "Depósito Maderera del Oriente",
    docTipo: "RUC",
    docNumero: "20156698963",
    direccion: "Carretera Federico Basadre km 8",
    departamento: "Ucayali",
    provincia: "Coronel Portillo",
    distrito: "Yarinacocha",
    autorizacion: "25-UCA/DEP-0042",
    encargado: "Rosa",
    ...over,
  });
  const fiscal = parte({ codigoCtp: "25-UCA/C-OPE-001", contactoNombre: "Gerencia" });

  it("mismo RUC con otra dirección: pregunta en vez de guardar encima", () => {
    const plan = planGuardado(deposito(), "establecimiento", [fiscal]);
    expect("choque" in plan && plan.choque.existente.id).toBe("p1");
    expect("choque" in plan && plan.choque.tiene).toContain("Jr. Tacna 123");
  });

  it("«Guardar aparte»: otra ficha SIN documento (la libreta admite una por RUC) y el RUC en las notas", () => {
    const plan = planGuardado(deposito(), "establecimiento", [fiscal], true);
    if (!("input" in plan)) throw new Error("debía guardar");
    expect(plan.input.id).toBeUndefined();
    expect(plan.input.docNumero).toBeUndefined();
    expect(plan.input.docTipo).toBeUndefined();
    expect(plan.input).toMatchObject({ roles: ["establecimiento"], direccion: "Carretera Federico Basadre km 8", codigoCtp: "25-UCA/DEP-0042", contactoNombre: "Rosa" });
    expect(plan.input.notas).toBe("Local de Maderera del Oriente SAC (RUC 20156698963).");
  });

  it("sin dirección distinta pero con otro (18): también pregunta", () => {
    const plan = planGuardado(deposito({ direccion: "" }), "establecimiento", [fiscal]);
    expect("choque" in plan && plan.choque.tiene).toBe("N° de autorización 25-UCA/C-OPE-001");
  });

  it("misma dirección (con otros puntos y mayúsculas) o ficha sin dirección: une por documento como antes", () => {
    for (const p of [parte({ direccion: "CARRETERA FEDERICO BASADRE KM. 8", codigoCtp: null }), parte({ direccion: null, codigoCtp: null })]) {
      const plan = planGuardado(deposito(), "establecimiento", [p]);
      expect("input" in plan && plan.input.id).toBeUndefined();
      expect("input" in plan && plan.input.docNumero).toBe("20156698963");
    }
  });

  it("otro papel con el mismo RUC no pregunta: el destinatario actualiza su ficha", () => {
    const plan = planGuardado({ ...deposito(), autorizacion: "" }, "destinatario", [fiscal]);
    expect("input" in plan && plan.input.docNumero).toBe("20156698963");
  });

  it("el local ya guardado aparte se actualiza la próxima vez, no se duplica ni vuelve a preguntar", () => {
    const local = parte({ id: "loc", roles: ["establecimiento"], nombre: "DEPOSITO MADERERA DEL ORIENTE", docTipo: null, docNumero: null, direccion: "Carretera Federico Basadre Km 8", notas: "Local de Maderera del Oriente SAC (RUC 20156698963)." });
    const plan = planGuardado(deposito({ telefono: "961000111" }), "establecimiento", [fiscal, local]);
    if (!("input" in plan)) throw new Error("debía guardar");
    expect(plan.input.id).toBe("loc");
    expect(plan.input.docNumero).toBeUndefined();
    expect(plan.input).toMatchObject({ telefono: "961000111", notas: local.notas, activo: true });
  });

  it("partida sin RUC: une con la ficha sin documento del mismo nombre y dirección (antes duplicaba)", () => {
    const previa = parte({ id: "sin", roles: ["proveedor"], nombre: "Depósito El Tigre", docTipo: null, docNumero: null, direccion: "Jr. Raymondi 450", region: null, provincia: null, distrito: null });
    const v = deposito({ nombre: "deposito el tigre", docNumero: "", direccion: "JR RAYMONDI 450" });
    const plan = planGuardado(v, "establecimiento", [fiscal, previa]);
    if (!("input" in plan)) throw new Error("debía guardar");
    expect(plan.input.id).toBe("sin");
    expect(plan.input.roles).toEqual(["proveedor", "establecimiento"]);
    expect(plan.input).toMatchObject({ region: "Ucayali", distrito: "Yarinacocha", codigoCtp: "25-UCA/DEP-0042" });
    /* Otra dirección = otro local: ésa sí es una ficha nueva. */
    const otra = planGuardado({ ...v, direccion: "Jr. Raymondi 999" }, "establecimiento", [previa]);
    expect("input" in otra && otra.input.id).toBeUndefined();
  });
});
