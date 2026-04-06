export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { chatCompletion, getAIStatus } from "@/lib/ai-config";
import { requireAdmin } from "@/lib/require-admin";

// GET: Test AI connection (admin-only)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const status = getAIStatus();

  if (!status.hasAnyProvider) {
    return NextResponse.json({
      ok: false,
      message: "No hay ninguna API key configurada. Agrega al menos una en el archivo .env",
      provider: null,
    });
  }

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: "Responde solo 'OK' en español." },
        { role: "user", content: "¿Funciona?" },
      ],
      { maxTokens: 10, temperature: 0 },
    );

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        message: `Conexión exitosa con ${status.activeProviderName}`,
        provider: status.activeProviderName,
        response: result.content,
      });
    }

    return NextResponse.json({
      ok: false,
      message: result.error ?? "La IA no respondió correctamente",
      provider: status.activeProviderName,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      message: "Error al conectar con la IA. Verifica que tu API key sea correcta.",
      provider: status.activeProviderName,
    });
  }
}
