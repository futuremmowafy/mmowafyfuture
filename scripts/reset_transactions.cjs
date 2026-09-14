require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function resetDatabase() {
  console.log('🧹 Clearing transaction tables...');
  
  const { error: err1 } = await supabase.from('supplier_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err1) console.error('Error clearing supplier_transactions:', err1.message);

  const { error: err2 } = await supabase.from('salary_advances').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err2) console.error('Error clearing salary_advances:', err2.message);

  const { error: err3 } = await supabase.from('attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err3) console.error('Error clearing attendance:', err3.message);

  const { error: err4 } = await supabase.from('cash_flow').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err4) console.error('Error clearing cash_flow:', err4.message);

  const { error: err5 } = await supabase.from('devices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err5) console.error('Error clearing devices:', err5.message);

  console.log('✨ All transactional data cleared. Suppliers and Technicians tables are preserved.');
}

resetDatabase();
