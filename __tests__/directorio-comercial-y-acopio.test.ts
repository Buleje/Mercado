/**
 * Condiciones comerciales, punto de acopio y bitácora de una ficha del
 * Directorio (ADR-424 · ronda 3).
 *
 * Las tres cosas existen porque el dato vivía en un chat: cuántos días de
 * crédito se pactaron, dónde se carga el camión y qué se habló la última vez.
 */

import { describe, it, expect } from "vitest";
import {
  textoCondicionPago,
  fechaDePagoPactada,
  parsearCoordenadas,
  motivoCoordenadaSospechosa,
  formatearCoordenadas,
  linkDelMapa,
  agregarNota,
  leerBitacora,
  BITACORA_MAX,
  parteAInput,
  parteInputSchema,
  type Parte,
} from "@/lib/forestal/directorio";

describe("condición de pago", () => {
  it("sin pactar NO es contado: son estados distintos", () => {
    expect(textoCondicionPago(null, null)).toBe("Sin condición pactada");
    expect(textoCondicionPago(undefined, 30)).toBe("Sin condición pactada");
    expect(textoCondicionPago("contado", null)).toBe("Contado");
  });

  it("el crédito dice su plazo, y avisa cuando no lo tiene", () => {
    expect(textoCondicionPago("credito", 30)).toBe("Crédito a 30 días");
    expect(textoCondicionPago("credito", 1)).toBe("Crédito a 1 día");
    expect(textoCondicionPago("credito", null)).toBe("A crédito, sin plazo pactado");
  });
});

