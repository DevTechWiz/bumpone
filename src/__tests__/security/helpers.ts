import { expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared adversarial-test harness (not a test file — vitest only picks up
// *.test.ts). Module-level state is per test file (vitest isolates files).
// ---------------------------------------------------------------------------

export type QueryResult = { data: any; error: any; count?: number | null };

export const tableCalls: string[] = [];
export const builders: Record<string, any> = {};

// Thenable builder mirroring supabase-js: awaited chains (insert/upsert/
// update…select) resolve to the configured result.
export function makeBuilder(result: QueryResult) {
  const builder: any = {};
  for (const m of ['select', 'eq', 'neq', 'ilike', 'or', 'order', 'not', 'lte', 'gt', 'in', 'is', 'insert', 'update', 'upsert', 'delete']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  builder.__result = result;
  return builder;
}

export function resetHelpers() {
  tableCalls.length = 0;
  for (const k of Object.keys(builders)) delete builders[k];
}

/**
 * Route `supabaseAdmin.from(table)` (the file's `from` mock) to per-table
 * builders. Unknown tables throw — a route touching an unexpected table
 * fails loudly instead of silently passing.
 */
export function mockTables(fromMock: any, tables: Record<string, QueryResult>) {
  resetHelpers();
  fromMock.mockImplementation((table: string) => {
    tableCalls.push(table);
    if (!(table in tables)) throw new Error(`unexpected table queried: ${table}`);
    if (!builders[table]) builders[table] = makeBuilder(tables[table]);
    return builders[table];
  });
}

/**
 * The fundamental invariant: an unauthorized request must never reach the
 * service-role layer at all (no table reads/writes, no RPCs). Auth-first
 * routes must reject before any supabaseAdmin usage.
 */
export function expectNoServiceRoleUse() {
  expect(tableCalls).toEqual([]);
}
