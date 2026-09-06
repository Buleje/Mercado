/**
 * directorio-desde-guias.ts — la libreta que ya está escrita en las guías.
 *
 * El Directorio (ADR-317) mostraba **0 proveedores, 0 destinatarios, 0
 * transportistas, 0 conductores y 0 vehículos** en un tenant con 17 guías
 * cargadas, todas con su titular, su destinatario y su chofer con DNI. Los datos
 * estaban; sólo vivían dentro de cada guía y había que volver a tipearlos.
 *
 * Este módulo los **descubre**. No los da de alta solo: propone, y el operador
 * decide. Dos motivos, los dos del patio:
 *
 * 1. Una guía trae el nombre como lo tipeó el emisor —«COMUNIDAD NATIVA SAN
 *    LUIS DE CHINCHIHUANI» hoy, «CC.NN. San Luis» mañana—. Dar de alta a ciegas
 *    llena la libreta de duplicados que después nadie limpia.
 * 2. El directorio es una libreta CURADA: se le agregan cuenta bancaria, tarifas
 *    y contacto. Un alta automática pisaría eso en la siguiente importación.
 *
 * PURO y client-safe.
 */

import type { RolParte } from "./directorio";

/** Un ingreso, en lo que este descubrimiento necesita de él. */
export interface GuiaConPartes {
  gtfNumber?: string | null;
  providerName?: string | null;
  providerDocument?: string | null;
  providerDocumentType?: string | null;
  /** El cuerpo de la guía (ADR-336): destinatario, transportista y vehículo. */
  gtfDatos?: unknown;
}

/** Alguien que aparece en las guías y todavía no está en la libreta. */
export interface CandidatoParte {
  /** Clave de deduplicación: el documento si lo hay, si no el nombre normalizado. */
  clave: string;
  nombre: string;
  docTipo: string | null;
  docNumero: string | null;
  roles: RolParte[];
  /** En cuántas guías aparece. Ordena: el que más se repite es el que más urge. */
  guias: number;
  /** Las primeras guías donde aparece — para que el operador lo reconozca. */
  ejemplos: string[];
}

export interface CandidatoVehiculo {
  placa: string;
  /** `terrestre` | `fluvial` — una chata no lleva placa. */
  modo: string | null;
  guias: number;
}

export interface DescubiertoEnGuias {
  partes: CandidatoParte[];
  vehiculos: CandidatoVehiculo[];
}

const MAX_EJEMPLOS = 3;

