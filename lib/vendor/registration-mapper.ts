import type { VendorApplicationSubmitInput } from "@/lib/db/vendor-applications.db";
import type {
  ApplicationStatus,
  VendorApplication,
  VendorCategory,
  VendorDistrict,
  VendorPlan,
} from "@/lib/generated/prisma/client";
import type { VendorRegistrationPayload } from "@/lib/validators/vendor-registration";

/**
 * Mapea los enum values del wizard (Spanish labels) a los enums de Prisma.
 * Los defaults cubren los casos "Otro" / "otros_ucayali" para que nunca
 * falle si el wizard ofrece opciones nuevas antes que el schema.
 */
const CATEGORY_MAP: Record<string, VendorCategory> = {
  Bodega: "bodega",
  Minimarket: "minimarket",
  "Carnicería": "carniceria",
  "Carniceria": "carniceria",
  "Frutería": "fruteria",
  "Fruteria": "fruteria",
  "Panadería": "panaderia",
  "Panaderia": "panaderia",
  "Licorería": "licoreria",
  "Licoreria": "licoreria",
  Farmacia: "farmacia",
  Bazar: "ferreteria", // fallback razonable
  Otro: "bodega",
};

const DISTRICT_MAP: Record<string, VendorDistrict> = {
  "Callería": "callerya",
  "Calleria": "callerya",
  Yarinacocha: "yarinacocha",
  Manantay: "manantay",
  "Campo Verde": "otros_ucayali",
  "Nueva Requena": "otros_ucayali",
  Iparia: "otros_ucayali",
  Masisea: "masisea",
  Otro: "otros_ucayali",
};

const PLAN_MAP: Record<string, VendorPlan> = {
  gratis: "free",
  pro: "pro",
};

/**
 * Toma un payload validado por el Zod del wizard y lo transforma al shape
 * que espera `VendorApplicationsDB.submit`.
 */
export function mapWizardToSubmitInput(
  payload: VendorRegistrationPayload,
): VendorApplicationSubmitInput {
  const { datosNegocio, contacto, verificacion, horariosDelivery, plan } =
    payload;

  const district =
    DISTRICT_MAP[datosNegocio.distrito] ?? "otros_ucayali";
  const category = CATEGORY_MAP[datosNegocio.categoria] ?? "bodega";
  const mappedPlan = PLAN_MAP[plan.plan] ?? "free";

  return {
    businessName: datosNegocio.nombreNegocio,
    ruc: datosNegocio.ruc,
    address: datosNegocio.direccion,
    district,
    category,
    contactName: contacto.responsableNombre,
    contactDni: contacto.responsableDni,
    // El wizard valida 9 digitos locales → agregamos prefijo +51.
    contactPhone: `+51${contacto.whatsapp}`,
    contactEmail: contacto.email,
    rucDocumentUrl: verificacion.fotoRucSubida ? "pending-upload" : null,
    storefrontPhotoUrl: verificacion.fotoFachadaSubida ? "pending-upload" : null,
    termsAcceptedAt: verificacion.aceptoTerminos ? new Date() : null,
    schedule: horariosDelivery.horarios,
    deliveryZones: horariosDelivery.zonasEntrega.map((d) =>
      DISTRICT_MAP[d] ?? "otros_ucayali",
    ),
    deliveryFeeSoles: horariosDelivery.tarifaDelivery,
    plan: mappedPlan,
  };
}

/**
 * Mapea una fila de VendorApplication (Prisma) al shape `VendorApplication`
 * que consume el componente de superadmin (VendorApplicationsModule).
 * Mantiene los strings en castellano / UI-friendly (status, category, etc).
 */
export interface SuperadminApplicationView {
  id: string;
  businessName: string;
  ownerName: string;
  ruc: string;
  phone: string;
  email: string;
  district: string;
  address: string;
  category: string;
  monthlyRevenue: string;
  productsCount: number;
  hasDelivery: boolean;
  hasPos: boolean;
  description: string;
  status: "pendiente" | "aprobada" | "rechazada" | "info_solicitada";
  submittedAt: string;
  reviewedAt?: string;
  rejectReason?: string;
  requestedInfo?: string;
}

const STATUS_UI_MAP: Record<
  ApplicationStatus,
  SuperadminApplicationView["status"]
> = {
  pending: "pendiente",
  under_review: "pendiente",
  info_requested: "info_solicitada",
  approved: "aprobada",
  tenant_provisioned: "aprobada",
  rejected: "rechazada",
};

const CATEGORY_UI_LABEL: Record<VendorCategory, string> = {
  bodega: "Bodega",
  minimarket: "Minimarket",
  carniceria: "Carnicería",
  fruteria: "Frutería",
  panaderia: "Panadería",
  licoreria: "Licorería",
  farmacia: "Farmacia",
  ferreteria: "Ferretería",
  restaurante_comida: "Restaurante y comida",
};

const DISTRICT_UI_LABEL: Record<VendorDistrict, string> = {
  callerya: "Callería",
  yarinacocha: "Yarinacocha",
  manantay: "Manantay",
  puerto_callao: "Puerto Callao",
  pucallpa_centro: "Pucallpa Centro",
  san_fernando: "San Fernando",
  masisea: "Masisea",
  otros_ucayali: "Otros (Ucayali)",
};

export function toSuperadminView(
  row: VendorApplication,
): SuperadminApplicationView {
  return {
    id: row.id,
    businessName: row.businessName,
    ownerName: row.contactName,
    ruc: row.ruc,
    phone: row.contactPhone,
    email: row.contactEmail,
    district: DISTRICT_UI_LABEL[row.district],
    address: row.address,
    category: CATEGORY_UI_LABEL[row.category],
    monthlyRevenue: "—",
    productsCount: 0,
    hasDelivery:
      Array.isArray(row.deliveryZones) && row.deliveryZones.length > 0,
    hasPos: false,
    description: "",
    status: STATUS_UI_MAP[row.status],
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.decidedAt ? row.decidedAt.toISOString() : undefined,
    rejectReason:
      row.status === "rejected" && row.decisionReason
        ? row.decisionReason
        : undefined,
    requestedInfo:
      row.status === "info_requested" && row.infoRequestNote
        ? row.infoRequestNote
        : undefined,
  };
}
