import {
  Sparkles, BookOpenText, Zap, Phone, ShoppingCart, CircleHelp, Megaphone,
} from "@buleje/design-system/icons";
import type { ComponentType } from "react";

/** Los bloques que se pueden sumar a una página, con el nombre que ve el dueño. */
export const BLOQUES_DISPONIBLES: { type: string; nombre: string; icon: ComponentType<{ className?: string }> }[] = [
  { type: "hero", nombre: "Portada principal", icon: Sparkles },
  { type: "about", nombre: "Nosotros", icon: BookOpenText },
  { type: "benefits", nombre: "Beneficios", icon: Zap },
  { type: "contact", nombre: "Contacto", icon: Phone },
  { type: "products", nombre: "Productos", icon: ShoppingCart },
  { type: "faq", nombre: "Preguntas frecuentes", icon: CircleHelp },
  { type: "cta", nombre: "Llamada a la acción", icon: Megaphone },
];

export function nombreDeBloque(type: string): string {
  return BLOQUES_DISPONIBLES.find((b) => b.type === type)?.nombre ?? type;
}

export type TipoCampo = "text" | "textarea" | "url" | "color" | "boolean" | "link";
export interface CampoDef { key: string; label: string; type: TipoCampo; placeholder?: string }

export const CAMPOS_POR_BLOQUE: Record<string, CampoDef[]> = {
  hero: [
    { key: "title", label: "Título principal", type: "text", placeholder: "Bienvenido a..." },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Productos frescos..." },
    { key: "description", label: "Descripción", type: "textarea", placeholder: "Texto descriptivo..." },
    { key: "ctaText", label: "Botón principal (texto)", type: "text", placeholder: "Ver productos" },
    { key: "ctaLink", label: "Botón principal (enlace)", type: "link", placeholder: "/tienda" },
    { key: "secondaryCTAText", label: "Botón secundario (texto)", type: "text", placeholder: "Hacer pedido" },
    { key: "secondaryCTALink", label: "Botón secundario (enlace)", type: "link", placeholder: "#contacto" },
    { key: "showBadge", label: "Mostrar etiqueta de envío", type: "boolean" },
    { key: "badgeText", label: "Texto de la etiqueta", type: "text", placeholder: "Envío gratis desde S/ 50" },
    { key: "backgroundImage", label: "Imagen de fondo (enlace)", type: "url", placeholder: "https://..." },
    { key: "backgroundColor", label: "Color de fondo", type: "color" },
    { key: "showStats", label: "Mostrar estadísticas", type: "boolean" },
    { key: "showAnimations", label: "Mostrar animaciones", type: "boolean" },
  ],
  about: [
    { key: "title", label: "Título", type: "text", placeholder: "Nuestra historia" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Quiénes somos" },
    { key: "description", label: "Descripción", type: "textarea", placeholder: "Historia de la bodega..." },
    { key: "image", label: "Imagen (enlace)", type: "url", placeholder: "https://..." },
    { key: "founded", label: "Año de fundación", type: "text", placeholder: "2010" },
    { key: "mission", label: "Misión", type: "textarea", placeholder: "Nuestra misión..." },
  ],
  benefits: [
    { key: "title", label: "Título de la sección", type: "text", placeholder: "¿Por qué elegirnos?" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Todo lo que necesitas" },
  ],
  contact: [
    { key: "title", label: "Título", type: "text", placeholder: "Contáctanos" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Estamos para ayudarte" },
    { key: "phone", label: "Teléfono / WhatsApp", type: "text", placeholder: "+51 999 999 999" },
    { key: "address", label: "Dirección", type: "text", placeholder: "Calle..." },
    { key: "hours", label: "Horario", type: "text", placeholder: "Lun-Dom 7am-10pm" },
    { key: "email", label: "Correo", type: "text", placeholder: "contacto@..." },
  ],
  products: [
    { key: "title", label: "Título de la sección", type: "text", placeholder: "Nuestros productos" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Frescos y de calidad" },
    { key: "showSearch", label: "Mostrar buscador", type: "boolean" },
  ],
  faq: [
    { key: "title", label: "Título de la sección", type: "text", placeholder: "Preguntas frecuentes" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Resolvemos tus dudas" },
  ],
  cta: [
    { key: "title", label: "Título", type: "text", placeholder: "¡Pide ahora!" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Delivery en 30-45 min" },
    { key: "ctaText", label: "Botón (texto)", type: "text", placeholder: "Hacer pedido" },
    { key: "ctaLink", label: "Botón (enlace)", type: "link", placeholder: "#contacto" },
    { key: "backgroundImage", label: "Imagen de fondo (enlace)", type: "url", placeholder: "https://..." },
    { key: "backgroundColor", label: "Color de fondo", type: "color" },
  ],
};
