/**
 * Insignia — el `BadgeStatus` del DS con el texto en `-ink`: el de serie da
 * 1,9:1 en ámbar sobre claro (medido 26-10); con `-ink`, 12,4:1 en los dos temas.
 */
import { BadgeStatus, type BadgeStatusVariant } from "@buleje/design-system";

export type TonoInsignia = BadgeStatusVariant;

const TINTA: Partial<Record<BadgeStatusVariant, string>> = {
  success: "text-[var(--data-success-ink)]",
  warning: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
  info: "text-[var(--data-info-ink)]",
};

export function Insignia({ tono, texto, punto = true }: { tono: TonoInsignia; texto: string; punto?: boolean }) {
  return <BadgeStatus variant={tono} label={texto} dot={punto} className={TINTA[tono]} />;
}
