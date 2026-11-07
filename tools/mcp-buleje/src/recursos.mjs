// Recursos del MCP «buleje» (contrato §5): negocios, hoy por negocio, propuestas vivas y registro de hoy.
// Las funciones de contenido son puras (testeables sin SDK); registrarRecursos() las cuelga del McpServer.
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export const URI_NEGOCIOS = "buleje://negocios";
export const URI_PENDIENTES = "buleje://pendientes";
export const URI_REGISTRO_HOY = "buleje://registro/hoy";
export const PLANTILLA_HOY = "buleje://{negocio}/hoy";

const diaFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });
/** Día de Lima AAAA-MM-DD (el «hoy» del panel). @param {Date | number | string} f */
export const diaLima = (f) => diaFmt.format(new Date(f));

/**
 * Llamadas de hoy (día de Lima), las últimas `n`.
 * @param {Array<{ ts?: string }>} eventos  líneas ya redactadas por registro.mjs
 * @param {Date} [ahora]
 */
export function registroDeHoy(eventos, ahora = new Date(), n = 50) {
  const hoy = diaLima(ahora);
  return (eventos ?? []).filter((e) => typeof e?.ts === "string" && !Number.isNaN(Date.parse(e.ts)) && diaLima(e.ts) === hoy).slice(-n);
}

/**
 * @typedef {Object} DepsRecursos
 * @property {() => Array<{ nombre: string, slug: string, rubro: string }>} negocios
 * @property {() => string} porDefecto
 * @property {() => boolean} seco
 * @property {{ pendientes: () => unknown[] }} confirmador
 * @property {(negocio: string) => Promise<string>} hoy
 * @property {(n: number) => Array<{ ts?: string }>} [ultimas]
 * @property {(negocio: string) => boolean | null} [sesionViva]
 * @property {() => Date} [ahora]
 */

/** @param {DepsRecursos} d */
export function contenidoNegocios(d) {
  return {
    porDefecto: d.porDefecto(),
    seco: d.seco(),
    nota: d.seco() ? "Modo a seco: las escrituras y confirmar devuelven el pedido sin mandarlo." : "Modo real: plata, stock y borrar piden «Sí, hazlo» en la ventana de Brandon.",
    negocios: d.negocios().map((n) => ({ ...n, sesionViva: d.sesionViva ? d.sesionViva(n.nombre) : null })),
  };
}

const json = (uri, v) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(v, null, 1) }] });

/**
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} servidor
 * @param {DepsRecursos} d
 */
export function registrarRecursos(servidor, d) {
  servidor.registerResource("negocios", URI_NEGOCIOS,
    { title: "Negocios del MCP", description: "Negocios configurados, si hay sesión viva y si está en modo a seco.", mimeType: "application/json" },
    async (uri) => json(uri.href, contenidoNegocios(d)));

  servidor.registerResource("pendientes", URI_PENDIENTES,
    { title: "Propuestas esperando OK", description: "Propuestas de plata/stock/borrar que todavía no se confirmaron (vencen a los 120 s).", mimeType: "application/json" },
    async (uri) => json(uri.href, d.confirmador.pendientes()));

  servidor.registerResource("registro-hoy", URI_REGISTRO_HOY,
    { title: "Llamadas de hoy", description: "Últimas 50 llamadas del MCP de hoy (día de Lima), con claves y tokens tapados.", mimeType: "application/json" },
    async (uri) => json(uri.href, registroDeHoy(d.ultimas ? d.ultimas(500) : [], d.ahora ? d.ahora() : new Date())));

  const plantilla = new ResourceTemplate(PLANTILLA_HOY, {
    list: async () => ({
      resources: d.negocios().map((n) => ({ uri: `buleje://${n.nombre}/hoy`, name: `Hoy en ${n.nombre}`, mimeType: "text/plain" })),
    }),
    complete: { negocio: async (v) => d.negocios().map((n) => n.nombre).filter((n) => n.startsWith(v ?? "")) },
  });
  servidor.registerResource("hoy", plantilla,
    { title: "Hoy en el negocio", description: "Resumen de hoy (= hoy_resumen) ya formateado: S/ primero; en Blas PT, después m³ y piezas.", mimeType: "text/plain" },
    async (uri, vars) => {
      const negocio = String(Array.isArray(vars.negocio) ? vars.negocio[0] : vars.negocio ?? "");
      if (!d.negocios().some((n) => n.nombre === negocio)) throw new Error(`Negocio «${negocio}» desconocido. Ver ${URI_NEGOCIOS}.`);
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: await d.hoy(negocio) }] };
    });
}
