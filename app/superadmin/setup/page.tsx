import { redirect } from "next/navigation";

// Modulo eliminado por decision del producto. La ruta queda como redirect
// permanente al dashboard para no romper bookmarks viejos.
export default function SetupPage() {
  redirect("/superadmin/dashboard");
}
