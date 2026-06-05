/**
 * MarketplaceHomeHeader — H1 SEO del home /marketplace (server component).
 *
 * Brandon 2026-06-05: el header editorial visible ("Tus bodegas y tiendas
 * favoritas, a un toque" + propuesta + buscador + trust strip) se removió a
 * pedido — el marketplace ahora arranca directo en los banners (igual que
 * /tiendas). Conservamos SOLO el <h1> sr-only: el resto de la home son
 * secciones `dynamic({ ssr: false })`, así que sin este H1 server-rendered
 * Google vería la página sin encabezado primario. `storeCount` queda como
 * prop por compatibilidad con el caller (no se usa visualmente).
 */
export default function MarketplaceHomeHeader(_props: { storeCount?: number }) {
  return (
    <h1 className="sr-only">
      Tus bodegas y tiendas favoritas de Ciudad Constitución, a un toque —
      delivery rápido con Yape, tarjeta o efectivo
    </h1>
  );
}
