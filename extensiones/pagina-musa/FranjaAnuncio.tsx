/**
 * La barra de bienvenida (como la de Natura): cacao, 36 px, UNA línea fija,
 * sin rotar ni ventanas emergentes. En el celular, el primer mensaje vigente;
 * desde 640 px, los dos primeros separados por el destello ✦ oro. El orden
 * lo da `FRANJA` (anuncios.ts): lo de campaña primero, mientras dura.
 *
 * Antes rotaba 8 mensajes cada 4 s con botón de pausa (WCAG 2.2.2): era lo
 * único que se movía en la primera pantalla y nadie alcanzaba a leer el 5.º.
 * Sin código de bienvenida no hay «copiar»: el pedido sale por WhatsApp y no
 * hay dónde aplicarlo (ver `tema.ts`, cupón de la tienda general escondido).
 */
import { Destello } from "./ui";

export function FranjaAnuncio({ mensajes }: { mensajes: string[] }) {
  const [primero, segundo] = mensajes;
  if (!primero) return null;
  return (
    <div role="region" aria-label="Aviso de la tienda" className="bg-[var(--mu-cacao)] text-[var(--mu-sobre-cacao)]">
      <p className="mx-auto flex min-h-9 max-w-[1280px] items-center justify-center gap-3 px-4 text-center text-sm font-medium leading-snug tracking-[0.04em] sm:px-6 sm:tracking-[0.08em] lg:px-8">
        <span>{primero}</span>
        {segundo && (
          <>
            <Destello className="hidden h-2.5 w-2.5 shrink-0 text-[var(--mu-oro)] sm:block" />
            <span className="hidden sm:inline">{segundo}</span>
          </>
        )}
      </p>
    </div>
  );
}