/** Sin tildes, sin dobles espacios y en mayúsculas: «Perez» y «PÉREZ  » son uno. */
export function normalizarNombre(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * La placa, sin la basura con que viene del papel.
 *
 * Las guías traen «V2H-901 /», «V2H-901 / -----» y «V2H-901»: la misma chata,
 * tres veces en la propuesta. El emisor escribe la placa y después el remolque,
 * y cuando no hay remolque deja el separador igual.
 *
 * Se corta en el primer `/` y se limpian los guiones sueltos. Si lo que queda no
 * parece una placa, se devuelve el texto normalizado tal cual — el dato del
 * documento no se pierde por no poder parsearlo.
 */
export function normalizarPlaca(v: string | null | undefined): string {
  const base = normalizarNombre((v ?? "").split("/")[0]);
  return base.replace(/^-+|-+$/g, "").trim();
}

/** La clave con la que se compara contra la libreta. El documento manda. */
export function claveDeParte(docNumero: string | null | undefined, nombre: string | null | undefined): string {
  const doc = (docNumero ?? "").replace(/\D/g, "");
  return doc ? `doc:${doc}` : `nom:${normalizarNombre(nombre)}`;
}

/** Lee `gtfDatos` sin confiar: es un blob que viene de afuera. */
function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

/**
 * Quiénes aparecen en las guías y no están todavía en la libreta.
 *
 * `yaEnDirectorio` son las claves que la libreta ya tiene: se pasan desde
 * afuera para que este módulo siga siendo puro y para no volver a proponer al
 * proveedor que se dio de alta hace un rato.
 */
export function descubrirEnGuias(
  guias: readonly GuiaConPartes[],
  yaEnDirectorio: ReadonlySet<string> = new Set(),
  placasEnDirectorio: ReadonlySet<string> = new Set(),
): DescubiertoEnGuias {
  const partes = new Map<string, CandidatoParte>();
  const vehiculos = new Map<string, CandidatoVehiculo>();

  const sumar = (
    rol: RolParte,
    nombre: string | null,
    docTipo: string | null,
    docNumero: string | null,
    gtf: string | null,
  ) => {
    if (!nombre) return;
    const clave = claveDeParte(docNumero, nombre);
    if (yaEnDirectorio.has(clave)) return;
    const fila =
      partes.get(clave) ??
      ({ clave, nombre, docTipo, docNumero, roles: [], guias: 0, ejemplos: [] } satisfies CandidatoParte);
    if (!fila.roles.includes(rol)) fila.roles.push(rol);
    /* El documento gana sobre el hueco: la misma persona puede venir con DNI en
       una guía y sin nada en otra, y la ficha sirve más completa. */
    if (!fila.docNumero && docNumero) {
      fila.docNumero = docNumero;
      fila.docTipo = docTipo;
    }
    fila.guias += 1;
    if (gtf && fila.ejemplos.length < MAX_EJEMPLOS && !fila.ejemplos.includes(gtf)) fila.ejemplos.push(gtf);
    partes.set(clave, fila);
  };

  for (const g of guias) {
    const gtf = texto(g.gtfNumber);
    sumar("proveedor", texto(g.providerName), texto(g.providerDocumentType), texto(g.providerDocument), gtf);

    const d = objeto(g.gtfDatos);
    if (!d) continue;

    const dest = objeto(d.destinatario);
    if (dest) {
      sumar("destinatario", texto(dest.nombre), texto(dest.docTipo), texto(dest.docNumero), gtf);
    }
    const trans = objeto(d.transportista);
    if (trans) {
      sumar("transportista", texto(trans.nombre), texto(trans.docTipo), texto(trans.docNumero), gtf);
    }
    const veh = objeto(d.vehiculo);
    if (veh) {
      /* El conductor va como PERSONA: es a quien el control le pide licencia, y
         su DNI está en el casillero (33). */
      sumar("conductor", texto(veh.conductor), "DNI", texto(veh.conductorDni), gtf);

      const modo = texto(veh.modo);
      // Por río la matrícula de la embarcación hace de placa (ADR-350).
      const placa = normalizarPlaca(modo === "fluvial" ? texto(veh.embarcacion) ?? texto(veh.placa) : texto(veh.placa));
      if (placa && !placasEnDirectorio.has(placa)) {
        const fila = vehiculos.get(placa) ?? { placa, modo, guias: 0 };
        fila.guias += 1;
        vehiculos.set(placa, fila);
      }
    }
  }

  const porFrecuencia = <T extends { guias: number }>(a: T, b: T) => b.guias - a.guias;
  return {
    partes: fundirPorNombre([...partes.values()]).sort(porFrecuencia),
    vehiculos: [...vehiculos.values()].sort(porFrecuencia),
  };
}

/**
 * Funde al que llegó SIN documento con el que llegó CON él, si se llaman igual.
 *
 * Pasa siempre: una guía trae el RUC del titular y la siguiente no. Sin esto, el
 * mismo proveedor aparecía dos veces en la propuesta —una con documento y otra
 * sin— y el operador daba de alta un duplicado creyendo que eran dos.
 *
 * Sólo funde con el nombre **exacto tras normalizar**. Dos personas distintas
 * pueden llamarse igual; por eso esto PROPONE y no da de alta: quien conoce a
 * su gente revisa la lista antes de apretar.
 */
function fundirPorNombre(filas: CandidatoParte[]): CandidatoParte[] {
  const conDoc = new Map<string, CandidatoParte>();
  for (const f of filas) {
    if (f.docNumero) conDoc.set(normalizarNombre(f.nombre), f);
  }
  if (conDoc.size === 0) return filas;

  const resultado: CandidatoParte[] = [];
  for (const f of filas) {
    const dueño = f.docNumero ? null : conDoc.get(normalizarNombre(f.nombre));
    if (!dueño) {
      resultado.push(f);
      continue;
    }
    dueño.guias += f.guias;
    for (const r of f.roles) if (!dueño.roles.includes(r)) dueño.roles.push(r);
    for (const e of f.ejemplos) {
      if (dueño.ejemplos.length < MAX_EJEMPLOS && !dueño.ejemplos.includes(e)) dueño.ejemplos.push(e);
    }
  }
  return resultado;
}
