/**
 * «Compra tranquila» (como el de Musa, `pagina-musa/Salon.tsx` › Confianza):
 * 3-4 promesas con su ícono en un círculo gris, y debajo cómo se paga y el
 * enlace a «Envíos, pagos y cambios».
 *
 * Las promesas salen de `contenido.confianza` (las que puso el dueño o, si no
 * puso ninguna, las que arma `datos.ts` con su envío, sus pagos y sus cambios).
 * El ícono se elige por lo que dice el título. WhatsApp sólo con número.
 */
import { MessageCircle, RotateCcw, ShieldCheck, Truck, Wallet, type LucideIcon } from "@buleje/design-system/icons";
import type { ContenidoTienda, NegocioTienda } from "./contenido";
import { TituloBloque } from "./PortadaPartes";
import { ANCHO, BOTON_BORDE, EXTERNO, enlaceWhatsapp } from "./ui";

function iconoDe(titulo: string): LucideIcon {
  const t = titulo.toLocaleLowerCase("es-PE");
  if (/env[ií]o|delivery|reparto|entrega/.test(t)) return Truck;
  if (/pag|yape|plin|efectivo|tarjeta/.test(t)) return Wallet;
  if (/cambio|devoluci/.test(t)) return RotateCcw;
  return ShieldCheck;
}

const COLUMNAS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" };

/** «Yape, Plin y Efectivo». */
function lista(xs: readonly string[]): string {
  return xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

export function Confianza({
  items,
  negocio,
  politicas,
}: {
  items: ContenidoTienda["confianza"];
  negocio: Pick<NegocioTienda, "slug" | "nombre" | "whatsapp" | "pagos">;
  /** Hay bloque `#politicas` en la página: recién ahí se enlaza. */
  politicas: boolean;
}) {
  const promesas = items.slice(0, 4);
  if (promesas.length === 0) return null;
  const columnas = COLUMNAS[promesas.length] ?? "";
  const pie = negocio.pagos.length > 0 || politicas;
  return (
    <section aria-labelledby="ti-confianza" className="border-t border-[var(--ti-linea-suave)] py-12 sm:py-20">
      <div className={ANCHO}>
        <TituloBloque
          id="ti-confianza"
          titulo="Compra tranquila"
          accion={
            negocio.whatsapp ? (
              <span className="hidden sm:block">
                <a href={enlaceWhatsapp(negocio.whatsapp, `Hola ${negocio.nombre}, tengo una consulta.`)} {...EXTERNO} className={BOTON_BORDE}>
                  <MessageCircle className="h-5 w-5" aria-hidden="true" /> Escríbenos
                </a>
              </span>
            ) : undefined
          }
        />
        <ul className={`grid gap-6 md:gap-8 ${columnas}`}>
          {promesas.map((p) => {
            const Icono = iconoDe(p.titulo);
            return (
              <li key={p.titulo} className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ti-suave)] text-[var(--ti-texto)]">
                  <Icono className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold leading-snug text-[var(--ti-texto)]">{p.titulo}</h3>
                  <p className="mt-1 leading-relaxed text-[var(--ti-texto-2)]">{p.texto}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {(pie || negocio.whatsapp) && (
          <div className="mt-8 flex flex-col gap-4 border-t border-[var(--ti-linea-suave)] pt-6 lg:flex-row lg:items-center lg:justify-between">
            {negocio.pagos.length > 0 && (
              <p className="leading-relaxed text-[var(--ti-texto-2)]">
                <span className="font-semibold text-[var(--ti-texto)]">Pagas como prefieras:</span> {lista(negocio.pagos)}.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {politicas && (
                <a href="#politicas" className="ti-subrayado ti-foco inline-flex min-h-12 items-center font-semibold text-[var(--ti-texto)] [--ti-subrayado-abajo:.55rem]">
                  Envíos, pagos y cambios
                </a>
              )}
              {negocio.whatsapp && (
                <a
                  href={enlaceWhatsapp(negocio.whatsapp, `Hola ${negocio.nombre}, tengo una consulta.`)}
                  {...EXTERNO}
                  className={`${BOTON_BORDE} sm:hidden`}
                >
                  <MessageCircle className="h-5 w-5" aria-hidden="true" /> Escríbenos por WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
