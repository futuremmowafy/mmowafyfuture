import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0MjIwMywiZXhwIjoyMDk5MTE4MjAzfQ.cWMWhi-2o2p6M8CarBdBQkVfEurpCVYFRF3T9hX96uk';
const supabase = createClient(supabaseUrl, serviceKey);

async function inspectSchema() {
  const { data: dev, error: devErr } = await supabase.from('devices').select('*').limit(1);
  if (dev && dev.length > 0) {
    console.log('Devices columns:', Object.keys(dev[0]));
  } else {
    console.log('No devices or error:', devErr);
  }

  const { data: tech, error: techErr } = await supabase.from('technicians').select('*').limit(1);
  if (tech && tech.length > 0) {
    console.log('Technicians columns:', Object.keys(tech[0]));
  } else {
    console.log('No technicians or error:', techErr);
  }
}

inspectSchema();
