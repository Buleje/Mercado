export function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatSolesShort(n: number): string {
  if (n >= 1000) return `S/${(n / 1000).toFixed(1)}k`;
  return `S/${n.toFixed(0)}`;
}
