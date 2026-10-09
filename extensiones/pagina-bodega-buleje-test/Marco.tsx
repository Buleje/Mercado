/**
 * El marco de «Buleje Beauty» para el resto de la tienda (ADR-460): el layout
 * de la tienda lo pone alrededor del catálogo, la ficha, la cuenta, los
 * pedidos, los legales y el checkout de ESTE negocio.
 *
 * · `tema` — los dos niveles de `tema.ts` (global + lo de esta carpeta).
 * · `encabezado` / `pie` — los mismos de la portada, con la lectura liviana
 *   (`cargarMarco`: ajustes, contacto y categorías; sin precios). Sin el
 *   historial de precios, la franja no dice «hasta X % de descuento».
 * · `flotantes` — la bolsa con el carrito del LAYOUT (sin otro `CartProvider`);
 *   «Finalizar compra» abre el checkout de siempre.
 *
 * Todo lo de esta carpeta va dentro de `<Paleta>`: un `[data-pagina]` sin
 * caja propia (`display: contents`), así la barra pegajosa sigue pegando.
 */
import "server-only";
import type { ReactNode } from "react";
import type { MarcoTienda, PropsMarco } from "../_contrato";
import { FRANJA } from "./anuncios";
import { PartesBolsa } from "./Bolsa";
import { cargarMarco } from "./datos";
import { rellenar } from "./destinos";
import { BarraSuperior, MenuCategorias } from "./Encabezado";
import { FranjaAnuncio } from "./FranjaAnuncio";
import type { Opciones } from "./manifest";
import { Pie } from "./Pie";
import { CSS_GLOBAL, CSS_TEMA, ID_PAGINA } from "./tema";
import { ANCHO } from "./ui";

export function Paleta({ children }: { children: ReactNode }) {
  return (
    <div data-pagina={ID_PAGINA} className="contents">
      {children}
    </div>
  );
}

async function Encabezado({ tenantId, slug }: { tenantId: string; slug: string }) {
  const m = await cargarMarco(tenantId);
  const mensajes = FRANJA.map((t) => rellenar(t, { descuento: null, pagos: m.pagos })).filter((t): t is string => t !== null);
  return (
    <Paleta>
      <FranjaAnuncio mensajes={mensajes} />
      <BarraSuperior nombre={m.nombre} slug={slug} logoEsTitulo={false} />
      <MenuCategorias slug={slug} categorias={m.categorias} hayOfertas />
    </Paleta>
  );
}

/** Mismo alto que el encabezado (franja + barra + menú, con el buscador debajo en el celular): sin saltos al llegar. */
function EsqueletoEncabezado() {
  const bloque = "animate-pulse rounded-full bg-[var(--bb-rubor)]";
  return (
    <Paleta>
      <div aria-hidden="true">
        <div className="h-10 bg-[var(--bb-tinta)]" />
        <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
          <div className={`${ANCHO} flex h-14 items-center gap-6 sm:h-20`}>
            <div className={`${bloque} h-10 w-32`} />
            <div className={`${bloque} mx-auto hidden h-12 w-full max-w-[34rem] md:block`} />
          </div>
        </div>
        <div className="h-[7.25rem] border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] md:h-[3.75rem]" />
      </div>
    </Paleta>
  );
}

async function PieDelMarco({ tenantId, slug }: { tenantId: string; slug: string }) {
  const m = await cargarMarco(tenantId);
  return (
    <Paleta>
      <Pie nombre={m.nombre} descripcion={m.descripcion} slug={slug} whatsapp={m.whatsapp} redes={m.redes} pagos={m.pagos} />
    </Paleta>
  );
}

export function marco({ ctx }: PropsMarco<Opciones>): MarcoTienda {
  return {
    tema: <style dangerouslySetInnerHTML={{ __html: CSS_GLOBAL + CSS_TEMA }} />,
    encabezado: <Encabezado tenantId={ctx.tenantId} slug={ctx.slug} />,
    esqueletoEncabezado: <EsqueletoEncabezado />,
    pie: <PieDelMarco tenantId={ctx.tenantId} slug={ctx.slug} />,
    flotantes: (
      <Paleta>
        <PartesBolsa />
      </Paleta>
    ),
  };
}
