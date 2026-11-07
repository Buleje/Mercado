// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos).
// Pendientes de la 2.ª pasada de security (29-10, Ley 29733): DNI con puntos/espacios y datos personales tapados
// también fuera de RRHH (clientes, pedidos, adelantos), sin romper números de guía o comprobante.
import { describe, it, expect, vi } from "vitest";
import { taparTexto, taparPorClaves } from "../../tools/mcp-buleje/src/tapar.mjs";
import { crearServidor, cargarHerramientas } from "../../tools/mcp-buleje/servidor.mjs";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";

describe("datos personales", () => {
  it("DNI con puntos o espacios se tapa; montos y fechas no", () => {
    expect(taparTexto("DNI 12.345.678 y 87 654 321")).toBe("DNI ••••5678 y ••••4321");
    expect(taparTexto("S/ 12.345,67 el 2026-10-29")).toBe("S/ 12.345,67 el 2026-10-29");
  });

  it("por clave: dni, celular, carné y sueldo; la guía 00012345 queda", () => {
    const r = taparPorClaves({ cliente: { nombre: "Ana", dni: "45678912", phone: "987654321", carnet: "001234567" }, numeroGuia: "00012345", sueldo: 1500 });
    expect(r).toEqual({ cliente: { nombre: "Ana", dni: "••••8912", phone: "••• ••• 321", carnet: "••••4567" }, numeroGuia: "00012345", sueldo: "(oculto: sueldo)" });
  });

  it("3.ª pasada: documentos con prefijo, correo y cuenta; ids, tipos y tarifas del negocio quedan", () => {
    const r = taparPorClaves({ representanteDni: "45678912", titularDoc: "10456789123", titularNumeroDocumento: "45678912", proveedorDocumento: "20123456789",
      conductorDni: "41234567", licencia: "Q41234567", email: "ana.perez@gmail.com", cuentaNumero: "1912345678901", cci: "00219100123456789012",
      documentId: "cmabc123", tipoDocumento: "DNI", tarifa: 45, sueldo: 1200 });
    expect(r).toEqual({ representanteDni: "••••8912", titularDoc: "••••9123", titularNumeroDocumento: "••••8912", proveedorDocumento: "••••6789",
      conductorDni: "••••4567", licencia: "••••4567", email: "a•••@gmail.com", cuentaNumero: "••••8901", cci: "••••9012",
      documentId: "cmabc123", tipoDocumento: "DNI", tarifa: 45, sueldo: "(oculto: sueldo)" });
  });

  it("clientes_ver ya no le devuelve al modelo el celular ni el DNI completos", async () => {
    const { defs } = await cargarHerramientas();
    const pedir = vi.fn(async () => ({ ok: true, status: 200, ms: 2, datos: [{ id: "c1", name: "Ana Pérez", phone: "987654321", documento: "45678912", balance: 30 }] }));
    const { servidor } = crearServidor({ herramientas: defs, pedir, config: { base: "http://x", porDefecto: "bodega", seco: false, negocios: { bodega: { slug: "main" } } }, seco: false, preguntar: async () => "no" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: "t", version: "1" });
    await Promise.all([servidor.connect(a), c.connect(b)]);
    const r = await c.callTool({ name: "clientes_ver", arguments: {} });
    const texto = r.content.map((x) => x.text).join("\n");
    expect(texto).toMatch(/Ana Pérez/);
    expect(texto).not.toMatch(/987654321|45678912/);
  });
});
