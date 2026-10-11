"use client";

/**
 * Tarjeta de un producto de Musa (contrato visual §e «Tarjeta»): el envase
 * ilustrado sobre el tinte de su categoría, dentro de un arco y con su sombra;
 * insignias (Preventa / Por encargo); kicker de categoría y código; nombre;
 * la frase «Ayuda a…»; precio en Cormorant y «Agregar», que al tocarlo se
 * vuelve el contador `[− n +]` (`BotonAgregar`) y pone «✓ En tu bolsa».
 * Un kit suma la píldora «Ahorras S/ 18», qué trae con sus códigos y «Por
 * separado S/ 167» (cuentas del servidor, `datos.ts`; sin tachar nada).
 *
 * La ilustración y el nombre abren la ficha rápida (`EnlaceFicha`); con
 * ctrl/cmd + clic o el clic del medio, la ficha en otra pestaña. Es de cliente
 * para que `p` viaje UNA vez al navegador (no una por enlace).
 *
 * La fila precio + botón se acomoda al ancho de la TARJETA (`@container`),
 * no al de la pantalla: la misma tarjeta vive en la grilla y en los carriles.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "@buleje/design-system/icons";
import { BotonAgregar, useEnBolsa } from "./BotonAgregar";
import type { ProductoSalon } from "./datos";
import { EnlaceFicha } from "./EnlaceFicha";
import { solesCortos as precio } from "./destinos";
import { anchosIlustracion, imagenDe, resumenDe, TAMANOS_TARJETA, tinteDe } from "./imagenes";
import { Sello } from "./Sello";

const POCAS = 5;

type ConImagen = Pick<ProductoSalon, "id" | "imagen" | "codigo">;

/**
 * El envase ilustrado (`.webp` cuadrado y transparente, con el envase parado
 * abajo al centro): entero (`contain`) y apoyado en la sombra del `Escenario`.
 * Si el archivo no existe todavía, el sello con el código: el error se escucha
 * y, por si llegó antes de hidratar (React no lo vio), se mira al montar.
 */
export function Ilustracion({
  p,
  prioridad = false,
  alt = "",
  className = "",
  sello = "h-[46%] w-[46%]",
  cerca = false,
  tamanos = TAMANOS_TARJETA,
}: {
  p: ConImagen;
  prioridad?: boolean;
  alt?: string;
  className?: string;
  sello?: string;
  /** El `sizes` del `<img>`: cuánto ocupa en la pantalla (elige el envase de 480, 800 o 1200). */
  tamanos?: string;
  /** Miniaturas: el envase más grande (sin el aire de la escena), apoyado abajo. */
  cerca?: boolean;
}) {
  const { src } = imagenDe(p);
  const [falla, setFalla] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFalla(true);
  }, [src]);

  if (!src || falla) {
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2" {...(alt ? { role: "img", "aria-label": alt } : {})}>
        <Sello id={`ilus-${p.id}`} className={`relative ${sello} opacity-90`} />
        {p.codigo && <span className="relative text-sm font-semibold tracking-[0.14em] text-[var(--mu-acento-tinta)]">{p.codigo}</span>}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- archivo propio de /public; con next/image no se ve el error para caer al sello
    <img
      ref={img}
      src={src}
      {...(anchosIlustracion(src) ? { srcSet: anchosIlustracion(src), sizes: tamanos } : {})}
      alt={alt}
      loading={prioridad ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={prioridad ? "high" : "auto"}
      onError={() => setFalla(true)}
      className={`absolute object-contain object-bottom ${cerca ? "inset-x-0 bottom-[3%] top-0 h-[97%] w-full origin-bottom scale-[1.32]" : "inset-x-[7%] bottom-[10%] top-[4%] h-[86%] w-[86%]"} ${className}`}
    />
  );
}

