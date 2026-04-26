import { redirect } from "next/navigation";

// Modulo eliminado por decisión del producto. La ruta redirige al dashboard.
export default function RoadmapPage() {
  redirect("/superadmin/dashboard");
}
