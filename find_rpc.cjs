// find_rpc.cjs
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const rpcs = ['exec_sql', 'run_sql', 'execute_sql', 'sql', 'query'];
  for (const rpc of rpcs) {
    const { data, error } = await supabase.rpc(rpc, { sql: 'SELECT 1;' });
    console.log(`${rpc}:`, error ? error.message : 'Success!');
  }
}
run();
