import SuperAdminDocumentsModule from "@/components/superadmin/documentos/SuperAdminDocumentsModule";

// Auth (PLATFORM_SESSION) + chrome (SuperAdminShell) los provee app/superadmin/layout.tsx.
export const metadata = { title: "Mis Documentos · Superadmin" };

export default function SuperAdminDocumentosPage() {
  return <SuperAdminDocumentsModule />;
}
