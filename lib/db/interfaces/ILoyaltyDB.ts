/**
 * lib/db/interfaces/ILoyaltyDB.ts
 *
 * Formal interface for the loyalty ledger DB class. Closes TD-010 ("DB classes
 * without formal interfaces") for the loyalty module.
 *
 * Contract source: docs/adr/024-loyalty-transaction-model.md
 *
 * Every method takes `tenantId` as the FIRST parameter (CLAUDE.md rule #3).
 */

export type LoyaltyReason =
  | "purchase"
  | "promotion"
  | "redemption"
  | "manual"
  | "referral"
  | "expiry"
  | "adjustment"
  | "backfill";

export interface LoyaltyTransactionRow {
  id: string;
  customerId: string;
  tenantId: string;
  amount: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface LoyaltyHistoryPage {
  transactions: LoyaltyTransactionRow[];
  balance: number;
  total: number;
}

export interface ILoyaltyDB {
  /**
   * Append a positive (credit) ledger row and increment the materialized
   * `Customer.loyaltyPoints` balance — both inside one Prisma `$transaction`.
   *
   * @throws LoyaltyInvalidAmountError when `amount <= 0`
   * @throws LoyaltyCrossTenantError when the customer's tenantId !== `tenantId`
   * @throws NotFoundError when no customer with that phone exists in the tenant
   */
  earn(
    tenantId: string,
    customerId: string,
    amount: number,
    reason: LoyaltyReason | string,
    metadata?: Record<string, unknown>,
  ): Promise<LoyaltyTransactionRow>;

  /**
   * Append a negative ledger row and decrement the materialized balance,
   * inside one Prisma `$transaction`.
   *
   * @param amount Positive integer — the number of points to redeem.
   *               The DB class flips the sign before insert.
   * @throws LoyaltyInvalidAmountError when `amount <= 0`
   * @throws LoyaltyInsufficientBalanceError when `balance < amount`
   * @throws LoyaltyCrossTenantError when the customer's tenantId !== `tenantId`
   * @throws NotFoundError when no customer with that phone exists in the tenant
   */
  redeem(
    tenantId: string,
    customerId: string,
    amount: number,
    reason: LoyaltyReason | string,
    metadata?: Record<string, unknown>,
  ): Promise<LoyaltyTransactionRow>;

  /**
   * Paginated history of a customer's loyalty ledger, newest first.
   * Reads `Customer.loyaltyPoints` in the same call so the client never has
   * to reconcile two requests.
   *
   * @param limit  default 20, hard cap 100
   * @param offset default 0
   */
  getHistory(
    tenantId: string,
    customerId: string,
    limit?: number,
    offset?: number,
  ): Promise<LoyaltyHistoryPage>;

  /**
   * Returns the materialized balance from `Customer.loyaltyPoints`.
   * Cheap O(1) read — does not aggregate over the ledger.
   */
  getBalance(tenantId: string, customerId: string): Promise<number>;
}
