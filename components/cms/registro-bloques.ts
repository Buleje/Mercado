import type { ComponentType } from "react";
import HeroBlock from "@/components/blocks/HeroBlock";
import AboutBlock from "@/components/blocks/AboutBlock";
import BenefitsBlock from "@/components/blocks/BenefitsBlock";
import ContactBlock from "@/components/blocks/ContactBlock";
import ProductsBlock from "@/components/blocks/ProductsBlock";
import FAQBlock from "@/components/blocks/FAQBlock";
import CTABlock from "@/components/blocks/CTABlock";

/**
 * Tipo de bloque → componente. Única fuente: la usan el renderer público, la
 * vista previa del editor y la pieza `pagina-por-bloques` de la portada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada bloque tiene sus propias props
export const BLOQUES_POR_TIPO: Record<string, ComponentType<any>> = {
  hero: HeroBlock,
  about: AboutBlock,
  benefits: BenefitsBlock,
  contact: ContactBlock,
  products: ProductsBlock,
  faq: FAQBlock,
  cta: CTABlock,
};
