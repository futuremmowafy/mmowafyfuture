import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data: cashFlow } = await supabase
    .from('cash_flow')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('--- Current Cash Flow ---');
  cashFlow.forEach(c => {
    if (c.description.includes('محفظة') || c.description.includes('بنك مصر') || c.description.includes('بيزنيس')) {
      console.log(`[${c.type}] Amount: ${c.amount} | Date: ${c.date} | Desc: ${c.description}`);
    }
  });
}

check();
