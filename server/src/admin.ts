export interface AdminLog { id: string; adminId: string; action: string; target?: string; createdAt: number; }
export interface AdminNotification { id: string; title: string; message: string; createdAt: number; }
export interface AdminEvent { id: string; title: string; startsAt: number; endsAt: number; multiplier: number; }
export class AdminStorage {
  private banned = new Set<string>(); private logs: AdminLog[] = []; private notifications: AdminNotification[] = []; private events: AdminEvent[] = [];
  isBanned(userId: string): boolean { return this.banned.has(userId); }
  ban(adminId: string, userId: string): void { this.banned.add(userId); this.log(adminId, 'user.ban', userId); }
  unban(adminId: string, userId: string): void { this.banned.delete(userId); this.log(adminId, 'user.unban', userId); }
  notify(adminId: string, title: string, message: string, now: number): AdminNotification { const item = { id: crypto.randomUUID(), title, message, createdAt: now }; this.notifications.unshift(item); this.log(adminId, 'notification.create', item.id); return item; }
  createEvent(adminId: string, title: string, startsAt: number, endsAt: number, multiplier: number): AdminEvent { const item = { id: crypto.randomUUID(), title, startsAt, endsAt, multiplier }; this.events.unshift(item); this.log(adminId, 'event.create', item.id); return item; }
  snapshot(): { banned: string[]; logs: AdminLog[]; notifications: AdminNotification[]; events: AdminEvent[] } { return { banned: [...this.banned], logs: structuredClone(this.logs), notifications: structuredClone(this.notifications), events: structuredClone(this.events) }; }
  private log(adminId: string, action: string, target?: string): void { this.logs.unshift({ id: crypto.randomUUID(), adminId, action, target, createdAt: Date.now() }); }
}

