/**
 * Guía del Libro TH → Libro CTP (28-09-2026) — las reglas puras.
 *
 * Lo que se prueba acá es lo que la pantalla muestra ANTES de recibir y lo que
 * el servidor registra: los dos llaman a estas mismas funciones.
 */
import { describe, expect, it } from "vitest";
import { claveNumeroGtf, colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import {
  destinoDeGuiaTh,
  foliosEnTexto,
  mensajeDeRecibirInvalido,
  mensajeGuiaYaRecibida,
  mismaGuiaTh,
  SIN_ARREGLO_EN_LA_LISTA,
  dimensionesDeTroza,
  guiaThDeNumero,
  ingresosDesdeGuiaTh,
  leerItemsGuiaTh,
  mensajeDelPase,
  RecibirGuiaThInput,
  type ItemGuiaTh,
} from "@/lib/forestal/guia-th-al-ctp";
import { medidasDeTroza } from "@/lib/forestal/serfor-gtf-a-ingresos";
import { vencimientoDeGuiaGuardada } from "@/lib/forestal/vencimiento-guia-guardada";

const RUC = "20605859438";
const dest = (docNumero: string, nombre = "INVERSIONES AGROFORESTALES BLAS") => ({
  destinatario: {
    nombre,
    docTipo: "RUC" as const,
    docNumero,
    direccion: "",
    departamento: "",
    provincia: "",
    distrito: "",
    zona: "",
  },
});

const troza = (o: Partial<ItemGuiaTh>): ItemGuiaTh => ({
  code: null,
  treeCode: null,
  species: null,
  scientific: null,
  cites: false,
  diamMayorM: null,
  diamMenorM: null,
  lengthM: null,
  volumeM3: null,
  pieces: null,
  ...o,
});

describe("destinoDeGuiaTh — sólo pasa al CTP propio si el destinatario es este negocio", () => {
  it("mismo RUC (con espacios o guiones) → propio", () => {
    expect(destinoDeGuiaTh(dest("20605859438"), RUC)).toEqual({ propio: true });
    expect(destinoDeGuiaTh(dest(" 20-605859438 "), "RUC 20605859438")).toEqual({ propio: true });
  });

  it("otro RUC → no pasa, y dice a quién va", () => {
    const r = destinoDeGuiaTh(dest("20100000001", "MADERERA VECINA SAC"), RUC);
    expect(r.propio).toBe(false);
    if (r.propio) return;
    expect(r.motivo).toBe("otra_empresa");
    expect(r.mensaje).toContain("MADERERA VECINA SAC");
    expect(r.mensaje).toContain("20100000001");
  });

  it("sin RUC en la Ficha o sin RUC del destinatario → no se adivina", () => {
    const sinPropio = destinoDeGuiaTh(dest(RUC), "");
    expect(sinPropio.propio === false && sinPropio.motivo).toBe("sin_ruc_propio");
    const sinDest = destinoDeGuiaTh(dest(""), RUC);
    expect(sinDest.propio === false && sinDest.motivo).toBe("sin_destinatario");
  });

  it("un DNI del destinatario nunca es la planta (RUC de 11 dígitos)", () => {
    expect(destinoDeGuiaTh(dest("40506070"), RUC).propio).toBe(false);
  });
});

describe("ingresosDesdeGuiaTh — un ingreso por especie, con sus trozas", () => {
  const items = [
    troza({ code: "85-TOR-A", species: "Tornillo", scientific: "Cedrelinga cateniformis", diamMayorM: 0.62, diamMenorM: 0.55, lengthM: 4.2, volumeM3: 1.1275 }),
    troza({ code: "86-CAP-A", species: "Capirona", diamMayorM: 0.48, diamMenorM: 0.44, lengthM: 3.8, volumeM3: 0.6315 }),
    troza({ code: "85-TOR-B", species: "TORNILLO (Cedrelinga cateniformis)", diamMayorM: 0.55, diamMenorM: 0.5, lengthM: 3.5, volumeM3: 0.7568 }),
  ];

  it("agrupa «Tornillo» y «TORNILLO (Cedrelinga…)» en un renglón y suma sus trozas", () => {
    const r = ingresosDesdeGuiaTh(items, { parcela: "PC-3" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas.map((l) => [l.especieComun, l.trozas.length, l.volumenM3])).toEqual([
      ["Tornillo", 2, 1.8843],
      ["Capirona", 1, 0.6315],
    ]);
    expect(r.totalM3).toBe(2.5158);
    expect(r.trozas).toBe(3);
    expect(r.lineas[0].especieCientifica).toBe("Cedrelinga cateniformis");
    expect(r.lineas[0].presentacion).toBe("TROZAS");
    expect(r.lineas[0].piezas).toBe(2);
  });

  it("cada troza lleva su código, D1/D2 en cm, largo, m³ y la parcela, en el orden de la guía", () => {
    const r = ingresosDesdeGuiaTh(items, { parcela: "PC-3" });
    if (!r.ok) throw new Error(r.motivo);
    const t = r.lineas[0].trozas[0];
    expect(t).toMatchObject({
      orden: 1,
      codificacion: "85-TOR-A",
      d1Cm: 62,
      d2Cm: 55,
      largoM: 4.2,
      volumenM3: 1.1275,
      cantidad: 1,
      parcela: "PC-3",
    });
    expect(t.diametroCm).toBe(58.5);
    expect(r.lineas[0].trozas[1].orden).toBe(3);
  });

  it("las dimensiones se releen como las de SERFOR (diámetros en cm, largo en m)", () => {
    const d = dimensionesDeTroza(62, 55, 4.2);
    expect(d).toBe("62 X 55 X 4.2");
    expect(medidasDeTroza(d)).toEqual({ largoM: 4.2, diametroCm: 58.5, d1Cm: 62, d2Cm: 55 });
    expect(dimensionesDeTroza(null, 55, 4.2)).toBeNull();
  });

  it("una troza sin especie o sin volumen frena la guía entera (y dice cuál)", () => {
    const sinEspecie = ingresosDesdeGuiaTh([...items, troza({ code: "X-1", volumeM3: 1 })]);
    expect(sinEspecie.ok === false && sinEspecie.motivo).toContain("X-1");
    const sinVolumen = ingresosDesdeGuiaTh([troza({ code: "Y-1", species: "Tornillo" })]);
    expect(sinVolumen.ok === false && sinVolumen.motivo).toContain("Y-1");
    /* La lista es una foto: el mensaje no manda a completar el Trozado. */
    expect(sinVolumen.ok === false && sinVolumen.motivo).toContain(SIN_ARREGLO_EN_LA_LISTA);
    expect(sinVolumen.ok === false && sinVolumen.motivo).not.toContain("Complétala en el Trozado");
    expect(ingresosDesdeGuiaTh([]).ok).toBe(false);
  });

  it("si el total de la guía no es la suma de sus trozas, avisa (tolerancia de 10 litros)", () => {
    const igual = ingresosDesdeGuiaTh(items, { volumenDeclaradoM3: 2.52 });
    expect(igual.ok && igual.avisos).toEqual([]);
    const distinto = ingresosDesdeGuiaTh(items, { volumenDeclaradoM3: 3, gtfNumber: "001-0000123" });
    expect(distinto.ok && distinto.avisos[0]).toContain("001-0000123");
  });
});

describe("leerItemsGuiaTh — la columna JSON se lee con desconfianza", () => {
  it("convierte números escritos como texto y descarta lo que no entiende", () => {
    const r = leerItemsGuiaTh([
      { code: " 85-A ", species: "Tornillo", volumeM3: "1,25", diamMayorM: "0.6", pieces: 1 },
      "basura",
      { code: "", species: "", volumeM3: "abc" },
    ]);
    expect(r[0]).toMatchObject({ code: "85-A", species: "Tornillo", volumeM3: 1.25, diamMayorM: 0.6, pieces: 1 });
    expect(r[1]).toMatchObject({ code: null, species: null, volumeM3: null });
    expect(r).toHaveLength(2);
    expect(leerItemsGuiaTh(null)).toEqual([]);
  });
});

describe("el enlace por N° de guía", () => {
  const guias = [
    { id: "a", gtfNumber: "019-0000123", status: "anulada", createdAt: new Date("2026-09-20") },
    { id: "b", gtfNumber: "19-123", status: "emitida", createdAt: new Date("2026-09-10") },
    { id: "c", gtfNumber: "019-0000124", status: "emitida", createdAt: new Date("2026-09-21") },
  ];
  it("compara tramo a tramo y prefiere la emitida", () => {
    expect(guiaThDeNumero("19-0000123", guias)?.id).toBe("b");
    expect(guiaThDeNumero("019-0000125", guias)).toBeNull();
  });
  it("la cola sirve para pedir candidatos a la base sin los ceros", () => {
    expect(colaDeGtf("001-0000123")).toBe("123");
    expect(colaDeGtf("019-001-0000000")).toBe("0");
    expect(colaDeGtf("  ")).toBeNull();
  });
});

describe("contrato de «Recibir»", () => {
  it("la fecha de llegada tiene que existir", () => {
    expect(RecibirGuiaThInput.safeParse({ fechaLlegada: "2026-09-28" }).success).toBe(true);
    expect(RecibirGuiaThInput.safeParse({ fechaLlegada: "2026-02-31" }).success).toBe(false);
    expect(RecibirGuiaThInput.safeParse({}).success).toBe(false);
  });
  it("el Libro TH sólo dice algo cuando hay algo que decir", () => {
    expect(mensajeDelPase("creada")).toContain("Libro CTP");
    expect(mensajeDelPase("sin_libro_ctp")).toBe("");
    expect(mensajeDelPase("otra_empresa", "va a otra")).toBe("va a otra");
  });
});

describe("el vencimiento de una guardada que viene del Libro TH", () => {
  const base = { resumen: null, gtfDate: "2026-09-28", verificadaEnSerfor: false };
  it("sin ficha de SERFOR vale el casillero (4) de la guía del TH", () => {
    const v = vencimientoDeGuiaGuardada({ ...base, libroTh: { vencimiento: "2026-09-30" } }, "2026-09-28");
    expect(v).toMatchObject({ tono: "pronto", vencimiento: "2026-09-30", dias: 2 });
  });
  it("si la guía del TH no lo dice, no manda a buscarla en SERFOR", () => {
    const v = vencimientoDeGuiaGuardada({ ...base, libroTh: { vencimiento: null } }, "2026-09-28");
    expect(v.tono).toBe("sin_fecha");
    expect(v.detalle).toContain("Libro TH");
  });
});

describe("el N° de guía: UNA regla tramo a tramo (revisión 28-09)", () => {
  it("el talonario, SERFOR y lo tipeado con espacios alrededor del guion son la misma guía", () => {
    expect(claveNumeroGtf("19-001-0000065")).toBe("19-1-65");
    expect(claveNumeroGtf("019-001-0000065")).toBe("19-1-65");
    expect(claveNumeroGtf(" 019 - 001 - 65 ")).toBe("19-1-65");
    expect(mismoNumeroGtf("19-001-0000065", "019-001-0000065")).toBe(true);
  });
  it("NO se igualan: otra serie, otro número de tramos, ni espacios sin guion", () => {
    expect(mismoNumeroGtf("19-002-0000065", "19-001-0000065")).toBe(false);
    expect(mismoNumeroGtf("20-001-0000065", "19-001-0000065")).toBe(false);
    expect(mismoNumeroGtf("001-0000065", "19-001-0000065")).toBe(false);
    expect(mismoNumeroGtf("019 001 65", "19-001-0000065")).toBe(false);
    expect(mismoNumeroGtf("", "")).toBe(false);
  });
  it("la cola para pedir candidatas no deja afuera ninguna escritura de la misma guía", () => {
    expect(colaDeGtf("019-001-0000065")).toBe("65");
    expect("0000065".endsWith(colaDeGtf("19-001-65") ?? "x")).toBe(true);
  });
});

describe("¿la guardada y la guía del TH son la misma, además del N°?", () => {
  const th = { permiso: "17-CPO/C-J-001-02", titular: "Maderera El Aguajal S.A.C." };
  it("manda el permiso; signos y mayúsculas no cuentan", () => {
    expect(mismaGuiaTh({ permisoCodigo: "17 cpo/c-j-001-02", titularNombre: "Otro" }, th).ok).toBe(true);
    const otra = mismaGuiaTh({ permisoCodigo: "25-UCA/C-J-009-01", titularNombre: null }, th);
    expect(otra.ok).toBe(false);
    expect(otra.ok === false && otra.motivo).toContain("25-UCA/C-J-009-01");
  });
  it("sin permiso de un lado, mira el titular (SAC ≡ S.A.C.); lo que falta no objeta", () => {
    expect(mismaGuiaTh({ permisoCodigo: null, titularNombre: "MADERERA EL AGUAJAL SAC" }, th).ok).toBe(true);
    expect(mismaGuiaTh({ permisoCodigo: null, titularNombre: "Comunidad Santa Rosa" }, th).ok).toBe(false);
    expect(mismaGuiaTh({ permisoCodigo: null, titularNombre: null }, th).ok).toBe(true);
  });
});

describe("el «no» de anular una guía que ya entró al CTP", () => {
  it("nombra los ingresos como se leen en el libro", () => {
    expect(foliosEnTexto([116, 115])).toBe("N° 115–116");
    expect(foliosEnTexto([115, 118, 120])).toBe("N° 115, 118 y 120");
    expect(mensajeGuiaYaRecibida([115, 116])).toBe(
      "Esta guía ya entró a tu Libro CTP como ingresos N° 115–116. Anúlalos allá primero y después anula la guía.",
    );
    expect(mensajeGuiaYaRecibida([7])).toContain("como ingreso N° 7. Anúlalo allá");
  });
});

describe("el motivo de una llegada vencida no acepta invisibles", () => {
  it("un motivo hecho de espacios de ancho cero queda vacío y se rechaza al recibir", () => {
    const r = RecibirGuiaThInput.safeParse({ fechaLlegada: "2026-09-28", aceptaVencida: true, motivoVencida: "\u200B\u200B\u200B" });
    expect(r.success && r.data.motivoVencida).toBe("");
    expect(RecibirGuiaThInput.safeParse({ fechaLlegada: "2026-09-28", observacion: "x".repeat(301) }).success).toBe(false);
  });
});

describe("un cuerpo mal formado se explica en español", () => {
  it("el «Too big» de Zod no llega a la pantalla", () => {
    const r = RecibirGuiaThInput.safeParse({ fechaLlegada: "2026-09-28", observacion: "x".repeat(301) });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(mensajeDeRecibirInvalido(r.error.issues)).toBe("La observación va en hasta 300 letras.");
    expect(mensajeDeRecibirInvalido([{ path: ["fechaLlegada"], message: "Invalid input" }])).toContain("fecha de llegada");
    expect(mensajeDeRecibirInvalido([])).toBe("Revisa los datos de la recepción.");
  });
});
