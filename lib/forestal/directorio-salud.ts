/**
 * Qué tan lista está una ficha del Directorio, y qué le falta.
 *
 * Una ficha se carga apurado —en medio de una guía, con el camión esperando— y
 * se completa «después». El problema aparece más tarde: al emitir la GTF falta
 * el ubigeo del destinatario, o al pagarle a la comunidad nadie tiene la
 * cuenta. El modal pedía veinte campos todos al mismo peso, sin decir cuáles
 * hacen falta **para qué**.
 *
 * Acá se define lo que cada papel necesita y se calcula qué falta. No bloquea
 * nada: es una lista de pendientes, que es lo contrario de un formulario que
 * no deja guardar.
 */

import type { RolParte } from "./directorio";

export interface FichaParaSalud {
  roles?: readonly string[];
  nombre?: string | null;
  docTipo?: string | null;
  docNumero?: string | null;
  direccion?: string | null;
  region?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  ubigeo?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  representante?: string | null;
  representanteDni?: string | null;
  tituloHabilitante?: string | null;
  resolucion?: string | null;
  arffs?: string | null;
  registroMtc?: string | null;
  licencia?: string | null;
  banco?: string | null;
  cuentaNumero?: string | null;
  cuentaCci?: string | null;
  tituloVigenciaHasta?: string | Date | null;
  /** `contado` | `credito`; vacío = no se pactó (ADR-430: lo pide el cliente). */
  condicionPago?: string | null;
}

/**
 * Lo que la ficha tiene **alrededor** y no vive en sus campos.
 *
 * El título habilitante dejó de ser un campo de texto: desde ADR-425 los
 * permisos de un titular son filas (`ForestContrato` con `titularId`), cada una
 * con su área, su resolución y su vigencia. La ficha seguía reclamando el campo
 * viejo aunque abajo listara dos permisos vigentes — la barra decía 0 % con el
 * origen legal cargado, y una barra que miente se aprende a ignorar.
 *
 * Es opcional a propósito: quien no sepa nada de permisos llama igual que antes
 * y obtiene exactamente lo mismo.
 */
export interface ContextoDeFicha {
  /** Permisos del titular ya cargados (atados + los del alta que aún no tienen id). */
  permisos?: number;
}

export interface Pendiente {
  campo: string;
  /** Qué se rompe si falta. Lo que convierte un campo en una razón. */
  porque: string;
  /** `alto` = no se puede emitir el documento; `medio` = se puede, incompleto. */
  nivel: "alto" | "medio";
}

const lleno = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/** Un permiso cargado ya es el origen legal: el campo de texto pasa a ser copia. */
const tienePermisos = (ctx: ContextoDeFicha): boolean => (ctx.permisos ?? 0) > 0;

/**
 * Qué le falta a la ficha, según los papeles que cumple.
 *
 * Cada papel pide lo suyo: al **destinatario** la GTF le exige la dirección
 * completa (es el punto de llegada); al **transportista**, el registro MTC; al
 * **conductor**, la licencia; al **proveedor**, con qué título extrae.
 *
 * `ctx` dice qué tiene la ficha fuera de sus campos: hoy, sus permisos. Sin él
 * se comporta igual que siempre.
 */
export function pendientesDeFicha(f: FichaParaSalud, ctx: ContextoDeFicha = {}): Pendiente[] {
  const roles = (f.roles ?? []) as RolParte[];
  const p: Pendiente[] = [];

  if (!lleno(f.docNumero)) {
    p.push({ campo: "Documento", porque: "Sin RUC o DNI la parte no se puede cruzar con SUNAT ni con otra ficha", nivel: "alto" });
  }

  if (roles.includes("destinatario")) {
    if (!lleno(f.direccion)) p.push({ campo: "Dirección", porque: "Es el punto de llegada que imprime la GTF", nivel: "alto" });
    if (!lleno(f.distrito) || !lleno(f.provincia) || !lleno(f.region)) {
      p.push({ campo: "Departamento, provincia y distrito", porque: "La guía los imprime por separado", nivel: "alto" });
    }
    if (!lleno(f.ubigeo)) p.push({ campo: "Ubigeo", porque: "Se completa solo al elegir los tres de arriba", nivel: "medio" });
  }

  if (roles.includes("transportista") && !lleno(f.registroMtc)) {
    p.push({ campo: "Registro MTC", porque: "Es lo que pide el puesto de control a la empresa de transporte", nivel: "alto" });
  }

  if (roles.includes("conductor") && !lleno(f.licencia)) {
    p.push({ campo: "Licencia de conducir", porque: "Sin licencia el control detiene el camión", nivel: "alto" });
  }

  if (roles.includes("proveedor")) {
    /* El origen legal puede estar en el campo viejo O en sus permisos: con uno
       solo cargado, el dato existe y reclamarlo de nuevo es ruido. El orden y
       el peso de los demás pendientes no cambian. */
    if (!lleno(f.tituloHabilitante) && !tienePermisos(ctx)) {
      p.push({ campo: "Título habilitante", porque: "Es el origen legal de la madera que te vende", nivel: "alto" });
    }
    if (!lleno(f.representante)) {
      p.push({ campo: "Representante legal", porque: "Es quien firma el contrato y la guía", nivel: "medio" });
    }
    if (!lleno(f.banco) && !lleno(f.cuentaCci) && !lleno(f.cuentaNumero)) {
      p.push({ campo: "Cuenta para pagarle", porque: "Sin esto, cada pago vuelve a pedir el número por chat", nivel: "medio" });
    }
  }

  /* Al cliente se le cobra (ADR-430): sin pactar contado o crédito, su cargo no
     deja una fecha que vigilar. Sin pactar NO es contado (ver
     `textoCondicionPago`), así que se reclama en vez de suponerlo. Nivel medio:
     se le puede cobrar igual. */
  if (roles.includes("cliente") && !f.condicionPago) {
    p.push({ campo: "Condición de pago", porque: "Contado o crédito decide si su cargo deja una fecha de pago que vigilar", nivel: "medio" });
  }

  if (!lleno(f.telefono) && !lleno(f.whatsapp)) {
    p.push({ campo: "Teléfono o WhatsApp", porque: "Es como se resuelve un problema de guía sin viajar", nivel: "medio" });
  }

  return p;
}

