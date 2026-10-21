import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  adminHash: text('admin_hash').notNull(),
  revision: integer('revision').notNull().default(1),
  config: text('config').notNull(),
  createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(()=>rooms.id),
  configVersion: integer('config_version').notNull(),
  name: text('name').notNull(),
  config: text('config').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('sessions_room').on(t.roomId)]);
export const answers = sqliteTable('answers', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(()=>rooms.id),
  sessionId: text('session_id').notNull().references(()=>sessions.id),
  round: integer('round').notNull(),
  itemId: text('item_id').notNull(),
  itemName: text('item_name').notNull(),
  choice: text('choice').notNull(),
  category: text('category').notNull(),
  correct: integer('correct').notNull(),
  reason: text('reason').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('answer_round').on(t.sessionId,t.round),uniqueIndex('answer_item').on(t.sessionId,t.itemId),index('answers_room').on(t.roomId)]);
