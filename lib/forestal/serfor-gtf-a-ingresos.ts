import type { GtfSerfor, TrozaGtf } from "./serfor-gtf";
import { descuadreDeEspecie, explicarDescuadre, type DescuadreDeGuia } from "./guia-descuadre";

/**
 * Convierte una GTF de SERFOR en los ingresos que le corresponden en el libro
 * (ADR-312).
 *
 * El LO-CTP registra **por especie y producto**, no por documento: una guía que
 * ampara Copaiba 9.065 m³ y Sapotillo 4.874 m³ son DOS renglones del libro, no
 * uno de 13.939 m³ a nombre de la primera especie. Registrarlo como uno solo
 * dejaba una especie con un volumen que nunca entró y otra que no entró nunca.
 *
 * Puro y sin red: se testea con la ficha real y se usa desde el servidor.
 */

/** Un ingreso a crear, ya con la parte de la guía que le toca. */
export type IngresoDesdeGtf = {
  especieComun: string;
  especieCientifica: string | null;
  tipoProducto: string | null;
  presentacion: string | null;
  unidad: string | null;
  volumenM3: number;
  piezas: number;
  /** De dónde salió el volumen: sirve para avisar cuando la guía no lo declara. */
  volumenDe: "producto" | "trozas";
  trozas: TrozaDeIngreso[];
};

export type TrozaDeIngreso = {
  orden: number;
  codificacion: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  d1Cm: number | null;
  d2Cm: number | null;
  cantidad: number | null;
  volumenM3: number | null;
};

export type ReparteGtf =
  | { ok: true; ingresos: IngresoDesdeGtf[]; avisos: string[]; descuadres: DescuadreDeGuia[] }
  | { ok: false; motivo: string };

