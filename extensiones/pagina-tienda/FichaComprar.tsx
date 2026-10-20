"use client";

/**
 * Lo que se toca en la ficha (ADR-511): «Agregar a tu bolsa · S/ x» (que se
 * vuelve contador + «Ver bolsa»), «Pregunta por WhatsApp» si el negocio tiene
 * número, «Compartir» y, en el celular, la barra fija con precio y contador
 * cuando el botón grande ya salió de la vista.
 *
 * · Compartir: en el celular abre el menú del teléfono (WhatsApp, Facebook…);
 *   en la compu, WhatsApp con el mensaje listo. El enlace es el de la página
 *   que se ve (el dominio real). Cancelar el menú no hace nada.
 * · La barra pone `html[data-ti-barra-compra]` mientras se ve: el aviso
 *   «Ver bolsa» del celular se esconde para no taparla.
 */
import { useEffect, useState } from "react";
import { MessageCircle, Share2 } from "@buleje/design-system/icons";
import type { Product } from "@/data/products";
import { BotonAgregar } from "./BotonAgregar";
import { BOTON_BORDE, EXTERNO, solesCortos } from "./ui";

export const ANCLA_COMPRAR = "ti-comprar";

function Compartir({ nombre, texto }: { nombre: string; texto: string }) {
  const compartir = async () => {
    const url = `${location.origin}${location.pathname}`;
    const porWhatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`, "_blank", "noopener,noreferrer");
    if (typeof navigator.share !== "function") return porWhatsapp();
    try {
      await navigator.share({ title: nombre, text: texto, url });
    } catch (err) {
      // Cerrar el menú del teléfono no es un error; cualquier otro, WhatsApp directo.
      if (!(err instanceof DOMException && err.name === "AbortError")) porWhatsapp();
    }
  };
  return (
    <button
      type="button"
      onClick={compartir}
      className="ti-foco inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--ti-radio-control)] px-5 text-base font-semibold text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-suave)]"
    >
      <Share2 className="h-5 w-5 text-[var(--ti-texto-2)]" aria-hidden="true" /> Compartir
    </button>
  );
}

/** El bloque de compra de la ficha. `consulta` = el enlace de WhatsApp ya armado (o `null` sin número). */
export function Comprar({ producto, consulta, compartir }: { producto: Product; consulta: string | null; compartir: string }) {
  return (
    <div id={ANCLA_COMPRAR} data-ti-despejar className="mt-7 flex flex-col gap-3">
      <BotonAgregar producto={producto} variante="grande" />
      {consulta && (
        <a href={consulta} {...EXTERNO} className={`${BOTON_BORDE} w-full`}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pregunta por WhatsApp
        </a>
      )}
      <Compartir nombre={producto.name} texto={compartir} />
    </div>
  );
}

/** La barra fija del celular: aparece cuando el bloque de compra quedó arriba, fuera de la vista. */
export function BarraCompra({ producto }: { producto: Product }) {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    const el = document.getElementById(ANCLA_COMPRAR);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([x]) => setVer(Boolean(x) && !x.isIntersecting && x.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    if (ver) html.dataset.tiBarraCompra = "";
    else delete html.dataset.tiBarraCompra;
    return () => {
      delete html.dataset.tiBarraCompra;
    };
  }, [ver]);

  return (
    <div
      inert={!ver}
      aria-hidden={!ver}
      className={`ti-sombra-flotante fixed inset-x-0 bottom-0 z-50 border-t border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-[var(--ti-texto)] transition-transform duration-[var(--ti-dur-medio)] ease-[var(--ti-ease)] md:hidden ${
        ver ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--ti-t-chico)] text-[var(--ti-texto-2)]">{producto.name}</p>
          <p className="ti-nombre mt-0.5 text-[1.5rem] leading-tight tabular-nums">{solesCortos(producto.price)}</p>
        </div>
        <BotonAgregar producto={producto} variante="barra" />
      </div>
    </div>
  );
}
