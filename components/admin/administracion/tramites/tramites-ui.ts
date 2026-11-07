/**
 * Cómo se dice y se pinta cada valor de un trámite (ADR-524). Los valores son
 * los del contrato (`lib/admin/fichas-tramites-alquileres.ts`); acá sólo van
 * las palabras y el tono de la insignia.
 */
import type {
  CanalTramite,
  EntidadTramite,
  EstadoRequisito,
  EstadoTramite,
  TramiteDto,
} from "@/lib/admin/fichas-tramites-alquileres";
import type { TonoInsignia } from "../comun/Insignia";

export const ENTIDAD_UI: Record<EntidadTramite, string> = {
  banco: "Banco",
  sunat: "SUNAT",
  sunarp: "SUNARP",
  municipalidad: "Municipalidad",
  notaria: "Notaría",
  reniec: "RENIEC",
  otra: "Otra entidad",
};

export const ESTADO_TRAMITE_UI: Record<EstadoTramite, { texto: string; tono: TonoInsignia }> = {
  preparando: { texto: "Preparando", tono: "pending" },
  enviado: { texto: "Enviado", tono: "info" },
  observado: { texto: "Observado", tono: "warning" },
  aprobado: { texto: "Aprobado", tono: "success" },
  rechazado: { texto: "Rechazado", tono: "error" },
  cerrado: { texto: "Cerrado", tono: "neutral" },
  desistido: { texto: "Desistido", tono: "neutral" },
};

/** Los que ya no esperan nada: no cuentan para «vencen pronto». */
export const ESTADOS_TERMINADOS: readonly EstadoTramite[] = ["aprobado", "rechazado", "cerrado", "desistido"];

export const CANAL_UI: Record<CanalTramite, string> = {
  presencial: "Presencial",
  correo: "Correo",
  web: "Página web",
  whatsapp: "WhatsApp",
  otro: "Otro",
};

export const REQUISITO_UI: Record<EstadoRequisito, { texto: string; tono: TonoInsignia }> = {
  hay: { texto: "Hay", tono: "success" },
  falta: { texto: "Falta", tono: "warning" },
  no_aplica: { texto: "No aplica", tono: "neutral" },
};

/**
 * Las plantillas que siembran requisitos (el servidor tiene la lista en
 * `lib/admin/tramites-plantillas.ts`; acá sólo el nombre y con qué se llena).
 */
export const PLANTILLAS_TRAMITE: readonly { id: string; texto: string; entidad: EntidadTramite; asunto: string; entidadNombre?: string }[] = [
  { id: "alquiler_banco", texto: "Alquiler de local a un banco", entidad: "banco", asunto: "Alquiler del local" },
  { id: "sunat_reactivar_ruc", texto: "Reactivar el RUC en SUNAT", entidad: "sunat", asunto: "Reactivar el RUC", entidadNombre: "SUNAT" },
  { id: "dni_renovar", texto: "Renovar el DNI", entidad: "reniec", asunto: "Renovar el DNI", entidadNombre: "RENIEC" },
  { id: "municipalidad_predial", texto: "Predial y licencia en la municipalidad", entidad: "municipalidad", asunto: "Impuesto predial / autovalúo" },
];

/** Quién: la ficha o el nombre escrito. */
export const personaDe = (t: TramiteDto): string => t.parteNombre ?? t.personaNombre ?? "";

/** «Agrobanco» o, si no se escribió el nombre, «Banco». */
export const entidadDe = (t: TramiteDto): string => t.entidadNombre?.trim() || ENTIDAD_UI[t.entidad];

/** «7 de 10 listos»: los que no aplican no cuentan en ninguno de los dos lados. */
export function textoConteo(c: TramiteDto["conteo"]): string {
  const total = c.hay + c.falta;
  if (total === 0) return c.noAplica > 0 ? "Nada pendiente" : "Sin requisitos";
  return `${c.hay} de ${total} ${total === 1 ? "listo" : "listos"}`;
}

/** La fecha más cercana que pide algo: el próximo paso o el vencimiento. */
export function proximaFecha(t: TramiteDto): string | null {
  const fechas = [t.proximoPasoEl, t.venceEl].filter((f): f is string => !!f).sort();
  return fechas[0] ?? null;
}
