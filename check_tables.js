import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  // Let's test if we can query a hypothetical 'customers' table or other tables
  const { data: tbls, error } = await supabase.from('customers').select('*').limit(1);
  if (error) {
    console.log('customers table check error (might not exist):', error.message);
  } else {
    console.log('customers table exists! Rows:', tbls);
  }
}

check();
