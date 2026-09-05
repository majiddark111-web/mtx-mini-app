export interface AdminLog { id: string; adminId: string; action: string; target?: string; createdAt: number; }
export interface AdminNotification { id: string; title: string; message: string; createdAt: number; expiresAt: number; }
export interface AdminEvent { id: string; title: string; startsAt: number; endsAt: number; multiplier: number; }

export interface AdminSnapshot { banned: string[]; logs: AdminLog[]; notifications: AdminNotification[]; events: AdminEvent[]; }
export interface AdminPersistence {
  isBanned(userId: string): Promise<boolean>;
  setBanned(adminId: string, userId: string, banned: boolean, now: number): Promise<void>;
  notify(adminId: string, item: AdminNotification): Promise<void>;
  createEvent(adminId: string, item: AdminEvent): Promise<void>;
  snapshot(): Promise<AdminSnapshot>;
}

export class MemoryAdminPersistence implements AdminPersistence {
  private banned = new Set<string>(); private logs: AdminLog[] = []; private notifications: AdminNotification[] = []; private events: AdminEvent[] = [];
  async isBanned(userId: string): Promise<boolean> { return this.banned.has(userId); }
  async setBanned(adminId: string, userId: string, banned: boolean, now: number): Promise<void> { if (banned) this.banned.add(userId); else this.banned.delete(userId); this.logs.unshift({ id: crypto.randomUUID(), adminId, action: banned ? 'user.ban' : 'user.unban', target: userId, createdAt: now }); }
  async notify(adminId: string, item: AdminNotification): Promise<void> { this.notifications.unshift(structuredClone(item)); this.logs.unshift({ id: crypto.randomUUID(), adminId, action: 'notification.create', target: item.id, createdAt: item.createdAt }); }
  async createEvent(adminId: string, item: AdminEvent): Promise<void> { this.events.unshift(structuredClone(item)); this.logs.unshift({ id: crypto.randomUUID(), adminId, action: 'event.create', target: item.id, createdAt: Date.now() }); }
  async snapshot(): Promise<AdminSnapshot> { return { banned: [...this.banned], logs: structuredClone(this.logs), notifications: structuredClone(this.notifications), events: structuredClone(this.events) }; }
}

export class AdminStorage {
  private readonly persistence: AdminPersistence;
  constructor(persistence: AdminPersistence = new MemoryAdminPersistence()) { this.persistence = persistence; }
  isBanned(userId: string): Promise<boolean> { return this.persistence.isBanned(userId); }
  ban(adminId: string, userId: string): Promise<void> { return this.persistence.setBanned(adminId, userId, true, Date.now()); }
  unban(adminId: string, userId: string): Promise<void> { return this.persistence.setBanned(adminId, userId, false, Date.now()); }
  async notify(adminId: string, title: string, message: string, now: number): Promise<AdminNotification> { const item = { id: crypto.randomUUID(), title, message, createdAt: now, expiresAt: now + 30 * 86_400_000 }; await this.persistence.notify(adminId, item); return item; }
  async createEvent(adminId: string, title: string, startsAt: number, endsAt: number, multiplier: number): Promise<AdminEvent> { const item = { id: crypto.randomUUID(), title, startsAt, endsAt, multiplier }; await this.persistence.createEvent(adminId, item); return item; }
  snapshot(): Promise<AdminSnapshot> { return this.persistence.snapshot(); }
}
