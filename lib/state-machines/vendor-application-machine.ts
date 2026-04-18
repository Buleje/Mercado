/**
 * lib/state-machines/vendor-application-machine.ts
 *
 * ADR-079 — State machine del workflow de aprobacion de vendor applications.
 *
 * Separado del DB class (lib/db/vendor-applications.db.ts) porque:
 *   - Es codigo puro (sin IO), se testea sin prisma/server-only
 *   - Vive junto a otros state machines del repo (order-machine.ts)
 *   - Permite re-uso desde UI si en el futuro queremos guards client-side
 *
 * Transiciones permitidas:
 *
 *   pending              → under_review  (start_review)
 *   pending              → approved      (approve)
 *   pending              → rejected      (reject)
 *   under_review         → info_requested (request_info)
 *   under_review         → approved      (approve)
 *   under_review         → rejected      (reject)
 *   info_requested       → approved      (approve)
 *   info_requested       → rejected      (reject)
 *   approved             → rejected      (reject — si se descubre fraude)
 *   rejected             → pending       (reopen)
 *   tenant_provisioned   → (terminal, sin salidas)
 *
 * La transicion approved → tenant_provisioned NO vive aca porque no es
 * una action humana — es un hook disparado por `provisionTenant`. La DB
 * class maneja esa transicion con `markTenantProvisioned`.
 */

export type ApplicationStatus =
  | "pending"
  | "under_review"
  | "info_requested"
  | "approved"
  | "tenant_provisioned"
  | "rejected";

export type ApplicationReviewAction =
  | "start_review"
  | "request_info"
  | "approve"
  | "reject"
  | "reopen";

interface TransitionSpec {
  from: ApplicationStatus[];
  to: ApplicationStatus;
}

const TRANSITIONS: Record<ApplicationReviewAction, TransitionSpec> = {
  start_review: {
    from: ["pending"],
    to: "under_review",
  },
  request_info: {
    from: ["under_review"],
    to: "info_requested",
  },
  approve: {
    from: ["pending", "under_review", "info_requested"],
    to: "approved",
  },
  reject: {
    from: ["pending", "under_review", "info_requested", "approved"],
    to: "rejected",
  },
  reopen: {
    from: ["rejected"],
    to: "pending",
  },
};

export class InvalidStateTransitionError extends Error {
  code = "INVALID_STATE_TRANSITION" as const;
  constructor(
    public from: ApplicationStatus,
    public to: ApplicationStatus,
    public action: ApplicationReviewAction,
  ) {
    super(`Transicion invalida ${from} -> ${to} (action=${action})`);
    this.name = "InvalidStateTransitionError";
  }
}

/** True si `action` puede aplicarse desde `from`. */
export function canTransition(
  from: ApplicationStatus,
  action: ApplicationReviewAction,
): boolean {
  const spec = TRANSITIONS[action];
  if (!spec) return false;
  return spec.from.includes(from);
}

/** Devuelve el destino, o throwea InvalidStateTransitionError. */
export function resolveTransition(
  from: ApplicationStatus,
  action: ApplicationReviewAction,
): ApplicationStatus {
  const spec = TRANSITIONS[action];
  if (!spec || !spec.from.includes(from)) {
    throw new InvalidStateTransitionError(
      from,
      spec?.to ?? from,
      action,
    );
  }
  return spec.to;
}

/** Lista de transiciones validas — util para debugging y visualizacion. */
export function allTransitions(): Array<{
  from: ApplicationStatus;
  action: ApplicationReviewAction;
  to: ApplicationStatus;
}> {
  const out: Array<{
    from: ApplicationStatus;
    action: ApplicationReviewAction;
    to: ApplicationStatus;
  }> = [];
  for (const [action, spec] of Object.entries(TRANSITIONS)) {
    for (const from of spec.from) {
      out.push({
        from,
        action: action as ApplicationReviewAction,
        to: spec.to,
      });
    }
  }
  return out;
}
