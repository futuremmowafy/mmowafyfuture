require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanOldAdvances() {
  console.log('🧹 Cleaning mistakenly imported old advances...');
  
  // 1. Delete all salary advances (since we only imported the two old ones)
  const { data: delAdv, error: err1 } = await supabase
    .from('salary_advances')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletes all records

  if (err1) {
    console.error('Error deleting advances:', err1.message);
  } else {
    console.log('Successfully cleared salary_advances table.');
  }

  // 2. Delete the corresponding cash flow entries
  const { data: delCash, error: err2 } = await supabase
    .from('cash_flow')
    .delete()
    .like('description', '%سلفة نقدية للفني: اسلام (مستوردة)%');

  if (err2) {
    console.error('Error deleting cash flow entries:', err2.message);
  } else {
    console.log('Successfully cleared corresponding cash flow logs.');
  }

  console.log('✅ Cleanup completed!');
}

cleanOldAdvances();
