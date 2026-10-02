import "server-only";
import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { ENCHUFE_PAGINA, type ContextoPieza, type ParametrosDeBusqueda } from "@/extensiones/_contrato";
import { BordeDePieza } from "./BordeDePieza";
import { RecargarSinPiezas } from "./RecargarSinPiezas";
import { resolverPiezas } from "./resolver";
import { conTope, reportarFalloPieza } from "./tope";

/**
 * El enchufe `tienda.pagina` (ADR-458): la página pública ENTERA de un negocio
 * con su propio código. Lo monta `<Enchufe nombre="tienda.pagina">` desde la
 * ruta `/t/[slug]`, que ya hizo los controles (negocio publicado o vista previa
 * de su dueño) y que sólo llega acá si el negocio tiene una página propia
 * prendida.
 *
 * Garantías (ADR-457) y su ALCANCE exacto:
 * · Tope de 2 s + try/catch sobre cargar el código (`import()` perezoso del
 *   registro) y correr `Pagina()` hasta que DEVUELVE: si tira o se pasa, se ve
 *   `fallback` (la página general) y se avisa a Sentry.
 * · Lo que devuelve se dibuja después, SIN tope: si un componente de adentro
 *   tarda, la página tarda. Si falla al dibujarse, `<BordeDePieza>` lo ataja en
 *   el navegador y `<RecargarSinPiezas>` recarga la misma URL con
 *   `?sinPiezas=1` (la general pura). El respaldo es ese componente liviano y
 *   no la general armada: armarla siempre doblaba lo que viaja en cada visita
 *   (medido 01-10: 203 KB contra 161 KB en /t/main).
 * · `notFound()` / `redirect()` dentro de la página propia no son fallas: se
 *   dejan pasar (`unstable_rethrow`), igual que en cualquier página de Next.
 * · El negocio (`ctx`) lo pone la ruta desde el host/slug, nunca la pieza.
 *
 * Exclusiva: una página propia es de UN negocio (lo hace cumplir el guardado
 * del superadmin). Si por un error quedaran dos prendidas, gana la primera por
 * `orden` — nunca se dibujan dos páginas enteras una debajo de la otra.
 */
export interface EnchufePaginaProps {
  nombre: typeof ENCHUFE_PAGINA;
  tenantId: string;
  slug: string;
  /** La página general: se ve si no hay página propia, o si `Pagina()` tira o tarda en devolver. */
  fallback: ReactNode;
  /** La búsqueda de la URL, tal cual la recibió la ruta. */
  searchParams: ParametrosDeBusqueda;
}

export async function EnchufePagina({ tenantId, slug, fallback, searchParams }: EnchufePaginaProps): Promise<ReactNode> {
  const ctx: ContextoPieza = { tenantId, slug, enchufe: ENCHUFE_PAGINA };
  const pieza = (await resolverPiezas(tenantId, ENCHUFE_PAGINA)).find((p) => p.entrada.pagina);
  const cargarPagina = pieza?.entrada.pagina;
  if (!pieza || !cargarPagina) return fallback;

  let pagina: ReactNode;
  try {
    // `.then` y no una llamada directa: un `throw` síncrono también cae en el catch.
    pagina = await conTope(
      Promise.resolve()
        .then(cargarPagina)
        .then(({ Pagina }) => Pagina({ ctx, opciones: pieza.opciones, searchParams })),
      undefined,
      `la página propia ${pieza.piezaId}`,
    );
  } catch (err) {
    unstable_rethrow(err);
    reportarFalloPieza(err, { piezaId: pieza.piezaId, enchufe: ctx.enchufe, tenantId, etapa: "pagina" });
    return fallback;
  }

  return (
    <BordeDePieza piezaId={pieza.piezaId} fallback={<RecargarSinPiezas />} mientrasCarga={null}>
      {pagina}
    </BordeDePieza>
  );
}
