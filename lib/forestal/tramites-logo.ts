"use client";

/**
 * tramites-logo — el logo del membrete de los trámites (ADR-364 ronda 6,
 * Brandon 2026-08-20: "logo para poner y cambiar"). Mismo patrón que el logo
 * del ANEXO N° 04 (`Anexo04Campos.leerLogo`): se reduce a `LOGO_MAX_PX` en un
 * canvas y se guarda como dataURL — no viaja en `datos` del trámite (ese se
 * imprime/exporta/guarda en Drive tal cual; el logo es una preferencia del
 * tenant, no un dato del documento puntual), vive en localStorage por tenant.
 */

/** Lado máximo del logo guardado: entra nítido en el membrete sin inflar localStorage. */
const LOGO_MAX_PX = 320;
export const LOGO_MAX_BYTES = 5_000_000;

export interface LogoTramite {
  src: string;
  aspect: number;
}

const claveTenant = (sufijo: string) => {
  let slug = "main";
  try {
    slug = localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* ignore */
  }
  return `buleje-tramite-${sufijo}-${slug}`;
};
const claveSrc = () => claveTenant("logo");
const claveAspect = () => claveTenant("logo-aspect");

/** Lee el archivo, lo reduce a `LOGO_MAX_PX` y devuelve dataURL + proporción. */
export async function leerArchivoLogo(file: File): Promise<LogoTramite> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("no se pudo leer el archivo"));
    fr.readAsDataURL(file);
  });
  const img = new window.Image();
  img.src = dataUrl;
  await img.decode();
  const escala = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  return { src: canvas.toDataURL("image/png"), aspect: img.width / img.height };
}

/** Logo guardado del tenant activo, o `null` si nunca se subió uno. */
export function leerLogoTramite(): LogoTramite | null {
  try {
    const src = localStorage.getItem(claveSrc());
    if (!src) return null;
    const aspect = Number(localStorage.getItem(claveAspect()));
    return { src, aspect: aspect > 0 ? aspect : 1 };
  } catch {
    return null;
  }
}

export function guardarLogoTramite(logo: LogoTramite): void {
  try {
    localStorage.setItem(claveSrc(), logo.src);
    localStorage.setItem(claveAspect(), String(logo.aspect));
  } catch {
    /* localStorage lleno/deshabilitado: el logo simplemente no persiste */
  }
}

export function borrarLogoTramite(): void {
  try {
    localStorage.removeItem(claveSrc());
    localStorage.removeItem(claveAspect());
  } catch {
    /* ignore */
  }
}
