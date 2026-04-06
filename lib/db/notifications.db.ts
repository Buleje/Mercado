import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  AdminMessage as PAdminMessage,
  NotificationLog as PNotificationLog,
} from "@/lib/generated/prisma/client";
import { normalizePhone } from "./misc.db";

// ── Local Types ───────────────────────────────────────────────────────────────

export type DbNotificationLog = {
  id: string;
  type: string;
  recipient: string;
  message: string;
  status: string;
  orderId?: string;
  createdAt: string;
};

export type DbAdminMessage = {
  id: string;
  sender: string;
  message: string;
  createdAt: string;
};

type PChatMessage = { id: string; customerPhone: string; customerName: string; sender: string; message: string; read: boolean; createdAt: Date };

export type DbChatMessage = {
  id: string;
  customerPhone: string;
  customerName: string;
  sender: "customer" | "admin";
  message: string;
  read: boolean;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapNotificationLog(n: PNotificationLog): DbNotificationLog {
  return { id: n.id, type: n.type, recipient: n.recipient, message: n.message, status: n.status, ...(n.orderId != null && { orderId: n.orderId }), createdAt: toISO(n.createdAt) };
}

function mapAdminMessage(m: PAdminMessage): DbAdminMessage {
  return { id: m.id, sender: m.sender, message: m.message, createdAt: toISO(m.createdAt) };
}

function mapChatMessage(m: PChatMessage): DbChatMessage {
  return { id: m.id, customerPhone: m.customerPhone, customerName: m.customerName, sender: m.sender as DbChatMessage["sender"], message: m.message, read: m.read, createdAt: toISO(m.createdAt) };
}

// ── Notification Logs DB ──────────────────────────────────────────────────────

export const NotificationLogsDB = {
  async getAll(tenantId?: string): Promise<DbNotificationLog[]> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    return (await prisma.notificationLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 })).map(mapNotificationLog);
  },
  async getByRecipient(phone: string): Promise<DbNotificationLog[]> {
    return (await prisma.notificationLog.findMany({
      where: { recipient: normalizePhone(phone) },
      orderBy: { createdAt: "desc" },
      take: 100,
    })).map(mapNotificationLog);
  },
  async add(data: Omit<DbNotificationLog, "id" | "createdAt">): Promise<DbNotificationLog> {
    const row = await prisma.notificationLog.create({ data });
    return mapNotificationLog(row);
  },
};

// ── Admin Chat DB ─────────────────────────────────────────────────────────────

export const AdminChatDB = {
  async getAll(tenantId?: string, limit = 100): Promise<DbAdminMessage[]> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    return (await prisma.adminMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: limit })).map(mapAdminMessage).reverse();
  },
  async add(sender: string, message: string): Promise<DbAdminMessage> {
    const row = await prisma.adminMessage.create({ data: { sender, message } });
    return mapAdminMessage(row);
  },
};

// ── Customer Live Chat DB ─────────────────────────────────────────────────────

export const ChatDB = {
  async getByPhone(phone: string, limit = 50): Promise<DbChatMessage[]> {
    return (await prisma.chatMessage.findMany({ where: { customerPhone: phone }, orderBy: { createdAt: "asc" }, take: limit })).map(mapChatMessage);
  },
  async getConversations(): Promise<{ phone: string; name: string; lastMessage: string; lastAt: string; unread: number }[]> {
    const msgs = await prisma.chatMessage.findMany({ orderBy: { createdAt: "desc" } });
    const map = new Map<string, { name: string; lastMessage: string; lastAt: Date; unread: number }>();
    for (const m of msgs) {
      if (!map.has(m.customerPhone)) {
        map.set(m.customerPhone, { name: m.customerName, lastMessage: m.message, lastAt: m.createdAt, unread: 0 });
      }
      if (m.sender === "customer" && !m.read) {
        const c = map.get(m.customerPhone)!;
        c.unread++;
      }
    }
    return Array.from(map.entries()).map(([phone, c]) => ({ phone, name: c.name, lastMessage: c.lastMessage, lastAt: toISO(c.lastAt), unread: c.unread }));
  },
  async add(customerPhone: string, customerName: string, sender: "customer" | "admin", message: string): Promise<DbChatMessage> {
    const row = await prisma.chatMessage.create({ data: { customerPhone, customerName, sender, message } });
    return mapChatMessage(row);
  },
  async markRead(customerPhone: string): Promise<void> {
    await prisma.chatMessage.updateMany({ where: { customerPhone, sender: "customer", read: false }, data: { read: true } });
  },
};
