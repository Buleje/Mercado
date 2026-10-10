/**
 * Lo que va debajo de la ficha de Musa (ADR-460; contrato visual §e «Ficha»):
 * «Tu rutina en 3 pasos» (el producto de cada paso, `rutinaEnTresPasos`),
 * «Llévalo en kit» (los kits que lo traen, con su ahorro real), «Qué trae» de
 * un kit, los pasos de uso o de reserva, el carril de la categoría (o los
 * otros servicios) y el «no lo encontramos» dentro del marco (el esqueleto
 * vive en `FichaPartes.tsx`).
 */
import { ArrowRight, Clock } from "@buleje/design-system/icons";
import { BotonAgregar } from "./BotonAgregar";
import { Carril } from "./Carril";
import type { KitSalon, ProductoSalon } from "./datos";
import { rutas, soles, solesCortos } from "./destinos";
import { EnlaceFicha } from "./EnlaceFicha";
import { imagenDe } from "./imagenes";
import type { PasoRutina } from "./rutina";
import { Sello } from "./Sello";
import { Escenario, Ilustracion, PildoraAhorro, TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, BOTON, BOTON_BORDE, Destello, Kicker, TituloSeccion } from "./ui";

const productoDe = (p: ProductoSalon) => ({
  id: p.id,
  name: p.nombre,
  category: p.categoria,
  price: p.precio,
  image: imagenDe(p).src ?? "",
  unit: p.unidad,
  ...(p.stock !== null ? { stock: p.stock } : {}),
});

/** Numeral de paso: Cormorant grande en oro-tinta (5,74:1 sobre hueso). */
function Numeral({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="mu-precio text-[2.5rem] text-[var(--mu-oro-tinta)]">
      {n}
    </span>
  );
}

