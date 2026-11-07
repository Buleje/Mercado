/**
 * Enlace de WhatsApp a soporte con el ID del negocio ya escrito (ADR-500).
 * «Hola, soy Buleje, ID 525-146: » — el cliente completa el problema.
 * Sin ID o sin nombre no rompe: arma el saludo con lo que haya.
 */
import { formatearCodigoTienda } from "@/lib/codigo-tienda";
import { LEGAL } from "@/lib/legal";

/** Sólo dígitos; 9 dígitos peruanos → con 51. Vacío si no queda nada. */
export function numeroSoporte(numero?: string | null): string {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (!digitos) return LEGAL.whatsapp;
  return digitos.length === 9 ? `51${digitos}` : digitos;
}

export function mensajeSoporte(negocio?: string | null, codigo?: string | null): string {
  const nombre = (negocio ?? "").trim();
  const id = codigo ? `ID ${formatearCodigoTienda(codigo)}` : "";
  const quien = [nombre ? `soy ${nombre}` : "", id].filter(Boolean).join(", ");
  return quien ? `Hola, ${quien}: ` : "Hola, necesito ayuda: ";
}

export function enlaceSoporte(opts: { negocio?: string | null; codigo?: string | null; numero?: string | null }): string {
  return `https://wa.me/${numeroSoporte(opts.numero)}?text=${encodeURIComponent(mensajeSoporte(opts.negocio, opts.codigo))}`;
}
