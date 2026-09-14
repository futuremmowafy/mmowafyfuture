// test_rpc_sql.cjs
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql_raw', {
    sql_query: "ALTER TABLE technicians ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'فني';"
  });
  console.log('Result:', data);
  console.log('Error:', error);
}
run();
