import { describe, it, expect, beforeEach } from "vitest";
import {
  stashPendingApproval,
  listPendingApprovals,
  getPendingApproval,
  removePendingApproval,
  _clearApprovalsStore,
  _approvalsStoreSize,
} from "@/lib/agents/pending-approvals";
import { isToolApprovalRequired } from "@/lib/agents/tool-definitions";

describe("HITL pending-approvals store", () => {
  beforeEach(() => {
    _clearApprovalsStore();
  });

  it("stashes a pending approval and returns an id", () => {
    const id = stashPendingApproval({
      tenantId: "tenant-a",
      toolName: "notifications_send_promotion",
      domain: "notifications",
      action: "send-promotion",
      payload: { promoId: "p1" },
      requestedBy: "admin",
    });
    expect(id).toBeTypeOf("string");
    expect(id.length).toBeGreaterThan(0);
    expect(_approvalsStoreSize()).toBe(1);
  });

  it("retrieves a stashed approval by id", () => {
    const id = stashPendingApproval({
      tenantId: "tenant-a",
      toolName: "notifications_send_order_update",
      domain: "notifications",
      action: "send-order-update",
      payload: { orderId: "o1", status: "confirmado" },
      requestedBy: "admin",
    });
    const retrieved = getPendingApproval(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.toolName).toBe("notifications_send_order_update");
    expect(retrieved?.payload).toEqual({ orderId: "o1", status: "confirmado" });
  });

  it("lists pending approvals filtered by tenant", () => {
    stashPendingApproval({
      tenantId: "tenant-a",
      toolName: "notifications_send_promotion",
      domain: "notifications",
      action: "send-promotion",
      payload: {},
      requestedBy: "admin",
    });
    stashPendingApproval({
      tenantId: "tenant-b",
      toolName: "notifications_send_promotion",
      domain: "notifications",
      action: "send-promotion",
      payload: {},
      requestedBy: "other-admin",
    });

    const aList = listPendingApprovals("tenant-a");
    const bList = listPendingApprovals("tenant-b");
    expect(aList).toHaveLength(1);
    expect(bList).toHaveLength(1);
    expect(aList[0].tenantId).toBe("tenant-a");
    expect(bList[0].tenantId).toBe("tenant-b");
  });

  it("removes a resolved approval", () => {
    const id = stashPendingApproval({
      tenantId: "tenant-a",
      toolName: "notifications_send_promotion",
      domain: "notifications",
      action: "send-promotion",
      payload: {},
      requestedBy: "admin",
    });
    expect(_approvalsStoreSize()).toBe(1);
    const removed = removePendingApproval(id);
    expect(removed).not.toBeNull();
    expect(_approvalsStoreSize()).toBe(0);
    expect(getPendingApproval(id)).toBeNull();
  });

  it("returns null for non-existent id", () => {
    expect(getPendingApproval("non-existent-id")).toBeNull();
    expect(removePendingApproval("non-existent-id")).toBeNull();
  });

  it("sorts listed approvals by most recent first", async () => {
    const id1 = stashPendingApproval({
      tenantId: "tenant-a",
      toolName: "notifications_send_promotion",
      domain: "notifications",
      action: "send-promotion",
      payload: { n: 1 },
      requestedBy: "admin",
    });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    const id2 = stashPendingApproval({
      tenantId: "tenant-a",
      toolName: "notifications_send_order_update",
      domain: "notifications",
      action: "send-order-update",
      payload: { n: 2 },
      requestedBy: "admin",
    });

    const list = listPendingApprovals("tenant-a");
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(id2); // most recent first
    expect(list[1].id).toBe(id1);
  });
});

describe("isToolApprovalRequired", () => {
  it("returns true for notifications_send_order_update", () => {
    expect(isToolApprovalRequired("notifications_send_order_update")).toBe(true);
  });

  it("returns true for notifications_send_promotion", () => {
    expect(isToolApprovalRequired("notifications_send_promotion")).toBe(true);
  });

  it("returns false for read-only tools", () => {
    expect(isToolApprovalRequired("inventory_check_stock")).toBe(false);
    expect(isToolApprovalRequired("analytics_daily_kpis")).toBe(false);
    expect(isToolApprovalRequired("customers_segmentation")).toBe(false);
  });

  it("returns false for notifications_digest_pending (internal, not high-risk)", () => {
    expect(isToolApprovalRequired("notifications_digest_pending")).toBe(false);
  });

  it("returns false for unknown tool name", () => {
    expect(isToolApprovalRequired("nonexistent_tool_xyz")).toBe(false);
  });
});
