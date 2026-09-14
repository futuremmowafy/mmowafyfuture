require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const oldSerial = 'DEV-كار-764989'; // 1.5hp Carrier Cool Normal
const newSerial = 'DEV-كار-707000'; // 2.25hp Carrier Cool Normal

async function run() {
  console.log(`🔄 Swapping dispatch from ${oldSerial} (1.5hp) to ${newSerial} (2.25hp)...`);

  // 1. Get details of the old device
  const { data: oldDev, error: fetchErr } = await supabase
    .from('devices')
    .select('*')
    .eq('serial_number', oldSerial)
    .maybeSingle();

  if (fetchErr || !oldDev) {
    console.error('❌ Failed to fetch old device:', fetchErr || 'Device not found');
    return;
  }

  if (oldDev.status === 'متاح') {
    console.error('❌ The old device is already marked as "متاح" (Available). Swap might have already run or was not registered.');
    return;
  }

  // 2. Get details of the new device
  const { data: newDev, error: fetchNewErr } = await supabase
    .from('devices')
    .select('*')
    .eq('serial_number', newSerial)
    .maybeSingle();

  if (fetchNewErr || !newDev) {
    console.error('❌ Failed to fetch new device:', fetchNewErr || 'Device not found');
    return;
  }

  console.log(`Found old device ID: ${oldDev.id}, status: ${oldDev.status}`);
  console.log(`Found new device ID: ${newDev.id}, status: ${newDev.status}`);

  // 3. Update the new device with the old device's sale details
  console.log(`⚙️ Transferring sale details to ${newSerial}...`);
  const { error: updateNewErr } = await supabase
    .from('devices')
    .update({
      status: oldDev.status,
      supplier_id: oldDev.supplier_id,
      customer_name: oldDev.customer_name,
      customer_phone: oldDev.customer_phone,
      customer_address: oldDev.customer_address,
      sale_price: oldDev.sale_price,
      amount_paid: oldDev.amount_paid,
      amount_remaining: oldDev.amount_remaining,
      assigned_at: oldDev.assigned_at,
      installed_at: oldDev.installed_at,
      contract_images: oldDev.contract_images
    })
    .eq('id', newDev.id);

  if (updateNewErr) {
    console.error('❌ Failed to update new device:', updateNewErr);
    return;
  }
  console.log(`✅ Successfully updated ${newSerial} to "${oldDev.status}".`);

  // 4. Reset the old device back to 'متاح'
  console.log(`⚙️ Resetting ${oldSerial} back to "متاح"...`);
  const { error: resetOldErr } = await supabase
    .from('devices')
    .update({
      status: 'متاح',
      supplier_id: null,
      customer_name: null,
      customer_phone: null,
      customer_address: null,
      sale_price: 0,
      amount_paid: 0,
      amount_remaining: 0,
      assigned_at: null,
      installed_at: null,
      contract_images: []
    })
    .eq('id', oldDev.id);

  if (resetOldErr) {
    console.error('❌ Failed to reset old device:', resetOldErr);
    return;
  }
  console.log(`✅ Successfully reset ${oldSerial} to "متاح".`);

  // 5. Update supplier_transactions to point to the new device ID
  console.log(`⚙️ Updating supplier_transactions from old device to new device...`);
  const { error: updateTxErr } = await supabase
    .from('supplier_transactions')
    .update({ device_id: newDev.id })
    .eq('device_id', oldDev.id);

  if (updateTxErr) {
    console.log('⚠️ Failed to update supplier transactions:', updateTxErr.message);
  } else {
    console.log('✅ Successfully updated supplier transactions link.');
  }

  // 6. Update cash_flow description text
  console.log(`⚙️ Updating cash flow descriptions containing serial number...`);
  const { data: cashEntries } = await supabase
    .from('cash_flow')
    .select('*')
    .like('description', `%${oldSerial}%`);

  if (cashEntries && cashEntries.length > 0) {
    for (const entry of cashEntries) {
      const newDesc = entry.description.replace(oldSerial, newSerial);
      await supabase
        .from('cash_flow')
        .update({ description: newDesc })
        .eq('id', entry.id);
    }
    console.log(`✅ Successfully updated ${cashEntries.length} cash flow descriptions.`);
  } else {
    console.log('ℹ️ No cash flow entries needed serial number updates.');
  }

  console.log('🎉 Swap completed successfully!');
}

run();
