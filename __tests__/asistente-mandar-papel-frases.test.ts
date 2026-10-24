/**
 * «Manda la resolución de plantación a Alex» — lo que el asistente entiende
 * como mandar un papel a OTRA persona, y lo que NO.
 *
 * El riesgo de leer de más es real: «mándale 50 soles a Alex» es plata,
 * «mándame el contrato» es para el dueño (lo contesta el bot con el archivo) y
 * «mándale un mensaje a Alex» no nombra ningún papel. Ninguna de esas puede
 * terminar en una tarjeta de «¿Mando…?».
 */
import { describe, expect, it } from "vitest";
import {
  TOOL_MANDAR_PAPEL,
  enmascararTelefono,
  leerPedidoDeEnvio,
  llamadaDeAtajo,
  mensajeDelPapel,
  puntajeDeNombre,
  respuestaDeAtajo,
} from "@/lib/asistente/mandar-papel";
import { leerPreguntaDePapeles } from "@/lib/whatsapp/preguntar-archivo";
import { toolsParaMensaje } from "@/lib/agents/tool-routing";
import { isToolApprovalRequired, resolveToolCall, siempreConfirma } from "@/lib/agents/tool-definitions";
import { AGENT_ACTION_PERMISSIONS } from "@/lib/agents/permissions";
import { checkPermission } from "@/lib/auth/role-permissions";
import { payloadsDelEnsayo } from "@/lib/agents/pending-approvals";

describe("leerPedidoDeEnvio — frases que SÍ son mandar un papel", () => {
  it.each([
    ["manda la resolución de plantación a Alex", { papel: "resolución de plantación", persona: "Alex" }],
    ["Mándale la resolución de plantación a Alex por WhatsApp", { papel: "resolución de plantación", persona: "Alex" }],
    ["envíale el contrato del local al ingeniero Pérez", { papel: "contrato del local", persona: "ingeniero Pérez" }],
    ["pásale a Alex la resolución", { papel: "resolución", persona: "Alex" }],
    ["comparte el certificado con la señora Rosa", { papel: "certificado", persona: "señora Rosa" }],
    ["manda el link de la resolución a Alex", { papel: "resolución", persona: "Alex" }],
    ["manda la guía a Alex para que la firme", { papel: "guía", persona: "Alex" }],
    ["puedes enviarle el permiso forestal a don Julio?", { papel: "permiso forestal", persona: "don Julio" }],
    ["manda la carta a Alex a las 5", { papel: "carta", persona: "Alex" }],
    // La frase de ejemplo que sugiere el asistente cuando pregunta «¿a cuál?».
    ["manda Resolución de plantación a Alex Ríos", { papel: "Resolución de plantación", persona: "Alex Ríos" }],
  ])("«%s»", (frase, esperado) => {
    expect(leerPedidoDeEnvio(frase)).toEqual(esperado);
  });

  it("toma el número cuando lo dice, ya con el 51", () => {
    expect(leerPedidoDeEnvio("hola nova, porfa manda el DNI del jefe a Alex 987 654 321")).toEqual({
      papel: "DNI del jefe",
      persona: "Alex",
      telefono: "51987654321",
    });
    expect(leerPedidoDeEnvio("manda la guía 0012345 al +51 987654321")).toEqual({
      papel: "guía 0012345",
      persona: "",
      telefono: "51987654321",
    });
  });
});

describe("leerPedidoDeEnvio — frases que NO son mandar un papel", () => {
  it.each([
    "mándame el contrato del local", // a uno mismo: lo contesta el bot del dueño
    "manda la resolución a mí",
    "mándale 50 soles a Alex", // plata
    "yapea S/50 a Alex",
    "mándale un mensaje a Alex", // no es un papel
    "manda el documento a Alex", // no dice cuál
    "manda la resolución", // no dice a quién
    "mandé la resolución a Alex", // cuenta algo que ya pasó
    "¿qué pasa con la resolución a Alex?",
    "¿dónde está la resolución de Alex?",
  ])("«%s» → null", (frase) => {
    expect(leerPedidoDeEnvio(frase)).toBeNull();
  });
});