describe("fechaDePagoPactada", () => {
  const compra = new Date("2026-09-10T00:00:00.000Z");

  it("contado vence el mismo día", () => {
    expect(fechaDePagoPactada(compra, "contado", null)?.toISOString().slice(0, 10)).toBe("2026-09-10");
  });

  it("a crédito suma los días pactados", () => {
    expect(fechaDePagoPactada(compra, "credito", 30)?.toISOString().slice(0, 10)).toBe("2026-10-10");
  });

  it("sin plazo devuelve null, no una fecha inventada", () => {
    // Una fecha falsa se ordenaría junto a las reales y nadie notaría la diferencia.
    expect(fechaDePagoPactada(compra, "credito", null)).toBeNull();
    expect(fechaDePagoPactada(compra, null, 30)).toBeNull();
  });

  it("no muta la fecha de compra", () => {
    fechaDePagoPactada(compra, "credito", 45);
    expect(compra.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });
});

describe("parsearCoordenadas — lo que la gente pega de verdad", () => {
  it("dos números separados por coma, como los manda el WhatsApp", () => {
    expect(parsearCoordenadas("-8.379100, -74.553900")).toEqual({ lat: -8.3791, lng: -74.5539 });
    expect(parsearCoordenadas("-8.3791,-74.5539")).toEqual({ lat: -8.3791, lng: -74.5539 });
    expect(parsearCoordenadas("-8.3791 -74.5539")).toEqual({ lat: -8.3791, lng: -74.5539 });
  });

  it("un link de Google Maps, con @ o con !3d!4d", () => {
    expect(parsearCoordenadas("https://www.google.com/maps/@-8.3791,-74.5539,17z")).toEqual({
      lat: -8.3791,
      lng: -74.5539,
    });
    expect(parsearCoordenadas("https://maps.app.goo.gl/x?q=1!3d-8.3791!4d-74.5539")).toEqual({
      lat: -8.3791,
      lng: -74.5539,
    });
  });

  it("lo que no tiene coordenadas devuelve null, no un cero", () => {
    // Un (0,0) silencioso pone el punto en el Golfo de Guinea.
    expect(parsearCoordenadas("")).toBeNull();
    expect(parsearCoordenadas("por el km 42")).toBeNull();
    expect(parsearCoordenadas("200, 400")).toBeNull();
  });
});

describe("motivoCoordenadaSospechosa — el error que de verdad pasa", () => {
  it("un punto en Ucayali no molesta", () => {
    expect(motivoCoordenadaSospechosa({ lat: -8.3791, lng: -74.5539 })).toBeNull();
  });

  it("invertidas lo dice con todas las letras", () => {
    const m = motivoCoordenadaSospechosa({ lat: -74.5539, lng: -8.3791 });
    expect(m).toContain("al revés");
  });

  it("fuera del Perú avisa sin bloquear", () => {
    expect(motivoCoordenadaSospechosa({ lat: 40.7, lng: -74.0 })).toContain("fuera del Perú");
  });

  it("sin punto no hay aviso", () => {
    expect(motivoCoordenadaSospechosa(null)).toBeNull();
  });
});

describe("formato del punto", () => {
  it("seis decimales y latitud primero, como en el papel", () => {
    expect(formatearCoordenadas({ lat: -8.3791, lng: -74.5539 })).toBe("-8.379100, -74.553900");
  });

  it("el link abre ese punto exacto", () => {
    expect(linkDelMapa({ lat: -8.3791, lng: -74.5539 })).toBe("https://www.google.com/maps?q=-8.3791,-74.5539");
  });
});

describe("bitácora", () => {
  const ahora = new Date("2026-09-20T15:00:00.000Z");

  it("la nota queda con autor y fecha, y la nueva va primero", () => {
    const uno = agregarNota([], "Pidió guía a nombre de la comunidad", "qaadmin", ahora);
    expect(uno).toHaveLength(1);
    expect(uno[0]).toEqual({
      texto: "Pidió guía a nombre de la comunidad",
      autor: "qaadmin",
      fecha: "2026-09-20T15:00:00.000Z",
    });
    const dos = agregarNota(uno, "Confirmó el flete", "brandon", new Date("2026-09-21T10:00:00.000Z"));
    expect(dos.map((n) => n.texto)).toEqual(["Confirmó el flete", "Pidió guía a nombre de la comunidad"]);
  });

  it("no pisa lo anterior: para eso está «observaciones»", () => {
    const previas = [{ texto: "vieja", autor: "x", fecha: ahora.toISOString() }];
    expect(agregarNota(previas, "nueva", "y", ahora)).toHaveLength(2);
  });

  it("una nota vacía no ensucia la bitácora", () => {
    const previas = [{ texto: "vieja", autor: "x", fecha: ahora.toISOString() }];
    expect(agregarNota(previas, "   ", "y", ahora)).toEqual(previas);
  });

  it("tiene tope: es memoria, no un chat", () => {
    let notas = [] as ReturnType<typeof agregarNota>;
    for (let i = 0; i < BITACORA_MAX + 10; i++) notas = agregarNota(notas, `n${i}`, "x", ahora);
    expect(notas).toHaveLength(BITACORA_MAX);
    expect(notas[0].texto).toBe(`n${BITACORA_MAX + 9}`);
  });

  it("sin autor no queda en blanco", () => {
    expect(agregarNota([], "algo", "", ahora)[0].autor).toBe("desconocido");
  });
});

describe("leerBitacora — el Json puede traer cualquier cosa", () => {
  it("lee lo que tiene forma de nota", () => {
    const v = [{ texto: "a", autor: "b", fecha: "2026-09-20T15:00:00.000Z" }];
    expect(leerBitacora(v)).toEqual(v);
  });

  it("lo que no la tiene no rompe la ficha", () => {
    expect(leerBitacora(null)).toEqual([]);
    expect(leerBitacora("texto suelto")).toEqual([]);
    expect(leerBitacora([{ texto: "a" }, null, 3])).toEqual([]);
  });
});

describe("parteAInput no se queda corta — el bug que se repite", () => {
  // La copia a mano de los campos de una parte ya se quedó corta dos veces: los
  // datos que el formulario no carga, al guardar con `id`, se BORRAN. Este test
  // falla en cuanto alguien agrega un campo al schema y se olvida del mapeo.
  const SOLO_DE_ENTRADA = new Set(["logo", "adjuntos", "nuevaNota"]);

  it("mapea todos los campos del schema de entrada", () => {
    const ficha: Parte = {
      id: "p1",
      roles: ["proveedor"],
      nombre: "Maderera del Oriente SAC",
      categoria: "empresa" as const,
      codigoCtp: null,
      docTipo: "RUC" as const,
      docNumero: "20156698963",
      direccion: null,
      region: null,
      provincia: null,
      distrito: null,
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
    };
    const mapeados = new Set(Object.keys(parteAInput(ficha)));
    const faltan = Object.keys(parteInputSchema.shape).filter(
      (k) => !SOLO_DE_ENTRADA.has(k) && !mapeados.has(k),
    );
    expect(faltan).toEqual([]);
  });

  it("los campos nuevos viajan con su valor, no vacíos", () => {
    const parte: Parte = {
      id: "p2",
      roles: ["proveedor"],
      nombre: "X",
      categoria: null,
      codigoCtp: null,
      docTipo: null,
      docNumero: null,
      direccion: null,
      region: null,
      provincia: null,
      distrito: null,
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
      condicionPago: "credito",
      diasCredito: 30,
      emailCobranza: "cobranzas@x.pe",
      contacto2Nombre: "Rosa",
      contacto2Telefono: "961555222",
      acopioLat: -8.3791,
      acopioLng: -74.5539,
      acopioReferencia: "km 42",
      banco: "BCP",
      cuentaCci: "00212345678901234567",
      notas: null,
      activo: true,
      usos: 0,
      ultimoUso: null,
      logo: null,
      adjuntos: [],
    };
    const conDatos = parteAInput(parte);
    expect(conDatos.condicionPago).toBe("credito");
    expect(conDatos.diasCredito).toBe(30);
    expect(conDatos.acopioLat).toBe(-8.3791);
    expect(conDatos.contacto2Telefono).toBe("961555222");
    expect(conDatos.banco).toBe("BCP");
    expect(conDatos.cuentaCci).toBe("00212345678901234567");
  });
});
