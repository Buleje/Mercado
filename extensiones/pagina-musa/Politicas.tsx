/**
 * «Envíos, cambios y devoluciones» (`#politicas`): las políticas del manual
 * (§1 Políticas, §18 «Del pedido a la entrega», §20 «Tu compra está protegida»)
 * en tres columnas, abiertas y sin JavaScript. La privacidad completa vive en
 * `/privacidad` y los reclamos en el Libro de reclamaciones (enlaces del pie).
 * Los textos están en `anuncios.ts` (`POLITICAS`, `PROTEGIDA`).
 */
import { ArrowRight } from "@buleje/design-system/icons";
import { POLITICAS, PROTEGIDA } from "./anuncios";
import { rutas } from "./destinos";
import { ANCHO, TituloBloque } from "./ui";

function Lista({ items }: { items: readonly { titulo: string; texto: string }[] }) {
  return (
    <ul className="mt-3 grid gap-2.5">
      {items.map((g) => (
        <li key={g.titulo} className="flex gap-2 leading-relaxed text-[var(--text-secondary)]">
          <ArrowRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-[var(--mu-acento-tinta)]" aria-hidden="true" />
          <span>
            <span className="font-semibold text-[var(--text-primary)]">{g.titulo}. </span>
            {g.texto}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Politicas({ slug }: { slug: string }) {
  const r = rutas(slug);
  return (
    <section id="politicas" aria-labelledby="mu-politicas" className="scroll-mt-24 border-t border-[var(--rule-soft)] py-12 sm:py-16">
      <div className={ANCHO}>
        <TituloBloque id="mu-politicas" titulo="Envíos, cambios" acento="y devoluciones" texto="Así cuidamos tu compra, tal como lo acordamos con cada clienta." />
        <div className="grid gap-8 md:grid-cols-3 md:gap-10">
          <div id="envios">
            <h3 className="text-lg font-semibold leading-snug text-[var(--text-primary)]">Envíos y pago</h3>
            <Lista items={POLITICAS.envios} />
          </div>
          <div id="protegida">
            <h3 className="text-lg font-semibold leading-snug text-[var(--text-primary)]">Cambios y devoluciones</h3>
            <Lista items={PROTEGIDA} />
          </div>
          <div id="privacidad">
            <h3 className="text-lg font-semibold leading-snug text-[var(--text-primary)]">Tus datos</h3>
            <Lista items={POLITICAS.datos} />
            <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">
              <a href={`${r.base}/privacidad`} className="mu-subrayado mu-foco font-semibold text-[var(--text-primary)]">
                Política de privacidad
              </a>
              {" · "}
              <a href={`${r.base}/libro-de-reclamaciones`} className="mu-subrayado mu-foco font-semibold text-[var(--text-primary)]">
                Libro de reclamaciones
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
