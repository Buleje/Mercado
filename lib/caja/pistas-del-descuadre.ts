/**
 * lib/caja/pistas-del-descuadre.ts — «¿por qué no cuadra?» después de contar
 * (auditoría 15-10, M60, la parte de «explica este descuadre»).
 *
 * Compara el faltante o sobrante del último conteo con los movimientos que ese
 * conteo vio y propone causas con el movimiento que las respalda, para ir a
 * mirarlo. Son PISTAS: no corrigen nada; quien cuenta decide si cambia el
 * medio, anula o anota un ajuste. Reglas, sin IA: la misma diferencia da
 * siempre las mismas pistas.
 *
 * PURO y client-safe.
 */
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import type { MovimientoParaRevisar } from "@/lib/caja/cobros-para-revisar";

export interface PistaDelDescuadre {
  clave: string;
  texto: string;
  /** Por qué podría ser (va en la ⓘ). */
  detalle: string;
  /** Lo que se escribe en la búsqueda de Movimientos para llegar al movimiento. */
  buscar?: string;
}

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });
const BILLETES = [10, 20, 50, 100, 200];
const NO_COBRADO = new Set(["fiado", "credito", "crédito"]);
const TOPE_POR_TIPO = 3;

const nombreMedio = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

export function pistasDelDescuadre(
  e: {
    /** contado − esperado del conteo (negativo = faltante). */
    diferencia: number;
    /** Cuándo se contó: lo anotado después no pudo causar esa diferencia. */
    contadoEn: string;
    movimientos: ReadonlyArray<MovimientoParaRevisar>;
  },
  formato: (n: number) => string,
): PistaDelDescuadre[] {
  const monto = Math.round(Math.abs(e.diferencia) * 100) / 100;
  if (monto < 0.01) return [];
  const faltante = e.diferencia < 0;
  const igual = (a: number) => Math.abs(Math.abs(a) - monto) < 0.005;
  const vistos = e.movimientos
    .filter((m) => m.createdAt <= e.contadoEn && igual(Number(m.amount)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hora = (m: MovimientoParaRevisar) => HORA.format(new Date(m.createdAt));
  const out: PistaDelDescuadre[] = [];
  const agregar = (lista: MovimientoParaRevisar[], pista: (m: MovimientoParaRevisar) => Omit<PistaDelDescuadre, "clave" | "buscar">) => {
    for (const m of lista.slice(0, TOPE_POR_TIPO)) out.push({ clave: m.id, buscar: String(m.amount), ...pista(m) });
  };

  if (faltante) {
    agregar(
      vistos.filter((m) => m.type === "venta" && medioDeMovimiento(m.method) === "efectivo"),
      (m) => ({
        texto: `La venta en efectivo de ${formato(monto)} de las ${hora(m)}: ¿se pagó con Yape o tarjeta?`,
        detalle: "Si se cobró por otro medio y se anotó como efectivo, el cajón espera plata que nunca entró. Se corrige cambiándole el medio en Movimientos.",
      }),
    );
    agregar(
      vistos.filter((m) => m.type === "ingreso" && medioDeMovimiento(m.method) === "efectivo"),
      (m) => ({
        texto: `El ingreso de ${formato(monto)} de las ${hora(m)}: ¿entró de verdad al cajón?`,
        detalle: "Un ingreso anotado sin que la plata llegue al cajón (o anotado dos veces) sube lo esperado y deja un faltante del mismo monto.",
      }),
    );
  } else {
    agregar(
      vistos.filter((m) => m.type === "venta" && !["efectivo", ...NO_COBRADO].includes(medioDeMovimiento(m.method))),
      (m) => ({
        texto: `La venta por ${nombreMedio(medioDeMovimiento(m.method))} de ${formato(monto)} de las ${hora(m)}: ¿te la pagaron en efectivo?`,
        detalle: "Si el cliente pagó en efectivo y se anotó por otro medio, esa plata está en el cajón pero el esperado no la cuenta.",
      }),
    );
    agregar(
      vistos.filter((m) => m.type === "egreso" && medioDeMovimiento(m.method) === "efectivo"),
      (m) => ({
        texto: `El retiro de ${formato(monto)} de las ${hora(m)}: ¿salió de verdad la plata?`,
        detalle: "Un retiro anotado que no se llegó a sacar (o anotado dos veces) baja lo esperado y deja un sobrante del mismo monto.",
      }),
    );
  }

  if (out.length === 0 && BILLETES.includes(monto)) {
    out.push({
      clave: "billete",
      texto: `Justo un billete de ${formato(monto)}`,
      detalle: faltante
        ? "Suele ser un vuelto de más, un billete que quedó fuera del cajón o uno mal contado. Vuelve a contar esa denominación."
        : "Suele ser un vuelto de menos o un billete contado dos veces. Vuelve a contar esa denominación.",
    });
  } else if (out.length === 0 && monto < 1) {
    out.push({
      clave: "monedas",
      texto: `Menos de ${formato(1)}: monedas o redondeo del vuelto`,
      detalle: "Si pasa casi todos los días, conviene anotarlo como ajuste de redondeo en vez de buscarlo cada vez.",
    });
  }
  if (out.length === 0) {
    out.push({
      clave: "sin-anotar",
      texto: faltante ? "Ningún movimiento da justo ese monto: ¿un retiro o un pago que no se anotó?" : "Ningún movimiento da justo ese monto: ¿una venta o un ingreso que no se anotó?",
      detalle: faltante
        ? "Pagos a proveedores, vueltos grandes o plata que alguien sacó sin anotar. Pregúntale a quien atendió el turno."
        : "Una venta cobrada sin pasar por el sistema o un cambio que dejaron en el cajón.",
    });
  }
  return out;
}
