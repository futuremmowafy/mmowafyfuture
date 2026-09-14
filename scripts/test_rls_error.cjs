const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDIyMDMsImV4cCI6MjA5OTExODIwM30.fFuuNo1j13KPvQRoDRa0q-X2Uq-T4AVPCUjoehs7IhY';
const supabase = createClient(supabaseUrl, supabaseKey);

const deviceId = 'b321036a-d807-4caa-8077-620b15151feb';
const supplierId = '404cc25d-efad-4c99-95d4-86b2df2a0c25';

async function testRLS() {
  console.log('🧪 Testing UPDATE on devices...');
  const { error: devErr } = await supabase
    .from('devices')
    .update({ sale_price: 1 })
    .eq('id', deviceId);
  console.log('Devices UPDATE result error:', devErr);

  console.log('🧪 Testing INSERT on supplier_transactions...');
  const { error: txErr } = await supabase
    .from('supplier_transactions')
    .insert({
      supplier_id: supplierId,
      device_id: deviceId,
      transaction_type: 'بيع',
      amount: 1,
      notes: 'Test RLS with real IDs'
    });
  console.log('supplier_transactions INSERT result error:', txErr);

  console.log('🧪 Testing INSERT on cash_flow...');
  const { error: cashErr } = await supabase
    .from('cash_flow')
    .insert({
      type: 'إيراد',
      amount: 1,
      description: 'Test RLS'
    });
  console.log('cash_flow INSERT result error:', cashErr);
}

testRLS();
