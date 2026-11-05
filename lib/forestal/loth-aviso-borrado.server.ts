import "server-only";

/**
 * Envío del aviso de borrado grande del Libro TH (`loth-aviso-borrado.ts`):
 * a cada chat de Telegram vinculado a ESE negocio (Configuración › Telegram).
 * Sin bot o sin chats no hace nada. Va siempre DESPUÉS del commit y fuera del
 * request (quien llama lo dispara con `.catch(logger)`): un Telegram caído no
 * frena un borrado.
 */

import { TelegramDB } from "@/lib/db/telegram.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { botConfigurado, mandarMensaje } from "@/lib/telegram/bot";
import { tocaAvisar, textoAvisoBorrado, type BorradoParaAviso } from "@/lib/forestal/loth-aviso-borrado";

/** Devuelve a cuántos chats llegó (0 si no tocaba avisar). */
export async function avisarBorradoDelLibro(
  tenantId: string,
  b: Omit<BorradoParaAviso, "negocio">,
): Promise<number> {
  if (!tenantId || !tocaAvisar(b.borradas, b.sueltas) || !botConfigurado()) return 0;
  const chats = await TelegramDB.listar(tenantId);
  if (chats.length === 0) return 0;
  const negocio = (await TenantsDB.getBasicById(tenantId))?.name ?? null;
  const texto = textoAvisoBorrado({ ...b, negocio });
  let llegaron = 0;
  for (const c of chats) if (await mandarMensaje(c.chatId, texto)) llegaron += 1;
  return llegaron;
}
