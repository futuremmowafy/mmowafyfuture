const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDIyMDMsImV4cCI6MjA5OTExODIwM30.fFuuNo1j13KPvQRoDRa0q-X2Uq-T4AVPCUjoehs7IhY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Real ID from database that is currently status = 'متاح'
// Let's query one available device ID using the service client first to ensure we test with a valid available device.
const { createClient: createServiceClient } = require('@supabase/supabase-js');
require('dotenv').config();
const serviceClient = createServiceClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: devs } = await serviceClient.from('devices').select('id, brand, capacity, serial_number').eq('status', 'متاح').limit(1);
  const { data: sups } = await serviceClient.from('suppliers').select('id, name').limit(1);

  if (!devs || devs.length === 0 || !sups || sups.length === 0) {
    console.error('No available devices or suppliers found to run the test.');
    return;
  }

  const deviceId = devs[0].id;
  const supplierId = sups[0].id;
  console.log(`Testing with Device ID: ${deviceId} (${devs[0].brand}), Supplier ID: ${supplierId} (${sups[0].name})`);

  // Step 1: Storage Upload Test
  console.log('\n🧪 Testing Storage Upload...');
  const fileName = `test_rls/${Date.now()}_test.txt`;
  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('contracts')
    .upload(fileName, Buffer.from('hello world'), { contentType: 'text/plain', upsert: true });
  console.log('Storage Upload result:', uploadData, 'Error:', uploadErr);

  // Step 2: Device UPDATE Test
  console.log('\n🧪 Testing Device Update...');
  const { data: devUpdate, error: devErr } = await supabase
    .from('devices')
    .update({
      status: 'تم التركيب',
      supplier_id: supplierId,
      sale_price: 33250,
      amount_paid: 33250,
      amount_remaining: 0,
      assigned_at: new Date().toISOString()
    })
    .eq('id', deviceId);
  console.log('Device Update result:', devUpdate, 'Error:', devErr);

  // Step 3: supplier_transactions INSERT 1
  console.log('\n🧪 Testing supplier_transactions INSERT (بيع)...');
  const { error: txErr1 } = await supabase
    .from('supplier_transactions')
    .insert({
      supplier_id: supplierId,
      device_id: deviceId,
      transaction_type: 'بيع',
      amount: 33250,
      notes: `Test RLS`
    });
  console.log('supplier_transactions INSERT (بيع) error:', txErr1);

  // Step 4: supplier_transactions INSERT 2
  console.log('\n🧪 Testing supplier_transactions INSERT (تحصيل)...');
  const { error: txErr2 } = await supabase
    .from('supplier_transactions')
    .insert({
      supplier_id: supplierId,
      device_id: deviceId,
      transaction_type: 'تحصيل',
      amount: 33250,
      notes: `Test RLS`
    });
  console.log('supplier_transactions INSERT (تحصيل) error:', txErr2);

  // Step 5: cash_flow INSERT
  console.log('\n🧪 Testing cash_flow INSERT...');
  const { error: cashErr } = await supabase
    .from('cash_flow')
    .insert({
      type: 'إيراد',
      amount: 33250,
      description: 'Test RLS'
    });
  console.log('cash_flow INSERT error:', cashErr);

  // Cleanup: Reset device status back to 'متاح'
  await serviceClient.from('devices').update({
    status: 'متاح',
    supplier_id: null,
    sale_price: null,
    amount_paid: null,
    amount_remaining: null,
    assigned_at: null
  }).eq('id', deviceId);
  console.log('\n🧹 Database cleaned up.');
}

run();
