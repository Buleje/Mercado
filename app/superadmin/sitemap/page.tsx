import { redirect } from "next/navigation";

// Modulo eliminado por decisión del producto. La ruta queda como redirect
// permanente al dashboard para no romper bookmarks viejos.
export default function SitemapPage() {
  redirect("/superadmin/dashboard");
}
