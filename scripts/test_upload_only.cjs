const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ybzmqrrecdavaarfxjvv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem1xcnJlY2RhdmFhcmZ4anZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDIyMDMsImV4cCI6MjA5OTExODIwM30.fFuuNo1j13KPvQRoDRa0q-X2Uq-T4AVPCUjoehs7IhY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('🧪 Testing Storage Upload with image/jpeg...');
  
  // Create a 1x1 dummy JPEG buffer
  const dummyJpg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64'
  );

  const fileName = `test_rls/${Date.now()}_test.jpg`;
  const { data, error } = await supabase.storage
    .from('contracts')
    .upload(fileName, dummyJpg, { contentType: 'image/jpeg', upsert: true });

  console.log('Storage Upload result:', data);
  console.log('Storage Upload error:', error);
}

run();
