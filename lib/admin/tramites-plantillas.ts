/**
 * tramites-plantillas — requisitos de partida para los trámites que se repiten
 * (ADR-524). `POST /api/admin/tramites` con `plantilla` siembra estos
 * requisitos en «falta»; después cada uno se marca o se borra en la ficha.
 *
 * Estáticas y sin schema: son una ayuda para no olvidar papeles, no la norma
 * de cada entidad (la entidad pide lo que pide ese día: se edita en el trámite).
 * Ningún requisito pide anotar una clave: la clave SOL nunca va al panel.
 */
import type { EntidadTramite } from "@/lib/admin/fichas-tramites-alquileres";

export interface PlantillaTramite {
  clave: string;
  titulo: string;
  entidad: EntidadTramite;
  asunto: string;
  requisitos: readonly string[];
}

export const PLANTILLAS_TRAMITE = [
  {
    clave: "alquiler_banco",
    titulo: "Alquilar un local a un banco",
    entidad: "banco",
    asunto: "Alquiler de local al banco",
    requisitos: [
      "DNI vigente del dueño",
      "Ficha RUC del dueño",
      "Partida registral SUNARP (copia literal)",
      "HR y PU del autovalúo",
      "Recibo de luz o agua del local",
      "Cuenta CCI del dueño",
      "Contrato firmado",
    ],
  },
  {
    clave: "sunat_reactivar_ruc",
    titulo: "Reactivar el RUC en SUNAT",
    entidad: "sunat",
    asunto: "Reactivar RUC",
    requisitos: [
      "DNI original vigente",
      "Recibo de luz o agua del domicilio fiscal",
      "Turno en el centro de servicios SUNAT (presencial)",
      "Formulario de reactivación o actualización de datos",
      "Ficha RUC actualizada (después de reactivar)",
    ],
  },
  {
    clave: "dni_renovar",
    titulo: "Renovar el DNI en RENIEC",
    entidad: "reniec",
    asunto: "Renovar DNI",
    requisitos: [
      "DNI anterior (o denuncia si se perdió)",
      "Pago de la tasa (Banco de la Nación o Págalo.pe)",
      "Cita en RENIEC o trámite en línea",
      "Foto (la toman en la agencia o se sube en línea)",
      "Recoger el DNI nuevo",
    ],
  },
  {
    clave: "municipalidad_predial",
    titulo: "Impuesto predial y arbitrios",
    entidad: "municipalidad",
    asunto: "Impuesto predial y arbitrios",
    requisitos: [
      "Declaración jurada HR (hoja de resumen)",
      "PU (predio urbano) del inmueble",
      "Recibo del impuesto predial del año",
      "Recibo de arbitrios del año",
      "DNI del propietario",
      "Título o partida del inmueble",
    ],
  },
] as const satisfies readonly PlantillaTramite[];

export type ClavePlantillaTramite = (typeof PLANTILLAS_TRAMITE)[number]["clave"];

export const CLAVES_PLANTILLA_TRAMITE = PLANTILLAS_TRAMITE.map((p) => p.clave) as [
  ClavePlantillaTramite,
  ...ClavePlantillaTramite[],
];

export function plantillaTramite(clave: string): PlantillaTramite | null {
  return PLANTILLAS_TRAMITE.find((p) => p.clave === clave) ?? null;
}
