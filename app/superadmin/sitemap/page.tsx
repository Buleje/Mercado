import type { Metadata } from "next";
import SitemapClient from "./SitemapClient";

export const metadata: Metadata = {
  title: "Sitemap · SuperAdmin",
  description: "Directorio completo de rutas del proyecto Buleje",
  robots: "noindex, nofollow",
};

export default function SitemapPage() {
  return <SitemapClient />;
}
