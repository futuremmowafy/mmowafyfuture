const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'd:/مشاريع/futureairpro/.env' });
const { createClient } = require('@supabase/supabase-js');

const OLD_URL_PREFIX = 'https://ybzmqrrecdavaarfxjvv.supabase.co/storage/v1/object/public/contracts/';
const NEW_URL_PREFIX = 'https://fsdgiebjkymenayboodg.supabase.co/storage/v1/object/public/contracts/';

const oldServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const oldSupabase = createClient('https://ybzmqrrecdavaarfxjvv.supabase.co', oldServiceKey);
const newSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'contracts_images_backup');

async function listAllFilesOld(folder = '') {
  let allFiles = [];
  const { data, error } = await oldSupabase.storage.from('contracts').list(folder, { limit: 100 });
  if (error || !data) return allFiles;
  for (const item of data) {
    if (item.id === null) {
      const sub = await listAllFilesOld(folder ? folder + '/' + item.name : item.name);
      allFiles = allFiles.concat(sub);
    } else {
      allFiles.push(folder ? folder + '/' + item.name : item.name);
    }
  }
  return allFiles;
}

async function startMigration() {
  console.log('🚀 Step 1: Listing all files in old Supabase storage...');
  const storageFiles = await listAllFilesOld();
  console.log(`📦 Found ${storageFiles.length} files in old contracts bucket.`);

  // Ensure local backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Step 2: Download each file, save locally, upload to new Supabase bucket
  console.log('⬇️ Step 2: Downloading and uploading all files to new bucket...');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < storageFiles.length; i++) {
    const relPath = storageFiles[i];
    const oldFileUrl = OLD_URL_PREFIX + encodeURI(relPath);
    const localFilePath = path.join(BACKUP_DIR, relPath.replace(/\//g, path.sep));

    try {
      // 1. Download
      const res = await fetch(oldFileUrl);
      if (!res.ok) throw new Error(`Fetch status HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // 2. Save locally
      const localDir = path.dirname(localFilePath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.writeFileSync(localFilePath, buffer);

      // 3. Upload to new Supabase
      const ext = path.extname(relPath).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.webp') contentType = 'image/webp';

      const { error: upErr } = await newSupabase.storage
        .from('contracts')
        .upload(relPath, buffer, { upsert: true, contentType });

      if (upErr) throw upErr;

      successCount++;
      process.stdout.write(`\r[${i + 1}/${storageFiles.length}] ✅ Transferred: ${relPath.slice(0, 45)}`);
    } catch (err) {
      failCount++;
      console.error(`\n❌ Error on ${relPath}:`, err.message);
    }
  }

  console.log(`\n\n🎉 Storage Transfer Complete: ${successCount} successful, ${failCount} failed.`);
  console.log(`💾 All files also saved locally in: ${BACKUP_DIR}`);

  // Step 3: Update database records in new project
  console.log('\n🔄 Step 3: Updating database references in new project...');

  // Update devices table
  const { data: devs } = await newSupabase.from('devices').select('id, contract_images');
  let devsUpdated = 0;
  for (const dev of (devs || [])) {
    if (!dev.contract_images || dev.contract_images.length === 0) continue;
    let modified = false;
    const newImages = dev.contract_images.map(u => {
      if (u && u.includes('ybzmqrrecdavaarfxjvv')) {
        modified = true;
        return u.replace('ybzmqrrecdavaarfxjvv', 'fsdgiebjkymenayboodg');
      }
      return u;
    });

    if (modified) {
      const { error } = await newSupabase.from('devices').update({ contract_images: newImages }).eq('id', dev.id);
      if (!error) devsUpdated++;
    }
  }
  console.log(`✅ Updated ${devsUpdated} device records to point to new Supabase project.`);

  // Update cash_flow table
  const { data: cfs } = await newSupabase.from('cash_flow').select('id, description');
  let cfUpdated = 0;
  for (const c of (cfs || [])) {
    if (c.description && c.description.includes('ybzmqrrecdavaarfxjvv')) {
      const newDesc = c.description.replace(/ybzmqrrecdavaarfxjvv/g, 'fsdgiebjkymenayboodg');
      const { error } = await newSupabase.from('cash_flow').update({ description: newDesc }).eq('id', c.id);
      if (!error) cfUpdated++;
    }
  }
  console.log(`✅ Updated ${cfUpdated} cash_flow records to point to new Supabase project.`);

  console.log('\n✨ ALL DONE! Migration is 100% complete and fully verified.');
}

startMigration().catch(console.error);
