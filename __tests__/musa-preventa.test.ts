import { describe, expect, it } from "vitest";
import { FRANJA } from "@/extensiones/pagina-musa/anuncios";
import { rellenar } from "@/extensiones/pagina-musa/destinos";
import { armarMensajePedido, PREGUNTA_PREVENTA_10 } from "@/extensiones/pagina-musa/pedido-whatsapp";
import {
  avisoEnviosProvincia,
  diaCorto,
  enviosProvinciaAbiertos,
  estadoProducto,
  etapaPreventaNavidad,
  valoresCampana,
} from "@/extensiones/pagina-musa/preventa";

/* Manual vigente de Musa: «Preventa desde el 16 nov (se separa con S/ 20) · envíos a
   provincia hasta el 18 dic» · «Entregas hasta el 24» · «preventa 10 % a las primeras 20 clientas». */

describe("preventa de Navidad (días de Lima)", () => {
  it("antes del 16 nov se anuncia, desde el 16 se separa y después del 24 dic ya no sale", () => {
    expect(etapaPreventaNavidad("2026-10-11")).toBe("antes");
    expect(etapaPreventaNavidad("2026-11-15")).toBe("antes");
    expect(etapaPreventaNavidad("2026-11-16")).toBe("abierta");
    expect(etapaPreventaNavidad("2026-12-24")).toBe("abierta");
    expect(etapaPreventaNavidad("2026-12-25")).toBeNull();
  });

  it("los envíos a provincia van hasta el 18 dic inclusive", () => {
    expect(enviosProvinciaAbiertos("2026-12-18")).toBe(true);
    expect(enviosProvinciaAbiertos("2026-12-19")).toBe(false);
    expect(avisoEnviosProvincia("2026-12-01")).toBe("Para Navidad, los envíos a provincia van hasta el viernes 18/12.");
    expect(avisoEnviosProvincia("2026-12-19")).toBeNull();
  });

  it("escribe las fechas como «lunes 16/11» con el día de la semana correcto", () => {
    expect(diaCorto("2026-11-09")).toBe("lunes 09/11");
    expect(diaCorto("2026-11-16")).toBe("lunes 16/11");
    expect(diaCorto("2026-12-18")).toBe("viernes 18/12");
    expect(diaCorto("2026-12-24")).toBe("jueves 24/12");
    expect(diaCorto("2026-12-31")).toBe("jueves 31/12");
  });
});

describe("franja: cada mensaje de campaña sale sólo mientras vale y cabe en una línea", () => {
  const franja = (hoy: string) =>
    FRANJA.map((t) => rellenar(t, { descuento: null, pagos: null, ...valoresCampana(hoy) })).filter((t): t is string => t !== null);

  it("en noviembre salen el 10 %, la preventa de Navidad y los envíos a provincia", () => {
    const hoy = franja("2026-11-20");
    expect(hoy).toContain("Preventa: 10 % a las primeras 20 clientas");
    expect(hoy).toContain("Navidad: separa tu kit con S/ 20 desde el 16/11");
    expect(hoy).toContain("Envíos a provincia para Navidad: hasta el 18/12");
  });

  it("el 19 dic se va la de provincia; el 25 la de Navidad; el 1 ene la del 10 %", () => {
    expect(franja("2026-12-19").some((t) => t.includes("provincia"))).toBe(false);
    expect(franja("2026-12-19").some((t) => t.startsWith("Navidad:"))).toBe(true);
    expect(franja("2026-12-25").some((t) => t.startsWith("Navidad:"))).toBe(false);
    expect(franja("2026-12-31").some((t) => t.includes("10 %"))).toBe(true);
    expect(franja("2027-01-01").some((t) => t.includes("10 %"))).toBe(false);
  });

  it("ningún mensaje pasa de 48 letras (a 400 px la franja sube a dos líneas)", () => {
    for (const t of franja("2026-11-20")) expect(t.length).toBeLessThanOrEqual(48);
  });
});

describe("estadoProducto: en stock / preventa / por encargo, con los datos del producto", () => {
  const noviembre = "2026-11-20";
  const octubre = "2026-10-11";

  it("«Por encargo» del panel manda siempre (los 6 del manual)", () => {
    expect(estadoProducto({ badge: "Por encargo", stock: null, codigo: "MU004" }, noviembre)).toBe("Por encargo");
    expect(estadoProducto({ badge: " por encargo ", stock: 3, codigo: "MU006" }, octubre)).toBe("Por encargo");
  });

  it("el badge «Preventa» del panel no decide: sin existencias no se afirma nada, con existencias dice «En stock»", () => {
    expect(estadoProducto({ badge: "Preventa", stock: null, codigo: "MU001" }, noviembre)).toBeNull();
    expect(estadoProducto({ badge: "Preventa", stock: 10, codigo: "MU001" }, noviembre)).toBe("En stock");
    expect(estadoProducto({ badge: "Preventa", stock: 0, codigo: "MU001" }, noviembre)).toBeNull();
  });

  it("un kit (KT…) dice «Preventa» sólo mientras la preventa de Navidad está abierta", () => {
    expect(estadoProducto({ badge: "Preventa", stock: null, codigo: "KT04" }, octubre)).toBeNull();
    expect(estadoProducto({ badge: "Preventa", stock: null, codigo: "KT04" }, noviembre)).toBe("Preventa");
    expect(estadoProducto({ badge: null, stock: 4, codigo: "KT01" }, "2026-12-25")).toBe("En stock");
    // Los dúos de la campaña no son kits del manual: no se separan.
    expect(estadoProducto({ badge: "Preventa", stock: null, codigo: "MU016-2" }, noviembre)).toBeNull();
  });

  it("otros badges del dueño se respetan; los de descuento no son etiqueta", () => {
    expect(estadoProducto({ badge: "Favorito", stock: 5, codigo: "MU010" }, noviembre)).toBe("Favorito");
    expect(estadoProducto({ badge: "10% dscto", stock: 5, codigo: "MU010" }, noviembre)).toBe("En stock");
    expect(estadoProducto({ badge: "Oferta", stock: null, codigo: "MU010" }, noviembre)).toBeNull();
  });
});

describe("pedido por WhatsApp: el 10 % de las primeras 20 lo verifica Drucila", () => {
  const base = {
    lineas: [{ nombre: "Sérum de vitamina C", codigo: "MU010", cantidad: 1, precio: 69, porEncargo: false }],
    nombre: "Rosa",
    pueblo: "Ciudad Constitución" as const,
    pago: "Yape" as const,
  };

  it("mientras dura la Campaña 01 el mensaje pregunta (no promete) el 10 %", () => {
    const r = armarMensajePedido({ ...base, preventa10: true });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.mensaje.split("\n").at(-1)).toBe(PREGUNTA_PREVENTA_10);
    expect(PREGUNTA_PREVENTA_10).toBe("¿Me toca el 10 % de preventa (primeras 20 clientas)?");
  });

  it("sin campaña, el mensaje no cambia", () => {
    const r = armarMensajePedido(base);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.mensaje).not.toContain("10 %");
    expect(r.mensaje.split("\n").at(-1)).toBe("Pago: Yape");
  });
});
