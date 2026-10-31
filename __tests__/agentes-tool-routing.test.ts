/**
 * El ruteo de herramientas decide qué puede hacer el asistente en cada frase.
 *
 * Un dominio que deja de activarse NO da error: el modelo simplemente contesta
 * «no puedo hacer eso», y desde afuera parece una decisión del asistente en vez
 * de un diccionario incompleto. Estos tests son el candado: cada frase real que
 * tiene que funcionar queda escrita acá.
 */

import { describe, it, expect } from "vitest";
import {
  dominiosMencionados,
  toolsParaMensaje,
  tokensAproximados,
} from "@/lib/agents/tool-routing";
import { ALL_AGENT_TOOLS } from "@/lib/agents/tool-definitions";

const nombres = (texto: string) => toolsParaMensaje(texto).map((t) => t.function.name);

describe("qué dominios reconoce una frase", () => {
  it("la frase de Brandon activa plata", () => {
    const doms = dominiosMencionados(
      "Anotame compra de combustible para camión N12, el precio del petróleo sale 27 y el tanque 25 galones",
    );
    expect(doms).toContain("plata");
  });

  it("aguanta el dictado sin tildes (el reconocedor las come)", () => {
    expect(dominiosMencionados("anotame el petroleo del camion")).toContain("plata");
    expect(dominiosMencionados("anotame el petróleo del camión")).toContain("plata");
  });

  it("«le adelanté 300 soles a Juan» activa plata", () => {
    expect(dominiosMencionados("Le adelanté 300 soles en efectivo a Juan Pérez")).toContain("plata");
  });

  it("«¿quién me debe?» activa cobranzas", () => {
    expect(dominiosMencionados("¿quién me debe plata?")).toContain("cobranzas");
  });

  it("una pregunta abierta no reconoce ningún dominio", () => {
    expect(dominiosMencionados("¿cómo estamos hoy?")).toHaveLength(0);
  });

  it("no matchea por substring: «encobrado» no es «cobrar»", () => {
    expect(dominiosMencionados("el alambre encobrado")).not.toContain("cobranzas");
  });
});

describe("qué herramientas viajan", () => {
  it("anotar un gasto lleva la búsqueda Y la escritura", () => {
    const t = nombres("anotame 25 galones de petróleo para el camión N12 a 27");
    expect(t).toContain("plata_buscar_maquina");
    expect(t).toContain("plata_registrar_gasto");
  });

  it("cobrar lleva buscar-deuda y cobrar-fiado", () => {
    const t = nombres("Doña Rosa me pagó 50 soles de lo que debía");
    expect(t).toContain("plata_buscar_deuda");
    expect(t).toContain("plata_cobrar_fiado");
  });

  it("preguntar por las deudas arrastra plata (buscar vive ahí)", () => {
    const t = nombres("¿quién me debe y cuánto?");
    expect(t).toContain("cobranzas_fiados");
    expect(t).toContain("plata_buscar_deuda");
  });

  it("navegar viaja siempre, diga lo que diga la frase", () => {
    expect(nombres("cualquier cosa sin sentido")).toContain("ui_abrir");
    expect(nombres("anotame un gasto")).toContain("ui_abrir");
    expect(nombres("¿cuánto stock tengo?")).toContain("ui_abrir");
  });

  it("una pregunta abierta cae al núcleo, no al catálogo entero", () => {
    const t = nombres("¿cómo viene el negocio?");
    expect(t).toContain("analytics_daily_kpis");
    expect(t).toContain("orders_pending_summary");
    // El catálogo entero es justo lo que no entra en el límite por minuto.
    expect(t.length).toBeLessThan(ALL_AGENT_TOOLS.length);
  });

  it("el libro forestal se activa por su vocabulario", () => {
    expect(nombres("¿cuántas trozas tengo en patio?")).toContain("forestal_existencias");
    expect(nombres("buscame la GTF 1234")).toContain("forestal_buscar_guia");
  });

  it("las automatizaciones se activan por «flujo» y por «n8n»", () => {
    expect(nombres("dispará el flujo del contador")).toContain("n8n_disparar_flujo");
    expect(nombres("¿qué tengo en n8n?")).toContain("n8n_listar_flujos");
  });
});

describe("el presupuesto de tokens, que es la razón de todo esto", () => {
  it("el catálogo entero no entra en el límite por minuto del free tier", () => {
    // Si esto deja de ser cierto (Groq sube el límite, o se podan tools), el
    // ruteo puede simplificarse. Mientras tanto, es la restricción real.
    expect(tokensAproximados(ALL_AGENT_TOOLS)).toBeGreaterThan(5000);
  });

  it("una frase concreta pesa una fracción del catálogo", () => {
    const elegidas = toolsParaMensaje("anotame 25 galones de petróleo para el camión N12 a 27");
    expect(tokensAproximados(elegidas)).toBeLessThan(tokensAproximados(ALL_AGENT_TOOLS) / 2);
  });
});

describe("las operaciones de la segunda tanda", () => {
  it("comprarle a un proveedor lleva buscar proveedor, buscar producto Y anotar la compra", () => {
    // Las tres tienen que viajar juntas: sin la búsqueda de producto, el modelo
    // tiene con qué escribir la orden y no con qué saber qué producto es.
    const t = nombres("compré 20 sacos de arroz costeño a 120 cada uno a Distribuidora Ucayali");
    expect(t).toContain("plata_buscar_proveedor");
    expect(t).toContain("inventory_buscar_producto");
    expect(t).toContain("plata_registrar_compra");
  });

  it("mover plata entre cuentas lleva buscar cuenta y mover tesorería", () => {
    const t = nombres("pasá 5000 soles del BCP a la caja chica");
    expect(t).toContain("plata_buscar_cuenta");
    expect(t).toContain("plata_mover_tesoreria");
  });

  it("un flete se activa por «flete», por «viaje» y por «placa»", () => {
    for (const frase of [
      "anotá el flete de 800 soles",
      "el viaje del camión costó 800",
      "la placa A4B-892 trajo 30 m3 por 800 soles",
    ]) {
      expect(nombres(frase)).toContain("plata_registrar_flete");
    }
  });

  it("un gasto contra un lote lleva la búsqueda del código exacto", () => {
    const t = nombres("anotame 200 soles de estibaje para el lote L-2026-003");
    expect(t).toContain("plata_buscar_lote");
    expect(t).toContain("plata_registrar_gasto");
  });

  it("ninguna frase concreta manda el catálogo entero", () => {
    // El catálogo completo ya pesa más que el límite POR MINUTO de la cuenta:
    // si una frase lo activara todo, la operación no se podría anotar.
    for (const frase of [
      "compré 20 sacos de arroz a Distribuidora Ucayali",
      "pasá 5000 del BCP a la caja chica",
      "anotame el flete de la placa A4B-892",
      "¿cómo viene el negocio?",
    ]) {
      expect(tokensAproximados(toolsParaMensaje(frase))).toBeLessThan(6000);
    }
  });
});