/** Compara nombres de especie sin tildes ni mayúsculas: SERFOR mezcla las dos. */
function clave(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Rompe las dimensiones que publica SERFOR en largo y diámetro.
 *
 * ⚠️ El orden es **diámetro1 × diámetro2 × largo**, con los diámetros en
 * CENTÍMETROS y el largo en METROS: `100.0 X 96.0 X 6.5` es una troza de 6.5 m
 * con extremos de 100 y 96 cm. Leerlo como "largo primero" daba trozas de 100
 * metros de largo y 51 metros de diámetro.
 *
 * No es una suposición: el volumen que declara la guía se reproduce exacto con
 * la fórmula de Huber sobre el diámetro medio —4.903 m³ para esa troza, 4.162,
 * 1.606 y 3.268 para las otras tres de la guía real—, y no se acerca con
 * ninguna otra lectura. `volumenSegunDimensiones` deja esa comprobación
 * disponible para los tests.
 *
 * Si el texto no se puede partir, los números quedan en null y el original se
 * conserva: perderlo por no poder parsearlo sería peor que no tener los números.
 */
export function medidasDeTroza(dimensiones: string | null | undefined): {
  largoM: number | null;
  diametroCm: number | null;
  /** Los dos extremos por separado: el tronco es cónico y el retrozado (ADR-313)
   *  necesita el MAYOR, que el promedio esconde. */
  d1Cm: number | null;
  d2Cm: number | null;
} {
  const partes = (dimensiones ?? "")
    .split(/[xX×]/)
    .map((p) => Number(p.replace(",", ".").trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (partes.length < 2) return { largoM: null, diametroCm: null, d1Cm: null, d2Cm: null };

  const largoM = partes.at(-1) ?? null;
  const diams = partes.slice(0, -1);
  const promedio = diams.reduce((a, b) => a + b, 0) / diams.length;
  return {
    largoM,
    diametroCm: Number(promedio.toFixed(2)),
    d1Cm: diams[0] ?? null,
    d2Cm: diams[1] ?? diams[0] ?? null,
  };
}

/**
 * Volumen de una troza por Huber (diámetro medio), en m³. Es la fórmula con la
 * que SERFOR publica el volumen de cada troza: sirve para CONTROLAR que se
 * leyeron bien las dimensiones, no para reemplazar el dato del documento —el
 * volumen que vale es el que declara la guía.
 */
export function volumenSegunDimensiones(dimensiones: string | null | undefined): number | null {
  const { largoM, diametroCm } = medidasDeTroza(dimensiones);
  if (largoM == null || diametroCm == null) return null;
  const radioM = diametroCm / 200;
  return Number((Math.PI * radioM * radioM * largoM).toFixed(4));
}

function aTroza(t: TrozaGtf, orden: number): TrozaDeIngreso {
  const { largoM, diametroCm, d1Cm, d2Cm } = medidasDeTroza(t.dimensiones);
  return {
    orden,
    codificacion: t.codificacion ?? null,
    especieComun: t.comun ?? null,
    especieCientifica: t.cientifico ?? null,
    dimensiones: t.dimensiones ?? null,
    largoM,
    diametroCm,
    d1Cm,
    d2Cm,
    cantidad: t.cantidad ?? null,
    volumenM3: t.volumen ?? null,
  };
}

export function repartirGtfEnIngresos(gtf: GtfSerfor): ReparteGtf {
  const productos = gtf.productos ?? [];
  if (productos.length === 0) return { ok: false, motivo: "La guía no declara ningún producto." };

  const avisos: string[] = [];
  const trozas = (gtf.trozas ?? []).map(aTroza);

  // Cada troza se asigna a la especie que declara. Las que no matchean con
  // ninguna se enganchan al primer ingreso —la guía es un solo embarque— pero
  // CONSERVAN su especie: el dato del documento no se pierde por una heurística
  // nuestra, y así la discrepancia queda a la vista en vez de taparse.
  const porEspecie = new Map<string, TrozaDeIngreso[]>();
  const sueltas: TrozaDeIngreso[] = [];
  for (const t of trozas) {
    const k = clave(t.especieComun) || clave(t.especieCientifica);
    const matchea = productos.some((p) => clave(p.comun) === k || clave(p.cientifico) === k);
    if (k && matchea) porEspecie.set(k, [...(porEspecie.get(k) ?? []), t]);
    else sueltas.push(t);
  }
  if (sueltas.length > 0 && productos.length > 1) {
    avisos.push(
      `${sueltas.length} troza(s) de la lista no coinciden con ninguna especie declarada: quedan en el primer ingreso, con su especie tal como la publica SERFOR.`,
    );
  }

  const ingresos: IngresoDesdeGtf[] = [];
  const descuadres: DescuadreDeGuia[] = [];
  for (const [i, p] of productos.entries()) {
    const k = clave(p.comun) || clave(p.cientifico);
    const mias = [...(porEspecie.get(k) ?? []), ...(i === 0 ? sueltas : [])];

    // El volumen sale de lo que DECLARA la guía. Si el producto no lo trae, se
    // cae a la suma de sus trozas. Lo que no se hace nunca es repartir el total
    // entre especies a ojo: sería inventar el dato que el libro tiene que probar.
    const declarado = p.volumen != null && p.volumen > 0 ? p.volumen : null;
    const deTrozas = mias.reduce((a, t) => a + (t.volumenM3 ?? 0), 0);
    const volumenM3 = declarado ?? (deTrozas > 0 ? Number(deTrozas.toFixed(4)) : 0);
    if (volumenM3 <= 0) {
      return {
        ok: false,
        motivo: `La guía no declara volumen para «${p.comun ?? p.cientifico ?? "un producto"}». Cargá ese ingreso a mano.`,
      };
    }
    if (declarado == null) {
      avisos.push(`El volumen de ${p.comun ?? p.cientifico} se tomó de la suma de sus trozas: la guía no lo declara.`);
    }

    const piezasDeclaradas = p.cantidad != null && p.cantidad > 0 ? Math.round(p.cantidad) : null;
    const piezas = piezasDeclaradas ?? mias.reduce((a, t) => a + (t.cantidad ?? 1), 0);

    // Los DOS testigos del papel tienen que dar lo mismo (ADR-353). Cuando no
    // dan, se avisa acá —antes de registrar— y no tres pantallas después, cuando
    // el consumo choque contra I2 y parezca que se equivocó el operador.
    const descuadre = descuadreDeEspecie({
      especie: p.comun ?? p.cientifico ?? null,
      declaradoM3: declarado,
      piezasDeclaradas,
      filas: mias.map((t) => ({
        codificacion: t.codificacion,
        cantidad: t.cantidad,
        volumenM3: t.volumenM3,
      })),
    });
    if (descuadre) {
      descuadres.push(descuadre);
      avisos.push(explicarDescuadre(descuadre, gtf.gtfNumber));
    }

    ingresos.push({
      especieComun: (p.comun ?? p.cientifico ?? "").trim() || "Sin especie declarada",
      especieCientifica: p.cientifico?.trim() || null,
      tipoProducto: p.tipoProducto ?? null,
      presentacion: p.presentacion ?? null,
      unidad: p.unidad ?? null,
      volumenM3,
      piezas,
      volumenDe: declarado != null ? "producto" : "trozas",
      trozas: mias,
    });
  }

  // Control final contra el total del documento: si la suma de las líneas no da
  // el total declarado, se avisa. No se corrige ninguno de los dos —el que
  // manda es el documento— pero el operador tiene que verlo antes de registrar.
  const suma = ingresos.reduce((a, x) => a + x.volumenM3, 0);
  if (gtf.volumenTotal != null && Math.abs(suma - gtf.volumenTotal) > 0.001) {
    avisos.push(
      `La suma de los productos (${suma.toFixed(3)} m³) no coincide con el total que declara la guía (${gtf.volumenTotal.toFixed(3)} m³).`,
    );
  }

  return { ok: true, ingresos, avisos, descuadres };
}
