import "server-only";
import { logger } from "@/lib/logger";
import { sharpSeguro } from "./imagen-segura";
import {
  ALTO_MIN_FIRMA_PX,
  CABEZA,
  SIN_CHALECOS_REGISTRADOS,
  altoBandaRotulo,
  firmaDelCuerpo,
  marcadorDeChaleco,
  muestrearRecorte,
  type CajaGuardada,
  type CajaPersonaFraccion,
} from "./apariencia";

/**
 * Firma de la ropa de cada caja, calculada en el SERVIDOR desde la foto que
 * ya se guarda (ADR-479). El cliente sólo manda dónde está cada persona: la
 * firma nunca viene de afuera.
 *
 * La foto se decodifica UNA vez a píxeles crudos y cada cuerpo se muestrea en
 * memoria a ≤ 64 × 128 (`muestrearRecorte`): antes se decodificaba una vez
 * POR CAJA y una foto de 1280 × 16 383 con 50 cajas costaba 46 s de CPU
 * (revisión de seguridad 08-10). Del cuerpo se lee del 18 % de la caja para
 * abajo, sin la banda del rótulo: la franja de la cabeza no se copia, no se
 * pasa a `firmaDelCuerpo` y no se guarda.
 *
 * El `marcador` que manda el cliente se conserva sólo si es un chaleco
 * registrado (`chalecosRegistrados`; hoy ninguno): si no, manda la ropa.
 *
 * Nunca tira: una caja que no se puede leer queda con `firma: null` (la foto
 * se guarda igual; esa aparición cuenta como «sin agrupar»).
 */

const dec4 = (n: number) => Math.round(n * 10_000) / 10_000;

function sinFirma(c: CajaPersonaFraccion, chalecosRegistrados: ReadonlySet<number>): CajaGuardada {
  const marcador = marcadorDeChaleco(c.marcador, chalecosRegistrados);
  return {
    x: dec4(c.x),
    y: dec4(c.y),
    ancho: dec4(c.ancho),
    alto: dec4(c.alto),
    confianza: Math.round(c.confianza * 100) / 100,
    ...(marcador != null ? { marcador } : {}),
    firma: null,
    chaleco: null,
  };
}

interface FotoCruda {
  data: Buffer;
  ancho: number;
  alto: number;
  canales: number;
}

async function decodificar(imagen: Buffer): Promise<FotoCruda | null> {
  try {
    const { data, info } = await sharpSeguro(imagen).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, ancho: info.width, alto: info.height, canales: info.channels };
  } catch (err) {
    logger.warn("[camaras.apariencia] no se pudo leer la foto", { error: String(err) });
    return null;
  }
}

export async function firmarCajas(
  imagen: Buffer,
  cajas: readonly CajaPersonaFraccion[],
  chalecosRegistrados: ReadonlySet<number> = SIN_CHALECOS_REGISTRADOS,
): Promise<CajaGuardada[]> {
  if (cajas.length === 0) return [];
  const foto = await decodificar(imagen);
  if (!foto) return cajas.map((c) => sinFirma(c, chalecosRegistrados));
  const { ancho, alto } = foto;
  const abajo = alto - altoBandaRotulo(ancho);
  return cajas.map((c) => {
    const base = sinFirma(c, chalecosRegistrados);
    const altoCaja = Math.round(c.alto * alto);
    const x0 = Math.min(Math.max(Math.round(c.x * ancho), 0), ancho - 1);
    const x1 = Math.min(Math.round((c.x + c.ancho) * ancho), ancho);
    const arriba = Math.round(c.y * alto) + Math.ceil(altoCaja * CABEZA);
    const fondo = Math.min(Math.round(c.y * alto) + altoCaja, abajo);
    if (altoCaja < ALTO_MIN_FIRMA_PX || x1 - x0 < 2 || fondo - arriba < 4) return base;
    const cuerpo = muestrearRecorte(foto.data, ancho, foto.canales, { x0, y0: arriba, x1, y1: fondo });
    const f = firmaDelCuerpo(cuerpo.rgba, cuerpo.ancho, cuerpo.filas, altoCaja * cuerpo.escalaFilas);
    return f ? { ...base, firma: f.firma, chaleco: f.chaleco } : base;
  });
}
