require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reconcile() {
  console.log('📦 Starting inventory reconciliation to match physical count...');

  // 1. Fetch all devices that are currently 'متاح'
  const { data: devices, error } = await supabase
    .from('devices')
    .select('id, brand, capacity, status')
    .eq('status', 'متاح');

  if (error) {
    console.error('Error fetching devices:', error.message);
    return;
  }

  console.log(`Found ${devices.length} devices marked as 'متاح' in database.`);

  // 2. Define what we want to KEEP as 'متاح' (Physical Inventory)
  // We need:
  // - 3 of Carrier 1.5hp
  // - 2 of Midea 1.5hp
  // - 1 of Midea 2.25hp
  // - 1 of Carrier 2.25hp
  
  let keepIds = [];
  
  // Helpers to match brands and capacities (handling variations with/without dashes)
  const isCarrier = (b) => b === 'كاريير' || b === 'كاريير ';
  const isMidea = (b) => b === 'ميديا' || b === 'ميديا ';
  const is1_5 = (c) => c === '1.5 حصان' || c === '1.5-حصان' || c === '1.5';
  const is2_25 = (c) => c === '2.25 حصان' || c === '2.25-حصان' || c === '2.25';

  // Find 3 Carrier 1.5hp
  const carrier15 = devices.filter(d => isCarrier(d.brand) && is1_5(d.capacity)).slice(0, 3);
  carrier15.forEach(d => keepIds.push(d.id));
  console.log(`Keeping ${carrier15.length} Carrier 1.5hp devices as 'متاح'.`);

  // Find 2 Midea 1.5hp
  const midea15 = devices.filter(d => isMidea(d.brand) && is1_5(d.capacity)).slice(0, 2);
  midea15.forEach(d => keepIds.push(d.id));
  console.log(`Keeping ${midea15.length} Midea 1.5hp devices as 'متاح'.`);

  // Find 1 Midea 2.25hp
  const midea225 = devices.filter(d => isMidea(d.brand) && is2_25(d.capacity)).slice(0, 1);
  midea225.forEach(d => keepIds.push(d.id));
  console.log(`Keeping ${midea225.length} Midea 2.25hp devices as 'متاح'.`);

  // Find 1 Carrier 2.25hp
  const carrier225 = devices.filter(d => isCarrier(d.brand) && is2_25(d.capacity)).slice(0, 1);
  carrier225.forEach(d => keepIds.push(d.id));
  console.log(`Keeping ${carrier225.length} Carrier 2.25hp devices as 'متاح'.`);

  // 3. Update all other 'متاح' devices to 'تم التركيب'
  const toUpdate = devices.filter(d => !keepIds.includes(d.id));
  console.log(`Updating ${toUpdate.length} devices to 'تم التركيب' (sold/consumed)...`);

  const updateIds = toUpdate.map(d => d.id);

  if (updateIds.length > 0) {
    // We update in batches or single query
    const { error: updateErr } = await supabase
      .from('devices')
      .update({
        status: 'تم التركيب',
        customer_name: 'مبيعات سابقة غير مسجلة',
        customer_phone: 'غير مسجل',
        customer_address: 'تم التركيب والبيع من المخزن'
      })
      .in('id', updateIds);

    if (updateErr) {
      console.error('Error during bulk update:', updateErr.message);
      return;
    }
  }

  // Double check and standardize the kept devices' capacities/brands
  if (keepIds.length > 0) {
    for (const d of carrier15) {
      await supabase.from('devices').update({ brand: 'كاريير', capacity: '1.5-حصان' }).eq('id', d.id);
    }
    for (const d of midea15) {
      await supabase.from('devices').update({ brand: 'ميديا', capacity: '1.5-حصان' }).eq('id', d.id);
    }
    for (const d of midea225) {
      await supabase.from('devices').update({ brand: 'ميديا', capacity: '2.25-حصان' }).eq('id', d.id);
    }
    for (const d of carrier225) {
      await supabase.from('devices').update({ brand: 'كاريير', capacity: '2.25-حصان' }).eq('id', d.id);
    }
  }

  console.log('✅ Inventory reconciliation completed successfully! Available stock is now matched to ground reality.');
}

reconcile();
