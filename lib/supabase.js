import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load env variables
dotenv.config();

let supabaseUrl = process.env.SUPABASE_URL || 'https://fsdgiebjkymenayboodg.supabase.co';
let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZGdpZWJqa3ltZW5heWJvb2RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU4NTYyNCwiZXhwIjoyMTA0MTYxNjI0fQ.HadIKjbOZ4L4QyNSeTwUtMM4_pR4Kaw3xMOFRyUlEW0';

// Auto-fallback from old blocked project
if (supabaseUrl.includes('ybzmqrrecdavaarfxjvv')) {
  supabaseUrl = 'https://fsdgiebjkymenayboodg.supabase.co';
  supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZGdpZWJqa3ltZW5heWJvb2RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU4NTYyNCwiZXhwIjoyMTA0MTYxNjI0fQ.HadIKjbOZ4L4QyNSeTwUtMM4_pR4Kaw3xMOFRyUlEW0';
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
