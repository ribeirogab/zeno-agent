import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  name: text('name').primaryKey(),
  port: integer('port').notNull().unique(),
  masterKey: text('master_key').notNull(),
  status: text('status', { enum: ['running', 'stopped', 'failed'] })
    .notNull()
    .default('stopped'),
  createdAt: integer('created_at').notNull(),
  lastStartedAt: integer('last_started_at'),
  lastStoppedAt: integer('last_stopped_at'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: integer('ts').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  details: text('details').notNull().default('{}'),
});
