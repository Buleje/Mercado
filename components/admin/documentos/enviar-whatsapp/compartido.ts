import type { DbDocument } from "@/lib/types/documents";
import { createShare } from "@/hooks/use-documents";

export type Contact = { name: string; phone: string };
export type Via = "archivo" | "dispositivo" | "enlace";

/** Topes de WhatsApp (los mismos que valida el endpoint). */
const MAX_IMAGEN = 5 * 1024 * 1024;
const MAX_DOCUMENTO = 95 * 1024 * 1024;
const IMAGEN_NATIVA = /^image\/(jpeg|png|webp)$/;

/**
 * Cuántos enlaces se pueden crear de una tanda. El endpoint de compartir corre
 * con el preset STRICT (10 solicitudes cada 15 minutos): pedir más no falla a
 * medias, deja al usuario sin poder compartir nada por un cuarto de hora.
 */
export const LIMITE_LOTE = 10;

/** Espera `ms` (para el reintento tras un 429). */
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea los enlaces de a `concurrencia` en vez de todos juntos: veinte fetch
 * simultáneos contra un endpoint con límite estricto es la forma más rápida de
 * comerse un 429. Si aun así aparece, reintenta una vez tras esperar.
 */
export async function crearEnlaces(
  docs: DbDocument[],
  ruta: string,
  concurrencia = 3,
  clave?: string,
): Promise<{ ok: Map<string, string>; mal: Map<string, string> }> {
  const ok = new Map<string, string>();
  const mal = new Map<string, string>();
  const cola = [...docs];

  const trabajador = async () => {
    for (;;) {
      const d = cola.shift();
      if (!d) return;
      for (let intento = 0; intento < 2; intento++) {
        try {
          const share = await createShare(d.id, {
            expiresInDays: 30,
            password: clave || undefined,
          });
          ok.set(d.id, `${window.location.origin}/${ruta}/${share.token}`);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const limitado = msg.includes("429");
          if (limitado && intento === 0) {
            await dormir(1500);
            continue;
          }
          mal.set(d.id, limitado ? "límite de enlaces alcanzado" : "no se pudo compartir");
          break;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrencia, docs.length) }, trabajador));
  return { ok, mal };
}

/** Normaliza a dígitos y antepone el código de Perú (51) a celulares de 9 dígitos. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length >= 11) return digits;
  if (digits.length === 9) return `51${digits}`;
  return digits;
}

/** ¿Este equipo sabe compartir archivos (celular, o Chrome con la API)? */
export function equipoComparteArchivos(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File(["x"], "prueba.txt", { type: "text/plain" })] });
  } catch {
    return false;
  }
}

/** Motivo por el que un documento no puede viajar como adjunto (o null). */
export function noEntraComoArchivo(doc: DbDocument): string | null {
  const tope = IMAGEN_NATIVA.test(doc.mimeType ?? "") ? MAX_IMAGEN : MAX_DOCUMENTO;
  if (doc.size > tope) {
    return `pesa ${(doc.size / 1024 / 1024).toFixed(1)} MB (WhatsApp acepta hasta ${Math.round(tope / 1024 / 1024)} MB)`;
  }
  return null;
}

export type PropsEnviarWhatsApp = {
  docs: DbDocument[];
  mode?: "share" | "sign";
  /** Número precargado (ej. el cliente de la cotización recién generada). */
  telefono?: string;
  onClose: () => void;
};
