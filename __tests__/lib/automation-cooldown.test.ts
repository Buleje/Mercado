import { describe, it, expect } from "vitest";
import {
  partitionByCooldown,
  recordNotified,
  getCooldownDays,
  DEFAULT_COOLDOWN_DAYS,
  type NotifyLog,
} from "@/lib/superadmin/automation-cooldown";

const NOW = new Date("2026-06-17T12:00:00Z").getTime();
const DAY = 86_400_000;
const COOLDOWN = 7 * DAY;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const t = (id: string) => ({ id, slug: id, name: id });

describe("getCooldownDays", () => {
  it("default 7 sin env", () => {
    expect(getCooldownDays({})).toBe(DEFAULT_COOLDOWN_DAYS);
  });
  it("override por env", () => {
    expect(getCooldownDays({ AUTOMATION_COOLDOWN_DAYS: "3" })).toBe(3);
  });
  it("valor invalido → default", () => {
    expect(getCooldownDays({ AUTOMATION_COOLDOWN_DAYS: "xx" })).toBe(7);
  });
});

describe("partitionByCooldown", () => {
  it("nunca notificado → toNotify", () => {
    const r = partitionByCooldown([t("a"), t("b")], {}, "stale-30d", NOW, COOLDOWN);
    expect(r.toNotify.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.skipped).toEqual([]);
  });

  it("notificado hace 2 dias → skipped (dentro del cooldown)", () => {
    const log: NotifyLog = { "stale-30d": { a: ago(2) } };
    const r = partitionByCooldown([t("a"), t("b")], log, "stale-30d", NOW, COOLDOWN);
    expect(r.skipped.map((x) => x.id)).toEqual(["a"]);
    expect(r.toNotify.map((x) => x.id)).toEqual(["b"]);
  });

  it("notificado hace 10 dias → toNotify (cooldown vencido)", () => {
    const log: NotifyLog = { "stale-30d": { a: ago(10) } };
    const r = partitionByCooldown([t("a")], log, "stale-30d", NOW, COOLDOWN);
    expect(r.toNotify.map((x) => x.id)).toEqual(["a"]);
  });

  it("el cooldown es por regla (otra regla no bloquea)", () => {
    const log: NotifyLog = { "no-login-14d": { a: ago(1) } };
    const r = partitionByCooldown([t("a")], log, "stale-30d", NOW, COOLDOWN);
    expect(r.toNotify.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("recordNotified", () => {
  it("marca a los notificados con now", () => {
    const log = recordNotified({}, "stale-30d", ["a", "b"], NOW, COOLDOWN);
    expect(log["stale-30d"].a).toBe(new Date(NOW).toISOString());
    expect(log["stale-30d"].b).toBe(new Date(NOW).toISOString());
  });

  it("poda entradas fuera del cooldown", () => {
    const old: NotifyLog = { "stale-30d": { viejo: ago(30) } };
    const log = recordNotified(old, "stale-30d", ["nuevo"], NOW, COOLDOWN);
    expect(log["stale-30d"].viejo).toBeUndefined();
    expect(log["stale-30d"].nuevo).toBeDefined();
  });

  it("no muta el log de entrada", () => {
    const orig: NotifyLog = { "stale-30d": {} };
    recordNotified(orig, "stale-30d", ["a"], NOW, COOLDOWN);
    expect(orig["stale-30d"].a).toBeUndefined();
  });

  it("round-trip: tras registrar, el mismo set queda en cooldown", () => {
    const log = recordNotified({}, "stale-30d", ["a"], NOW, COOLDOWN);
    const r = partitionByCooldown([t("a")], log, "stale-30d", NOW + DAY, COOLDOWN);
    expect(r.skipped.map((x) => x.id)).toEqual(["a"]);
  });
});
