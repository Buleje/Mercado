import { describe, expect, it } from "vitest";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import {
  aplicarPlantilla,
  bloquesDe,
  bloquesMarcados,
  contenidoDesdeDatos,
  contenidoPlantillaSchema,
  estadoDelPermiso,
  nombrePropuesto,
  tituloQueNoVa,
  type ContenidoPlantilla,
  type PlanesDeLaGuia,
  type PlantillaGuia,
} from "@/lib/forestal/gtf-plantillas";
import { TOPE_PLANTILLAS, accionPlantillaSchema, aplicarAccion, nombreDeCopia, normalizarAlmacen, ordenarPlantillas } from "@/lib/forestal/gtf-plantillas-almacen";

const PERMISO = { planId: "plan-a", etiqueta: "PO 12-2024 · Juan Pérez" };

/** Una guía llena: permiso, partida, destino, transporte, y lo de un solo viaje. */
function guiaLlena(): GtfDatos {
  const d = gtfDatosVacio();
  return {
    ...d,
    titulos: ["16-UCA/C-OPP-001-24"],
    guia: { ...d.guia, autoridad: "ATFFS Ucayali", resolucion: "RD 123-2024", planManejoTipo: "PO", departamento: "UCAYALI", listaTrozasNro: "019-001-0000065", guiaRemisionNro: "EG01-55" },
    propietario: { ...d.propietario, esElCtp: true, nombre: "Juan Pérez", docTipo: "DNI", docNumero: "44556677" },
    destinatario: { ...d.destinatario, nombre: "Maderera San Juan SAC", docNumero: "20123456789", direccion: "Jr. Los Pinos 123", departamento: "UCAYALI", provincia: "CORONEL PORTILLO", distrito: "CALLERIA" },
    transportista: { ...d.transportista, nombre: "Transportes Rápido", docNumero: "20999888777" },
    vehiculo: { ...d.vehiculo, placa: "ABC-123", conductor: "Pedro Ruiz", conductorDni: "11223344" },
    traslado: {
      ...d.traslado,
      partida: { ...d.traslado.partida, modo: "inicio", nombre: "Fundo Las Palmas", distrito: "MASISEA", provincia: "CORONEL PORTILLO", departamento: "UCAYALI" },
      puntoPartida: "MASISEA, CORONEL PORTILLO, UCAYALI",
      fechaInicio: "2026-10-16",
    },
    observaciones: "Carga cubierta con lona",
  };
}

const planes = (x: Partial<PlanesDeLaGuia> = {}): PlanesDeLaGuia => ({
  planIdActual: "plan-a",
  planes: [
    { id: "plan-a", etiqueta: "PO 12-2024 · Juan Pérez" },
    { id: "plan-b", etiqueta: "PO 7-2025 · Rosa Díaz" },
  ],
  vigenciaDe: () => null,
  hoy: "2026-10-16",
  ...x,
});

describe("guardar una plantilla", () => {
  it("guarda SÓLO los bloques elegidos, nunca el N°, las fechas ni el viaje", () => {
    const c = contenidoDesdeDatos(guiaLlena(), ["titulo", "destinatario"], PERMISO);
    expect(bloquesDe(c)).toEqual(["titulo", "destinatario"]);
    expect(c.titulo).toMatchObject({ planId: "plan-a", permiso: PERMISO.etiqueta, numero: "16-UCA/C-OPP-001-24", autoridad: "ATFFS Ucayali" });
    const json = JSON.stringify(c);
    expect(json).not.toContain("0000065");
    expect(json).not.toContain("2026-10-16");
    expect(json).not.toContain("EG01-55");
    expect(c.propietario).toBeUndefined();
    expect(contenidoPlantillaSchema.safeParse(c).success).toBe(true);
  });

  it("la ruta que se armó sola no se guarda; la escrita a mano sí", () => {
    const d = guiaLlena();
    expect(contenidoDesdeDatos(d, ["destinatario"], PERMISO).destinatario?.ruta).toBe("");
    const aMano = { ...d, traslado: { ...d.traslado, ruta: "Masisea – río Ucayali – Pucallpa" } };
    expect(contenidoDesdeDatos(aMano, ["destinatario"], PERMISO).destinatario?.ruta).toBe("Masisea – río Ucayali – Pucallpa");
  });

  it("marca solos los bloques nombrados que tienen datos; el nombre es «permiso → destino»", () => {
    const d = guiaLlena();
    expect(bloquesMarcados(d, PERMISO)).toEqual(["titulo", "propietario", "partida", "destinatario"]);
    expect(bloquesMarcados(gtfDatosVacio(), null)).toEqual([]);
    expect(nombrePropuesto(d, PERMISO)).toBe("16-UCA/C-OPP-001-24 → Maderera San Juan SAC");
    expect(nombrePropuesto(gtfDatosVacio(), null)).toBe("Sin permiso → sin destino");
  });

  it("una plantilla sin ningún bloque no valida", () => {
    expect(contenidoPlantillaSchema.safeParse({}).success).toBe(false);
  });
});

