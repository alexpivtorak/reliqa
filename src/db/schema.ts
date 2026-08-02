import { pgTable, serial, text, timestamp, jsonb, boolean, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});

export const session = pgTable(
    'session',
    {
        id: text('id').primaryKey(),
        expiresAt: timestamp('expires_at').notNull(),
        token: text('token').notNull().unique(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at')
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
    },
    (table) => ({
        sessionUserIdIdx: index('session_userId_idx').on(table.userId),
    }),
);

export const account = pgTable(
    'account',
    {
        id: text('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: timestamp('access_token_expires_at'),
        refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
        scope: text('scope'),
        password: text('password'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at')
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => ({
        accountUserIdIdx: index('account_userId_idx').on(table.userId),
    }),
);

export const verification = pgTable(
    'verification',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: timestamp('expires_at').notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at')
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => ({
        verificationIdentifierIdx: index('verification_identifier_idx').on(table.identifier),
    }),
);

export const testRuns = pgTable('test_runs', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id).notNull(),
    url: text('url').notNull(),
    goal: text('goal').notNull(),
    status: text('status').notNull().default('queued'),
    result: text('result'),
    logs: jsonb('logs'),
    videoUrl: text('video_url'),
    browserConnectUrl: text('browser_connect_url'),
    startTime: timestamp('start_time'),
    endTime: timestamp('end_time'),
    model: text('model'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const testSteps = pgTable('test_steps', {
    id: serial('id').primaryKey(),
    runId: integer('run_id').references(() => testRuns.id).notNull(),
    stepNumber: integer('step_number').notNull(),
    actionType: text('action_type').notNull(),
    thought: text('thought'),
    selector: text('selector'),
    screenshotUrl: text('screenshot_url'),
    domSnapshot: jsonb('dom_snapshot'),
    timestamp: timestamp('timestamp').defaultNow(),
});

export const issues = pgTable('issues', {
    id: serial('id').primaryKey(),
    testRunId: integer('test_run_id').references(() => testRuns.id),
    description: text('description').notNull(),
    severity: text('severity').default('medium'),
    timestamp: text('timestamp'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
    testRuns: many(testRuns),
}));

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(users, {
        fields: [session.userId],
        references: [users.id],
    }),
}));

export const accountRelations = relations(account, ({ one }) => ({
    user: one(users, {
        fields: [account.userId],
        references: [users.id],
    }),
}));

export const testRunsRelations = relations(testRuns, ({ one, many }) => ({
    user: one(users, {
        fields: [testRuns.userId],
        references: [users.id],
    }),
    steps: many(testSteps),
}));

export const testStepsRelations = relations(testSteps, ({ one }) => ({
    run: one(testRuns, {
        fields: [testSteps.runId],
        references: [testRuns.id],
    }),
}));
