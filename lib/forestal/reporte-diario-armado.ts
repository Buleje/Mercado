/**
 * Reportes diarios (ADR-439) — el correo y el WhatsApp, armados.
 *
 * `armarReporteForestal(datos, secciones)` → `{ asunto, html, texto }`:
 *  · `html`: tablas con estilos en línea, SIN imágenes externas (Gmail las
 *    bloquea y el reporte llegaba con huecos) y con todo lo que viene de datos
 *    escapado — las especies y los proveedores los tipea una persona;
 *  · `texto`: WhatsApp, ≤ `TOPE_WHATSAPP` caracteres, totales primero y un
 *    link «ver más» al panel. Si no entra, se recorta el DETALLE, nunca los
 *    totales ni el link.
 *
 * PURO: se prueba sin base ni red.
 */
import { escapeHtml } from "@/lib/email/escape-html";
import { armarBloques, periodoLegible, diaLegible, type Bloque, type DatosReporteForestal } from "./reporte-diario-bloques";
import { sinCaracteresDeControl, type SeccionReporte } from "./reporte-diario";

export type { DatosReporteForestal } from "./reporte-diario-bloques";

/** WhatsApp corta en 4096; 1500 se lee sin «Leer más» en el celular. */
export const TOPE_WHATSAPP = 1500;

export interface ReporteArmado {
  asunto: string;
  html: string;
  texto: string;
}

/* Colores del logo (#00A29C / #12181E) y grises neutros. Un correo no tiene los
   tokens del panel: los clientes de correo sólo entienden estilos en línea. */
const C = {
  marca: "#00A29C",
  tinta: "#12181E",
  suave: "#5B6670",
  regla: "#E3E8EC",
  fondo: "#F6F8F9",
  alerta: "#B42318",
};

function tablaHtml(b: Bloque): string {
  const t = b.tabla;
  if (!t || t.filas.length === 0) return "";
  const alin = (i: number) => (t.numericas.includes(i) ? "right" : "left");
  const th = t.cabecera
    .map(
      (c, i) =>
        `<th style="text-align:${alin(i)};padding:6px 8px;border-bottom:2px solid ${C.regla};font-size:12px;color:${C.suave};font-weight:600">${escapeHtml(c)}</th>`,
    )
    .join("");
  const filas = t.filas
    .map((f) => {
      /* Una fila con la 1ª celda llena y el resto vacío es un subtítulo («Por proveedor»). */
      const esSubtitulo = f[0] !== "" && f.slice(1).every((c) => c === "");
      const peso = esSubtitulo || (f[0] !== "" && t.cabecera[1] === "Producto") ? "600" : "400";
      return `<tr>${f
        .map(
          (c, i) =>
            `<td style="text-align:${alin(i)};padding:5px 8px;border-bottom:1px solid ${C.regla};font-size:13px;font-weight:${peso};color:${C.tinta};font-variant-numeric:tabular-nums">${escapeHtml(c)}</td>`,
        )
        .join("")}</tr>`;
    })
    .join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:8px 0 0"><thead><tr>${th}</tr></thead><tbody>${filas}</tbody></table>`;
}

function bloqueHtml(b: Bloque): string {
  const lista =
    !b.tabla && b.detalle.length
      ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.6;color:${C.tinta}">${b.detalle
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join("")}</ul>`
      : "";
  /* Con tabla, lo que la tabla no dice (varadas, sin guía, pagos) va abajo. */
  const extra = b.tabla ? (b.notas ?? []) : [];
  const extraHtml = extra.length
    ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:${C.tinta}">${extra.map(escapeHtml).join("<br>")}</p>`
    : "";
  const borde = b.alerta ? C.alerta : C.marca;
  return `<div style="margin:0 0 14px;padding:12px 14px;background:#FFFFFF;border:1px solid ${C.regla};border-left:4px solid ${borde};border-radius:8px">
<h3 style="margin:0;font-size:15px;color:${C.tinta}">${escapeHtml(b.titulo)}</h3>
<p style="margin:4px 0 0;font-size:14px;color:${b.alerta ? C.alerta : C.tinta};font-weight:600">${escapeHtml(b.resumen)}</p>
${tablaHtml(b)}${lista}${extraHtml}
</div>`;
}

