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

export function FranjaAnuncio({ mensajes }: { mensajes: string[] }) {
  const [primero, segundo] = mensajes;
  if (!primero) return null;
  return (
    <div role="region" aria-label="Aviso de la tienda" className="bg-[var(--mu-cacao)] text-[var(--mu-sobre-cacao)]">
      <p className="mx-auto flex min-h-9 max-w-[1280px] items-center justify-center gap-3 px-4 text-center text-sm font-medium leading-snug sm:px-6 lg:px-8">
        <span>{primero}</span>
        {segundo && (
          <>
            <span aria-hidden="true" className="hidden text-[var(--text-tertiary)] sm:inline">·</span>
            <span className="hidden sm:inline">{segundo}</span>
          </>
        )}
      </p>
    </div>
  );
}
