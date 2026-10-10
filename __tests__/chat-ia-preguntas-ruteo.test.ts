/**
 * Cada pregunta sugerida del Chat IA tiene que encender la herramienta que la
 * responde con datos del servidor.
 *
 * Si el ruteo no le da la herramienta, el modelo contesta igual —de memoria— y
 * en pantalla parece un dato real (pasó con «¿Qué fecha comercial viene?»: el
 * calendario no es herramienta del modelo). Una pregunta nueva sin su fila en
 * ESPERA hace fallar el test a propósito.
 */

import { describe, expect, it } from "vitest";
import { PREGUNTAS } from "@/components/admin/chat-ia/preguntas-sugeridas";
import { toolsParaMensaje } from "@/lib/agents/tool-routing";

const ESPERA: Record<string, string> = {
  "¿Qué hago hoy?": "orders_status_overview",
  "Ventas de hoy": "orders_daily_sales_report",
  "¿Qué combo armo esta semana?": "pricing_bundle_suggestions",
  "¿Qué se acaba antes del sábado?": "inventory_reorder_suggestions",
  "¿Qué rebajo porque no se mueve?": "pricing_promotion_candidates",
  "¿Qué le ofrezco a mis clientes que más compran?": "customers_top_customers",
};

describe("preguntas sugeridas del Chat IA → herramienta del ruteo", () => {
  it.each(PREGUNTAS.map((p) => [p.label, p.prompt] as const))("«%s»", (label, prompt) => {
    const herramienta = ESPERA[label];
    expect(herramienta, `«${label}» no tiene herramienta esperada en ESPERA`).toBeDefined();
    expect(toolsParaMensaje(prompt).map((t) => t.function.name)).toContain(herramienta);
  });
});