/** El «escenario» del envase (como el catálogo): el tinte de su categoría, un arco claro y la sombra elíptica donde se apoya. */
export function Escenario({ categoria, className = "", children }: { categoria: string; className?: string; children: ReactNode }) {
  return (
    <span className={`relative block overflow-hidden ${tinteDe(categoria)} ${className}`}>
      {/* En oscuro el arco se aclara (nude al 30 %): la tapa negra de los envases sobre el arco oscuro medía 1,08:1 y se perdía. */}
      <span aria-hidden="true" className="mu-arco absolute inset-x-[15%] bottom-[7%] top-[9%] bg-[var(--surface-raised)]/45 dark:bg-[var(--mu-nude-fuerte)]/30" />
      <span
        aria-hidden="true"
        className="absolute inset-x-[24%] bottom-[8.5%] h-[6%] rounded-[50%] bg-[radial-gradient(closest-side,var(--mu-envase-sombra),transparent)] transition-[transform,opacity] duration-300 group-hover:scale-x-90 group-hover:opacity-70"
      />
      {children}
    </span>
  );
}

/** Por encargo (achiote), Preventa u otro badge (acento, punto oro) o En stock (punto verde): `estadoProducto`. */
export function Insignia({ texto, grande = false }: { texto: string; grande?: boolean }) {
  const encargo = /encargo/i.test(texto);
  const enStock = texto === "En stock";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-[0.14em] ${grande ? "px-3 py-1.5 text-[12px]" : "px-2.5 py-1 text-[11px]"} ${
        encargo ? "bg-[var(--mu-encargo-fondo)] text-[var(--mu-encargo)]" : "bg-[var(--surface-raised)] text-[var(--mu-acento-tinta)] ring-1 ring-[var(--rule-soft)]"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${encargo ? "bg-current" : enStock ? "bg-[var(--mu-exito)]" : "bg-[var(--mu-oro)]"}`} />
      {texto}
    </span>
  );
}

/**
 * La píldora negra del catálogo: «AHORRAS S/ 18» (sólo con ahorro real). Con los
 * colores del botón principal: cacao + hueso en claro e invertida en oscuro
 * (nude + negro, 9,39:1), porque el cacao sobre la tarjeta oscura no se despegaba.
 */
export function PildoraAhorro({ ahorro, grande = false }: { ahorro: number; grande?: boolean }) {
  return (
    <span className={`mu-brillo inline-flex items-center rounded-full bg-[var(--mu-boton-fondo)] font-semibold uppercase tracking-[0.14em] text-[var(--mu-boton-texto)] ${grande ? "px-3.5 py-1.5 text-[12px]" : "px-2.5 py-1 text-[11px]"}`}>
      Ahorras {precio(ahorro)}
    </span>
  );
}

export function TarjetaProducto({ p, prioridad = false }: { p: ProductoSalon; prioridad?: boolean }) {
  const n = useEnBolsa(p.id);
  const kit = p.kit && p.kit.ahorro > 0 ? p.kit : null;
  const pocas = p.stock !== null && p.stock > 0 && p.stock <= POCAS;
  const linea = p.kit ? p.kit.componentes.map((c) => (c.cantidad > 1 ? `${c.cantidad} × ${c.nombre}` : c.nombre)).join(" + ") : resumenDe(p.descripcion);
  const { src } = imagenDe(p);

  return (
    <article
      data-mu-producto
      className="group @container relative flex h-full flex-col overflow-hidden rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)] bg-[var(--surface-raised)] mu-sombra-tarjeta transition-colors duration-200 hover:border-[var(--rule-base)] focus-within:border-[var(--rule-base)]"
    >
      <EnlaceFicha p={p} data-mu-foto tabIndex={-1} aria-hidden="true" className="relative block">
        {/* Cuadrada como la ilustración: así un kit no pierde los envases de los costados. */}
        <Escenario categoria={p.categoria} className="aspect-square">
          <Ilustracion p={p} prioridad={prioridad} className="origin-bottom transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1.5 group-hover:rotate-2" />
        </Escenario>
        <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5 @min-[15.5rem]:left-3 @min-[15.5rem]:top-3">
          {p.descuento && <span className="rounded-full bg-[var(--mu-ahorro)] px-2.5 py-1 text-sm font-bold text-[var(--surface-raised)]">-{p.descuento} %</span>}
          {p.etiqueta && <Insignia texto={p.etiqueta} />}
          {/* Tarjeta angosta (2 columnas del celular): la píldora va debajo de la insignia, no encima. */}
          {kit && (
            <span className="@min-[15.5rem]:hidden">
              <PildoraAhorro ahorro={kit.ahorro} />
            </span>
          )}
        </span>
        {kit && (
          <span className="absolute right-3 top-3 hidden @min-[15.5rem]:block">
            <PildoraAhorro ahorro={kit.ahorro} />
          </span>
        )}
        {n > 0 && (
          // Entra una vez y «late» en cada cambio del contador (`key`): el aviso de que sumó sin tapar el texto de la tarjeta.
          <span className="mu-entrar absolute bottom-2.5 left-2.5 [--mu-i:0] [animation-duration:var(--mu-dur-medio)] @min-[15.5rem]:bottom-3 @min-[15.5rem]:left-3">
            <span
              key={n}
              className="mu-sombra-tarjeta inline-flex origin-left animate-[mu-latido_var(--mu-dur-medio)_var(--mu-ease-rebote)] items-center gap-1 rounded-full bg-[var(--mu-exito-fondo)] px-2.5 py-1 text-sm font-semibold text-[var(--mu-exito)]"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" /> En tu bolsa
            </span>
          </span>
        )}
      </EnlaceFicha>

      <div className="flex flex-1 flex-col p-3 @min-[15.5rem]:p-4">
        <p className="flex items-baseline justify-between gap-2">
          <span className="mu-kicker truncate text-[var(--mu-acento-tinta)]">{p.kit ? (p.kit.componentes.length === 1 ? "Dúo" : "Kit") : p.categoria}</span>
          {p.codigo && <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-tertiary)]">{p.codigo}</span>}
        </p>
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.7em] text-[length:var(--mu-t-nombre)] font-medium leading-[1.35] text-[var(--text-primary)]">
          <EnlaceFicha p={p} className="mu-foco rounded-sm hover:underline hover:underline-offset-4">
            {p.nombre}
          </EnlaceFicha>
        </h3>
        {linea && <p className="mt-1 line-clamp-2 text-[length:var(--mu-t-chico)] leading-snug text-[var(--text-tertiary)]">{linea}</p>}
        {p.kit && <p className="mt-1 text-sm font-medium text-[var(--mu-acento-tinta)]">Cód. {p.kit.componentes.map((c) => c.codigo).join(", ")}</p>}
        {pocas && <p className="mt-1 text-sm font-semibold text-[var(--mu-achiote-tinta)]">¡Quedan {p.stock}!</p>}

        <div className="mt-auto flex flex-col gap-2.5 pt-3 @min-[15.5rem]:flex-row @min-[15.5rem]:items-end @min-[15.5rem]:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="mu-precio text-[length:var(--mu-t-precio-tarjeta)] text-[var(--text-primary)]">{precio(p.precio)}</span>
              {p.antes && (
                <span className="text-sm tabular-nums text-[var(--text-tertiary)] line-through">
                  <span className="sr-only">Antes </span>
                  {precio(p.antes)}
                </span>
              )}
            </p>
            {kit && <p className="mt-0.5 whitespace-nowrap text-sm text-[var(--text-tertiary)]">Por separado {precio(kit.porSeparado)}</p>}
          </div>
          <BotonAgregar
            producto={{
              id: p.id,
              name: p.nombre,
              category: p.categoria,
              price: p.precio,
              image: src ?? "",
              unit: p.unidad,
              ...(p.stock !== null ? { stock: p.stock } : {}),
            }}
          />
        </div>
      </div>
    </article>
  );
}
