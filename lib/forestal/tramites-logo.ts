"use client";

/**
 * tramites-logo — RETIRADO como lugar donde se sube el logo (ADR-514).
 * El logo del membrete de los trámites es el de Ajustes › Negocio › Logo, el
 * mismo de todos los papeles. Queda sólo la lectura del que alguien subió antes
 * a este navegador (localStorage por tenant): se usa de respaldo mientras
 * Ajustes no tenga uno, y ya no se puede subir ni cambiar desde el trámite.
 */

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

/** Logo viejo de este navegador, o `null`. Sólo respaldo: el vigente es el de Ajustes. */
export function leerLogoTramite(): LogoTramite | null {
  try {
    const src = localStorage.getItem(claveTenant("logo"));
    if (!src) return null;
    const aspect = Number(localStorage.getItem(claveTenant("logo-aspect")));
    return { src, aspect: aspect > 0 ? aspect : 1 };
  } catch {
    return null;
  }
}
