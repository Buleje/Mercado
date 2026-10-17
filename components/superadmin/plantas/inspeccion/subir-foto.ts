/**
 * Subir la foto de un hallazgo desde el celular del inspector.
 *
 * La foto de la cámara pesa 3-6 MB y en la planta la señal es mala: si pasa de
 * 1,5 MB se achica en el equipo (lado mayor 1600 px, JPEG) antes de subirla.
 * El servidor la vuelve a optimizar a WebP y la guarda PRIVADA, en la carpeta
 * de la planta (security 17-10): devuelve `/api/superadmin/plantas/<planta>/
 * inspecciones/fotos/<uuid>`, que se ve sólo con la sesión del superadmin.
 */
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { rutaFotosDeInspeccion } from "@/lib/superadmin/plantas-forestales/schemas";

const ACHICAR_DESDE = 1.5 * 1024 * 1024;
const LADO_MAX = 1600;
const TIPOS = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const TIPO_INVALIDO = "Esa imagen no se puede subir: usa una foto JPG, PNG o WebP.";

async function achicar(file: File): Promise<File> {
  if (file.size <= ACHICAR_DESDE || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    /* Formato que el navegador no sabe abrir (HEIC en algunos Android): que la suba el servidor. */
    return file;
  }
}

/** Devuelve la dirección de la foto o el error legible. */
export async function subirFotoDeHallazgo(tenantId: string, file: File): Promise<{ url: string } | { error: string }> {
  if (file.type && !TIPOS.includes(file.type)) return { error: TIPO_INVALIDO };
  const lista = await achicar(file);
  const fd = new FormData();
  fd.append("file", lista);
  try {
    const res = await fetchSuperadmin(rutaFotosDeInspeccion(tenantId), { method: "POST", body: fd });
    const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && d.url) return { url: d.url };
    /* El servidor ya explica el error en castellano: va tal cual. */
    return { error: d.error ?? "No se pudo subir la foto. Prueba de nuevo." };
  } catch {
    return { error: "Sin conexión: la foto no se subió. Prueba de nuevo cuando tengas señal." };
  }
}
