import { construirDocDeVarios } from "@/lib/forestal/anexo04-pdf";
import { DATOS_ANEXO04_DEFAULT } from "@/lib/forestal/anexo04-serfor";

/**
 * ANEXO N° 04 en blanco: el formato oficial (modo «oficial», con todos los
 * renglones) sin ninguna pieza ni dato de cabecera, para llenarlo a mano con
 * lapicero al cubicar en campo. Cada hoja es un anexo aparte («Hoja 1 de 1»),
 * así se pueden entregar sueltas. No se registra en la bandeja: no es un emitido.
 */
export async function descargarAnexo04EnBlanco(hojas = 1): Promise<void> {
  const n = Math.max(1, Math.min(20, Math.floor(hojas)));
  const items = Array.from({ length: n }, () => ({ piezas: [], datos: { ...DATOS_ANEXO04_DEFAULT, modo: "oficial" as const } }));
  const doc = await construirDocDeVarios(items);
  doc?.save(`anexo04-en-blanco-${n}-${n === 1 ? "hoja" : "hojas"}.pdf`);
}
