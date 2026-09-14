const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const supabase = createClient(supabaseUrl, serviceKey);

async function checkAndRemove() {
  const supplierId = 'e30996b4-0369-46c8-8b80-2c5fb84595c7';

  // 1. Check existing transactions
  const { data: txs, error: txErr } = await supabase
    .from('supplier_transactions')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: true });

  if (txErr) {
    console.error('Error fetching supplier transactions:', txErr);
    return;
  }

  console.log(`Total transactions for Tawfiq: ${txs.length}`);

  let balance = 0;
  txs.forEach((t, i) => {
    const amt = Number(t.amount || 0);
    if (t.transaction_type === 'شراء' || t.transaction_type === 'تحصيل') balance += amt;
    else if (t.transaction_type === 'بيع' || t.transaction_type === 'دفع') balance -= amt;
    
    if (t.amount === 22500) {
      console.log(`[Index ${i+1}] Date: ${t.created_at} | Type: ${t.transaction_type} | Amount: ${amt} | Balance: ${balance} | Notes: ${t.notes} | ID: ${t.id}`);
    }
  });

  console.log(`Current ending balance: ${balance}`);

  // Duplicate transaction to remove:
  // Transaction 1: id 'd473d6b3-2a88-4a12-a522-72c58add9e7c', created_at '2026-08-15T19:10:41.719+00:00', notes: 'دفع دفعة نقدية للمورد توفيق'
  // Transaction 2: id 'ed1ea2fe-6240-4e0b-8dbc-ade936eebe47', created_at '2026-08-15T22:58:47.161+00:00', notes: 'سداد دفعة نقدية للمورد توفيق سالم'
  // Both correspond to duplicate entries of 22,500 recorded within a few hours on 2026-08-15.
  // We will delete the duplicate one: 'ed1ea2fe-6240-4e0b-8dbc-ade936eebe47' from supplier_transactions
  // And its linked cash_flow: '0c6f9b2f-8865-4046-9dea-948005568325'

  const dupTxId = 'ed1ea2fe-6240-4e0b-8dbc-ade936eebe47';
  const dupCfId = '0c6f9b2f-8865-4046-9dea-948005568325';

  console.log(`\nDeleting duplicate supplier_transaction ${dupTxId}...`);
  const { error: delTxErr } = await supabase.from('supplier_transactions').delete().eq('id', dupTxId);
  if (delTxErr) console.error('Error deleting supplier transaction:', delTxErr);
  else console.log('Successfully deleted duplicate supplier transaction!');

  console.log(`Deleting duplicate cash_flow entry ${dupCfId}...`);
  const { error: delCfErr } = await supabase.from('cash_flow').delete().eq('id', dupCfId);
  if (delCfErr) console.error('Error deleting cash flow:', delCfErr);
  else console.log('Successfully deleted duplicate cash flow entry!');

  // Recalculate new balance
  const { data: updatedTxs } = await supabase
    .from('supplier_transactions')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: true });

  let newBalance = 0;
  updatedTxs.forEach((t) => {
    const amt = Number(t.amount || 0);
    if (t.transaction_type === 'شراء' || t.transaction_type === 'تحصيل') newBalance += amt;
    else if (t.transaction_type === 'بيع' || t.transaction_type === 'دفع') newBalance -= amt;
  });

  console.log(`\nNew ending balance for Tawfiq Salem: ${newBalance}`);
}

checkAndRemove();
