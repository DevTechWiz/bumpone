import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Database boundary tripwires — static assertions over the migration files
// that carry the security contract. Runtime DB invariants live in
// supabase/tests/*.sql (run via supabase/tests/run-db-tests.ps1); these
// tripwires catch accidental edits to the SQL that enforces them.
// ---------------------------------------------------------------------------

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const read = (name: string) => readFileSync(join(MIGRATIONS, name), 'utf8');

describe('SEC-001 financial boundary (migration 017)', () => {
  const sql = read('017_harden_financial_boundary.sql');

  it('requires a quote id on payment processing', () => {
    expect(sql).toContain('if v_quote_id is null then');
  });

  it('enforces the platform minimum before any mutation', () => {
    expect(sql).toContain('if p_amount_minor < 1000 then');
  });

  it('requires the webhook amount to equal the quoted amount exactly', () => {
    expect(sql).toContain('if p_amount_minor <> v_quote_amount then');
  });

  it('binds the payment to the quote owner', () => {
    expect(sql).toContain('if v_user_id is distinct from v_quote_user_id then');
  });

  it('has deterministic expired/duplicate/idempotency verdicts', () => {
    expect(sql).toContain('Quote expired');
    expect(sql).toContain('Duplicate payment rejected');
    expect(sql).toContain("'status', 'already_processed'");
  });
});

describe('SEC-004 identity boundary (migration 018)', () => {
  const sql = read('018_harden_identity_boundary.sql');

  it('binds reaction RPCs to auth.uid()', () => {
    expect(sql).toContain("auth.uid() is distinct from p_user_id");
  });

  it('drops forgeable legacy RPCs', () => {
    expect(sql).toContain('drop function if exists public.add_project_reaction(uuid, text, text);');
  });

  it('revokes execute from public/anon on the auth-bound RPCs', () => {
    expect(sql).toContain('revoke execute on function add_project_reaction_auth from public, anon;');
    expect(sql).toContain('revoke execute on function remove_project_reaction_auth from public, anon;');
  });

  it('revokes direct authenticated writes to the users table', () => {
    expect(sql).toContain('revoke update on public.users from authenticated;');
  });
});

describe('SEC-005 killswitch surface (migrations 003/019)', () => {
  it('admin_audit_log has RLS enabled', () => {
    expect(read('003_rls_policies.sql')).toContain('alter table admin_audit_log enable row level security;');
  });

  it('admin_audit_log exposes no policies to any role', () => {
    const all = ['001_initial_schema.sql', '003_rls_policies.sql', '018_harden_identity_boundary.sql']
      .map(read)
      .join('\n');
    expect(all).not.toMatch(/create policy[^;]*on admin_audit_log/i);
  });

  it('system_state has RLS enabled with zero policies', () => {
    const sql = read('019_reinstate_system_state_killswitch.sql');
    expect(sql).toContain('alter table system_state enable row level security;');
    expect(sql).not.toMatch(/create policy/i);
  });

  it('system_state seeds exactly one global row', () => {
    expect(read('019_reinstate_system_state_killswitch.sql')).toContain(
      "insert into system_state (id, purchases_paused) values ('global', false)"
    );
  });
});

describe('SEC-024 write-path trigger (migration 001)', () => {
  const sql = read('001_initial_schema.sql');

  it('protects authoritative project fields from direct writes', () => {
    expect(sql).toContain('create or replace function protect_project_authoritative_fields()');
    expect(sql).toContain('trg_protect_project_fields');
  });
});
