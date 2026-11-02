/**
 * POST /api/mcp/t/<clave> — el mismo servidor MCP con la clave en la dirección,
 * para las apps que solo aceptan una URL (ChatGPT «conectores», Gemini).
 *
 * La clave en la URL puede quedar en registros de acceso: por eso la pantalla
 * ofrece primero la forma con cabecera y aquí no se registra la ruta.
 */

import { atenderMcp, metodoNoPermitido } from "@/lib/mcp-servidor/servidor";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  return atenderMcp(req, token);
}

export function GET(): Response {
  return metodoNoPermitido();
}

export function DELETE(): Response {
  return metodoNoPermitido();
}
