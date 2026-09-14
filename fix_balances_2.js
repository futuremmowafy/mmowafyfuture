import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const supabase = createClient(supabaseUrl, serviceKey);

async function fix() {
  const { data: row, error: fetchErr } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('chat_id', 999999)
    .maybeSingle();

  if (fetchErr) {
    console.error(fetchErr);
    return;
  }

  const finData = row.data;
  console.log('Current stored Liquidity:', finData.liquidity);

  // Correct the BM wallet balance to be exactly: -25383 (53117 - 78500)
  finData.liquidity['محفظة بنك مصر'] = -25383;
  finData.liquidity['حساب بنك مصر بيزنيس (الشركة)'] = 1000;

  const { error: updateErr } = await supabase
    .from('bot_sessions')
    .update({ data: finData, updated_at: new Date().toISOString() })
    .eq('chat_id', 999999);

  if (updateErr) {
    console.error('Update error:', updateErr);
  } else {
    console.log('Successfully corrected balances again!');
    console.log('New Stored Liquidity:', finData.liquidity);
  }
}

fix();