describe("el permiso de la plantilla", () => {
  const c: ContenidoPlantilla = contenidoDesdeDatos(guiaLlena(), ["titulo"], PERMISO);

  it("mismo, otro, sin permiso o sin bloque", () => {
    expect(estadoDelPermiso(c, planes()).tipo).toBe("mismo");
    expect(estadoDelPermiso(c, planes({ planIdActual: "plan-b" }))).toEqual({ tipo: "cambia", planId: "plan-a", etiqueta: PERMISO.etiqueta });
    expect(estadoDelPermiso({ titulo: { ...c.titulo!, planId: null } }, planes()).tipo).toBe("sin_permiso");
    expect(estadoDelPermiso({ observaciones: "x" }, planes()).tipo).toBe("sin_bloque");
  });

  it("vencido o borrado: se avisa", () => {
    expect(estadoDelPermiso(c, planes({ vigenciaDe: () => "2026-10-15" }))).toEqual({ tipo: "vencido", planId: "plan-a", etiqueta: PERMISO.etiqueta, vencio: "2026-10-15" });
    expect(estadoDelPermiso(c, planes({ vigenciaDe: () => "2026-10-16T00:00:00.000Z" })).tipo).toBe("mismo");
    expect(estadoDelPermiso(c, planes({ planes: [] }))).toEqual({ tipo: "no_existe", etiqueta: PERMISO.etiqueta });
  });

  it("otro permiso sin trozas para despachar: no se cambia a él (el de ahora vale aunque no tenga)", () => {
    const soloB = (id: string) => id === "plan-b";
    expect(estadoDelPermiso(c, planes({ planIdActual: "plan-b", conTrozas: soloB }))).toEqual({ tipo: "sin_trozas", planId: "plan-a", etiqueta: PERMISO.etiqueta });
    expect(estadoDelPermiso(c, planes({ conTrozas: () => false })).tipo).toBe("mismo");
    expect(tituloQueNoVa({ tipo: "sin_trozas", planId: "plan-a", etiqueta: "x" }, "plan-b")).toBe("ese permiso no tiene trozas para despachar");
  });
});

