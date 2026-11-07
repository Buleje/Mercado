/**
 * Recortar una grabación: las muestras que entrega `AudioContext.decodeAudioData`
 * → mono → 16 kHz → WAV PCM de 16 bits. Puro (Float32Array in, bytes out) para
 * poder probarlo sin navegador.
 *
 * 16 kHz mono alcanza de sobra para la voz (es lo que usa el teléfono «HD») y
 * pesa 32 KB por segundo: un minuto ≈ 1,9 MB, lejos del tope del drive.
 */

export const TASA_WAV = 16_000;

/** Promedio de los canales (estéreo → mono). Un solo canal sale tal cual. */
export function mezclarAMono(canales: readonly Float32Array[]): Float32Array {
  if (canales.length === 0) return new Float32Array(0);
  if (canales.length === 1) return canales[0];
  const largo = Math.min(...canales.map((c) => c.length));
  const out = new Float32Array(largo);
  for (const c of canales) for (let i = 0; i < largo; i++) out[i] += c[i];
  for (let i = 0; i < largo; i++) out[i] /= canales.length;
  return out;
}

/**
 * Cambia la tasa de muestreo. Al bajar (48 kHz → 16 kHz) promedia la ventana
 * de cada muestra nueva —un filtro pasabajos simple que evita el «metálico»
 * del aliasing—; al subir, interpola lineal.
 */
export function remuestrear(muestras: Float32Array, desde: number, hacia: number): Float32Array {
  if (desde === hacia || muestras.length === 0) return muestras;
  const razon = desde / hacia;
  const largo = Math.max(1, Math.floor(muestras.length / razon));
  const out = new Float32Array(largo);
  if (razon > 1) {
    for (let i = 0; i < largo; i++) {
      const a = Math.floor(i * razon);
      const b = Math.min(muestras.length, Math.max(a + 1, Math.floor((i + 1) * razon)));
      let suma = 0;
      for (let j = a; j < b; j++) suma += muestras[j];
      out[i] = suma / (b - a);
    }
  } else {
    for (let i = 0; i < largo; i++) {
      const x = i * razon;
      const a = Math.floor(x);
      const b = Math.min(muestras.length - 1, a + 1);
      const t = x - a;
      out[i] = muestras[a] * (1 - t) + muestras[b] * t;
    }
  }
  return out;
}

/** Las muestras entre `inicioSeg` y `finSeg` (acotados al audio; fin ≤ inicio = vacío). */
export function recortar(muestras: Float32Array, tasa: number, inicioSeg: number, finSeg: number): Float32Array {
  const a = Math.max(0, Math.min(muestras.length, Math.round(inicioSeg * tasa)));
  const b = Math.max(a, Math.min(muestras.length, Math.round(finSeg * tasa)));
  return muestras.slice(a, b);
}

/** WAV PCM 16 bits mono. Las muestras fuera de [-1, 1] se recortan (no dan la vuelta). */
export function encodeWav(muestras: Float32Array, tasa: number): Uint8Array<ArrayBuffer> {
  const bytesDatos = muestras.length * 2;
  const buf = new ArrayBuffer(44 + bytesDatos);
  const v = new DataView(buf);
  const texto = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  texto(0, "RIFF");
  v.setUint32(4, 36 + bytesDatos, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  v.setUint32(16, 16, true); // tamaño del bloque fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, tasa, true);
  v.setUint32(28, tasa * 2, true); // bytes por segundo
  v.setUint16(32, 2, true); // bytes por muestra
  v.setUint16(34, 16, true); // bits
  texto(36, "data");
  v.setUint32(40, bytesDatos, true);
  for (let i = 0; i < muestras.length; i++) {
    const s = Math.max(-1, Math.min(1, muestras[i]));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return new Uint8Array(buf);
}

/** Todo junto: canales decodificados → recorte → mono 16 kHz → WAV. */
export function recortarAWav(
  canales: readonly Float32Array[],
  tasaOriginal: number,
  inicioSeg: number,
  finSeg: number,
  tasaDestino = TASA_WAV,
): Uint8Array<ArrayBuffer> {
  const mono = mezclarAMono(canales);
  const tramo = recortar(mono, tasaOriginal, inicioSeg, finSeg);
  return encodeWav(remuestrear(tramo, tasaOriginal, tasaDestino), tasaDestino);
}
