/**
 * Los datos del viaje que se repiten de un camión al siguiente (Brandon 28-10,
 * modal «Guardar cubicación»): «Igual que la anterior» copia lugar, quién
 * cubicó, placa, chofer y transportista de la última guardada, y al elegir una
 * placa vuelven el chofer y el transportista de la última vez que vino.
 *
 * Nunca pisa: sólo llena lo que está vacío (lo escrito a mano manda). Medido en
 * Blas el 28-10: 0 de 3 guardadas tenían esos datos, por eso se ofrecen de un
 * toque en vez de pedirlos otra vez.
 */
import { normalizarPlaca, type Vehiculo } from "./directorio";
import type { CubicacionRegistro, FichaCubicacion } from "./cubicacion-registro";

export const CAMPOS_DEL_VIAJE = ["lugar", "cubicadoPor", "placa", "chofer", "transportista"] as const;
export type CampoDelViaje = (typeof CAMPOS_DEL_VIAJE)[number];
export type DatosDelViaje = Partial<Pick<FichaCubicacion, CampoDelViaje>>;

export const NOMBRE_DEL_CAMPO: Record<CampoDelViaje, string> = {
  lugar: "lugar", cubicadoPor: "quién cubicó", placa: "placa", chofer: "chofer", transportista: "transportista",
};

type Guardada = Pick<CubicacionRegistro, "nombre" | "fecha" | "updatedAt" | "ficha">;

const recientePrimero = (a: Guardada, b: Guardada) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

function delViaje(f: FichaCubicacion | undefined, campos: readonly CampoDelViaje[] = CAMPOS_DEL_VIAJE): DatosDelViaje {
  const out: DatosDelViaje = {};
  for (const k of campos) {
    const v = f?.[k]?.trim();
    if (v) out[k] = v;
  }
  return out;
}

/** La última guardada (por la que se está actualizando no: sería copiarse a sí misma) que tenga algún dato del viaje. */
export function viajeAnterior(lista: readonly Guardada[], sinNombre?: string | null): { nombre: string; fecha: string; datos: DatosDelViaje } | null {
  for (const c of [...lista].sort(recientePrimero)) {
    if (sinNombre && c.nombre === sinNombre) continue;
    const datos = delViaje(c.ficha);
    if (Object.keys(datos).length > 0) return { nombre: c.nombre, fecha: c.fecha, datos };
  }
  return null;
}

/**
 * El chofer y el transportista de ESA placa («abc 123» = «ABC-123»): primero
 * los de la última guardada con esa placa; el transportista que falte, el de
 * su ficha del Directorio; y si ese transportista también maneja (el
 * dueño-chofer), él es el chofer.
 */
export function viajeDeLaPlaca(
  lista: readonly Guardada[],
  placa: string,
  vehiculos: readonly Pick<Vehiculo, "placa" | "transportistaNombre">[] = [],
  choferes: readonly string[] = [],
): DatosDelViaje {
  const k = normalizarPlaca(placa);
  if (!k) return {};
  const vino = [...lista].sort(recientePrimero).find((c) => normalizarPlaca(c.ficha?.placa ?? "") === k && Object.keys(delViaje(c.ficha, ["chofer", "transportista"])).length > 0);
  const out = delViaje(vino?.ficha, ["chofer", "transportista"]);
  const delDirectorio = vehiculos.find((v) => normalizarPlaca(v.placa) === k)?.transportistaNombre?.trim();
  if (!out.transportista && delDirectorio) out.transportista = delDirectorio;
  if (!out.chofer && out.transportista && choferes.includes(out.transportista)) out.chofer = out.transportista;
  return out;
}

/** Lo de `datos` sólo donde la ficha está vacía. `puestos` = qué se llenó (vacío = nada que hacer). */
export function completarVacios(ficha: FichaCubicacion, datos: DatosDelViaje): { ficha: FichaCubicacion; puestos: CampoDelViaje[] } {
  const puestos = CAMPOS_DEL_VIAJE.filter((k) => !!datos[k] && !ficha[k]?.trim());
  if (puestos.length === 0) return { ficha, puestos };
  const nueva: FichaCubicacion = { ...ficha };
  for (const k of puestos) nueva[k] = datos[k];
  return { ficha: nueva, puestos };
}