describe("usar una plantilla", () => {
  const c = contenidoDesdeDatos(guiaLlena(), ["titulo", "propietario", "partida", "destinatario", "transportista", "conductor", "vehiculo", "observaciones"], PERMISO);
  const vacia = gtfDatosVacio();

  it("sobre una guía vacía llena todo; nada se pisa", () => {
    const r = aplicarPlantilla(vacia, c, { permiso: { tipo: "sin_permiso" }, planIdActual: null });
    expect(r.pisa).toEqual([]);
    expect(r.datos.destinatario.nombre).toBe("Maderera San Juan SAC");
    expect(r.datos.vehiculo.placa).toBe("ABC-123");
    expect(r.datos.observaciones).toBe("Carga cubierta con lona");
    expect(r.llena.map((x) => x.campo)).toContain("N° de documento");
  });

  it("la llegada sale del destinatario y la partida trae su texto impreso", () => {
    const r = aplicarPlantilla(vacia, c, { permiso: { tipo: "sin_permiso" }, planIdActual: null });
    expect(r.datos.traslado.puntoLlegada).toBe("Jr. Los Pinos 123, CALLERIA, CORONEL PORTILLO, UCAYALI");
    expect(r.datos.traslado.partida.nombre).toBe("Fundo Las Palmas");
    expect(r.datos.traslado.puntoPartida).toBe("MASISEA, CORONEL PORTILLO, UCAYALI");
    expect(r.datos.traslado.ruta).toBe("MASISEA, CORONEL PORTILLO, UCAYALI → Jr. Los Pinos 123, CALLERIA, CORONEL PORTILLO, UCAYALI");
  });

  it("dice qué pisa: lo escrito que cambia, con el antes y el después", () => {
    const otra = { ...vacia, destinatario: { ...vacia.destinatario, nombre: "Aserradero Norte" } };
    const r = aplicarPlantilla(otra, { destinatario: c.destinatario! }, { permiso: { tipo: "sin_bloque" }, planIdActual: null });
    expect(r.pisa).toEqual([{ bloque: "destinatario", campo: "Nombre", antes: "Aserradero Norte", despues: "Maderera San Juan SAC" }]);
  });

  it("con permiso, el título sólo tapa huecos: lo que dicta el plan no se toca", () => {
    const delPlan = { ...vacia, titulos: ["OTRO-NUMERO"], guia: { ...vacia.guia, autoridad: "ARFFS Ucayali", resolucion: "" } };
    const r = aplicarPlantilla(delPlan, { titulo: c.titulo! }, { permiso: { tipo: "mismo", etiqueta: "" }, planIdActual: "plan-a" });
    expect(r.datos.titulos).toEqual(["OTRO-NUMERO"]);
    expect(r.datos.guia.autoridad).toBe("ARFFS Ucayali");
    expect(r.datos.guia.resolucion).toBe("RD 123-2024");
    expect(r.pisa).toEqual([]);
  });

  it("sin permiso sobre una guía CON permiso: el título no se toca, aunque esté vacío", () => {
    // La guía declara el título de SU permiso: ni el N° ni la autoridad de otro.
    const conPermiso = { ...vacia, titulos: [] };
    const sinPermiso = { ...c, titulo: { ...c.titulo!, planId: null, representanteLegal: "Ana Ríos" } };
    const r = aplicarPlantilla(conPermiso, sinPermiso, { permiso: { tipo: "sin_permiso" }, planIdActual: "plan-a" });
    expect(r.saltados).toEqual(["titulo"]);
    expect(r.datos.titulos).toEqual([]);
    expect(r.datos.guia.autoridad).toBe("");
    expect(r.datos.guia.representanteLegal).toBe("");
    expect(r.llena.some((x) => x.bloque === "titulo")).toBe(false);
    expect(r.datos.destinatario.nombre).toBe("Maderera San Juan SAC");
    expect(tituloQueNoVa({ tipo: "sin_permiso" }, "plan-a")).toBe("esta guía ya tiene su permiso");
    expect(tituloQueNoVa({ tipo: "sin_permiso" }, null)).toBeNull();
  });

  it("sin permiso en ninguna de las dos: lo que la plantilla trae vacío no borra lo escrito", () => {
    const escrita = { ...vacia, guia: { ...vacia.guia, autoridad: "ARFFS Ucayali", provincia: "PADRE ABAD" } };
    const t = { ...c.titulo!, planId: null, autoridad: "", provincia: "", resolucion: "RD 9-2025" };
    const r = aplicarPlantilla(escrita, { titulo: t }, { permiso: { tipo: "sin_permiso" }, planIdActual: null });
    expect(r.datos.guia.autoridad).toBe("ARFFS Ucayali");
    expect(r.datos.guia.provincia).toBe("PADRE ABAD");
    expect(r.datos.guia.resolucion).toBe("RD 9-2025");
    expect(r.pisa).toEqual([]);
  });

  it("permiso vencido, borrado o sin trozas: el título se salta y lo demás se aplica", () => {
    for (const permiso of [
      { tipo: "vencido", planId: "plan-a", etiqueta: "x", vencio: "2026-01-01" },
      { tipo: "no_existe", etiqueta: "x" },
      { tipo: "sin_trozas", planId: "plan-a", etiqueta: "x" },
    ] as const) {
      const r = aplicarPlantilla(vacia, c, { permiso, planIdActual: "plan-b" });
      expect(r.saltados).toEqual(["titulo"]);
      expect(r.datos.titulos).toEqual([]);
      expect(r.datos.guia.autoridad).toBe("");
      expect(r.datos.destinatario.nombre).toBe("Maderera San Juan SAC");
    }
  });

  it("«Es el titular»: el propietario sale del titular del plan de ahora", () => {
    const r = aplicarPlantilla(vacia, { propietario: c.propietario! }, {
      permiso: { tipo: "sin_bloque" },
      planIdActual: "plan-b",
      propietarioDelTitular: { nombre: "Rosa Díaz", docTipo: "DNI", docNumero: "10101010" },
    });
    expect(r.datos.propietario).toMatchObject({ esElCtp: true, nombre: "Rosa Díaz", docNumero: "10101010" });
  });

  it("no toca la lista, la guía de remisión ni las fechas de la guía de ahora", () => {
    const d = guiaLlena();
    const r = aplicarPlantilla(d, c, { permiso: { tipo: "mismo", etiqueta: "" }, planIdActual: "plan-a" });
    expect(r.datos.guia.listaTrozasNro).toBe("019-001-0000065");
    expect(r.datos.guia.guiaRemisionNro).toBe("EG01-55");
    expect(r.datos.traslado.fechaInicio).toBe("2026-10-16");
  });
});

