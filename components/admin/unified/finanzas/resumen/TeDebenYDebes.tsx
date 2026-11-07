"use client";

/**
 * «Te deben» y «Debes», una al lado de la otra, cada una con su enlace a la
 * sección que la detalla (Por cobrar · Lo que debo). Las cifras son los totales
 * de esas secciones tal cual (`deudas-del-negocio.ts`): acá sólo se dibujan.
 *
 * El enlace es un botón que cambia de vista dentro de Mi Plata sin recargar
 * (`irAlOrigen`: el `admin:navigate` al mismo módulo no cambia la vista). NO
 * un `<a href>`: `NavProgress` intercepta todo clic en un enlace interno y
 * espera un cambio de `pathname` que acá no llega (sólo cambia `?vista=`) — la
 * pantalla quedaba tapada por «Un toque ya viene» (medido 29-09 con
 * qa-capturas). El ⓘ va fuera del botón: uno dentro del otro no se toca solo.
 */

import { ArrowRight, CreditCard, ReceiptText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import type { CifraDeDeuda, DeudasDelNegocio } from "./deudas-del-negocio";

const enMonedas = (xs: CifraDeDeuda["montos"]) => xs.map((x) => montoEnMoneda(x.monto, x.moneda)).join(" · ");

interface Lado {
  rotulo: string;
  vista: "por-cobrar" | "por-pagar";
  seccion: string;
  vacio: string;
  unidad: [string, string];
  icon: typeof CreditCard;
  ayuda: { what: string; affects: string; example: string };
}

const LADOS: { teDeben: Lado; debes: Lado } = {
  teDeben: {
    rotulo: "Te deben",
    vista: "por-cobrar",
    seccion: "Por cobrar",
    vacio: "Nadie te debe",
    unidad: ["cuenta", "cuentas"],
    icon: CreditCard,
    ayuda: {
      what: "Todo lo que te deben: fiados, préstamos y adelantos que diste, y madera despachada a cuenta. Es el mismo total de «Por cobrar».",
      affects: "«Fiados pendientes» es sólo una parte de esta cifra. Cada moneda va aparte.",
      example: "Un fiado de S/ 30 y una venta de madera a cuenta de S/ 12 323 suman S/ 12 353 acá.",
    },
  },
  debes: {
    rotulo: "Debes",
    vista: "por-pagar",
    seccion: "Lo que debo",
    vacio: "No le debes a nadie",
    unidad: ["acreedor", "acreedores"],
    icon: ReceiptText,
    ayuda: {
      what: "Todo lo que debes: adelantos que te dieron, cuentas por pagar, préstamos que te hicieron y cuentas forestales a favor de la otra parte. Es el mismo total de «Lo que debo».",
      affects: "«Deuda proveedores» es sólo una parte de esta cifra. Si a alguien le debes y a la vez te debe, las dos cifras lo cuentan entero: su neto está en su fila de «Por cobrar» y de «Lo que debo».",
      example: "Si alguien te adelantó S/ 3 031 y te debe S/ 12 323 de madera, verás S/ 3 031 acá, S/ 12 323 en «Te deben» y «S/ 3 031 es entre las mismas personas».",
    },
  },
};

function Tarjeta({ lado, cifra }: { lado: Lado; cifra: CifraDeDeuda }) {
  const Icon = lado.icon;
  const [principal, ...otras] = cifra.montos;
  const cifraPrincipal = principal ? montoEnMoneda(principal.monto, principal.moneda) : montoEnMoneda(0, "PEN");
  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" data-testid={`resumen-${lado.vista}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="text-sm font-bold text-[var(--text-secondary)]">{lado.rotulo}</span>
        <InfoTip title={lado.rotulo} what={lado.ayuda.what} affects={lado.ayuda.affects} example={lado.ayuda.example} />
      </div>
      <button
        type="button"
        onClick={() => irAlOrigen({ tab: "plata", params: { vista: lado.vista } })}
        aria-label={`${lado.rotulo}: ${principal ? enMonedas(cifra.montos) : lado.vacio}. Ver ${lado.seccion}`}
        className="group mt-1 block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]"
      >
        {/* Sin partir «S/» del número: a 400 px, en dos columnas, el 2xl dejaba
            «S/» en un renglón y la cifra en otro (medido 29-09). Una cifra larga
            baja un tamaño en vez de cortarse. */}
        <span className={cn(
          "block whitespace-nowrap font-extrabold tabular-nums text-[var(--text-primary)]",
          cifraPrincipal.length > 12 ? "text-base sm:text-xl" : "text-lg sm:text-2xl",
        )}>
          {cifraPrincipal}
        </span>
        {otras.length > 0 && (
          <span className="block text-sm font-bold tabular-nums text-[var(--text-primary)]">{enMonedas(otras)}</span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-x-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          <span>{principal ? `en ${cifra.cuentas} ${cifra.cuentas === 1 ? lado.unidad[0] : lado.unidad[1]}` : lado.vacio}</span>
          <span className="inline-flex items-center gap-0.5 font-bold text-[var(--accent-ink)] group-hover:underline dark:text-[var(--accent)]">
            · Ver {lado.seccion} <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
        </span>
      </button>
    </div>
  );
}

/** Las dos cifras del Resumen. Sin ninguna de las dos (rol sin permiso), nada. */
export default function TeDebenYDebes({ deudas }: { deudas: DeudasDelNegocio }) {
  const { teDeben, debes, cruzable } = deudas;
  if (!teDeben && !debes) return null;
  return (
    <div className="space-y-1">
      <div className={teDeben && debes ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        {teDeben && <Tarjeta lado={LADOS.teDeben} cifra={teDeben} />}
        {debes && <Tarjeta lado={LADOS.debes} cifra={debes} />}
      </div>
      {teDeben && debes && cruzable.length > 0 && (
        <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
          {enMonedas(cruzable)} de esto es entre las mismas personas: les debes y te deben.
        </p>
      )}
    </div>
  );
}