function html(datos: DatosReporteForestal, bloques: Bloque[]): string {
  const periodo = periodoLegible(datos.desde, datos.hasta);
  return `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:${C.fondo}">
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px 14px;color:${C.tinta}">
<p style="margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${C.marca};font-weight:700">${escapeHtml(datos.negocio)}</p>
<h2 style="margin:4px 0 2px;font-size:20px">${escapeHtml(datos.nombreReporte)}</h2>
<p style="margin:0 0 16px;font-size:13px;color:${C.suave}">Período: ${escapeHtml(periodo)} · enviado el ${escapeHtml(diaLegible(datos.fecha))}</p>
${bloques.map(bloqueHtml).join("\n")}
<p style="margin:18px 0 0"><a href="${escapeHtml(datos.panelUrl)}" style="display:inline-block;background:${C.marca};color:#FFFFFF;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Abrir el Libro CTP</a></p>
<p style="margin:16px 0 0;font-size:11px;color:${C.suave}">Este reporte sale solo desde tu panel. Para cambiar la hora, las secciones o quién lo recibe: Libro CTP → Opciones → Reportes diarios.</p>
</div></body></html>`;
}

/** WhatsApp resalta con *asteriscos*: los de un nombre tipeado se sacan para que no rompan el formato. */
const sinAsteriscos = (s: string) => s.replace(/[*_~]/g, "");

function textoCon(datos: DatosReporteForestal, bloques: Bloque[], maxDetalle: number): string {
  const cabecera = `*${sinAsteriscos(datos.nombreReporte)}* — ${sinAsteriscos(datos.negocio)}\n${periodoLegible(datos.desde, datos.hasta)}`;
  const cuerpo = bloques.map((b) => {
    const marca = b.alerta ? "⚠️ " : "";
    const det = b.detalle.slice(0, maxDetalle).map((l) => `• ${sinAsteriscos(l)}`);
    const resto = b.detalle.length - det.length;
    if (resto > 0 && maxDetalle > 0) det.push(`• y ${resto} más`);
    return [`${marca}*${b.titulo}*: ${sinAsteriscos(b.resumen)}`, ...det].join("\n");
  });
  return [cabecera, ...cuerpo, `Ver más: ${datos.panelUrl}`].join("\n\n");
}

/**
 * El texto de WhatsApp dentro del tope: primero con 3 renglones de detalle por
 * bloque, después 1, después sólo totales. Si ni así entra (muchas secciones
 * con nombres largos), se corta el cuerpo y el link se conserva.
 */
export function textoWhatsapp(datos: DatosReporteForestal, bloques: Bloque[]): string {
  for (const n of [3, 2, 1, 0]) {
    const t = textoCon(datos, bloques, n);
    if (t.length <= TOPE_WHATSAPP) return t;
  }
  const pie = `\n\n… sigue en el panel: ${datos.panelUrl}`;
  const corto = textoCon(datos, bloques, 0);
  const sinLink = corto.slice(0, corto.lastIndexOf("\n\nVer más:"));
  return sinLink.slice(0, TOPE_WHATSAPP - pie.length).replace(/\n[^\n]*$/, "") + pie;
}

export function armarReporteForestal(entrada: DatosReporteForestal, secciones: readonly SeccionReporte[]): ReporteArmado {
  /* El nombre del negocio y el del reporte los tipeó alguien: un «\r\n»
     adentro partiría el asunto del correo o metería renglones en el WhatsApp. */
  const datos = {
    ...entrada,
    negocio: sinCaracteresDeControl(entrada.negocio) || "Tu negocio",
    nombreReporte: sinCaracteresDeControl(entrada.nombreReporte) || "Reporte del día",
  };
  const bloques = armarBloques(datos, secciones);
  const alertas = bloques.filter((b) => b.alerta).length;
  const asunto = `${alertas ? "[Atención] " : ""}${datos.nombreReporte} — ${datos.negocio} · ${periodoLegible(datos.desde, datos.hasta)}`;
  return { asunto, html: html(datos, bloques), texto: textoWhatsapp(datos, bloques) };
}