/** «Tu rutina en 3 pasos»: verbo, cómo y el producto de Musa de cada paso (el de la ficha, resaltado). */
export function RutinaTresPasos({ pasos, categoria }: { pasos: PasoRutina[]; categoria: string }) {
  if (pasos.length === 0) return null;
  return (
    <section aria-labelledby="mu-rutina-pasos" className="bg-[var(--mu-hueso)] py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-rutina-pasos" kicker={`Rutina de ${categoria.toLowerCase()}`} titulo="Tu rutina en 3 pasos" script="sin complicarte" />
        <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
          {pasos.map((s) => (
            <li
              key={s.numero}
              data-mu-producto
              className={`@container relative flex flex-col rounded-[var(--mu-radio-tarjeta)] border p-5 sm:p-6 ${s.esEste ? "border-[var(--mu-oro)] bg-[var(--mu-oro-claro)] ring-1 ring-[var(--mu-oro)]" : "border-[var(--rule-soft)] bg-[var(--surface-raised)]"}`}
            >
              <div className="flex items-baseline gap-3">
                <Numeral n={s.numero} />
                <div>
                  <p className="mu-serif text-[1.375rem] leading-none text-[var(--text-primary)]">{s.titulo}</p>
                  <p className="mt-1.5 text-[length:var(--mu-t-chico)] leading-snug text-[var(--text-secondary)]">{s.texto}</p>
                </div>
              </div>
              <div className="mb-1 mt-5 flex items-center gap-4">
                <EnlaceFicha p={s.producto} data-mu-foto tabIndex={-1} aria-hidden="true" className="shrink-0">
                  <Escenario categoria={s.producto.categoria} className="mu-arco h-24 w-20">
                    <Ilustracion p={s.producto} cerca sello="h-[60%] w-[60%]" />
                  </Escenario>
                </EnlaceFicha>
                <div className="min-w-0">
                  {s.esEste ? (
                    <p className="mu-kicker text-[var(--mu-oro-tinta)]">Este producto</p>
                  ) : (
                    <p className="text-[12px] font-medium tabular-nums text-[var(--text-tertiary)]">{s.producto.codigo}</p>
                  )}
                  <p className="mt-0.5 line-clamp-2 text-[length:var(--mu-t-nombre)] font-medium leading-snug text-[var(--text-primary)]">
                    {s.esEste ? (
                      s.producto.nombre
                    ) : (
                      <EnlaceFicha p={s.producto} className="mu-foco rounded-sm hover:underline hover:underline-offset-4">
                        {s.producto.nombre}
                      </EnlaceFicha>
                    )}
                  </p>
                  <p className="mu-precio mt-1 text-xl text-[var(--text-primary)]">{solesCortos(s.producto.precio)}</p>
                </div>
              </div>
              {/* El paso de esta ficha no repite «Agregar» (está arriba): dice dónde estás, a la altura de los botones de los otros dos. */}
              <div className="mt-auto pt-4">
                {s.esEste ? (
                  <p className="inline-flex h-10 items-center gap-2 text-[length:var(--mu-t-chico)] font-semibold text-[var(--mu-oro-tinta)]">
                    <Destello className="h-3.5 w-3.5" /> Lo estás viendo
                  </p>
                ) : (
                  <BotonAgregar producto={productoDe(s.producto)} />
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Un kit en horizontal: arco con la ilustración, qué trae, precio, ahorro real y «Agregar». */
function TarjetaKit({ k, grande = false }: { k: ProductoSalon & { kit: KitSalon }; grande?: boolean }) {
  return (
    <li data-mu-producto className={`@container flex gap-4 rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)] bg-[var(--surface-raised)] mu-sombra-tarjeta ${grande ? "p-4 sm:gap-6 sm:p-6" : "p-4"}`}>
      <EnlaceFicha p={k} data-mu-foto tabIndex={-1} aria-hidden="true" className="shrink-0">
        <Escenario categoria={k.categoria} className={`mu-arco ${grande ? "h-36 w-28 sm:h-52 sm:w-44" : "h-36 w-28"}`}>
          <Ilustracion p={k} cerca sello="h-[56%] w-[56%]" />
        </Escenario>
      </EnlaceFicha>
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <PildoraAhorro ahorro={k.kit.ahorro} />
        <p className="mt-2 text-[length:var(--mu-t-nombre)] font-semibold uppercase tracking-[0.04em] text-[var(--text-primary)]">
          <EnlaceFicha p={k} className="mu-foco rounded-sm hover:underline hover:underline-offset-4">
            {k.nombre}
          </EnlaceFicha>
        </p>
        <p className="mt-1 text-[12px] font-medium text-[var(--mu-acento-tinta)]">
          Cód. {k.codigo} · {k.kit.componentes.map((c) => (c.cantidad > 1 ? `${c.cantidad} × ${c.codigo}` : c.codigo)).join(" + ")}
        </p>
        {grande && (
          <p className="mt-2 line-clamp-2 text-[length:var(--mu-t-chico)] leading-snug text-[var(--text-secondary)]">
            Trae {k.kit.componentes.map((c) => (c.cantidad > 1 ? `${c.cantidad} × ${c.nombre}` : c.nombre)).join(" + ")}.
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="mu-precio text-[1.75rem] text-[var(--text-primary)]">{solesCortos(k.precio)}</span>
          <span className="text-[length:var(--mu-t-chico)] text-[var(--text-tertiary)]">Por separado {solesCortos(k.kit.porSeparado)}</span>
        </p>
        <div className="mt-auto pt-3">
          <BotonAgregar producto={productoDe(k)} />
        </div>
      </div>
    </li>
  );
}

/** «Llévalo en kit»: los kits y dúos que traen este producto, con lo que ahorras de verdad. */
export function KitsQueLoTraen({ kits, nombre }: { kits: ProductoSalon[]; nombre: string }) {
  const conKit = kits.filter((k): k is ProductoSalon & { kit: KitSalon } => Boolean(k.kit && k.kit.ahorro > 0)).sort((a, b) => b.kit.ahorro - a.kit.ahorro);
  if (conKit.length === 0) return null;
  const pocos = conKit.length <= 2;
  return (
    <section aria-labelledby="mu-en-kit" className="py-14 sm:py-20">
      <div className={ANCHO}>
        {/* Uno o dos kits: el título a la izquierda y los kits a la derecha (en una grilla de 3, uno solo dejaba 2/3 vacíos). */}
        <div className={pocos ? "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-14 lg:[&>div:first-child]:mb-0" : ""}>
          <TituloSeccion
            id="mu-en-kit"
            kicker="Ahorra en kit"
            titulo="Llévalo en kit"
            texto={`${nombre} también viene ${conKit.length === 1 ? "en este kit" : "en estos kits"}: pagas menos que comprando cada producto por separado.`}
          />
          <ul className={`grid gap-4 ${pocos ? (conKit.length === 2 ? "md:grid-cols-2 lg:grid-cols-1" : "") : "md:grid-cols-2 lg:grid-cols-3 lg:gap-6"}`}>
            {conKit.slice(0, 3).map((k) => (
              <TarjetaKit key={k.id} k={k} grande={conKit.length === 1} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Lo que trae un kit (va en la columna del resumen): cada producto con su código, su precio y su ficha. */
export function QueTrae({ kit }: { kit: KitSalon }) {
  return (
    <div className="mt-6">
      <p className="mu-kicker text-[var(--mu-acento-tinta)]">Qué trae</p>
      <ul className="mt-3 divide-y divide-[var(--rule-soft)] rounded-[var(--mu-radio-control)] border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        {kit.componentes.map((c) => (
          <li key={c.codigo} className="flex items-center gap-3 px-3 py-2.5">
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--mu-radio-control)] bg-[var(--surface-sunken)]">
              <Ilustracion p={{ id: c.id, imagen: "", codigo: c.codigo }} cerca sello="h-[80%] w-[80%]" />
            </span>
            <span className="min-w-0 flex-1">
              <a href={c.href} className="mu-foco line-clamp-2 rounded-sm text-[length:var(--mu-t-nombre)] font-medium leading-snug text-[var(--text-primary)] hover:underline hover:underline-offset-4">
                {c.cantidad > 1 ? `${c.cantidad} × ` : ""}
                {c.nombre}
              </a>
              <span className="block text-[12px] tabular-nums text-[var(--text-tertiary)]">{c.codigo}</span>
            </span>
            <span className="mu-precio-chico shrink-0 text-[length:var(--mu-t-chico)] text-[var(--text-primary)]">{solesCortos(c.precio * c.cantidad)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pasos({ kicker, titulo, pasos }: { kicker: string; titulo: string; pasos: readonly string[] }) {
  if (pasos.length === 0) return null;
  return (
    <section aria-labelledby="mu-pasos" className="bg-[var(--mu-hueso)] py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-pasos" kicker={kicker} titulo={titulo} />
        <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
          {pasos.map((t, i) => (
            <li key={t} className="flex gap-4 rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:flex-col sm:gap-3">
              <Numeral n={i + 1} />
              <p className="text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{t}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Una fila de tarjetas (las mismas del catálogo, con su contador). */
export function Rutina({ productos, kicker, titulo, verTodo }: { productos: ProductoSalon[]; kicker: string; titulo: string; verTodo?: { href: string; texto: string } }) {
  if (productos.length === 0) return null;
  return (
    <section aria-labelledby="mu-rutina" className="py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-rutina" kicker={kicker} titulo={titulo} {...(verTodo ? { verTodo } : {})} />
        <Carril etiqueta={titulo}>
          {productos.map((x) => (
            <TarjetaProducto key={x.id} p={x} />
          ))}
        </Carril>
      </div>
    </section>
  );
}

/** En la ficha de un servicio: los demás, cada uno a su ficha. */
export function OtrosServicios({ servicios, slug }: { servicios: ProductoSalon[]; slug: string }) {
  if (servicios.length === 0) return null;
  return (
    <section aria-labelledby="mu-otros" className="py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-otros" kicker="Salón" titulo="Otros servicios" verTodo={{ href: rutas(slug).servicios, texto: "Ver todos los servicios" }} />
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {servicios.map((s) => (
            <li key={s.id}>
              <a
                href={s.href}
                className="mu-foco group flex h-full flex-col gap-2 rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition-colors duration-200 hover:border-[var(--rule-base)]"
              >
                <span className="text-lg font-semibold leading-snug text-[var(--text-primary)]">{s.nombre}</span>
                <span className="mt-auto flex flex-wrap items-center gap-x-3 text-base text-[var(--text-secondary)]">
                  {s.duracion && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                    </span>
                  )}
                  <span className="mu-precio-chico text-[var(--text-primary)]">{soles(s.precio)}</span>
                  <ArrowRight className="ml-auto h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Un producto que no es del salón (la bodega de prueba de `main`), está oculto
 * o no existe: «no lo encontramos» DENTRO del marco — nunca la ficha general.
 */
export function NoEncontrado({ nombre, slug, sugeridos }: { nombre: string; slug: string; sugeridos: ProductoSalon[] }) {
  const r = rutas(slug);
  return (
    <main id="main-content">
      <div className={`${ANCHO} py-8 sm:py-12`}>
        <div className="flex flex-col items-center rounded-[var(--mu-radio-tarjeta)] bg-[var(--mu-nude-claro)] px-6 py-14 text-center sm:py-20">
          <Sello id="no-encontrado" className="h-20 w-20" />
          <Kicker className="mt-5">Error 404</Kicker>
          <h1 className="mu-serif mt-2 max-w-2xl text-[length:var(--mu-t-titulo)] leading-tight text-[var(--text-primary)]">No encontramos este producto</h1>
          <p className="mt-3 max-w-lg text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">
            Puede que ya no esté a la venta o que el enlace esté incompleto. Mira lo que sí tenemos en {nombre}.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={r.catalogo} className={BOTON}>
              Ver el catálogo
            </a>
            <a href={r.base} className={BOTON_BORDE}>
              Ir al inicio
            </a>
          </div>
        </div>
      </div>
      <Rutina productos={sugeridos} kicker={`Tienda ${nombre}`} titulo="Te puede gustar" verTodo={{ href: r.catalogo, texto: "Ver todo el catálogo" }} />
    </main>
  );
}
