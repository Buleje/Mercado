// Datos personales tapados antes de volver al modelo (Ley 29733; revisión de seguridad 29-10, hallazgo 6).
// leer_get y las herramientas de RRHH devolvían DNI, celulares y sueldos completos. Se tapan por CLAVE (dni,
// telefono, sueldo…) y por FORMA dentro de cualquier texto (8 cifras sueltas = DNI; 9 cifras que empiezan con 9 =
// celular). El neto de la semana (lo que se paga) queda: es el dato que Brandon pide. Puro: sin red.

/** Clave de un documento de identidad. 3.ª pasada de security (29-10): con nombre exacto se escapaban
 *  representanteDni, titularDoc, titularNumeroDocumento, proveedorDocumento, conductorDni y licencia. Los ids, tipos,
 *  URLs y nombres no son el número (documentId del drive, tipoDocumento = «DNI»). */
const CLAVE_DOC = { test: (k) => {
  const n = String(k).toLowerCase();
  if (/^tipo|ids?$|url$|nombre|name|count|fecha|date|estado|status/.test(n)) return false;
  return /dni|(^|[a-z])(doc|documento|numerodocumento|nrodocumento|nrodoc|numdoc|docnumero)$|ruc_persona|carn[eé]|pasaporte|^ce$|licencia/.test(n);
} };
const CLAVE_EMAIL = /(^|[a-z])(email|correo|mail)$/i;
const CLAVE_CUENTA = /(cuentanumero|numerocuenta|nrocuenta|cuentabancaria|cci|nrocci)$/i;
/** Fuera de RRHH, «tarifa» o «básico» son precios del negocio (flete, aserrío): solo se tapa el sueldo de una persona. */
const SUELDO_PERSONA = /(sueldo|salario|remuneraci)/i;
const CLAVE_FONO = /(telefono|teléfono|phone|celular|whatsapp|movil|móvil)/i;
const CLAVE_SUELDO = /(sueldo|salario|remuneraci|tarifa|jornal|valorhora|pagohora|pagodia|basico|básico)/i;

/** 8 cifras sueltas (DNI) y celulares peruanos (9 cifras que empiezan con 9, con o sin +51 y separadores). */
// Un número con decimales («12345678.50») o pegado a letras/guiones («GTF-12345678») no es un DNI ni un celular.
const RE_FONO = /(?<![\w-]|\d[.,])(?:\+?51[\s-]?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3}(?![\w-]|[.,]\d)/g;
const RE_DNI = /(?<![\w-]|\d[.,])\d{8}(?![\w-]|[.,]\d)/g;
/** DNI escrito con puntos o espacios: «12.345.678», «12 345 678» (2.ª pasada de security, 29-10). */
const RE_DNI_SEPARADO = /(?<![\w.,-])\d{2}[. ]\d{3}[. ]\d{3}(?![\w-]|[.,]\d)/g;

/** @param {string} s */
export function taparTexto(s) {
  return s.replace(RE_FONO, (m) => `9•• ••• ${m.replace(/\D/g, "").slice(-3)}`)
    .replace(RE_DNI_SEPARADO, (m) => `••••${m.replace(/\D/g, "").slice(-4)}`)
    .replace(RE_DNI, (m) => `••••${m.slice(-4)}`);
}

/**
 * Tapa SOLO por clave (dni, teléfono, sueldo…), sin buscar formas en el texto: para clientes, pedidos, adelantos y el
 * resto de los grupos, donde un número de 8 cifras suelto puede ser una guía o un comprobante (no se rompe).
 * @param {unknown} v @param {string} [clave] @param {number} [prof] @returns {unknown}
 */
export function taparPorClaves(v, clave = "", prof = 0) {
  if (prof > 12) return v;
  if (clave && (typeof v === "string" || typeof v === "number")) {
    if (SUELDO_PERSONA.test(clave)) return "(oculto: sueldo)";
    if (CLAVE_DOC.test(clave) || CLAVE_FONO.test(clave) || CLAVE_EMAIL.test(clave) || CLAVE_CUENTA.test(clave)) return taparPorClave(clave, v);
  }
  if (clave && SUELDO_PERSONA.test(clave) && v && typeof v === "object") return "(oculto: sueldo)";
  if (Array.isArray(v)) return v.map((x) => taparPorClaves(x, clave, prof + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, taparPorClaves(x, k, prof + 1)]));
  return v;
}

/** Valor de una clave sensible: deja ver el final (para reconocerlo) pero no el dato. */
function taparPorClave(clave, v) {
  if (v === null || v === undefined || v === "") return v;
  if (CLAVE_SUELDO.test(clave)) return "(oculto: sueldo)";
  if (CLAVE_EMAIL.test(clave)) { const [u, dom] = String(v).split("@"); return dom ? `${u.slice(0, 1)}•••@${dom}` : "(oculto)"; }
  const d = String(v).replace(/\D/g, "");
  if (CLAVE_FONO.test(clave)) return d.length >= 3 ? `••• ••• ${d.slice(-3)}` : "(oculto)";
  return d.length >= 4 ? `••••${d.slice(-4)}` : "(oculto)";
}

/**
 * Copia con los datos personales tapados. No toca el original.
 * @param {unknown} v @param {string} [clave] @param {number} [prof]
 * @returns {unknown}
 */
export function taparPersonales(v, clave = "", prof = 0) {
  if (prof > 12) return v;
  if (clave && (CLAVE_DOC.test(clave) || CLAVE_FONO.test(clave) || CLAVE_SUELDO.test(clave) || CLAVE_EMAIL.test(clave) || CLAVE_CUENTA.test(clave)) && (typeof v === "string" || typeof v === "number")) return taparPorClave(clave, v);
  if (clave && CLAVE_SUELDO.test(clave) && v && typeof v === "object") return "(oculto: sueldo)";
  if (typeof v === "string") return taparTexto(v);
  if (Array.isArray(v)) return v.map((x) => taparPersonales(x, clave, prof + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, taparPersonales(x, k, prof + 1)]));
  return v;
}
