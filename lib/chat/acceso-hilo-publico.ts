import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ChatPublicDB } from "@/lib/db/chat-public.db";
import { accesoAlHilo, respuestaSinAcceso } from "@/lib/chat/thread-token";

/**
 * Subidas del chat de invitados (foto/comprobante y nota de voz) atadas a un
 * hilo (security 17-10, T4). Antes `/api/chat/public/upload` y `upload-audio`
 * guardaban cualquier archivo en el storage público sin hilo ni token: un
 * almacén gratis de archivos con la URL de la tienda. Ahora el multipart trae
 * el hilo y el token (o la sesión verificada de ese celular), con las mismas
 * reglas que `action=send`: tienda publicada, hilo de esa tienda y celular,
 * prueba de acceso y conversación abierta.
 */

const CamposHilo = z.object({
  threadId:      z.string().min(1).max(100),
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
  threadToken:   z.string().max(200).optional(),
});

export type HiloDelComprador =
  | { ok: true; tenantId: string; threadId: string }
  | { ok: false; res: NextResponse };

const texto = (v: FormDataEntryValue | null): string | undefined =>
  typeof v === "string" && v ? v : undefined;

/** Valida que quien sube es el dueño del hilo abierto. El token puede ir en `x-chat-token` o en el form. */
export async function exigirHiloDelComprador(req: NextRequest, form: FormData): Promise<HiloDelComprador> {
  const parsed = CamposHilo.safeParse({
    threadId:      texto(form.get("threadId")),
    storeSlug:     texto(form.get("storeSlug")),
    customerPhone: texto(form.get("customerPhone")),
    threadToken:   req.headers.get("x-chat-token") ?? texto(form.get("threadToken")),
  });
  if (!parsed.success) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Abre el chat antes de adjuntar", code: "CHAT_HILO_REQUERIDO" },
        { status: 401 },
      ),
    };
  }
  const { threadId, storeSlug, customerPhone, threadToken } = parsed.data;
  const store = await ChatPublicDB.findStoreBySlug(storeSlug);
  if (!store || !store.isPublished) {
    return { ok: false, res: NextResponse.json({ error: "Tienda no disponible" }, { status: 404 }) };
  }
  const hilo = await ChatPublicDB.findThreadForOwnershipCheck(threadId, store.tenantId);
  if (!hilo || hilo.customerPhone !== customerPhone || hilo.storeId !== store.id) {
    return { ok: false, res: NextResponse.json({ error: "Thread no encontrado" }, { status: 404 }) };
  }
  const acceso = await accesoAlHilo(req, store.tenantId, threadId, hilo.customerPhone, threadToken);
  if (acceso !== "ok") return { ok: false, res: respuestaSinAcceso(acceso) };
  if (hilo.status !== "open") {
    return { ok: false, res: NextResponse.json({ error: "Conversación cerrada" }, { status: 409 }) };
  }
  return { ok: true, tenantId: store.tenantId, threadId };
}
