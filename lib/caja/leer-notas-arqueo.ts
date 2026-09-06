/**
 * Lo que el arqueo guardó adentro de un string.
 *
 * El Cuadre tiene una sección «Desglose de denominaciones» que nunca se
 * mostró: `mapRegisterToAudit` arma el detalle con `denominations: []` fijo,
 * porque el desglose por billete no se persiste en ninguna columna. Lo que sí
 * queda es el texto que escribe el Arqueo Guiado:
 *
 *   "Arqueo Guiado - 12/08 10:30 | Billetes: S/450.00 | Monedas: S/23.50 |
 *    Total efectivo: S/473.50 | Yape: S/120.00 | Total general: S/593.50 |
 *    Diferencia: +S/3.50 | Foto: https://…"
 *
 * Esa línea tiene todo lo que el cajero contó y nadie la lee: se muestra
 * entera, como un párrafo, o no se muestra. Acá se vuelve a convertir en
 * datos. Guardar el detalle billete por billete pide una columna nueva
 * (migración pendiente); esto recupera lo que ya está escrito.
 */

export type NotasArqueo = {
  /** Subtotal contado en billetes, si el arqueo lo declaró. */
  billetes: number | null;
  monedas: number | null;
  totalEfectivo: number | null;
  /** Lo cobrado por medios digitales que el arqueo declaró aparte. */
  digitales: Array<{ medio: string; monto: number }>;
  totalGeneral: number | null;
  diferencia: number | null;
  fotoUrl: string | null;
  /** `true` si la nota tiene algo estructurado que valga la pena mostrar. */
  hayDatos: boolean;
};

const VACIO: NotasArqueo = {
  billetes: null, monedas: null, totalEfectivo: null,
  digitales: [], totalGeneral: null, diferencia: null, fotoUrl: null, hayDatos: false,
};

/** `S/1,234.50` → 1234.5 · `+S/3.50` → 3.5 · `-S/2` → −2 */
function monto(raw: string | undefined): number | null {
  if (!raw) return null;
  const limpio = raw.replace(/\s/g, "").replace(/S\//i, "").replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function buscar(texto: string, etiqueta: string): number | null {
  // `Billetes: S/450.00` en el Arqueo Guiado, pero `contado S/473.50` (sin dos
  // puntos) en el conteo manual: los dos formatos los escribe el mismo sistema.
  const re = new RegExp(`${etiqueta}\\s*:?\\s*([+-]?\\s*S/\\s*[\\d.,]+)`, "i");
  return monto(re.exec(texto)?.[1]);
}

/** Los medios digitales que el Arqueo Guiado agrega al final del efectivo. */
const MEDIOS_DIGITALES = ["Yape", "Plin", "Tarjeta"] as const;

export function leerNotasArqueo(notes: string | null | undefined): NotasArqueo {
  if (!notes || typeof notes !== "string") return VACIO;

  const billetes = buscar(notes, "Billetes");
  const monedas = buscar(notes, "Monedas");
  const totalEfectivo = buscar(notes, "Total efectivo") ?? buscar(notes, "contado");
  const totalGeneral = buscar(notes, "Total general");
  const diferencia = buscar(notes, "Diferencia") ?? buscar(notes, "diferencia");

  const digitales: Array<{ medio: string; monto: number }> = [];
  for (const medio of MEDIOS_DIGITALES) {
    const v = buscar(notes, medio);
    if (v != null && v > 0) digitales.push({ medio, monto: v });
  }

  // `Foto: https://…` — el arqueo también puede decir sólo «Foto: adjunta»
  // cuando la subida falló, y eso no es una URL.
  const fotoRaw = /Foto:\s*(\S+)/i.exec(notes)?.[1];
  const fotoUrl = fotoRaw && /^https?:\/\//i.test(fotoRaw) ? fotoRaw : null;

  const hayDatos =
    billetes != null || monedas != null || totalEfectivo != null ||
    digitales.length > 0 || totalGeneral != null || fotoUrl != null;

  return { billetes, monedas, totalEfectivo, digitales, totalGeneral, diferencia, fotoUrl, hayDatos };
}
