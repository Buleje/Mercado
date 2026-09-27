/**
 * Lo que se ve mientras la tarjeta no tiene su troza: buscando, no existe, o no
 * se pudo preguntar. Cada uno dice qué hacer, con un botón que lo hace.
 */

import Link from "next/link";
import { LogIn, RefreshCw, SearchX, WifiOff, type LucideIcon } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { rutaFichaDeTroza, TAB_LIBRO_CTP } from "@/lib/forestal/ctp-troza-url";
import type { MotivoErrorFicha } from "@/hooks/use-ficha-troza";

export const BOTON_PRIMARIO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-base font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--accent-600)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)] disabled:opacity-60";
export const BOTON_SECUNDARIO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-base font-semibold text-[var(--text-primary)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/** La trozas del libro, sin ninguna abierta. */
const RUTA_TROZAS = `/admin?tab=${TAB_LIBRO_CTP}&vista=trozas`;

/** El esqueleto con la forma de la tarjeta: la pantalla no salta al llegar la ficha. */
export function TarjetaEsqueleto() {
  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-lg">
      <span className="sr-only">Buscando la troza…</span>
      <div aria-hidden className="space-y-4 bg-[var(--surface-sunken)] px-5 pb-6 pt-5">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--rule-base)]" />
        <div className="h-14 w-40 animate-pulse rounded-lg bg-[var(--rule-base)]" />
        <div className="h-6 w-48 animate-pulse rounded bg-[var(--rule-base)]" />
      </div>
      <div aria-hidden className="grid grid-cols-3 gap-2 p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
        ))}
      </div>
      <div aria-hidden className="space-y-3 px-5 pb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
        ))}
      </div>
    </div>
  );
}

function Aviso({
  icono: Icono,
  titulo,
  texto,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <div role="alert" data-tarjeta-aviso className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-8 text-center shadow-lg sm:px-8">
      <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--accent)]/12 text-[var(--accent-ink)]">
        <Icono className="h-7 w-7" />
      </span>
      <CardTitle as="h1" className="mt-4 text-xl font-bold">
        {titulo}
      </CardTitle>
      <p className="mx-auto mt-2 max-w-[26rem] text-base text-[var(--text-secondary)]">{texto}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">{children}</div>
    </div>
  );
}

/** Id con forma de troza que no está en el libro (o es de otro negocio: el 404 no distingue). */
export function TarjetaNoEncontrada({ idValido }: { idValido: boolean }) {
  return (
    <Aviso
      icono={SearchX}
      titulo={idValido ? "Esa troza no está en el libro" : "Ese código no es de una troza"}
      texto={
        idValido
          ? "Se anuló su guía o la etiqueta es de otro negocio. Búscala por su código en Trozas."
          : "El QR no trae una troza de este sistema. Escanea el QR chico de la etiqueta."
      }
    >
      <Link href={RUTA_TROZAS} className={BOTON_PRIMARIO}>
        Ir a Trozas
      </Link>
    </Aviso>
  );
}

const ERRORES: Record<MotivoErrorFicha, { icono: LucideIcon; titulo: string; texto: string }> = {
  sin_senal: {
    icono: WifiOff,
    titulo: "Sin señal",
    texto: "El QR grande de la etiqueta trae la ficha en texto: léelo con la cámara, funciona sin internet.",
  },
  sesion: { icono: LogIn, titulo: "Tu sesión venció", texto: "Vuelve a entrar y se abre esta misma troza." },
  modulo: { icono: SearchX, titulo: "El Libro CTP no está activo", texto: "Este negocio no tiene el libro de operaciones habilitado." },
  permiso: { icono: LogIn, titulo: "Tu usuario no ve el libro", texto: "Pide a un administrador o almacenero que la abra." },
  servidor: { icono: RefreshCw, titulo: "No se pudo leer la troza", texto: "El sistema no respondió. Intenta otra vez en unos segundos." },
};

export function TarjetaError({ motivo, id, onReintentar }: { motivo: MotivoErrorFicha; id: string; onReintentar: () => void }) {
  const e = ERRORES[motivo];
  return (
    <Aviso icono={e.icono} titulo={e.titulo} texto={e.texto}>
      {motivo === "sesion" ? (
        <a href={`/admin/login?from=${encodeURIComponent(`/admin/q/${id}`)}`} className={BOTON_PRIMARIO}>
          <LogIn className="h-5 w-5" aria-hidden /> Entrar
        </a>
      ) : motivo === "sin_senal" || motivo === "servidor" ? (
        <button type="button" onClick={onReintentar} className={BOTON_PRIMARIO}>
          <RefreshCw className="h-5 w-5" aria-hidden /> Reintentar
        </button>
      ) : null}
      {motivo !== "modulo" && motivo !== "permiso" && (
        <Link href={rutaFichaDeTroza(id)} className={BOTON_SECUNDARIO}>
          Abrir en el libro
        </Link>
      )}
    </Aviso>
  );
}