/** De 0 a 100, cuánto de lo que esta ficha necesita ya está cargado. */
export function completitud(f: FichaParaSalud, ctx: ContextoDeFicha = {}): number {
  const faltan = pendientesDeFicha(f, ctx);
  // El total se calcula sobre una ficha vacía con los mismos roles: así el
  // porcentaje mide contra lo que ESTA ficha necesita, no contra un ideal fijo.
  // A propósito **sin** `ctx`: el título habilitante sigue siendo un requisito
  // del proveedor, sólo que un permiso lo cubre. Si el denominador también
  // encogiera, atar un permiso dejaría la barra igual —el mismo 0 %— y el
  // operador no vería el efecto de lo que acaba de cargar.
  const total = pendientesDeFicha({ roles: f.roles }).length;
  if (total === 0) return 100;
  const resueltos = Math.max(0, total - faltan.length);
  return Math.round((resueltos / total) * 100);
}

/**
 * Por qué el título habilitante ya no se reclama.
 *
 * Sacar un pendiente en silencio es tan confuso como reclamarlo de más: el
 * operador que cargó el título en el campo viejo tiene que entender por qué la
 * ficha dejó de pedirlo. Devuelve `null` cuando no aplica.
 */
export function tituloCubiertoPorPermisos(f: FichaParaSalud, ctx: ContextoDeFicha = {}): string | null {
  const roles = (f.roles ?? []) as RolParte[];
  if (!roles.includes("proveedor")) return null;
  if (lleno(f.tituloHabilitante) || !tienePermisos(ctx)) return null;
  const n = ctx.permisos ?? 0;
  return `El origen legal está en sus permisos: ${n} cargado${n === 1 ? "" : "s"} acá abajo, con su área y su vigencia.`;
}

// ─── CCI: 20 dígitos ───────────────────────────────────────────────────────

/**
 * El Código de Cuenta Interbancario peruano tiene **20 dígitos**: 3 de banco,
 * 3 de oficina, 12 de cuenta y 2 de control. Acá se valida el largo y que sean
 * dígitos — el par de control depende del banco y no hay un algoritmo público
 * único, así que **no se inventa** una validación que rechace cuentas buenas.
 */
export function motivoCciInvalido(cci: string | null | undefined): string | null {
  const n = (cci ?? "").replace(/\D/g, "");
  if (!n) return null;
  if (n.length !== 20) return `El CCI tiene 20 dígitos; escribiste ${n.length}.`;
  return null;
}

/** Formatea un CCI en bloques legibles, como lo imprime el banco. */
export function formatearCci(cci: string | null | undefined): string {
  const n = (cci ?? "").replace(/\D/g, "");
  if (n.length !== 20) return cci ?? "";
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 18)}-${n.slice(18)}`;
}

// ─── Vigencia del título del proveedor ─────────────────────────────────────

export interface EstadoTitulo {
  nivel: "vigente" | "por_vencer" | "vencido" | "sin_dato";
  texto: string;
  tono: "ok" | "warn" | "danger" | "neutral";
}

/** Con menos de esto por delante, conviene pedir la renovación antes de comprar. */
export const DIAS_AVISO_TITULO = 60;

/**
 * Comprarle madera a un proveedor con el título vencido invalida la GTF que se
 * emita con esa madera. Es un dato de riesgo, no de contacto.
 */
export function estadoTitulo(
  hasta: string | Date | null | undefined,
  hoy: Date = new Date(),
): EstadoTitulo {
  if (!hasta) return { nivel: "sin_dato", texto: "Sin vigencia cargada", tono: "neutral" };
  const f = new Date(hasta);
  if (Number.isNaN(f.getTime())) return { nivel: "sin_dato", texto: "Fecha ilegible", tono: "neutral" };

  const dia = 86_400_000;
  const finUTC = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const dias = Math.round((finUTC - hoyUTC) / dia);

  if (dias < 0) {
    return {
      nivel: "vencido",
      texto: `Título vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"} — su GTF no ampara`,
      tono: "danger",
    };
  }
  if (dias <= DIAS_AVISO_TITULO) {
    return { nivel: "por_vencer", texto: `Su título vence en ${dias} día${dias === 1 ? "" : "s"}`, tono: "warn" };
  }
  return { nivel: "vigente", texto: `Título vigente · ${dias} días`, tono: "ok" };
}
