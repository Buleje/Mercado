import PlatformInboxPanel from "@/components/admin/PlatformInboxPanel";

export const metadata = {
  title: "Mensajes de Buleje — Panel",
  robots: "noindex, nofollow",
};

// Bandeja de la plataforma para el dueño del negocio (lado tenant del Messenger
// ADR-132). Pantalla dedicada; la auth la aporta el middleware (/admin/*).
export default function AdminBulejeInboxPage() {
  return <PlatformInboxPanel />;
}
