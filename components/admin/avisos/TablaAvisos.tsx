"use client";

import { DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { cuando, estadoAviso, numeroCorto, paraQuien, rotuloTipo, type Aviso } from "./tipos";

interface Props {
  avisos: readonly Aviso[];
  onVer: (a: Aviso) => void;
}

const alTeclado = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/**
 * El historial: un aviso por fila y el mensaje en UNA línea (el texto entero,
 * en la ventana del aviso). En el celular el panel lo dibuja como tarjetas
 * (`useMobileTableCards` rotula cada celda con su encabezado).
 */
export function TablaAvisos({ avisos, onVer }: Props) {
  return (
    <DataTable className="table-fixed">
      <colgroup className="max-sm:hidden">
        <col className="w-40" />
        <col className="w-40" />
        <col className="w-48" />
        <col />
        <col className="w-28" />
      </colgroup>
      <thead>
        <tr>
          <th>Cuándo</th>
          <th>Para</th>
          <th>Qué</th>
          <th>Mensaje</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {avisos.map((a) => {
          const estado = estadoAviso(a.status);
          return (
            <tr
              key={a.id}
              tabIndex={0}
              onClick={() => onVer(a)}
              onKeyDown={alTeclado(() => onVer(a))}
              aria-label={`Ver aviso: ${rotuloTipo(a.type)} para ${paraQuien(a.recipient)}`}
              className="cursor-pointer"
            >
              <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">{cuando(a.createdAt)}</td>
              <td className="whitespace-nowrap font-medium tabular-nums">{paraQuien(a.recipient)}</td>
              <td>
                <span className="block min-w-0 truncate">
                  {rotuloTipo(a.type)}
                  {a.orderId && <span className="text-[var(--text-secondary)]"> {numeroCorto(a.orderId)}</span>}
                </span>
              </td>
              <td className="text-[var(--text-secondary)]">
                <span className="block min-w-0 truncate" title={a.message}>{a.message}</span>
              </td>
              <td className={cn("whitespace-nowrap font-semibold", estado.clase)}>{estado.rotulo}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
