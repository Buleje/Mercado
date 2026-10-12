/**
 * «Kits que ahorran» (`#ofertas`, el «Regalos» del menú): los kits y los dúos
 * de la base en un carril con las tarjetas del catálogo (ahorro real de
 * `p.kit`, contador al agregar; nunca se tacha un precio). El Kit Regalo
 * especial (KT04) va primero.
 *
 * Al pie, la Campaña de Navidad en UNA franja (antes era un bloque oscuro de
 * media pantalla): el regalo con compra y la preventa, con las palabras y las
 * fechas del manual (`CAMPANA_REGALO`, `PREVENTA_NAVIDAD`); se va sola el 31-12.
 */
import { Gift, MessageCircle } from "@buleje/design-system/icons";
import { Carril } from "./Carril";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, hoyEnLima, rutas, solesCortos } from "./destinos";
import { CAMPANA_REGALO, WHATSAPP_MUSA } from "./pedido-whatsapp";
import { avisoEnviosProvincia, diaCorto, etapaPreventaNavidad, PREVENTA_NAVIDAD } from "./preventa";
import { externo } from "./Salon";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, EnlaceVer, TituloBloque } from "./ui";

/** El orden del catálogo impreso (pág. 3-4): el kit de regalo, los kits y, al final, los dúos de la campaña. */
const ORDEN = ["KT04", "KT01", "KT02", "KT03", "KT05", "MU016-2", "MU013-2"];
const posicion = (p: ProductoSalon) => {
  const i = ORDEN.indexOf(p.codigo ?? "");
  return i < 0 ? ORDEN.length : i;
};

function Campana({ whatsapp }: { whatsapp: string }) {
  const hoy = hoyEnLima();
  if (hoy > CAMPANA_REGALO.hasta) return null;
  const preventa = etapaPreventaNavidad(hoy);
  const pv = PREVENTA_NAVIDAD;
  const lineas = [
    `De regalo, 1 mascarilla con tu compra desde ${solesCortos(CAMPANA_REGALO.monto)}, del ${diaCorto(CAMPANA_REGALO.desde)} al ${diaCorto(CAMPANA_REGALO.hasta)}.`,
    ...(preventa === "antes" ? [`Preventa: separa tu kit con ${solesCortos(pv.separaCon)} desde el ${diaCorto(pv.desde)}.`] : []),
    ...(preventa === "abierta" ? [`Preventa abierta: separa tu kit con ${solesCortos(pv.separaCon)}.`] : []),
    ...(preventa ? [avisoEnviosProvincia(hoy)].filter((l): l is string => l !== null) : []),
  ];
  const mensaje = preventa === "abierta" ? `Hola Drucila, quiero separar mi kit de Navidad con ${solesCortos(pv.separaCon)}.` : "Hola Drucila, quiero saber de la campaña de Navidad.";
  return (
    <aside aria-label="Campaña de Navidad" className="mt-6 flex flex-col gap-4 rounded-[var(--mu-radio-tarjeta)] bg-[var(--mu-cacao)] p-4 text-[var(--mu-sobre-cacao)] sm:mt-8 sm:flex-row sm:items-center sm:gap-6 sm:px-6 dark:ring-1 dark:ring-[var(--rule-base)]">
      <Gift className="hidden h-8 w-8 shrink-0 text-[var(--mu-oro)] sm:block" strokeWidth={1.5} aria-hidden="true" />
      <div className="flex-1">
        <p className="mu-kicker text-[var(--mu-oro)]">Campaña de Navidad</p>
        <ul className="mt-1 grid gap-0.5 text-base leading-snug">
          {lineas.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <a
        href={enlaceWhatsapp(whatsapp, mensaje)}
        {...externo}
        className="mu-foco inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-[var(--mu-sello-nude)] px-6 font-semibold text-[var(--mu-sello-m)] transition-transform duration-[var(--mu-dur-corto)] hover:-translate-y-0.5 sm:self-center"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" /> {preventa === "abierta" ? "Separar por WhatsApp" : "Preguntar por WhatsApp"}
      </a>
    </aside>
  );
}

export function Kits({ productos, slug, whatsapp }: { productos: readonly ProductoSalon[]; slug: string; whatsapp: string | null }) {
  const kits = productos.filter((p) => p.categoria === "Kits y ofertas").sort((a, b) => posicion(a) - posicion(b) || a.precio - b.precio);
  if (kits.length === 0) return null;
  return (
    <section id="ofertas" aria-labelledby="mu-kits" className="scroll-mt-24 bg-[var(--mu-tinte-kits)] py-12 sm:py-16">
      <div className={ANCHO}>
        <TituloBloque
          id="mu-kits"
          titulo="Kits que"
          acento="ahorran"
          texto="Rutinas completas en caja de regalo: pagas menos que por separado."
          accion={
            <EnlaceVer href={rutas(slug).categoria("Kits y ofertas")} describe="mu-kits">
              Ver los {kits.length} kits y ofertas
            </EnlaceVer>
          }
        />
        <Carril etiqueta="Kits y ofertas">
          {kits.map((p) => (
            <TarjetaProducto key={p.id} p={p} />
          ))}
        </Carril>
        <Campana whatsapp={whatsapp ?? WHATSAPP_MUSA} />
      </div>
    </section>
  );
}
