/**
 * «Datos listos» del grupo que se lleva al cubicador (ADR-519, fase 0).
 *
 * Un bloque sólo se arma si sus trozas llegaron (guía recibida) y tienen
 * permiso (`motivoNoElegible`, T1). Acá se cuenta, ANTES de llevar, qué guías
 * faltan recibir y qué guías/trozas no tienen permiso, para arreglarlo con los
 * modales que ya existen. Puro: la misma cuenta sirve de paso 0 del recorrido.
 */
import type { TrozaConsumible } from "./consumo-trozas";

const txt = (v: unknown) => String(v ?? "").trim();
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export interface FaltanteDelGrupo {
  trozas: number;
  m3: number;
  /** N.º de guía de cada una, sin repetir y ordenados. */
  guias: string[];
}

export interface DatosListosDelGrupo {
  /** Trozas del grupo que se pudieron leer en el patio. */
  trozas: number;
  /** Guía sin recepción: sus trozas están «por recepcionar». */
  sinRecepcion: FaltanteDelGrupo;
  /** Troza sin permiso (y su guía): el bloque no sabe de qué título sale. */
  sinPermiso: FaltanteDelGrupo;
  /** Ids pedidos que el patio ya no trae (consumidas, otro período): se dicen, no se ocultan. */
  noEncontradas: number;
  listo: boolean;
}

const vacio = (): FaltanteDelGrupo => ({ trozas: 0, m3: 0, guias: [] });

function sumar(f: FaltanteDelGrupo, t: TrozaConsumible, guias: Set<string>): void {
  f.trozas += 1;
  f.m3 += Number(t.volumenM3) || 0;
  const g = txt(t.gtfNumber);
  if (g) guias.add(g);
}

function cerrar(f: FaltanteDelGrupo, guias: Set<string>): FaltanteDelGrupo {
  return { trozas: f.trozas, m3: r4(f.m3), guias: [...guias].sort((a, b) => a.localeCompare(b, "es-PE", { numeric: true })) };
}

/** `trozaIds` del grupo contra el patio: qué le falta antes de poder llevarse. */
export function datosListosDelGrupo(
  trozaIds: readonly string[],
  patio: readonly TrozaConsumible[],
): DatosListosDelGrupo {
  const pedidos = new Set(trozaIds);
  const rec = vacio();
  const per = vacio();
  const gRec = new Set<string>();
  const gPer = new Set<string>();
  let trozas = 0;
  for (const t of patio) {
    if (!pedidos.has(t.id)) continue;
    trozas += 1;
    if (t.guiaRecepcionada === false) sumar(rec, t, gRec);
    if (!txt(t.permiso)) sumar(per, t, gPer);
  }
  const sinRecepcion = cerrar(rec, gRec);
  const sinPermiso = cerrar(per, gPer);
  return {
    trozas,
    sinRecepcion,
    sinPermiso,
    noEncontradas: Math.max(0, pedidos.size - trozas),
    listo: sinRecepcion.trozas === 0 && sinPermiso.trozas === 0,
  };
}
