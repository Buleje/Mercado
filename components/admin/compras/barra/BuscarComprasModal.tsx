"use client";

/**
 * «Buscar en Compras» (C57) y «Recibir mercadería» (C63, atajo R).
 *
 * Un solo cuadro para encontrar una orden, un proveedor, una cuenta por pagar,
 * una recepción o una devolución por su comprobante, el código de la orden, el
 * RUC, el importe o un nombre. Cada resultado trae lo vinculado y su siguiente
 * paso; ↑↓ eligen y Enter hace el primero. «Por recibir» lista sólo las órdenes
 * que esperan mercadería, las atrasadas primero.
 */
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { PackageCheck, Search } from "@buleje/design-system/icons";
import { BlockTitle, LoadingState } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { AccionHallazgo, ModoBusqueda } from "@/lib/compras/buscar-compras";
import { useBuscarCompras } from "./use-buscar-compras";
import { FilaHallazgo, ICONO_DE_TIPO } from "./FilaHallazgo";

export type ProveedorParaOrden = { id: string; name: string };

const MODOS: { id: ModoBusqueda; rotulo: string }[] = [
  { id: "todo", rotulo: "Todo" },
  { id: "recibir", rotulo: "Por recibir" },
];

export default function BuscarComprasModal({
  open,
  modoInicial,
  onClose,
  onIr,
  onNuevaOrdenA,
}: {
  open: boolean;
  modoInicial: ModoBusqueda;
  onClose: () => void;
  /** Navega dentro del panel (la barra cierra la ventana antes). */
  onIr: (href: string) => void;
  onNuevaOrdenA: (p: ProveedorParaOrden) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [modo, setModo] = useState<ModoBusqueda>(modoInicial);
  const [activo, setActivo] = useState(0);
  const { resultado, cargando, error, reintentar, pregunta } = useBuscarCompras(open, consulta, modo);
  const base = useId();
  const lista = useMemo(() => resultado?.grupos.flatMap((g) => g.hallazgos) ?? [], [resultado]);
  const indice = Math.min(activo, Math.max(0, lista.length - 1));
  const idDe = (clave: string) => `${base}-${clave.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const hacer = (a: AccionHallazgo) => {
    onClose();
    if (a.nuevaOrdenA) onNuevaOrdenA(a.nuevaOrdenA);
    else if (a.href) onIr(a.href);
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (lista.length === 0) return;
      const paso = e.key === "ArrowDown" ? 1 : -1;
      const nuevo = (indice + paso + lista.length) % lista.length;
      setActivo(nuevo);
      document.getElementById(idDe(lista[nuevo].clave))?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const primera = lista[indice]?.acciones[0];
      if (primera) {
        e.preventDefault();
        hacer(primera);
      }
    }
  };

  const titulo = modo === "recibir" ? "Recibir mercadería" : "Buscar en Compras";
  const placeholder = modo === "recibir" ? "Proveedor, código de orden o producto" : "Comprobante, código de orden, RUC, importe o nombre";

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={titulo}
      description={modo === "recibir" ? "Elige la orden que llegó y ábrela para recibir." : "Órdenes, proveedores, cuentas, recepciones y devoluciones en un solo lugar."}
      icon={modo === "recibir" ? PackageCheck : Search}
      size="lg"
      ayuda={
        <InfoTip
          title={titulo}
          what="Busca por número de comprobante (F001-123), código de la orden (#4-RUVSAW), RUC o DNI, importe (600) o un nombre. Las palabras se suman: «leche gloria» trae lo que tiene las dos."
          affects="Sólo lee: abrir un resultado te lleva a su pantalla con la fila a la vista. Las cuentas por pagar las ve quien gestiona la plata."
          example="Llega el camión de Distribuidora Ucayali: tecleas R, eliges su orden y la abres para recibir."
          side="bottom"
        />
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{placeholder}</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              autoFocus
              type="search"
              value={consulta}
              onChange={(e) => {
                setConsulta(e.target.value);
                setActivo(0);
              }}
              onKeyDown={alTeclear}
              placeholder={placeholder}
              role="combobox"
              aria-expanded={lista.length > 0}
              aria-controls={`${base}-lista`}
              aria-activedescendant={lista[indice] ? idDe(lista[indice].clave) : undefined}
              className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-12 pr-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--rule-strong)] focus:outline-none"
            />
          </label>
          <div role="radiogroup" aria-label="Qué buscar" className="flex shrink-0 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1">
            {MODOS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={modo === m.id}
                onClick={() => {
                  setModo(m.id);
                  setActivo(0);
                }}
                className={cn(
                  "h-10 rounded-xl px-4 text-sm font-semibold transition-colors",
                  modo === m.id ? "bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-[var(--rule-base)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
        </div>

        <Resultados
          pregunta={pregunta}
          cargando={cargando && !resultado}
          error={error}
          reintentar={reintentar}
          vacio={resultado !== null && resultado.total === 0}
          modo={modo}
          consulta={consulta.trim()}
        >
          {resultado && resultado.total > 0 && (
            <div id={`${base}-lista`} role="listbox" aria-label="Resultados" className="space-y-4">
              {resultado.grupos.map((g) => {
                const Icono = ICONO_DE_TIPO[g.tipo];
                return (
                  <section key={g.tipo} className="space-y-2">
                    <BlockTitle className="flex items-center gap-2 text-[var(--text-primary)]">
                      <Icono className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                      {g.rotulo}
                      <span className="text-sm font-normal text-[var(--text-tertiary)]">
                        {g.total > g.hallazgos.length ? `${g.hallazgos.length} de ${g.total}` : g.total}
                      </span>
                    </BlockTitle>
                    <ul className="space-y-2">
                      {g.hallazgos.map((h) => {
                        const i = lista.indexOf(h);
                        return (
                          <FilaHallazgo key={h.clave} h={h} id={idDe(h.clave)} activo={i === indice} onActivar={() => setActivo(i)} onAccion={hacer} />
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {resultado.plataOculta && modo === "todo" && (
                <div className="text-xs text-[var(--text-tertiary)]">Las cuentas por pagar no salen acá: las ve quien gestiona la plata.</div>
              )}
            </div>
          )}
        </Resultados>
      </div>
    </AdminModal>
  );
}

/** Lo que va debajo del cuadro cuando todavía no hay resultados que mostrar. */
function Resultados({
  pregunta,
  cargando,
  error,
  reintentar,
  vacio,
  modo,
  consulta,
  children,
}: {
  pregunta: boolean;
  cargando: boolean;
  error: string | null;
  reintentar: () => void;
  vacio: boolean;
  modo: ModoBusqueda;
  consulta: string;
  children: React.ReactNode;
}) {
  if (!pregunta) {
    return <div className="py-6 text-center text-sm text-[var(--text-secondary)]">Escribe al menos 2 letras o números.</div>;
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
        {error}
        <button type="button" onClick={reintentar} className={button({ variant: "secondary", className: "rounded-xl" })}>
          Reintentar
        </button>
      </div>
    );
  }
  if (cargando) return <LoadingState message={modo === "recibir" ? "Buscando lo que falta recibir..." : "Buscando..."} />;
  if (vacio) {
    return (
      <div className="py-6 text-center text-sm text-[var(--text-secondary)]">
        {modo === "recibir"
          ? consulta ? `Ninguna orden por recibir coincide con «${consulta}».` : "No hay órdenes esperando mercadería."
          : `Nada coincide con «${consulta}». Prueba con el número del comprobante o el RUC.`}
      </div>
    );
  }
  return <>{children}</>;
}
