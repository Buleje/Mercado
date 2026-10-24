/**
 * cubicacion-whatsapp — el mensaje de una cubicación GUARDADA para mandarlo por
 * WhatsApp y el enlace `wa.me` que lo abre. PURO. Nunca envía nada: sólo arma
 * un texto y un enlace que abre WhatsApp para que la persona toque «enviar».
 */
import { m3DesdePt } from "./cubicacion";
import { fmtM3, fmtPt, fmtSoles } from "./cubicacion-formato";
import { precioDeCubicacion, type CubicacionRegistro } from "./cubicacion-registro";
import { resumenPorEspecie } from "./cubicacion-resumen";

/** Un celular de Perú como 51XXXXXXXXX; lo que no lo es → `null`. */
export function celularPeru(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("9")) return `51${d}`;
  if (d.length === 11 && d.startsWith("519")) return d;
  return null;
}

/** El primer número de celular válido de la ficha: WhatsApp, teléfono, luego sus contactos. */
export function celularDeParte(p: {
  whatsapp?: string | null;
  telefono?: string | null;
  contactoTelefono?: string | null;
  contacto2Telefono?: string | null;
} | null | undefined): string | null {
  if (!p) return null;
  for (const v of [p.whatsapp, p.telefono, p.contactoTelefono, p.contacto2Telefono]) {
    const n = celularPeru(v);
    if (n) return n;
  }
  return null;
}

/** `fechaTexto`: la fecha ya escrita («jueves 10/09»). */
export function textoWhatsAppDeGuardada(c: CubicacionRegistro, fechaTexto: string): string {
  const f = c.ficha ?? {};
  const cabecera = [
    `*Cubicación · ${c.nombre}*`,
    fechaTexto,
    c.cliente && `Comprador: ${c.cliente}`,
    f.comunidad && `CCNN: ${f.comunidad}`,
    c.gtfNumber && `GTF: ${c.gtfNumber}`,
    f.placa && `Placa: ${f.placa}`,
  ].filter((x): x is string => Boolean(x));
  const conValor = c.valor > 0;
  const bloques = resumenPorEspecie(c.piezas, precioDeCubicacion(c));
  const porEspecie = bloques.map((b) => {
    const base = `• ${b.especie}: ${b.total.cantidad.toLocaleString("es-PE")} pzas · ${fmtPt(b.total.pieTablar)} PT · ${fmtM3(m3DesdePt(b.total.pieTablar))} m³`;
    return conValor ? `${base} · S/ ${fmtSoles(b.total.valor)}` : base;
  });
  const total = [
    "*Total*",
    `${c.totales.piezas.toLocaleString("es-PE")} piezas · ${fmtPt(c.totales.pieTablar)} PT · ${fmtM3(m3DesdePt(c.totales.pieTablar))} m³`,
    conValor && `*Importe: S/ ${fmtSoles(c.valor)}*`,
  ].filter((x): x is string => Boolean(x));
  const partes = [cabecera.join("\n"), porEspecie.length ? ["*Por especie*", ...porEspecie].join("\n") : "", total.join("\n"), c.notas ? `*Notas*\n${c.notas}` : ""];
  return partes.filter(Boolean).join("\n\n");
}

/** `wa.me/<número>?text=…`, o sin número para que se elija el contacto. */
export function enlaceWhatsApp(texto: string, numero?: string | null): string {
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;
}
