import { BRAND_GEO } from "@/lib/geo";

// Audit SEO 2026-05-31: estas preguntas alimentan DOS cosas a la vez:
//   1. El FAQPage JSON-LD (Rich Results de Google).
//   2. La sección <HomeFaqSection /> VISIBLE al final de la home.
// Google exige que el contenido del FAQPage schema sea visible en la página
// (si es solo schema = "content mismatch", no da rich result y arriesga acción
// manual). Tener una sola lista evita que el schema y el texto se desincronicen.
// Copy real del marketplace + geo de lanzamiento (Ciudad Constitución).
export const HOME_FAQS: { q: string; a: string }[] = [
  {
    q: "¿Cómo hago un pedido en Buleje?",
    a: "Eliges tu tienda en /tiendas, seleccionas los productos y pagas con Yape, Plin o efectivo. Tu pedido llega en 25–35 minutos.",
  },
  {
    q: `¿Buleje hace delivery en ${BRAND_GEO.city}?`,
    a: `Sí. Hacemos delivery en ${BRAND_GEO.city} y zonas cercanas de ${BRAND_GEO.province} (${BRAND_GEO.region}). Tenemos bodegas, restaurantes, farmacias y más.`,
  },
  {
    q: "¿Puedo pagar con Yape o Plin en Buleje?",
    a: "Sí, aceptamos Yape, Plin y efectivo contra entrega en todos los pedidos del marketplace.",
  },
  {
    q: "¿Cuánto tarda el delivery de Buleje?",
    a: "El tiempo estimado es de 25 a 35 minutos según tu ubicación y la tienda elegida. Las tiendas con horario abierto entregan el mismo día.",
  },
];

