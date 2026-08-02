import { pgTable, serial, text, timestamp, jsonb, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').unique().notNull(),
    apiKey: text('api_key').unique().notNull(), // For API access
    createdAt: timestamp('created_at').defaultNow(),
});

export const testRuns = pgTable('test_runs', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    url: text('url').notNull(),
    goal: text('goal').notNull(),
    status: text('status').notNull().default('queued'), // queued, running, completed, failed
    result: text('result'), // 'pass', 'fail'
    logs: jsonb('logs'), // Array of actions/logs
    videoUrl: text('video_url'), // Link to stored video
    browserConnectUrl: text('browser_connect_url'), // For VNC/Debugger
    startTime: timestamp('start_time'),
    endTime: timestamp('end_time'),
    model: text('model'), // e.g. gemini-2.5-flash
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const testSteps = pgTable('test_steps', {
    id: serial('id').primaryKey(),
    runId: integer('run_id').references(() => testRuns.id).notNull(),
    stepNumber: integer('step_number').notNull(),
    actionType: text('action_type').notNull(), // click, type, think
    thought: text('thought'), // The "Why"
    selector: text('selector'), // The "Where"
    screenshotUrl: text('screenshot_url'),
    domSnapshot: jsonb('dom_snapshot'), // Distilled DOM
    timestamp: timestamp('timestamp').defaultNow(),
});

export const issues = pgTable('issues', {
    id: serial('id').primaryKey(),
    testRunId: integer('test_run_id').references(() => testRuns.id),
    description: text('description').notNull(),
    severity: text('severity').default('medium'), // low, medium, high, critical
    timestamp: text('timestamp'), // Video timestamp
    createdAt: timestamp('created_at').defaultNow(),
});
