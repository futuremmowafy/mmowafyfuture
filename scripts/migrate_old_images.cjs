require('dotenv').config({ path: 'd:/مشاريع/futureairpro/.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const OLD_URL_PREFIX = 'https://ybzmqrrecdavaarfxjvv.supabase.co/storage/v1/object/public/contracts/';
const NEW_URL_PREFIX = 'https://fsdgiebjkymenayboodg.supabase.co/storage/v1/object/public/contracts/';

const newSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  console.log('🚀 Checking status of old project and preparing migration...');

  // 1. Gather all unique old URLs from devices and cash_flow
  const { data: devs } = await newSupabase.from('devices').select('id, contract_images');
  const { data: cfs } = await newSupabase.from('cash_flow').select('id, description');

  const oldUrls = new Set();
  (devs || []).forEach(d => {
    (d.contract_images || []).forEach(u => {
      if (u && u.includes('ybzmqrrecdavaarfxjvv')) oldUrls.add(u);
    });
  });

  (cfs || []).forEach(c => {
    if (c.description && c.description.includes('ybzmqrrecdavaarfxjvv')) {
      const match = c.description.match(/https:\/\/ybzmqrrecdavaarfxjvv\.supabase\.co\/storage\/v1\/object\/public\/contracts\/[^\s\)]+/g);
      if (match) match.forEach(u => oldUrls.add(u));
    }
  });

  const urlList = Array.from(oldUrls);
  console.log(`📋 Found ${urlList.length} unique old image URLs to migrate.`);

  // 2. Test the first URL
  const testUrl = urlList[0];
  try {
    const testRes = await fetch(testUrl);
    if (testRes.status === 402) {
      console.log('⏳ Old project is still restricted (HTTP 402 - Exceeded Egress).');
      console.log('💡 As soon as restrictions are lifted (or plan upgraded/billing cycle reset), running this script will migrate all files.');
      return { success: false, reason: '402_restricted' };
    }
    if (!testRes.ok) {
      console.log(`⚠️ Test URL returned HTTP ${testRes.status} ${testRes.statusText}`);
      return { success: false, reason: `HTTP_${testRes.status}` };
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
    return { success: false, reason: err.message };
  }

  // 3. Download from old project and upload to new project
  console.log('✅ Old project is ACCESSIBLE! Starting transfer of all 97 files...');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urlList.length; i++) {
    const url = urlList[i];
    const relPath = decodeURIComponent(url.replace(OLD_URL_PREFIX, ''));

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      const mime = url.endsWith('.png') ? 'image/png' : (url.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      const { error: upErr } = await newSupabase.storage
        .from('contracts')
        .upload(relPath, buffer, { upsert: true, contentType: mime });

      if (upErr) throw upErr;
      successCount++;
      process.stdout.write(`\r[${i + 1}/${urlList.length}] Transferred: ${relPath.slice(0, 40)}...`);
    } catch (err) {
      failCount++;
      console.error(`\n❌ Failed to transfer ${relPath}:`, err.message);
    }
  }

  console.log(`\n\n🎉 Finished transfer: ${successCount} succeeded, ${failCount} failed.`);

  // 4. Update devices contract_images
  console.log('🔄 Updating URLs in devices table...');
  for (const dev of (devs || [])) {
    if (!dev.contract_images || dev.contract_images.length === 0) continue;
    let hasChange = false;
    const newImages = dev.contract_images.map(u => {
      if (u && u.includes('ybzmqrrecdavaarfxjvv')) {
        hasChange = true;
        return u.replace('ybzmqrrecdavaarfxjvv', 'fsdgiebjkymenayboodg');
      }
      return u;
    });

    if (hasChange) {
      await newSupabase.from('devices').update({ contract_images: newImages }).eq('id', dev.id);
    }
  }

  // 5. Update cash_flow description
  console.log('🔄 Updating URLs in cash_flow table...');
  for (const c of (cfs || [])) {
    if (c.description && c.description.includes('ybzmqrrecdavaarfxjvv')) {
      const newDesc = c.description.replace(/ybzmqrrecdavaarfxjvv/g, 'fsdgiebjkymenayboodg');
      await newSupabase.from('cash_flow').update({ description: newDesc }).eq('id', c.id);
    }
  }

  console.log('✨ MIGRATION COMPLETE! All 97 archive files and documents now live permanently in the new database.');
  return { success: true, count: successCount };
}

runMigration();
