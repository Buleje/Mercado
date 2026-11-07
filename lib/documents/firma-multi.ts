/**
 * firma-multi — varios firmantes, en orden, cada uno con su enlace.
 *
 * La firma que ya existía servía para una persona: se mandaba el link y quien
 * lo recibía firmaba. Un contrato de alquiler necesita dos, y un acta de
 * directorio, cinco — y muchas veces importa el ORDEN (el gerente firma
 * después del jefe de área, no antes).
 *
 * Acá vive la máquina de estados: quién puede firmar ahora, qué pasa cuando
 * alguien firma o rechaza, y cuándo la ronda está terminada. Es un módulo puro
 * —sin red ni base de datos— porque estas reglas son las que no pueden fallar:
 * habilitar al firmante equivocado invalida el documento.
 *
 * El estado vive en `ocrMetadata.firmaRonda` del documento, igual que el
 * trail de aprobación: sin migración y viajando con el documento.
 */

export type EstadoFirmante = "pendiente" | "firmado" | "rechazado";

export interface Firmante {
  /** Identificador estable dentro de la ronda. */
  id: string;
  nombre: string;
  /** Para avisarle: al menos uno de los dos. */
  telefono?: string | null;
  email?: string | null;
  /** Qué firma (Gerente, Arrendatario…). Sale en el sello del PDF. */
  cargo?: string | null;
  /** 1, 2, 3… El orden en que les toca. */
  orden: number;
  estado: EstadoFirmante;
  /** Token del enlace personal. Se crea al empezar la ronda. */
  token?: string | null;
  firmadoEn?: string | null;
  /** Por qué lo rechazó, si lo rechazó. */
  motivo?: string | null;
}

export interface Ronda {
  firmantes: Firmante[];
  /** `false` = todos pueden firmar cuando quieran. */
  enOrden: boolean;
  creadaPor: string;
  creadaEn: string;
  /** Se sella cuando firma el último. */
  completadaEn?: string | null;
  /** Si alguien rechaza, la ronda se frena acá. */
  frenadaPor?: string | null;
}

export type EstadoRonda = "sin-ronda" | "en-curso" | "completada" | "frenada";

/** En qué anda la ronda, mirando a los firmantes. */
export function estadoDeRonda(ronda: Ronda | null | undefined): EstadoRonda {
  if (!ronda || ronda.firmantes.length === 0) return "sin-ronda";
  if (ronda.firmantes.some((f) => f.estado === "rechazado")) return "frenada";
  if (ronda.firmantes.every((f) => f.estado === "firmado")) return "completada";
  return "en-curso";
}

/** Los firmantes ordenados como corresponde (por `orden`, y luego por nombre). */
export function enSecuencia(firmantes: Firmante[]): Firmante[] {
  return [...firmantes].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/**
 * ¿A quién le toca ahora?
 *
 * Con orden: el primero que falta, y sólo ese. Sin orden: todos los que no
 * firmaron todavía. Si la ronda está frenada o terminada, nadie.
 */
export function turnoDe(ronda: Ronda | null | undefined): Firmante[] {
  if (!ronda) return [];
  const estado = estadoDeRonda(ronda);
  if (estado !== "en-curso") return [];
  const pendientes = enSecuencia(ronda.firmantes).filter((f) => f.estado === "pendiente");
  if (!ronda.enOrden) return pendientes;
  return pendientes.length ? [pendientes[0]] : [];
}

/** ¿Este firmante puede firmar en este momento? */
export function puedeFirmar(ronda: Ronda | null | undefined, firmanteId: string): boolean {
  return turnoDe(ronda).some((f) => f.id === firmanteId);
}

/** El firmante al que pertenece un token (o null). */
export function firmantePorToken(ronda: Ronda | null | undefined, token: string): Firmante | null {
  if (!ronda || !token) return null;
  return ronda.firmantes.find((f) => f.token === token) ?? null;
}

export interface ResultadoFirma {
  ronda: Ronda;
  /** Qué cambió, para decirlo en pantalla y en el aviso. */
  evento: "firmado" | "rechazado";
  /** A quién hay que avisarle ahora (vacío si terminó o se frenó). */
  siguientes: Firmante[];
  completada: boolean;
}

/**
 * Registra que alguien firmó. Devuelve la ronda nueva (no muta la anterior).
 *
 * Lanza si no era su turno: es la regla que sostiene todo. Un documento donde
 * el segundo firmó antes que el primero no vale, y el error tiene que salir
 * acá y no descubrirse después.
 */
export function registrarFirma(ronda: Ronda, firmanteId: string, cuando = new Date().toISOString()): ResultadoFirma {
  if (!puedeFirmar(ronda, firmanteId)) {
    const f = ronda.firmantes.find((x) => x.id === firmanteId);
    if (!f) throw new Error("Ese firmante no es de esta ronda.");
    if (f.estado === "firmado") throw new Error("Ese firmante ya había firmado.");
    if (f.estado === "rechazado") throw new Error("Ese firmante rechazó el documento.");
    throw new Error("Todavía no es su turno de firmar.");
  }

  const firmantes = ronda.firmantes.map((f) =>
    f.id === firmanteId ? { ...f, estado: "firmado" as const, firmadoEn: cuando } : f,
  );
  const nueva: Ronda = { ...ronda, firmantes };
  const completada = firmantes.every((f) => f.estado === "firmado");
  if (completada) nueva.completadaEn = cuando;

  return { ronda: nueva, evento: "firmado", siguientes: turnoDe(nueva), completada };
}

/** Registra un rechazo: la ronda se frena y nadie más firma. */
export function registrarRechazo(ronda: Ronda, firmanteId: string, motivo?: string, cuando = new Date().toISOString()): ResultadoFirma {
  if (!puedeFirmar(ronda, firmanteId)) throw new Error("Ese firmante no puede rechazar en este momento.");
  const firmantes = ronda.firmantes.map((f) =>
    f.id === firmanteId ? { ...f, estado: "rechazado" as const, motivo: motivo ?? null, firmadoEn: cuando } : f,
  );
  const nueva: Ronda = { ...ronda, firmantes, frenadaPor: firmanteId };
  return { ronda: nueva, evento: "rechazado", siguientes: [], completada: false };
}

/** Cuánto falta, para mostrarlo sin hacer cuentas en la vista. */
export function progreso(ronda: Ronda | null | undefined): { firmados: number; total: number; porcentaje: number } {
  const total = ronda?.firmantes.length ?? 0;
  const firmados = ronda?.firmantes.filter((f) => f.estado === "firmado").length ?? 0;
  return { firmados, total, porcentaje: total ? Math.round((firmados / total) * 100) : 0 };
}

/** Arma una ronda nueva a partir de lo que se cargó en el formulario. */
export function crearRonda(
  entradas: { nombre: string; telefono?: string | null; email?: string | null; cargo?: string | null }[],
  opts: { enOrden: boolean; creadaPor: string; ahora?: string; idDe?: (i: number) => string },
): Ronda {
  const ahora = opts.ahora ?? new Date().toISOString();
  const idDe = opts.idDe ?? ((i: number) => `f${i + 1}`);
  return {
    enOrden: opts.enOrden,
    creadaPor: opts.creadaPor,
    creadaEn: ahora,
    firmantes: entradas.map((e, i) => ({
      id: idDe(i),
      nombre: e.nombre.trim(),
      telefono: e.telefono?.trim() || null,
      email: e.email?.trim() || null,
      cargo: e.cargo?.trim() || null,
      orden: i + 1,
      estado: "pendiente",
      token: null,
      firmadoEn: null,
    })),
  };
}