describe("lo que se muestra y lo que sale", () => {
  it("el número se tapa: sólo el 9 y los tres últimos", () => {
    expect(enmascararTelefono("51987654123")).toBe("+51 9•• ••• 123");
  });

  it("el nombre se puntúa sin tildes, sin mayúsculas y sin el «ing.»", () => {
    expect(puntajeDeNombre("Alex Ramírez", "alex ramirez")).toBe(3);
    expect(puntajeDeNombre("Alex", "ALEX RAMIREZ")).toBe(2);
    expect(puntajeDeNombre("ing. Pérez", "Juan Pérez")).toBe(2);
    expect(puntajeDeNombre("Rosa", "Alex Ramírez")).toBe(0);
  });

  it("el WhatsApp saluda por el nombre, dice de qué negocio viene y cuándo vence el enlace", () => {
    const texto = mensajeDelPapel({
      nombrePersona: "alex ramírez",
      negocio: "Inversiones Blas",
      nombrePapel: "Resolución de plantación.pdf",
      url: "https://panel.example/d/abc",
      vence: "2026-10-31",
    });
    expect(texto).toContain("Hola Alex");
    expect(texto).toContain("Inversiones Blas te comparte");
    expect(texto).toContain("*Resolución de plantación.pdf*");
    expect(texto).toContain("https://panel.example/d/abc");
    expect(texto).toContain("31/10");
  });

  it("la llamada de atajo tiene id único por turno", () => {
    const pedido = { papel: "resolución", persona: "Alex" };
    expect(llamadaDeAtajo(pedido, "a1").id).not.toBe(llamadaDeAtajo(pedido, "b2").id);
    const res = respuestaDeAtajo(pedido, "a1");
    expect(res.ok).toBe(true);
    expect(res.usage.totalTokens).toBe(0);
    expect(res.toolCalls?.[0].function.name).toBe(TOOL_MANDAR_PAPEL);
    expect(JSON.parse(res.toolCalls?.[0].function.arguments ?? "{}")).toEqual(pedido);
  });
});

describe("cableado: herramienta, confirmación y permisos", () => {
  it("la frase trae la herramienta y la herramienta pide confirmación SIEMPRE", () => {
    const nombres = toolsParaMensaje("manda la resolución de plantación a Alex").map((t) => t.function.name);
    expect(nombres).toContain(TOOL_MANDAR_PAPEL);
    expect(resolveToolCall(TOOL_MANDAR_PAPEL)).toEqual({ domain: "documentos", action: "mandar-papel" });
    expect(isToolApprovalRequired(TOOL_MANDAR_PAPEL)).toBe(true);
    // Ni el canal que «ya preguntó» (n8n con confirmar) se la salta.
    expect(siempreConfirma(TOOL_MANDAR_PAPEL)).toBe(true);
    expect(siempreConfirma("plata_registrar_gasto")).toBe(false);
  });

  it("sólo los roles que mandan avisos pueden mandar un papel", () => {
    const perm = AGENT_ACTION_PERMISSIONS.documentos?.["mandar-papel"];
    expect(perm).toEqual({ resource: "notifications", action: "write" });
    expect(checkPermission("admin", "notifications", "write")).toBe(true);
    expect(checkPermission("owner", "notifications", "write")).toBe(true);
    expect(checkPermission("cajero", "notifications", "write")).toBe(false);
    expect(checkPermission("almacenero", "notifications", "write")).toBe(false);
  });

  it("tras el «Sí» se ejecuta lo que el ensayo resolvió, y la tarjeta muestra lo legible", () => {
    const args = { papel: "resolución", persona: "Alex" };
    const data = {
      resumen: "¿Mando…?",
      payloadConfirmado: { documentoId: "d1", telefono: "51987654123", nombre: "Alex Ríos" },
      mostrar: { Papel: "Resolución.pdf", Para: "Alex Ríos (+51 9•• ••• 123)" },
    };
    expect(payloadsDelEnsayo(args, data)).toEqual({ payload: data.payloadConfirmado, mostrar: data.mostrar });
    // Las demás acciones siguen confirmando su payload de siempre.
    expect(payloadsDelEnsayo(args, { resumen: "Stock 3 → 4" })).toEqual({ payload: args });
  });
});

describe("el bot del dueño NO se queda con un envío a otra persona", () => {
  it("«manda la resolución a Alex» no es una pregunta por papeles del dueño", () => {
    expect(leerPreguntaDePapeles("manda la resolución de plantación a Alex")).toBeNull();
    expect(leerPreguntaDePapeles("pásale el contrato al ingeniero Pérez")).toBeNull();
  });

  it("«mándame el contrato» sigue siendo para el dueño", () => {
    expect(leerPreguntaDePapeles("mándame el contrato")).toMatchObject({ mandar: true });
  });
});
