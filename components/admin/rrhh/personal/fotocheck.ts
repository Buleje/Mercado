/**
 * fotocheck.ts — de la ficha al fotocheck (ADR-416): arma lo que dibuja
 * `lib/rrhh/fotocheck-pdf.ts` con lo que la pantalla ya tiene.
 */

import { descargarFotochecks, type PersonaFotocheck } from "@/lib/rrhh/fotocheck-pdf";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";
import { formatearFecha } from "../rrhh-ui";

/** A dónde lleva el QR: la ficha de la persona en el panel, que pide iniciar sesión. */
export function urlDeLaFicha(origen: string, colaboradorId: string): string {
  return `${origen}/admin?tab=rrhh&vista=personal&persona=${encodeURIComponent(colaboradorId)}`;
}

export function personaParaFotocheck(c: ColaboradorDTO, origen: string): PersonaFotocheck {
  return {
    nombre: c.nombre,
    puesto: c.puesto?.nombre ?? null,
    documento: c.documento ? `${c.tipoDocumento ?? "Doc."} ${c.documento}` : null,
    ingreso: c.fechaIngreso ? formatearFecha(c.fechaIngreso) : null,
    fotoUrl: c.fotoUrl,
    emergencia: { nombre: c.contactoEmergencia.nombre, celular: c.contactoEmergencia.celular },
    urlFicha: urlDeLaFicha(origen, c.id),
  };
}

/** Nombre y contacto del negocio para la tarjeta, desde la configuración del panel. */
export function negocioDelPanel(
  s: { businessName?: string | null; storeTheme?: { phone?: string; whatsapp?: string; address?: string } | null } | null | undefined,
): { nombre: string | null; contacto: string | null } {
  const tema = s?.storeTheme;
  return {
    nombre: s?.businessName?.trim() || null,
    contacto: tema?.phone?.trim() || tema?.whatsapp?.trim() || tema?.address?.trim() || null,
  };
}

/** «fotocheck-ana-quispe-rios» para una persona; «fotochecks-3-personas» para varias. */
export function archivoDeFotocheck(colaboradores: { nombre: string }[]): string {
  if (colaboradores.length === 1) {
    const slug = colaboradores[0]!.nombre
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `fotocheck-${slug || "persona"}`;
  }
  return `fotochecks-${colaboradores.length}-personas`;
}

export async function descargarFotochecksDe(
  colaboradores: ColaboradorDTO[],
  negocio: { nombre: string | null; contacto: string | null },
  archivo: string,
): Promise<void> {
  const origen = window.location.origin;
  await descargarFotochecks({
    negocio: negocio.nombre,
    contacto: negocio.contacto,
    personas: colaboradores.map((c) => personaParaFotocheck(c, origen)),
    archivo,
  });
}
