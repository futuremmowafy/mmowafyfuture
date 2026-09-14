// check_tech_cols.cjs
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDIyMDMsImV4cCI6MjA5OTExODIwM30.fFuuNo1j13KPvQRoDRa0q-X2Uq-T4AVPCUjoehs7IhY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data } = await supabase.from('technicians').select('*').limit(1);
  console.log(data);
}
run();
