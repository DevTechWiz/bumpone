import { createBrowserClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://lgpejkhnlxdekozwyczi.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxncGVqa2hubHhkZWtvend5Y3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzQ0NDksImV4cCI6MjEwNjA1MDQ0OX0.U-R1ieQ_FsLOiKd4OwWBqLVR68gs-3VcQw3G5SWHzP4';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

