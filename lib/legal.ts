/**
 * lib/legal.ts — Datos legales del titular de la plataforma Buleje.
 *
 * OBLIGATORIO (Ley N° 29571 — Código de Protección y Defensa del Consumidor +
 * normativa de comercio electrónico PE): el consumidor debe poder identificar
 * con quién contrata (razón social, RUC, domicilio fiscal) y acceder al Libro
 * de Reclamaciones (D.S. 011-2011-PCM).
 *
 * ⚠️ Brandon: reemplazá los valores [PENDIENTE …] con los datos REALES de la
 * persona jurídica/natural titular. Mientras tengan "PENDIENTE", el footer NO
 * los muestra (para no publicar placeholders), pero el Libro de Reclamaciones
 * SÍ queda accesible (la accesibilidad del libro es la obligación crítica).
 *
 * Single source of truth: importá `LEGAL` / `INDECOPI` desde acá. No hardcodees
 * RUC/razón social en componentes.
 */

export const LEGAL = {
  /** Razón social de la persona jurídica (o nombre completo si es persona natural con negocio). */
  razonSocial: "[PENDIENTE: Razón social — ej. Inversiones Buleje S.A.C.]",
  /** Nombre comercial visible al público. */
  nombreComercial: "Buleje",
  /** RUC — 11 dígitos (según ficha RUC SUNAT). */
  ruc: "[PENDIENTE: RUC 11 dígitos]",
  /** Domicilio fiscal completo (según ficha RUC SUNAT). */
  domicilioFiscal:
    "[PENDIENTE: Domicilio fiscal — calle/jr./av., número, distrito, provincia, región]",
  /** Representante legal (nombre completo) — exigible por transparencia (Código de Consumo). */
  representanteLegal: "[PENDIENTE: Representante legal — nombre completo]",
  /** Correo que recibe copia de cada reclamo del Libro de Reclamaciones. */
  emailReclamos: "[PENDIENTE: correo para reclamos — ej. reclamos@buleje.pe]",
  /** Teléfono de contacto del titular. */
  telefono: "+51 929 340 532",
  /** WhatsApp del titular (solo dígitos con código país). */
  whatsapp: "51929340532",
} as const;

/** `true` cuando ya se completaron los datos legales reales (sin placeholders). */
export const LEGAL_COMPLETO =
  !LEGAL.razonSocial.includes("PENDIENTE") &&
  !LEGAL.ruc.includes("PENDIENTE") &&
  !LEGAL.domicilioFiscal.includes("PENDIENTE");

/** Email destino real para reclamos (cae al de contacto si aún no se configuró). */
export const EMAIL_RECLAMOS = LEGAL.emailReclamos.includes("PENDIENTE")
  ? "bulejebrandonluis7575@gmail.com"
  : LEGAL.emailReclamos;

/** INDECOPI — referencias oficiales para el consumidor (Ley 29571). */
export const INDECOPI = {
  url: "https://www.gob.pe/indecopi",
  reclamaVirtual: "https://www.reclamavirtual.indecopi.gob.pe/",
  telefonoLima: "224-7777",
  telefonoProvincias: "0-800-4-4040",
} as const;

/** Plazo legal de respuesta a un reclamo (D.S. 011-2011-PCM). */
export const PLAZO_RESPUESTA_DIAS_HABILES = 15;

/** Edad mínima legal para compra de bebidas alcohólicas en Perú. */
export const EDAD_MINIMA_ALCOHOL = 18;
