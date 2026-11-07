/**
 * POST /api/mcp — servidor MCP del negocio (Buleje IA, ADR-528).
 *
 * Para ChatGPT, Claude, Gemini o Cursor: la clave de la conexión va en
 * `Authorization: Bearer bul_mcp_…`. Sin sesión ni CSRF (exención exacta en
 * `lib/csrf.ts` → `esRutaMcp`). Toda la lógica vive en `lib/mcp-servidor`.
 */

import { atenderMcp, metodoNoPermitido } from "@/lib/mcp-servidor/servidor";

export async function POST(req: Request): Promise<Response> {
  return atenderMcp(req);
}

/** Sin estado: no hay stream por GET ni sesión que cerrar por DELETE. */
export function GET(): Response {
  return metodoNoPermitido();
}

export function DELETE(): Response {
  return metodoNoPermitido();
}
