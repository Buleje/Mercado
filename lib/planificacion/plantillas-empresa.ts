/**
 * Las licencias y papeles típicos por rubro (ADR-497): el botón «Agregar las
 * típicas» de Planificación › Empresa › Licencias. Entran como pendientes y
 * sin fechas; sólo se agregan las que todavía no están (por nombre).
 *
 * Sin números de norma ni plazos: cambian por municipalidad y por año, y el
 * plan no los confirma. Cada nota dice con quién confirmar.
 */
import type { DatosSeccion } from "./secciones";

export type RubroPlantilla = "bodega" | "restaurante" | "forestal" | "belleza";

export interface PlantillaLicencia {
  nombre: string;
  entidad: string;
  nota: string;
}

export const RUBROS_PLANTILLA: { id: RubroPlantilla; rotulo: string; detalle: string }[] = [
  { id: "bodega", rotulo: "Bodega o comercio", detalle: "RUC, licencia municipal, Defensa Civil, libro de reclamaciones…" },
  { id: "restaurante", rotulo: "Restaurante o comida", detalle: "Lo de un comercio más carné de sanidad y fumigación" },
  { id: "forestal", rotulo: "Forestal o aserradero", detalle: "Lo de un comercio más los papeles de SERFOR y OSINFOR" },
  { id: "belleza", rotulo: "Belleza o cosméticos", detalle: "Lo de un comercio más sanidad y notificación de cosméticos" },
];

const BASE: PlantillaLicencia[] = [
  { nombre: "RUC", entidad: "SUNAT", nota: "No vence: mantenlo activo y habido. Anota el número de tu ficha RUC." },
  {
    nombre: "Licencia municipal de funcionamiento",
    entidad: "Municipalidad",
    nota: "Confirma con tu municipalidad si es indeterminada o si pide renovación, y qué giros cubre.",
  },
  {
    nombre: "Certificado de Defensa Civil (ITSE)",
    entidad: "Municipalidad",
    nota: "Inspección técnica de seguridad del local. La vigencia la fija tu municipalidad: confírmala.",
  },
  {
    nombre: "Libro de reclamaciones",
    entidad: "INDECOPI",
    nota: "Físico o virtual y con su aviso a la vista del cliente. Confirma el formato en INDECOPI.",
  },
  {
    nombre: "Autorización de anuncio (letrero)",
    entidad: "Municipalidad",
    nota: "Sólo si tienes letrero o aviso en la fachada. Confirma con tu municipalidad.",
  },
  {
    nombre: "Registro de marca",
    entidad: "INDECOPI",
    nota: "Opcional: protege tu nombre y tu logo para que otro no los use.",
  },
];

const SANIDAD: PlantillaLicencia = {
  nombre: "Carné de sanidad del personal",
  entidad: "Municipalidad",
  nota: "Para cada persona que atiende o manipula alimentos o clientes. Confirma con tu municipalidad si lo piden y cada cuánto.",
};

const FUMIGACION: PlantillaLicencia = {
  nombre: "Constancia de fumigación y desinfección",
  entidad: "Empresa autorizada",
  nota: "La da una empresa de saneamiento autorizada. Confirma con tu municipalidad cada cuánto la piden.",
};

const POR_RUBRO: Record<RubroPlantilla, PlantillaLicencia[]> = {
  bodega: [...BASE, { ...SANIDAD, nota: `Si vendes alimentos. ${SANIDAD.nota}` }],
  restaurante: [
    ...BASE,
    SANIDAD,
    FUMIGACION,
    {
      nombre: "Autorización sanitaria de alimentos",
      entidad: "DIGESA",
      nota: "Sólo si fabricas, envasas o vendes con marca propia. Confirma en DIGESA si te corresponde.",
    },
  ],
  forestal: [
    ...BASE,
    {
      nombre: "Título habilitante o permiso forestal",
      entidad: "Autoridad forestal regional / SERFOR",
      nota: "El permiso, concesión o autorización de donde sale la madera. Confirma el tipo y la vigencia con tu autoridad forestal.",
    },
    {
      nombre: "Registro del centro de transformación",
      entidad: "Autoridad forestal regional / SERFOR",
      nota: "Para aserraderos y depósitos. Confirma con tu autoridad forestal qué registro te corresponde.",
    },
    {
      nombre: "Libro de operaciones",
      entidad: "Autoridad forestal regional / SERFOR",
      nota: "El libro donde anotas ingresos, producción y salidas de madera. Confirma con tu autoridad forestal cómo se lleva.",
    },
    {
      nombre: "Actas de supervisión",
      entidad: "OSINFOR",
      nota: "No es una licencia: guarda aquí las actas de las supervisiones a tus títulos habilitantes.",
    },
    {
      nombre: "Instrumento de gestión ambiental",
      entidad: "Por confirmar",
      nota: "Según la actividad puede pedirse uno. Confirma con la autoridad ambiental que te corresponde.",
    },
  ],
  belleza: [
    ...BASE,
    SANIDAD,
    FUMIGACION,
    {
      nombre: "Notificación sanitaria de cosméticos",
      entidad: "DIGEMID",
      nota: "Los cosméticos que vendes deben tenerla. Si sólo revendes, la tiene el fabricante o importador; si importas o fabricas, la tramitas tú. Confírmalo en DIGEMID.",
    },
  ],
};

/** Nombre sin tildes, mayúsculas ni espacios de más: «Libro de Reclamaciones » = «libro de reclamaciones». */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function plantillasDe(rubro: RubroPlantilla): PlantillaLicencia[] {
  return POR_RUBRO[rubro];
}

type Licencia = DatosSeccion<"licencias">["items"][number];

/**
 * Las típicas del rubro que todavía no están en la lista, ya como licencias
 * pendientes (sin número ni fechas). `crearId` es `nuevoId` del hook.
 */
export function licenciasQueFaltan(actuales: readonly Licencia[], rubro: RubroPlantilla, crearId: () => string): Licencia[] {
  const ya = new Set(actuales.map((l) => normalizarNombre(l.nombre)));
  return plantillasDe(rubro)
    .filter((p) => !ya.has(normalizarNombre(p.nombre)))
    .map((p) => ({
      id: crearId(),
      nombre: p.nombre,
      entidad: p.entidad,
      numero: "",
      emitida: "",
      vence: "",
      tramitada: false,
      nota: p.nota,
      archivoUrl: "",
    }));
}
