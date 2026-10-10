import dynamic from "next/dynamic";
import { Reveal } from "@/components/landing/Reveal";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";
import { ConteoMercado } from "@/components/marketplace/home/HomeEstantes";

// Catálogo completo (fusión /marketplace → /, Brandon 2026-06-08): fila de
// orden + Filtros, 3 pasillos y la grilla (rediseño «Dosel», 2026-10-10).
const HomeCatalog = dynamic(() => import("@/components/marketplace/home/HomeCatalog"));

export default function CatalogoSeccion() {
  return (
    <section
      id="catalogo"
      aria-labelledby="catalogo-titulo"
      className="mx-auto w-full max-w-[1760px] scroll-mt-24 px-4 sm:px-6 lg:px-8"
    >
      <Reveal>
        <HomeSeccionTitulo id="catalogo-titulo" titulo="Todo el mercado" bajada={<ConteoMercado />} />
      </Reveal>
      <HomeCatalog />
    </section>
  );
}
