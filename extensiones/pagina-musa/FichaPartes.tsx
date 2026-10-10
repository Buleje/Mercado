/**
 * Las partes de la ficha de Musa (ADR-460; contrato visual §e «Ficha») que no
 * tienen estado y sirven en el servidor: migas, la galería (arco alto con el
 * envase y tres miniaturas: envase, textura y «en tu rutina»), el precio con
 * el ahorro real de los kits, la línea de preventa o encargo, las existencias
 * y el esqueleto mientras llegan los datos.
 * La ficha rápida (`FichaRapida`) usa las mismas.
 */
import type { ReactNode } from "react";
import { Check } from "@buleje/design-system/icons";
import type { ProductoSalon } from "./datos";
import { solesCortos } from "./destinos";
import { imagenDe, NOMBRE_TEXTURA, texturaDe, type Textura } from "./imagenes";
import type { PasoRutina } from "./rutina";
import { Escenario, Ilustracion } from "./TarjetaProducto";
import { ANCHO } from "./ui";

const POCAS = 5;

export interface Miga {
  nombre: string;
  href?: string;
}

/** Inicio / categoría / producto. El último no es enlace: es donde estás. */
export function Migas({ items }: { items: Miga[] }) {
  return (
    <nav aria-label="Estás en" className="text-[length:var(--mu-t-chico)] text-[var(--text-secondary)]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((m, i) => (
          <li key={m.nombre} className="inline-flex items-center gap-x-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {m.href ? (
              <a href={m.href} className="mu-foco rounded-sm underline-offset-4 hover:text-[var(--text-primary)] hover:underline">
                {m.nombre}
              </a>
            ) : (
              <span aria-current="page" className="font-medium text-[var(--text-primary)]">
                {m.nombre}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** La mancha de la textura (crema, gel, aceite…), dibujada con los colores de los envases. */
export function TexturaDibujo({ textura, className = "" }: { textura: Textura; className?: string }) {
  const trazo = "stroke-[var(--mu-nude-fuerte)]";
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false" className={className}>
      {textura === "crema" && (
        <>
          <path d="M14 52c-2-12 9-20 20-19 4-9 18-10 23-1 10 0 15 9 11 17-3 7-12 9-27 9-14 0-26 1-27-6Z" className={`fill-[var(--mu-envase-crema)] ${trazo}`} strokeWidth="1.2" />
          <path d="M30 40c6-6 16-6 21 0" fill="none" className="stroke-[var(--mu-envase-etiqueta)]" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {textura === "gel" && (
        <>
          <ellipse cx="40" cy="50" rx="27" ry="14" className={`fill-[var(--mu-envase-celeste)] ${trazo}`} strokeWidth="1.2" />
          <circle cx="30" cy="47" r="3" className="fill-[var(--mu-envase-etiqueta)]" />
          <circle cx="47" cy="53" r="2" className="fill-[var(--mu-envase-etiqueta)]" />
          <circle cx="53" cy="45" r="1.5" className="fill-[var(--mu-envase-etiqueta)]" />
        </>
      )}
      {(textura === "aceite" || textura === "serum") && (
        <>
          <path d="M40 12c9 14 18 24 18 35a18 18 0 0 1-36 0c0-11 9-21 18-35Z" className={textura === "aceite" ? "fill-[var(--mu-envase-ambar)]" : "fill-[var(--mu-envase-naranja)]"} />
          <path d="M31 46c0 6 4 10 9 11" fill="none" className="stroke-[var(--mu-envase-etiqueta)]" strokeWidth="3" strokeLinecap="round" opacity=".7" />
          {textura === "serum" && <path d="M62 54c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11Z" className="fill-[var(--mu-envase-naranja)]" />}
        </>
      )}
      {textura === "bruma" &&
        [
          [22, 40, 3],
          [32, 30, 2.4],
          [34, 48, 2.8],
          [46, 38, 3.4],
          [50, 24, 2],
          [56, 50, 2.6],
          [62, 34, 2.2],
          [42, 58, 2],
          [26, 56, 1.8],
        ].map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} className="fill-[var(--mu-envase-salvia)]" opacity=".55" />)}
      {textura === "lamina" && (
        <>
          <path d="M22 16h36c4 0 6 3 6 7v34c0 4-2 7-6 7H22c-4 0-6-3-6-7V23c0-4 2-7 6-7Z" className={`fill-[var(--mu-envase-nude)] ${trazo}`} strokeWidth="1.2" />
          <ellipse cx="33" cy="35" rx="4" ry="2.2" className="fill-[var(--mu-envase-crema)]" />
          <ellipse cx="47" cy="35" rx="4" ry="2.2" className="fill-[var(--mu-envase-crema)]" />
          <path d="M34 50c4 3 8 3 12 0" fill="none" className="stroke-[var(--mu-envase-crema)]" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {textura === "granos" && (
        <>
          <path d="M14 54c0-10 12-16 26-16s26 6 26 16c0 6-12 8-26 8s-26-2-26-8Z" className="fill-[var(--mu-envase-crema)]" />
          {[
            [24, 50],
            [32, 45],
            [40, 52],
            [47, 44],
            [55, 50],
            [36, 57],
            [50, 57],
          ].map(([x, y]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="2.6" ry="1.8" className="fill-[var(--mu-envase-kraft-sombra)]" />
          ))}
        </>
      )}
    </svg>
  );
}

/** Una miniatura con su rótulo (decorativas: informan, no se tocan). */
function Mini({ rotulo, detalle, children }: { rotulo: string; detalle: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <span className="relative block aspect-square overflow-hidden rounded-[var(--mu-radio-control)] border border-[var(--rule-soft)] bg-[var(--surface-raised)]">{children}</span>
      <span className="min-w-0 leading-tight">
        <span className="mu-kicker block truncate text-[var(--text-tertiary)]">{rotulo}</span>
        <span className="block truncate text-[length:var(--mu-t-chico)] font-medium text-[var(--text-primary)]">{detalle}</span>
      </span>
    </li>
  );
}

/**
 * El arco alto con el envase grande sobre el tinte de su categoría y, debajo,
 * tres miniaturas. Producto: envase · textura · su paso en la rutina. Kit: lo
 * que trae (cada envase con su código). `data-mu-foto`: de ahí sale el vuelo a la bolsa.
 * En el celular el arco es más bajo (6:5) y las miniaturas no salen (repiten el
 * arco, «Qué trae» y «Tu rutina en 3 pasos»): así el nombre y el precio asoman
 * en la primera pantalla en vez de quedar ~700 px más abajo.
 */
export function Galeria({ p, paso }: { p: ProductoSalon; paso: PasoRutina | null }) {
  const { ilustracion } = imagenDe(p);
  const textura = texturaDe(p.codigo);
  const kit = p.kit && p.kit.ahorro > 0 ? p.kit : null;
  return (
    <div className="lg:sticky lg:top-28 lg:self-start">
      <div data-mu-foto className="group relative">
        <Escenario categoria={p.categoria} className="mu-arco aspect-[6/5] w-full lg:aspect-auto lg:h-[560px]">
          <Ilustracion p={p} prioridad alt={ilustracion ? `${p.nombre} (ilustración referencial)` : p.nombre} sello="h-[40%] w-[40%]" />
        </Escenario>
        {kit && (
          // El círculo negro del catálogo («AHORRA S/ 18»), montado sobre el borde del arco.
          <span className="mu-sombra-flotante absolute -right-1 top-[10%] grid h-24 w-24 place-items-center rounded-full bg-[var(--mu-cacao)] text-center text-[var(--mu-sobre-cacao)] ring-[1.5px] ring-[var(--mu-oro)] ring-offset-[3px] ring-offset-[var(--mu-cacao)] sm:h-28 sm:w-28">
            <span className="leading-none">
              <span className="mu-kicker block text-[var(--mu-oro)]">Ahorras</span>
              <span className="mu-precio mt-1 block text-[1.75rem] sm:text-[2rem]">{solesCortos(kit.ahorro)}</span>
            </span>
          </span>
        )}
      </div>
      {p.kit ? (
        <ul aria-label="Lo que trae" className="mt-4 hidden grid-cols-3 gap-3 sm:grid">
          {p.kit.componentes.map((c) => (
            <Mini key={c.codigo} rotulo={c.codigo} detalle={c.cantidad > 1 ? `${c.cantidad} × ${solesCortos(c.precio)}` : solesCortos(c.precio)}>
              <Ilustracion p={{ id: c.id, imagen: "", codigo: c.codigo }} cerca sello="h-[56%] w-[56%]" />
            </Mini>
          ))}
        </ul>
      ) : (
        <ul aria-label="Detalles" className="mt-4 hidden grid-cols-3 gap-3 sm:grid">
          <Mini rotulo="Envase" detalle={p.codigo ?? p.unidad}>
            <Ilustracion p={p} cerca sello="h-[56%] w-[56%]" />
          </Mini>
          {textura && (
            <Mini rotulo="Textura" detalle={NOMBRE_TEXTURA[textura]}>
              <TexturaDibujo textura={textura} className="absolute inset-[14%]" />
            </Mini>
          )}
          {paso && (
            <Mini rotulo="Rutina" detalle={`Paso ${paso.numero} · ${paso.titulo}`}>
              <span className="absolute inset-0 grid place-items-center bg-[var(--mu-oro-claro)]">
                <span className="mu-precio text-[2.5rem] text-[var(--mu-oro-tinta)]">{paso.numero}</span>
              </span>
            </Mini>
          )}
        </ul>
      )}
      {ilustracion && <p className="mt-3 text-[12px] text-[var(--text-tertiary)]">Ilustración referencial: el envase que te llega puede variar.</p>}
    </div>
  );
}

/** «PRECIO MUSA», el precio grande y, en un kit, «Por separado S/ 167 · ahorras S/ 18» (cuentas del servidor, sin tachar). */
export function Precio({ p }: { p: ProductoSalon }) {
  const kit = p.kit && p.kit.ahorro > 0 ? p.kit : null;
  return (
    <div className="mt-5">
      <p className="mu-kicker text-[var(--text-tertiary)]">Precio Musa</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="mu-precio text-[length:var(--mu-t-precio)] text-[var(--text-primary)]">{solesCortos(p.precio)}</span>
        {p.antes && (
          <span className="text-lg tabular-nums text-[var(--text-tertiary)] line-through">
            <span className="sr-only">Antes </span>
            {solesCortos(p.antes)}
          </span>
        )}
      </p>
      {kit && (
        <p className="mt-2 text-[length:var(--mu-t-chico)] text-[var(--text-secondary)]">
          Por separado {solesCortos(kit.porSeparado)} · <strong className="font-semibold text-[var(--mu-ahorro)]">ahorras {solesCortos(kit.ahorro)}</strong>
        </p>
      )}
      {p.antes && !kit && <p className="mt-2 text-[length:var(--mu-t-chico)] font-semibold text-[var(--mu-ahorro)]">Ahorras {solesCortos(p.antes - p.precio)}</p>}
      <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">Precio final en soles.</p>
    </div>
  );
}

/** Preventa o por encargo: qué significa para quien compra (sin prometer fechas que no están en la base). */
export function EstadoPedido({ etiqueta }: { etiqueta: string | null }) {
  if (!etiqueta) return null;
  const encargo = /encargo/i.test(etiqueta);
  return (
    <p className={`mt-4 flex items-start gap-2 rounded-[var(--mu-radio-control)] px-3 py-2.5 text-[length:var(--mu-t-chico)] leading-snug ${encargo ? "bg-[var(--mu-encargo-fondo)] text-[var(--mu-encargo)]" : "bg-[var(--mu-oro-claro)] text-[var(--mu-oro-tinta)]"}`}>
      <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
      <span>
        <strong className="font-semibold">{encargo ? "Por encargo." : "Preventa."}</strong>{" "}
        {encargo ? "Se pide al proveedor cuando confirmas tu pago (100 % adelantado)." : "Lo separas hoy y Drucila te confirma la entrega por WhatsApp."}
      </span>
    </p>
  );
}

export function Existencias({ stock }: { stock: number | null }) {
  if (stock === null) return null;
  const [texto, tono] =
    stock <= 0
      ? ["Agotado por ahora", "text-[var(--text-secondary)]"]
      : stock <= POCAS
        ? [`¡Quedan ${stock}!`, "font-semibold text-[var(--mu-achiote-tinta)]"]
        : ["Disponible para delivery", "text-[var(--mu-exito)]"];
  return (
    <p className={`mt-4 inline-flex items-center gap-2 text-[length:var(--mu-t-chico)] ${tono}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${stock > 0 ? "bg-current" : "bg-[var(--rule-strong)]"}`} />
      {texto}
    </p>
  );
}

/** Mientras llegan los datos: las migas, el arco y la columna de compra. */
export function EsqueletoFicha() {
  const linea = "animate-pulse rounded bg-[var(--mu-nude-claro)]";
  return (
    <div aria-busy="true" aria-label="Cargando el producto" role="status" className={`${ANCHO} pb-14 pt-6 sm:pt-8`}>
      <div className={`${linea} h-4 w-64`} />
      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="mu-arco aspect-[6/5] animate-pulse bg-[var(--mu-nude-claro)] lg:aspect-auto lg:h-[560px]" />
        <div className="flex flex-col gap-4 pt-2">
          <div className={`${linea} h-4 w-32`} />
          <div className={`${linea} h-10 w-4/5`} />
          <div className={`${linea} h-6 w-24 rounded-full`} />
          <div className={`${linea} h-12 w-36`} />
          <div className={`${linea} h-24 w-full`} />
          <div className="h-12 w-full animate-pulse rounded-full bg-[var(--mu-nude-claro)]" />
          <div className="h-12 w-full animate-pulse rounded-full bg-[var(--mu-nude-claro)]" />
        </div>
      </div>
    </div>
  );
}
