"use client";

/**
 * membrete-forestal — abre un PDF de jsPDF del módulo forestal ya con el
 * membrete del negocio (logo + nombre + tipo/código/fecha, ADR-514) y deja el
 * pie paginado listo para `cerrar()`. Los exportes forestales usan `pt`; el
 * membrete común dibuja en mm: este helper abre el documento en mm y entrega
 * las medidas que `autoTable` necesita (márgenes con el pie y la cabecera breve
 * de las páginas que siguen), para no repetirlas en cada exporte.
 *
 * Es el papel del negocio, no un formato oficial: la GTF, el talonario y los
 * archivos SERFOR no pasan por acá.
 */

import { membreteDelDocumento } from "@/lib/documentos/membrete-cargar";
import { logger } from "@/lib/logger";
import { membreteHtml, type MembreteHtml } from "@/lib/documentos/membrete-html";
import {
  altoDelPie,
  datosDelMembrete,
  dibujarMembrete,
  dibujarMembreteBreve,
  dibujarPies,
  fechaDelDocumento,
  margenDelMembrete,
  type DatosMembrete,
} from "@/lib/documentos/membrete-pdf";

type Pdf = InstanceType<(typeof import("jspdf"))["default"]>;

export interface OpcionesPdfForestal {
  /** «Cubicación de madera», «Historia del lote»… va a la derecha, en mayúsculas. */
  tipo: string;
  codigo?: string | null;
  /** ISO o «aaaa-mm-dd»; por defecto, hoy en Lima. */
  fecha?: string | null;
  extra?: string | null;
  orientation?: "portrait" | "landscape";
  /** La unidad del documento: `pt` para los exportes que ya dibujan en puntos. Lo que devuelve va en esa unidad. */
  unit?: "mm" | "pt";
}

export interface PdfForestal {
  doc: Pdf;
  m: DatosMembrete;
  /** Dónde empieza el cuerpo en la primera página (mm). */
  y: number;
  /** Margen lateral (mm). */
  margen: number;
  /** Ancho y alto de la página (mm). */
  ancho: number;
  alto: number;
  /** El `margin` de autoTable: deja libre el pie y la cabecera breve de las hojas 2+. */
  margenTabla: { top: number; left: number; right: number; bottom: number };
  /** Cabecera breve en la página actual (para un `addPage()` propio). Devuelve dónde empieza el cuerpo. */
  breve: (titulo?: string) => number;
  /** `didDrawPage` de autoTable: pone la cabecera breve en las páginas 2+. */
  alDibujarPagina: (data: { pageNumber: number }) => void;
  /** Dibuja el pie «Página X de Y» en todas las páginas. Llamar una vez, al final. */
  cerrar: () => void;
}

const PT_POR_MM = 72 / 25.4;

/**
 * Una vista en mm de un documento abierto en pt: el membrete común dibuja en mm
 * y el exporte en puntos no tiene por qué reescribir sus coordenadas. Sólo
 * traduce lo que el membrete usa (texto, imagen, líneas, medidas de página).
 */
function vistaEnMm(doc: Pdf): Pdf {
  const k = PT_POR_MM;
  const num = (v: unknown) => (typeof v === "number" ? v * k : v);
  const pagina = doc.internal.pageSize;
  return new Proxy(doc, {
    get(real, prop) {
      const r = real as unknown as Record<string | symbol, unknown>;
      if (prop === "internal")
        return { ...real.internal, pageSize: { getWidth: () => pagina.getWidth() / k, getHeight: () => pagina.getHeight() / k } };
      const f = r[prop];
      if (typeof f !== "function") return f;
      const fn = f as (...a: unknown[]) => unknown;
      switch (prop) {
        case "text":
          return (t: unknown, x: unknown, y: unknown, ...rest: unknown[]) => fn.call(real, t, num(x), num(y), ...rest);
        case "addImage":
          return (d: unknown, fm: unknown, x: unknown, y: unknown, w: unknown, h: unknown, ...rest: unknown[]) => fn.call(real, d, fm, num(x), num(y), num(w), num(h), ...rest);
        case "roundedRect":
          return (x: unknown, y: unknown, w: unknown, h: unknown, rx: unknown, ry: unknown, st: unknown) => fn.call(real, num(x), num(y), num(w), num(h), num(rx), num(ry), st);
        case "line":
          return (a: unknown, b: unknown, c: unknown, d: unknown) => fn.call(real, num(a), num(b), num(c), num(d));
        case "setLineWidth":
          return (w: unknown) => fn.call(real, num(w));
        case "getTextWidth":
          return (t: string) => (fn.call(real, t) as number) / k;
        case "splitTextToSize":
          return (t: string, w: number, ...rest: unknown[]) => fn.call(real, t, w * k, ...rest);
        default:
          return fn.bind(real);
      }
    },
  });
}

