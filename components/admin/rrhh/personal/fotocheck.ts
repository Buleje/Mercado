/**
 * fotocheck.ts — de la ficha al fotocheck (ADR-416): arma lo que dibuja
 * `lib/rrhh/fotocheck-pdf.ts` con lo que la pantalla ya tiene.
 */

import { leerMembrete, logoParaPdf } from "@/lib/admin/membrete-cliente";
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
    // Seguridad (ADR-417): lo que se lee en el momento. Vacío se pasa como `null`
    // para que el dorso no imprima la etiqueta sin dato.
    grupoSanguineo: c.grupoSanguineo,
    alergias: c.alergias?.trim() || null,
    urlFicha: urlDeLaFicha(origen, c.id),
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

/** Trae el membrete (el nombre registrado si no hay uno configurado) y descarga los fotochecks. */
export async function descargarFotochecksDe(colaboradores: ColaboradorDTO[], archivo: string): Promise<void> {
  const origen = window.location.origin;
  const membrete = await leerMembrete();
  const logo = await logoParaPdf(membrete.logoUrl);
  await descargarFotochecks({
    negocio: membrete.nombre,
    contacto: membrete.telefono ?? membrete.direccion,
    logo,
    personas: colaboradores.map((c) => personaParaFotocheck(c, origen)),
    archivo,
  });
}
