import "server-only";

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 0, 0, 0, 0);
}

export function nextPayday(from: Date): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const day = from.getDate();
  if (day < 15) return new Date(y, m, 15, 0, 0, 0, 0);
  const eom = endOfMonth(from);
  if (day < eom.getDate()) return eom;
  return new Date(y, m + 1, 15, 0, 0, 0, 0);
}
