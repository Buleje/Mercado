import type { Metadata } from "next";
import FavoritosClient from "./favoritos-client";

export const metadata: Metadata = {
  title: "Mis favoritos — Buleje Marketplace",
  description: "Los productos que guardaste para comprar más tarde.",
  robots: { index: false, follow: false },
};

export default function FavoritosPage() {
  return <FavoritosClient />;
}
