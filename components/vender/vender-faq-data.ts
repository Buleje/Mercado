/**
 * FAQ seller-facing de /vender — módulo de datos PLANO (sin "use client")
 * para poder compartirlo entre el componente cliente VenderFAQ y el
 * Server Component app/vender/page.tsx (FAQPage JSON-LD). Importar este
 * dato desde un módulo "use client" hacia el server rompe el build
 * (los exports cliente se vuelven referencias, no el array real).
 */
export const FAQ_ITEMS = [
  {
    q: "¿Cuánto cobra Buleje de comisión?",
    a: "Los primeros 30 días es gratis, sin ninguna comisión. Después tienes dos opciones: Plan Gratis (5% por pedido exitoso, sin cuota fija) o Plan Pro (S/ 29 al mes, sin comisión por pedido). Vos eliges el que te convenga según tu volumen.",
  },
  {
    q: "¿Cuándo recibo la plata de mis ventas?",
    a: "Si el cliente pagó por Yape o Plin al repartidor, la plata la cobraste en el acto. Si pagó con tarjeta online, te transferimos el dinero al día siguiente hábil a la cuenta bancaria que registraste.",
  },
  {
    q: "¿Necesito tener RUC para vender?",
    a: "Sí. Pedimos RUC vigente (persona natural con negocio o persona jurídica). Si todavía no tienes, te mandamos el instructivo SUNAT para sacarlo en 48h sin costo. Una vez que lo tengas, subes la foto y sigues.",
  },
  {
    q: "¿Cómo manejo las entregas? ¿Tengo que contratar repartidores?",
    a: "No. Buleje coordina los repartidores. Vos preparás el pedido, marcás 'listo' en la app, y un motorizado pasa a recogerlo en minutos. Los repartidores son locales, conocen Pucallpa y tienen GPS para que el cliente vea la ruta en vivo.",
  },
  {
    q: "¿Qué productos puedo vender?",
    a: "Abarrotes, bebidas, lácteos, frutas y verduras, productos de limpieza, golosinas, panadería y carnes. No se permiten bebidas alcohólicas sin licencia vigente, medicamentos sin receta, ni productos piratas o de dudosa procedencia.",
  },
  {
    q: "¿Qué pasa si un cliente devuelve algo?",
    a: "Tenemos proceso de devolución simple. El cliente reporta el problema en la app, el repartidor recoge el producto, y tú decides si reembolsas, reemplazas o investigas más. Buleje te acompaña en cada paso y bloquea clientes con patrón de abuso.",
  },
  {
    q: "¿Cuántos productos puedo cargar?",
    a: "Ilimitados. En el Plan Gratis cargás hasta 50 productos activos, en Plan Pro son infinitos. Puedes subir fotos con el celular o pedirnos ayuda para fotografías profesionales (te cobramos solo el costo real, sin márgen).",
  },
  {
    q: "¿Puedo darme de baja si no me gusta?",
    a: "Cuando quieras, sin multas ni trámites raros. Apagás la tienda desde el panel o nos llamás por WhatsApp. La plata pendiente se te transfiere en 48h. Los datos de tus clientes son tuyos, te los exportamos en Excel.",
  },
] as const;