/** Hoy en Lima, «aaaa-mm-dd». */
export const hoyEnLima = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export async function abrirPdfForestal(o: OpcionesPdfForestal): Promise<PdfForestal> {
  const { jsPDF } = await import("jspdf");
  const unit = o.unit ?? "mm";
  const u = unit === "pt" ? PT_POR_MM : 1;
  const doc = new jsPDF({ unit, format: "a4", orientation: o.orientation ?? "portrait" });
  const mm = unit === "pt" ? vistaEnMm(doc) : doc;
  const m = datosDelMembrete(await membreteDelDocumento(), {
    tipo: o.tipo,
    codigo: o.codigo,
    fecha: fechaDelDocumento(o.fecha) ?? fechaDelDocumento(hoyEnLima()),
    extra: o.extra,
  });
  const y = dibujarMembrete(mm, m) * u;
  const margen = margenDelMembrete() * u;
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const top2 = 29 * u;
  // Páginas que ya tienen su cabecera: autoTable avisa en CADA tabla, y una página con tres tablas no la repite tres veces.
  const conCabecera = new Set<number>([1]);
  const breve = (titulo = o.tipo): number => {
    conCabecera.add(doc.getNumberOfPages());
    return dibujarMembreteBreve(mm, m, titulo) * u;
  };
  return {
    doc,
    m,
    y,
    margen,
    ancho,
    alto,
    margenTabla: { top: top2, left: margen, right: margen, bottom: (altoDelPie() + 2) * u },
    breve,
    alDibujarPagina: (d) => {
      if (d.pageNumber > 1 && !conCabecera.has(d.pageNumber)) {
        conCabecera.add(d.pageNumber);
        dibujarMembreteBreve(mm, m, o.tipo);
      }
    },
    cerrar: () => dibujarPies(mm, m),
  };
}

export interface MarcaDelNegocio {
  /** `<img>` listo para poner arriba del nombre en un papel HTML; "" si el negocio no tiene logo. */
  logoHtml: string;
  /** El logo como data URL (PNG), o `null`. */
  logo: string | null;
  /** Nombre comercial › razón social (Ajustes); `null` si no hay ninguno. */
  nombre: string | null;
}

/**
 * Logo y nombre del negocio (Ajustes › Datos del negocio, ADR-514) para los
 * papeles que se arman como HTML. Nunca falla: sin datos, el papel sale como antes.
 */
export async function marcaDelNegocio(): Promise<MarcaDelNegocio> {
  try {
    const m = await membreteDelDocumento();
    const logo = m.logo?.dataUrl && /^data:image\/(png|jpe?g);base64,[a-z0-9+/=]+$/i.test(m.logo.dataUrl) ? m.logo.dataUrl : null;
    return {
      logo,
      logoHtml: logo ? `<img class="mbr-logo" src="${logo}" alt="" style="display:block;height:15mm;max-width:44mm;object-fit:contain;margin-bottom:6px">` : "",
      nombre: m.nombre?.trim() || m.razonSocial?.trim() || null,
    };
  } catch {
    return { logo: null, logoHtml: "", nombre: null };
  }
}

/**
 * El membrete común en HTML (estilos + cabecera + pie) para los papeles que se
 * arman como página: va `<style>${estilos}</style>`, `cabecera` antes del título
 * y `pie` al final. Nunca falla: sin datos sale el nombre «Documento» con monograma,
 * así que el papel decide si lo usa (`datos.titulo`).
 */
export async function membreteParaHtml(doc: { tipo: string; codigo?: string | null; fecha?: string | null; extra?: string | null }): Promise<MembreteHtml> {
  let base: Awaited<ReturnType<typeof membreteDelDocumento>> = {};
  try {
    base = await membreteDelDocumento();
  } catch {
    base = {};
  }
  return membreteHtml(
    datosDelMembrete(base, { tipo: doc.tipo, codigo: doc.codigo, fecha: fechaDelDocumento(doc.fecha) ?? fechaDelDocumento(hoyEnLima()), extra: doc.extra }),
  );
}

/** Los huecos del membrete en un papel HTML armado de golpe: `completarMembrete` los llena cuando llegan los datos. */
export const MBR_HUECO_CABECERA = '<div id="mbr-slot-cab"></div>';
export const MBR_HUECO_PIE = '<div id="mbr-slot-pie"></div>';

/**
 * Llena los huecos del membrete en la ventana ya abierta (los papeles se
 * escriben de forma síncrona para que el navegador no bloquee la ventana) y,
 * si se pide, imprime recién cuando el logo cargó: el diálogo de impresión no
 * debe abrirse con el papel a medias.
 */
export function completarMembrete(
  w: Window,
  doc: { tipo: string; codigo?: string | null; fecha?: string | null; extra?: string | null },
  o: { imprimirAlTerminar?: boolean } = {},
): void {
  void (async () => {
    try {
      const mbr = await membreteParaHtml(doc);
      const d = w.document;
      const cab = d.getElementById("mbr-slot-cab");
      if (cab) cab.outerHTML = mbr.cabecera;
      const pie = d.getElementById("mbr-slot-pie");
      if (pie) pie.outerHTML = mbr.pie;
      const estilo = d.createElement("style");
      estilo.textContent = mbr.estilos;
      d.head.appendChild(estilo);
      const cargando = Array.from(d.images)
        .filter((i) => !i.complete)
        .map((i) => new Promise<void>((ok) => { i.onload = () => ok(); i.onerror = () => ok(); }));
      await Promise.race([Promise.all(cargando), new Promise<void>((ok) => setTimeout(ok, 4000))]);
    } catch (err) {
      logger.warn("[membrete-forestal] el membrete no llegó al papel", { error: String(err) });
    } finally {
      if (o.imprimirAlTerminar && !w.closed) w.print();
    }
  })();
}
