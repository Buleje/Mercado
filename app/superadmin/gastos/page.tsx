import "server-only";
import type { Metadata } from "next";
import GastosClient from "./GastosClient";

export const metadata: Metadata = {
  title: "Gastos de plataforma — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default function GastosPage() {
  return <GastosClient />;
}
