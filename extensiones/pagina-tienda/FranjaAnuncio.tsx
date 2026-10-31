/**
 * La barra de avisos de arriba (como la de Musa): gris, 36 px, UNA línea fija,
 * sin rotar. En el celular, el primer aviso; desde 640 px, los dos primeros
 * separados por «·». Los avisos son los del dueño (`contenido.franja`, del
 * editor de la tienda): sin avisos, no hay barra.
 */

export function FranjaAnuncio({ mensajes }: { mensajes: readonly string[] }) {
  const [primero, segundo] = mensajes;
  if (!primero) return null;
  return (
    <div role="region" aria-label="Aviso de la tienda" className="bg-[var(--ti-suave)] text-[var(--ti-texto)]">
      <p className="mx-auto flex min-h-9 max-w-[1280px] items-center justify-center gap-3 px-4 py-1.5 text-center text-sm font-medium leading-snug sm:px-6 lg:px-8">
        <span>{primero}</span>
        {segundo && (
          <>
            <span aria-hidden="true" className="hidden text-[var(--ti-texto-3)] sm:inline">
              ·
            </span>
            <span className="hidden sm:inline">{segundo}</span>
          </>
        )}
      </p>
    </div>
  );
}
