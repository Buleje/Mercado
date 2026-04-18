/**
 * scripts/backfill-vendor-applications.ts
 *
 * Inserta las 5 aplicaciones que estaban hardcodeadas en
 * `components/superadmin/VendorApplicationsModule.tsx` como filas reales
 * en la tabla vendor_applications. Util para seed / smoke-tests del
 * workflow ADR-079.
 *
 * Uso:
 *   npx tsx scripts/backfill-vendor-applications.ts
 *   # o
 *   node --loader tsx scripts/backfill-vendor-applications.ts
 *
 * Idempotente: usa `upsert` por RUC. Safe de correr N veces.
 */

import { prisma } from "@/lib/prisma";

type SeedApp = {
  ruc: string;
  businessName: string;
  address: string;
  district:
    | "callerya"
    | "yarinacocha"
    | "manantay"
    | "puerto_callao"
    | "pucallpa_centro"
    | "san_fernando"
    | "masisea"
    | "otros_ucayali";
  category:
    | "bodega"
    | "minimarket"
    | "carniceria"
    | "fruteria"
    | "panaderia"
    | "licoreria"
    | "farmacia"
    | "ferreteria"
    | "restaurante_comida";
  contactName: string;
  contactDni: string;
  contactPhone: string;
  contactEmail: string;
  plan: "free" | "pro";
  status:
    | "pending"
    | "under_review"
    | "info_requested"
    | "approved"
    | "tenant_provisioned"
    | "rejected";
  decisionReason?: string;
  infoRequestNote?: string;
  submittedAt: Date;
  decidedAt?: Date;
};

const DEFAULT_SCHEDULE = {
  mon: { open: "07:00", close: "21:00", enabled: true },
  tue: { open: "07:00", close: "21:00", enabled: true },
  wed: { open: "07:00", close: "21:00", enabled: true },
  thu: { open: "07:00", close: "21:00", enabled: true },
  fri: { open: "07:00", close: "21:00", enabled: true },
  sat: { open: "07:00", close: "21:00", enabled: true },
  sun: { open: "09:00", close: "13:00", enabled: false },
};

const SEED: SeedApp[] = [
  {
    ruc: "20123456789",
    businessName: "Bodega El Sol",
    address: "Jr. Los Incas 234",
    district: "yarinacocha",
    category: "bodega",
    contactName: "Carlos Torres",
    contactDni: "45678912",
    contactPhone: "+51987654321",
    contactEmail: "carlos@elsol.pe",
    plan: "free",
    status: "pending",
    submittedAt: new Date("2026-04-15T10:00:00Z"),
  },
  {
    ruc: "20234567890",
    businessName: "Panadería La Espiga Dorada",
    address: "Av. Pucallpa 567",
    district: "callerya",
    category: "panaderia",
    contactName: "María Quispe",
    contactDni: "56789123",
    contactPhone: "+51912345678",
    contactEmail: "maria@espigadorada.pe",
    plan: "free",
    status: "pending",
    submittedAt: new Date("2026-04-14T09:15:00Z"),
  },
  {
    ruc: "20345678901",
    businessName: "Frutas Amazónicas S.A.C.",
    address: "Calle Las Palmeras 89",
    district: "manantay",
    category: "fruteria",
    contactName: "Juan Ramírez",
    contactDni: "67891234",
    contactPhone: "+51965432109",
    contactEmail: "juan@frutasamazonicas.com",
    plan: "pro",
    status: "approved",
    submittedAt: new Date("2026-04-01T08:30:00Z"),
    decidedAt: new Date("2026-04-03T11:45:00Z"),
  },
  {
    ruc: "20456789012",
    businessName: "Farmacia Vida Plena",
    address: "Jr. Raymondi 456",
    district: "pucallpa_centro",
    category: "farmacia",
    contactName: "Ana Mendoza",
    contactDni: "78912345",
    contactPhone: "+51998877665",
    contactEmail: "ana@vidaplena.pe",
    plan: "pro",
    status: "rejected",
    decisionReason:
      "Categoría Farmacia requiere certificación DIGEMID adicional. Envía el certificado vigente para reactivar tu solicitud.",
    submittedAt: new Date("2026-03-25T14:20:00Z"),
    decidedAt: new Date("2026-03-28T10:10:00Z"),
  },
  {
    ruc: "20567890123",
    businessName: "Pollería Sabor Norteño",
    address: "Av. Centenario 123",
    district: "otros_ucayali",
    category: "restaurante_comida",
    contactName: "Pedro Salas",
    contactDni: "89123456",
    contactPhone: "+51934567890",
    contactEmail: "pedro@sabornorteno.pe",
    plan: "free",
    status: "info_requested",
    infoRequestNote:
      "Por favor envía una foto del letrero exterior del local y copia de la ficha RUC al día.",
    submittedAt: new Date("2026-04-10T16:00:00Z"),
    decidedAt: new Date("2026-04-11T09:00:00Z"),
  },
];

async function main() {
  console.log("[backfill] Seeding vendor_applications…");
  let created = 0;
  let skipped = 0;

  for (const app of SEED) {
    const existing = await prisma.vendorApplication.findUnique({
      where: { ruc: app.ruc },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      console.log(
        `  skip ${app.ruc} (${app.businessName}) — ya existe id=${existing.id}`,
      );
      continue;
    }

    const row = await prisma.vendorApplication.create({
      data: {
        businessName: app.businessName,
        ruc: app.ruc,
        address: app.address,
        district: app.district,
        category: app.category,
        contactName: app.contactName,
        contactDni: app.contactDni,
        contactPhone: app.contactPhone,
        contactEmail: app.contactEmail,
        rucDocumentUrl: null,
        storefrontPhotoUrl: null,
        termsAcceptedAt: app.submittedAt,
        schedule: DEFAULT_SCHEDULE,
        deliveryZones: [app.district],
        deliveryFeeSoles: 5,
        plan: app.plan,
        status: app.status,
        submittedAt: app.submittedAt,
        decidedAt: app.decidedAt ?? null,
        decisionReason: app.decisionReason ?? null,
        infoRequestNote: app.infoRequestNote ?? null,
        reviewerUserId:
          app.status === "approved" ||
          app.status === "rejected" ||
          app.status === "info_requested"
            ? "system-backfill"
            : null,
      },
    });

    // Si hay status decidido, insertar review de auditoria
    if (
      app.decidedAt &&
      (app.status === "approved" ||
        app.status === "rejected" ||
        app.status === "info_requested")
    ) {
      const action =
        app.status === "approved"
          ? "approve"
          : app.status === "rejected"
            ? "reject"
            : "request_info";
      await prisma.vendorApplicationReview.create({
        data: {
          applicationId: row.id,
          reviewerUserId: "system-backfill",
          action,
          note: app.decisionReason ?? app.infoRequestNote ?? null,
          previousStatus: "pending",
          newStatus: app.status,
          createdAt: app.decidedAt,
        },
      });
    }

    created += 1;
    console.log(
      `  ok   ${app.ruc} (${app.businessName}) -> ${row.id} [${app.status}]`,
    );
  }

  console.log(
    `[backfill] done — created=${created} skipped=${skipped} total=${SEED.length}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] FAILED", err);
    process.exit(1);
  });
