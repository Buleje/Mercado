/**
 * El sello del negocio (ADR-511): la misma geometría del sello chico de Musa
 * (`pagina-musa/Sello.tsx`, lienzo de 1000: aro de 478 con trazo 30, aro de
 * 432 con trazo 16 y disco de 388), con lo que sea de cada tienda adentro:
 *   · con logo → el logo en el disco (fondo blanco en los dos temas, para que
 *     un logo con letras negras no se pierda en oscuro);
 *   · sin logo → MONOGRAMA: la inicial del nombre en la letra de la tienda,
 *     sobre el acento.
 *
 * Sin `"use client"`. Aros en `--ti-texto` (en oscuro pasan a hueso), disco en
 * `--ti-acento` y letra en `--ti-sobre-acento` (≥ 4,5:1, lo asegura `tema.ts`).
 * Decorativo por defecto: el nombre ya va escrito al lado; con `titulo`, lo
 * lee el lector de pantalla.
 */
import type { CSSProperties } from "react";
import { inicialDe } from "./ui";

export function Sello({
  nombre,
  logo,
  titulo,
  className = "",
}: {
  nombre: string;
  logo: string | null;
  titulo?: string;
  className?: string;
}) {
  const lector = titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true as const };
  return (
    <span className={`relative inline-block shrink-0 ${className}`} {...lector}>
      <svg viewBox="0 0 1000 1000" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
        <circle cx="500" cy="500" r="478" fill="none" strokeWidth="30" className="stroke-[var(--ti-texto)]" />
        <circle cx="500" cy="500" r="432" fill="none" strokeWidth="16" className="stroke-[var(--ti-texto)]" />
        <circle cx="500" cy="500" r="388" className={logo ? "fill-[var(--ti-blanco)]" : "fill-[var(--ti-acento)]"} />
        {!logo && (
          <text
            x="500"
            y="500"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="440"
            fontWeight="600"
            className="fill-[var(--ti-sobre-acento)] font-[family-name:var(--ti-fuente)]"
          >
            {inicialDe(nombre)}
          </text>
        )}
      </svg>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element -- logo subido por el dueño (cualquier dominio): sin el paso de /_next/image
        <img
          src={logo}
          alt=""
          loading="eager"
          decoding="async"
          className="absolute inset-[18%] h-[64%] w-[64%] rounded-full object-contain"
        />
      )}
    </span>
  );
}

/**
 * El contador de la bolsa: un círculo del acento con el número (como el
 * «sello contador» de Musa). Desde 10 dice «9+». Cada número nuevo entra desde
 * abajo (`key`); con `previo`, el anterior sale hacia arriba. Con «reducir
 * movimiento» cambia en seco (`CSS_PIEZAS`). Decorativo: el texto para el
 * lector lo pone el botón que lo usa.
 */
export function SelloContador({ n, previo, tamano = 22, className = "" }: { n: number; previo?: number | null; tamano?: 20 | 22 | 28; className?: string }) {
  const texto = n > 9 ? "9+" : String(n);
  const antes = previo == null ? null : previo > 9 ? "9+" : String(previo);
  return (
    <span data-ti-contador aria-hidden="true" className={`ti-sello-contador ${className}`} style={{ "--ti-lado": `${tamano}px` } as CSSProperties}>
      {antes !== null && antes !== texto && (
        <span key={`sale-${antes}-${texto}`} className="ti-contador-num-sale">
          {antes}
        </span>
      )}
      <span key={texto} className="ti-contador-num">
        {texto}
      </span>
    </span>
  );
}
