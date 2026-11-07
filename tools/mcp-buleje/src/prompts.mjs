// Prompts del MCP «buleje» (contrato §5). Solo lectura: ninguno cierra, cobra ni mueve stock.
import { z } from "zod";

const FORMA = "Respondé corto: 1 línea de qué pasa + tabla de ≤5 filas + 1 línea de lo que sigue. Plata en S/ (S/ 1.234,50); madera en PT primero, después m³ y piezas.";
const SOLO_LEER = "Usá solo herramientas de lectura: no llames ninguna que pida OK ni `confirmar`.";

/** @param {string | undefined} negocio @param {string} siVacio */
const cual = (negocio, siVacio) => (negocio && negocio.trim() ? `el negocio «${negocio.trim()}»` : siVacio);

/** @type {Array<{ nombre: string, titulo: string, descripcion: string, texto: (a: { negocio?: string }) => string }>} */
export const PROMPTS = [
  {
    nombre: "hoy_en_tu_negocio",
    titulo: "Hoy en tu negocio",
    descripcion: "Cómo va el día en la bodega y en Blas: ventas, caja, por cobrar, adelantos, saldo CTP, GTF sin ingresar y tareas.",
    texto: ({ negocio }) => [
      `Contame cómo va hoy ${cual(negocio, "en la bodega (negocio «bodega») y en Blas (negocio «blas»)")}.`,
      "Bodega: ventas y caja de hoy (hoy_resumen, caja_ver), por cobrar y fiados (fiados_ver), tareas de hoy (tareas, agenda_hoy).",
      "Blas: adelantos abiertos (adelantos_ver), saldo CTP (ctp_ver: PT primero, después m³ y piezas), GTF sin ingresar (gtf_ver con sinIngresar) y tareas de hoy.",
      "Si una herramienta devuelve panel_apagado, decilo y sugerí `panel_prender`; si es solo de un rubro, saltala sin error.",
      SOLO_LEER, FORMA,
    ].join("\n"),
  },
  {
    nombre: "cierre_del_dia",
    titulo: "Cierre del día (vista previa)",
    descripcion: "Muestra cómo quedaría el cierre de caja de hoy, sin cerrar nada.",
    texto: ({ negocio }) => [
      `Mostrame la vista previa del cierre de hoy en ${cual(negocio, "la bodega (negocio «bodega»)")}: reporte_diario (usa GET /api/cierre-diario/preview) y caja_ver.`,
      "Decime: efectivo esperado vs. contado si existe, ventas por medio de pago, egresos y diferencias. Marcá en rojo (con «⚠») cualquier descuadre mayor a S/ 1.",
      "NO cierres el turno ni el día: eso lo hace Brandon (caja_cerrar_turno pide OK y no se llama desde este prompt).",
      SOLO_LEER, FORMA,
    ].join("\n"),
  },
  {
    nombre: "adelantos_abiertos",
    titulo: "Adelantos abiertos",
    descripcion: "Quién debe qué: adelantos sin cerrar, por persona, con lo que falta pagar o entregar.",
    texto: ({ negocio }) => [
      `Listame los adelantos abiertos de ${cual(negocio, "Blas (negocio «blas»)")} con adelantos_ver (estado abierto).`,
      "Por persona: monto dado, lo ya pagado o entregado (en S/ o en madera, según la modalidad), saldo y desde cuándo está abierto. Ordená por saldo, el mayor primero.",
      "La cifra total tiene que salir de la misma fuente que la lista (si el resumen del panel da otro total, di los dos y de dónde sale cada uno).",
      SOLO_LEER, FORMA,
    ].join("\n"),
  },
  {
    nombre: "cuadre_ctp",
    titulo: "Cuadre del libro CTP",
    descripcion: "Revisa si el cuadro del CTP cierra (A + B + D − C − E = saldo final) antes de decir que cuadra.",
    texto: ({ negocio }) => [
      `Revisá el cuadre del libro CTP de ${cual(negocio, "Blas (negocio «blas»)")} con ctp_ver (saldo, ingresos, producción y despachos).`,
      "Antes de decir «cuadra», verificá la fórmula del propio cuadro (la del SNIFFS, lib/forestal/ctp-cuadros-resumen.ts): saldo inicial (A) + ingresos (B) + producido (D) − consumos (C) − salidas (E) = saldo final, por producto. Mostrá la cuenta con los números.",
      "Si la fórmula no cierra, la lectura está mal: decilo y no inventes un total. Si mostrás un número calculado por vos, aclará que es un derivado.",
      "Tolerancia = el redondeo del cuadro (0,01 en su unidad), no el epsilon del float.",
      SOLO_LEER, FORMA,
    ].join("\n"),
  },
];

/** @param {string} nombre @param {{ negocio?: string }} [args] */
export function textoPrompt(nombre, args = {}) {
  const p = PROMPTS.find((x) => x.nombre === nombre);
  if (!p) throw new Error(`Prompt «${nombre}» no existe`);
  return p.texto(args);
}

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} servidor */
export function registrarPrompts(servidor) {
  for (const p of PROMPTS) {
    servidor.registerPrompt(p.nombre, {
      title: p.titulo,
      description: p.descripcion,
      argsSchema: { negocio: z.string().optional().describe("bodega, blas o qa-forestal (vacío = el de siempre)") },
    }, async (args) => ({
      description: p.descripcion,
      messages: [{ role: "user", content: { type: "text", text: p.texto(args ?? {}) } }],
    }));
  }
}
