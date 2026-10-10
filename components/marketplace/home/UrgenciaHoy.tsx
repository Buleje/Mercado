import dynamic from "next/dynamic";
import { Reveal } from "@/components/landing/Reveal";

// Ofertas del día con countdown (urgencia). Auto-oculta si no hay destacados.
const OfertasDelDiaHero = dynamic(
  () => import("@/components/marketplace/home/OfertasDelDiaHero"),
);

/** STUB de la Fase 0: lo de hoy. El carril B lo reemplaza. */
export default function UrgenciaHoy() {
  return (
    <Reveal>
      <OfertasDelDiaHero />
    </Reveal>
  );
}
