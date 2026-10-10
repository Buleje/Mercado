import dynamic from "next/dynamic";
import { Reveal } from "@/components/landing/Reveal";

// Fila ANCHA de descubrimiento con pestañas (Nuevos / Lo más pedido / Ofertas / Combos).
const HomeDiscoveryTabs = dynamic(
  () => import("@/components/marketplace/home/HomeDiscoveryTabs"),
);

export default function DescubreSeccion() {
  return (
    <Reveal>
      <section
        aria-label="Descubre en Buleje"
        className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
      >
        <HomeDiscoveryTabs />
      </section>
    </Reveal>
  );
}
