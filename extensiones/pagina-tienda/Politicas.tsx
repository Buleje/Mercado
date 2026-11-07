/**
 * «Envíos, pagos y cambios» (`#politicas`), como el bloque de Musa
 * (`pagina-musa/Politicas.tsx`): columnas abiertas, sin JavaScript.
 *
 * Todo sale de `NegocioTienda`, nada se promete de más:
 *   · Envíos — `envio.gratisDesde` y `envio.zonas` (con su costo);
 *   · Pagos — `pagos` (los medios prendidos en Ajustes);
 *   · Cambios — `devolucionDias` (sólo si el dueño lo guardó).
 * Una línea sin dato no sale; una columna sin líneas, tampoco; sin ninguna,
 * no hay bloque (`tienePoliticas` le avisa al pie para no enlazar a la nada).
 */
import { ArrowRight } from "@buleje/design-system/icons";
import type { NegocioTienda } from "./contenido";
import { TituloBloque } from "./PortadaPartes";
import { ANCHO, rutasTienda, solesCortos } from "./ui";

type NegocioPoliticas = Pick<NegocioTienda, "slug" | "envio" | "pagos" | "devolucionDias">;
type Linea = { titulo: string; texto: string };

/** Con más zonas, el resto se cuenta (la lista completa la da el checkout). */
const ZONAS_A_LA_VISTA = 6;

function columnas(n: NegocioPoliticas): { id: string; titulo: string; lineas: Linea[] }[] {
  const envios: Linea[] = [];
  if (n.envio.gratisDesde) envios.push({ titulo: "Envío gratis", texto: `En pedidos desde ${solesCortos(n.envio.gratisDesde)}.` });
  for (const z of n.envio.zonas.slice(0, ZONAS_A_LA_VISTA)) {
    envios.push({ titulo: z.nombre, texto: z.costo > 0 ? `${solesCortos(z.costo)} de envío.` : "Sin costo de envío." });
  }
  const resto = n.envio.zonas.length - ZONAS_A_LA_VISTA;
  if (resto > 0) envios.push({ titulo: `Y ${resto} ${resto === 1 ? "zona" : "zonas"} más`, texto: "Elige la tuya al hacer tu pedido." });

  const pagos: Linea[] = n.pagos.map((p) => ({
    titulo: p,
    texto: p === "Efectivo" ? "Pagas al recibir tu pedido." : p === "Transferencia" ? "A la cuenta del negocio." : "Desde tu celular.",
  }));
  // Tarjeta: no siempre es «desde tu celular» (puede ser POS al entregar): sin texto inventado.
  for (const l of pagos) if (l.titulo === "Tarjeta") l.texto = "Débito o crédito.";

  const cambios: Linea[] = n.devolucionDias
    ? [{ titulo: "Cambios y devoluciones", texto: `Hasta ${n.devolucionDias} ${n.devolucionDias === 1 ? "día" : "días"} después de tu compra.` }]
    : [];

  return [
    { id: "envios", titulo: "Envíos", lineas: envios },
    { id: "pagos", titulo: "Pagos", lineas: pagos },
    { id: "cambios", titulo: "Cambios", lineas: cambios },
  ].filter((c) => c.lineas.length > 0);
}

export const tienePoliticas = (n: NegocioPoliticas): boolean => columnas(n).length > 0;

const GRILLA: Record<number, string> = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" };

export function Politicas({ negocio }: { negocio: NegocioPoliticas }) {
  const cols = columnas(negocio);
  if (cols.length === 0) return null;
  const r = rutasTienda(negocio.slug);
  const enlace = "ti-subrayado ti-foco inline-flex min-h-12 items-center font-semibold text-[var(--ti-texto)] [--ti-subrayado-abajo:.55rem]";
  return (
    <section id="politicas" aria-labelledby="ti-politicas" className="scroll-mt-28 border-t border-[var(--ti-linea-suave)] py-12 sm:py-16">
      <div className={ANCHO}>
        <TituloBloque id="ti-politicas" titulo="Envíos, pagos y cambios" />
        <div className={`grid gap-8 md:gap-10 ${GRILLA[cols.length] ?? ""}`}>
          {cols.map((c) => (
            <div key={c.id} id={c.id}>
              <h3 className="text-lg font-semibold leading-snug text-[var(--ti-texto)]">{c.titulo}</h3>
              <ul className="mt-3 grid gap-2.5">
                {c.lineas.map((l) => (
                  <li key={l.titulo} className="flex gap-2 leading-relaxed text-[var(--ti-texto-2)]">
                    <ArrowRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-[var(--ti-acento)]" aria-hidden="true" />
                    <span>
                      <span className="font-semibold text-[var(--ti-texto)]">{l.titulo}. </span>
                      {l.texto}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 flex flex-wrap items-center gap-x-2 border-t border-[var(--ti-linea-suave)] pt-4 leading-relaxed text-[var(--ti-texto-2)]">
          <a href={`${r.base}/privacidad`} className={enlace}>
            Política de privacidad
          </a>
          <span aria-hidden="true">·</span>
          <a href={`${r.base}/libro-de-reclamaciones`} className={enlace}>
            Libro de reclamaciones
          </a>
        </p>
      </div>
    </section>
  );
}
