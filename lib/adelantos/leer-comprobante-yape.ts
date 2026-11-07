/**
 * «Desde la foto» del alta de adelanto: la captura de Yape, Plin o de una
 * transferencia BCP / Interbank → los campos del alta. PURO: texto del OCR
 * entra, campos salen. El OCR corre en el navegador (`lib/ocr/ocr-navegador`,
 * tesseract.js): la imagen no sale a nadie.
 *
 * POR QUÉ. De los 5 adelantos reales de Blas (25-10) ninguno tiene foto y se
 * anotaron 4,9 días tarde en promedio: la plata sale por Yape, la captura se
 * queda en el celular y el alta se escribe a mano días después.
 *
 * QUÉ AGREGA A `voucher.ts`. Aquel lee monto, fecha, hora, operación y
 * destinatario de un texto LIMPIO. Éste arregla antes lo que tesseract
 * devuelve en capturas reales y aquel no veía —«S/ 5OO» con dos letras O,
 * espacios finos de iOS, «¡Yapeaste» en un renglón y «a Juan…» en el
 * siguiente— y dice hacia qué lado fue la plata («Yapeaste a» = salió;
 * «te yapeó» = entró) y el nombre de la otra persona en los dos casos.
 *
 * NUNCA DECIDE: el alta queda prellenada y marcada «leído de la foto»; la
 * persona revisa y guarda con el botón de siempre. El monto es un borrador: el
 * total que vale lo calcula el servidor.
 */

import { comoNombre, leerVoucher, type VoucherLeido } from "./voucher";

export type SentidoComprobante = "enviado" | "recibido";

export interface ComprobanteLeido extends VoucherLeido {
  /** «enviado» = la plata salió de tu cuenta; «recibido» = te llegó; `null` = no se sabe. */
  sentido: SentidoComprobante | null;
  /** La otra persona: a quien le mandaste o quien te mandó. */
  nombre: string | null;
}

const ESPACIOS_RAROS = /[  -​  　﻿]/g;
const LETRA = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";

/**
 * Un grupo de cifras con letras que el OCR confunde con números («5OO»,
 * «1,2O0.0O», «O8:15» ya lo arregla `voucher`). Sólo si el grupo tiene al
 * menos un dígito y no está pegado a una letra: «Ol» o «lo» no se tocan.
 */
const RE_CIFRAS_CON_LETRAS = new RegExp(`(?<![${LETRA}])(?=[\\dOoIl.,]*\\d)[\\dOoIl][\\dOoIl.,]*(?![${LETRA}])`, "g");

/** Los verbos con los que las apps dicen que la plata SALIÓ. */
const VERBOS_ENVIO = "yapeaste|plineaste|enviaste|transferiste|pagaste|depositaste";

/**
 * El texto del OCR como lo esperan los lectores de `voucher.ts`.
 * Exportado para el test: es donde viven los arreglos de las capturas reales.
 */
export function normalizarTextoOcr(texto: string): string {
  return (
    texto
      .replace(ESPACIOS_RAROS, " ")
      .replace(/\r\n?/g, "\n")
      /* «Yape aste», «Yapeas te»: el OCR parte la palabra grande del título. */
      .replace(/\by\s?a\s?p\s?e\s?a\s?s\s?t\s?e\b/gi, "Yapeaste")
      .replace(/\bp\s?l\s?i\s?n\s?e\s?a\s?s\s?t\s?e\b/gi, "Plineaste")
      /* «¡Yapeaste» en un renglón y «a Juan Pérez» en el siguiente. */
      .replace(new RegExp(`(${VERBOS_ENVIO})\\s*!?\\s*\\n\\s*a\\s+`, "gi"), "$1 a ")
      /* «Yapeastea Juan»: sin el espacio. */
      .replace(new RegExp(`(${VERBOS_ENVIO})a\\s+`, "gi"), "$1 a ")
      /* El «¡» del título leído como «i», «l» o «!»: «iYapeaste a Juan». */
      .replace(/(^|\s)[i!|l1]\s?(?=yapeaste|plineaste)/gim, "$1¡")
      /* «S /», «S/.», «s/»: el símbolo de soles como lo busca el lector. */
      .replace(/\b[Ss]\s*\/\s*\.?\s*(?=[\dOoIl])/g, "S/ ")
      .replace(RE_CIFRAS_CON_LETRAS, (m) => m.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"))
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      /* Leída como columna, la captura trae un renglón vacío entre bloque y
         bloque: el nombre bajo «S/ 500» tiene que seguir siendo «el de abajo». */
      .filter(Boolean)
      .join("\n")
  );
}

const RE_RECIBIDO =
  /te\s+(?:yape[oó]|yapearon|envi[oó]|pag[oó]|transfiri[oó]|plin[eé][oó]|deposit[oó])|recibiste|yape\s+recibido|pago\s+recibido|abono\s+recibido|dep[oó]sito\s+recibido|transferencia\s+recibida/i;
const RE_ENVIADO = new RegExp(`${VERBOS_ENVIO}|transferencia\\s+(?:exitosa|realizada)|constancia\\s+de\\s+transferencia|monto\\s+transferido|enviado\\s+a`, "i");

function sentidoDe(texto: string): SentidoComprobante | null {
  if (RE_RECIBIDO.test(texto)) return "recibido";
  if (RE_ENVIADO.test(texto)) return "enviado";
  return null;
}

/** «Juan Pérez te yapeó», «Te yapeó Juan Pérez», «De: Juan Pérez», «Remitente …». */
function remitenteDe(lineas: string[]): string | null {
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const antes = /^(.+?)\s+te\s+(?:yape[oó]|envi[oó]|pag[oó]|transfiri[oó]|plin[eé][oó])(?![a-záéíóú])/i.exec(l);
    const nombre = antes && comoNombre(antes[1].replace(/^[¡!i]\s*/, ""));
    if (nombre) return nombre;
    const despues = /^(?:¡?\s*te\s+(?:yape[oó]|envi[oó]|pag[oó]|transfiri[oó]|plin[eé][oó])|de|remitente|ordenante|enviado\s+por|origen)(?![a-záéíóú])\s*[:!-]?\s*(.*)$/i.exec(l);
    if (despues) {
      const n = comoNombre(despues[1]) ?? comoNombre(lineas[i + 1] ?? "");
      if (n) return n;
    }
  }
  return null;
}

/**
 * Los campos de una captura de Yape, Plin o transferencia a partir del texto
 * del OCR. `hoy` (AAAA-MM-DD) completa el año cuando la captura no lo trae.
 */
export function leerComprobante(texto: string, opts: { hoy: string }): ComprobanteLeido {
  const limpio = normalizarTextoOcr(texto);
  const v = leerVoucher(limpio, opts);
  /* «mañana te pago» en un chat no es un pago recibido: sólo con monto o app. */
  const sentido = v.monto != null || v.app ? sentidoDe(limpio) : null;
  /* Si te mandaron, el «destinatario» que encuentra `voucher` (el nombre bajo
     el monto) es el de quien te mandó, salvo que diga quién en otro lado. */
  const nombre = sentido === "recibido" ? (remitenteDe(limpio.split("\n")) ?? v.destinatario) : v.destinatario;
  return { ...v, sentido, nombre };
}
