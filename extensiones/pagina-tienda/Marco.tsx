/**
 * El marco de la plantilla para el resto de la tienda (ADR-460/511): el layout
 * lo pone alrededor del catálogo, la ficha, la cuenta, los pedidos, los
 * legales y el checkout del negocio. Mismo encabezado y pie que la portada.
 *
 * · `tema` — la paleta del negocio; si la lectura falla, la neutra (el `tema`
 *   va fuera de `<BordeDePieza>`: no puede romper).
 * · `encabezado` / `pie` — leen con `cargarTienda` (en caché: la misma lectura
 *   que el catálogo o la ficha de esa visita).
 * · `flotantes` — la bolsa, si se la pasan (la arma el carril del carrito), con
 *   el carrito del LAYOUT: el marco nunca monta un segundo `CartProvider`.
 *
 * Todo va dentro de `<Paleta>`: un `[data-pagina]` sin caja propia
 * (`display: contents`), así la barra pegajosa sigue pegando.
 */
import "server-only";
import { Suspense, type ReactNode } from "react";
import type { MarcoTienda, PropsMarco } from "../_contrato";
import { cargarTienda } from "./datos";
import { BarraSuperior, MenuCategorias } from "./Encabezado";
import { CSS_NEUTRO, EsqueletoEncabezado } from "./EncabezadoEsqueleto";
import { FranjaAnuncio } from "./FranjaAnuncio";
import type { Opciones } from "./manifest";
import { categoriasDe } from "./PaginaTienda";
import { Pie } from "./Pie";
import { tienePoliticas } from "./Politicas";
import { cssTema, ID_PAGINA_TIENDA } from "./tema";
import { CSS_PIEZAS } from "./ui";

type Ctx = { tenantId: string; slug: string };

export function Paleta({ children }: { children: ReactNode }) {
  return (
    <div data-pagina={ID_PAGINA_TIENDA} className="contents">
      {children}
    </div>
  );
}

/** La paleta del negocio; si la lectura falla, la neutra (nunca sin estilos). */
async function TemaDelMarco({ ctx }: { ctx: Ctx }) {
  let css = CSS_NEUTRO;
  try {
    css = cssTema((await cargarTienda(ctx)).tema) + CSS_PIEZAS;
  } catch {
    // la lectura la registra `datos.ts`; acá sólo se elige el respaldo
  }
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

async function Encabezado({ ctx }: { ctx: Ctx }) {
  const d = await cargarTienda(ctx);
  const categorias = categoriasDe(d);
  const hayOfertas = d.mayorDescuento !== null;
  return (
    <Paleta>
      {d.contenido.bloques.includes("franja") && <FranjaAnuncio mensajes={d.contenido.franja} />}
      <BarraSuperior negocio={d.negocio} categorias={categorias} hayOfertas={hayOfertas} logoEsTitulo={false} />
      <MenuCategorias slug={d.negocio.slug} categorias={categorias} hayOfertas={hayOfertas} />
    </Paleta>
  );
}

async function PieDelMarco({ ctx }: { ctx: Ctx }) {
  const d = await cargarTienda(ctx);
  // El enlace del pie va a la portada (`/t/<negocio>#politicas`): sólo si allá hay bloque.
  const politicas = d.contenido.bloques.includes("politicas") && tienePoliticas(d.negocio);
  return (
    <Paleta>
      <Pie negocio={d.negocio} categorias={categoriasDe(d)} politicas={politicas} />
    </Paleta>
  );
}

/** El marco; `bolsa` = lo que flota (el cajón de la bolsa), si existe. */
export function crearMarco(bolsa?: (ctx: Ctx) => ReactNode) {
  return function marco({ ctx }: PropsMarco<Opciones>): MarcoTienda {
    const c: Ctx = { tenantId: ctx.tenantId, slug: ctx.slug };
    return {
      tema: (
        <Suspense fallback={<style dangerouslySetInnerHTML={{ __html: CSS_NEUTRO }} />}>
          <TemaDelMarco ctx={c} />
        </Suspense>
      ),
      encabezado: <Encabezado ctx={c} />,
      esqueletoEncabezado: (
        <Paleta>
          <EsqueletoEncabezado />
        </Paleta>
      ),
      pie: <PieDelMarco ctx={c} />,
      ...(bolsa ? { flotantes: <Paleta>{bolsa(c)}</Paleta> } : {}),
    };
  };
}

export const marco = crearMarco();
