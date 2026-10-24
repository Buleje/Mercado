/**
 * ID de la tienda para soporte (ADR-500): 6 dígitos aleatorios que pone la
 * base al dar de alta (`Tenant.codigo`, función `generar_codigo_tienda`).
 * Se guarda «482917»; se muestra y se copia «482-917» (se dicta en dos
 * golpes por WhatsApp). Sirve en el cliente y en el servidor.
 */

/** Lo que la base acepta (CHECK `Tenant_codigo_formato`): 100000-999999. */
export const CODIGO_TIENDA_RE = /^[1-9]\d{5}$/;

/**
 * Prefijo con el que el dueño suele mandar su ID: «ID 482917», «id: 482-917»,
 * «#482 917», «N° 482917». Sólo se quita al principio.
 */
const PREFIJO_ID = /^\s*(?:id\b|n[°º.]?\s*(?=\d)|#)\s*[:.\-]?\s*/i;

/** ¿Lo escrito empieza con «ID» o «#»? Entonces se busca SÓLO por ID. */
export function tienePrefijoDeId(entrada: string): boolean {
  return /^\s*(?:id\b|#)/i.test(entrada);
}

/**
 * Lo escrito → los 6 dígitos del ID, o `null` si no es un ID completo.
 * Acepta «482917», «482-917», «482 917», «#482 917», «ID 482917», «ID: 482.917».
 * Rechaza letras sueltas, 5 o 7 dígitos y el cero adelante («012345»).
 */
export function normalizarCodigoTienda(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  const cuerpo = entrada.replace(PREFIJO_ID, "").trim();
  // Sólo dígitos y separadores de lectura: «48a917» no es un ID.
  if (!/^[\d\s.\-]+$/.test(cuerpo)) return null;
  const digitos = cuerpo.replace(/\D/g, "");
  return CODIGO_TIENDA_RE.test(digitos) ? digitos : null;
}

/** «482917» → «482-917». Lo que no es un ID se devuelve tal cual (o «»). */
export function formatearCodigoTienda(codigo: string | null | undefined): string {
  if (!codigo) return "";
  return CODIGO_TIENDA_RE.test(codigo) ? `${codigo.slice(0, 3)}-${codigo.slice(3)}` : codigo;
}