describe("el almacén de plantillas", () => {
  const ctx = (n: number) => ({ en: `2026-10-16T10:0${n}:00.000Z`, por: "qaadmin", nuevoId: `id-${n}` });
  const contenido: ContenidoPlantilla = { observaciones: "x" };
  const crear = (lista: PlantillaGuia[], nombre: string, n: number) => {
    const r = aplicarAccion(lista, { accion: "crear", nombre, contenido }, ctx(n));
    if (!r.ok) throw new Error(r.error);
    return r.lista;
  };

  it("crea, no repite nombres (sin mirar mayúsculas) y respeta el tope", () => {
    const una = crear([], "PO 12 → San Juan", 1);
    expect(una).toHaveLength(1);
    expect(aplicarAccion(una, { accion: "crear", nombre: "  po 12 →  san juan ", contenido }, ctx(2))).toEqual({ ok: false, error: "nombre_repetido" });
    let lista: PlantillaGuia[] = [];
    for (let i = 0; i < TOPE_PLANTILLAS; i++) lista = crear(lista, `P${i}`, i);
    expect(aplicarAccion(lista, { accion: "crear", nombre: "Una más", contenido }, ctx(9))).toEqual({ ok: false, error: "tope" });
  });

  it("renombra, duplica con «(copia)», cuenta los usos y borra", () => {
    let lista = crear([], "Base", 1);
    const r1 = aplicarAccion(lista, { accion: "duplicar", id: "id-1" }, ctx(2));
    expect(r1.ok && r1.plantilla?.nombre).toBe("Base (copia)");
    lista = r1.ok ? r1.lista : lista;
    expect(nombreDeCopia(lista, "Base")).toBe("Base (copia 2)");
    const r2 = aplicarAccion(lista, { accion: "usar", id: "id-2" }, ctx(3));
    expect(r2.ok && r2.plantilla).toMatchObject({ usos: 1, usadaEn: ctx(3).en });
    lista = r2.ok ? r2.lista : lista;
    expect(ordenarPlantillas(lista)[0].id).toBe("id-2");
    expect(aplicarAccion(lista, { accion: "renombrar", id: "id-1", nombre: "base (COPIA)" }, ctx(4))).toEqual({ ok: false, error: "nombre_repetido" });
    const r3 = aplicarAccion(lista, { accion: "borrar", id: "id-1" }, ctx(5));
    expect(r3.ok && r3.lista.map((p) => p.id)).toEqual(["id-2"]);
    expect(aplicarAccion(lista, { accion: "borrar", id: "nada" }, ctx(6))).toEqual({ ok: false, error: "no_existe" });
  });

  it("«__proto__» y «constructor» son nombres como cualquier otro", () => {
    let lista = crear([], "__proto__", 1);
    lista = crear(lista, "constructor", 2);
    expect(lista.map((p) => p.nombre)).toEqual(["__proto__", "constructor"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(normalizarAlmacen(JSON.parse(JSON.stringify({ v: 1, plantillas: lista })))).toHaveLength(2);
  });

  it("normaliza lo guardado con desconfianza: descarta lo que no valida y los id repetidos", () => {
    const buena = crear([], "Buena", 1)[0];
    const raw = { v: 1, plantillas: [buena, { ...buena }, { id: "x", nombre: "", contenido: {} }, "basura", null] };
    expect(normalizarAlmacen(raw).map((p) => p.id)).toEqual(["id-1"]);
    expect(normalizarAlmacen(null)).toEqual([]);
    expect(normalizarAlmacen(JSON.parse('{"__proto__":{"plantillas":[1]}}'))).toEqual([]);
  });

  it("el PUT no acepta un contenido vacío ni nombres de más de 80", () => {
    expect(accionPlantillaSchema.safeParse({ accion: "crear", nombre: "x", contenido: {} }).success).toBe(false);
    expect(accionPlantillaSchema.safeParse({ accion: "crear", nombre: "x".repeat(81), contenido }).success).toBe(false);
    expect(accionPlantillaSchema.safeParse({ accion: "crear", nombre: "ok", contenido }).success).toBe(true);
  });
});
