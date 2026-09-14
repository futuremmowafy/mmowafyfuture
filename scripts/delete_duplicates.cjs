require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const duplicateIds = [
  '122e05cc-a7ab-40df-bf37-cddc428ac933', // عبد العزيز عين شمس (مكرر فارغ)
  'a85c12a5-5a18-4113-99c6-6eec4197b59c', // محمد سامى (مكرر فارغ)
  '9859a9fa-8147-440f-92ee-3f3777da79cb', // فـرج (مكرر فارغ)
  'd5d91be3-5593-4dae-937a-575d9b8c107a', // م نشأت (مكرر فارغ)
  'a05ec286-a21d-4155-b4fd-3ea769589e98'  // مايكل تجارى (مكرر فارغ)
];

async function cleanDuplicates() {
  console.log('🧹 Deleting empty duplicate supplier cards...');

  for (const id of duplicateIds) {
    const { data: sup } = await supabase.from('suppliers').select('name').eq('id', id).single();
    const name = sup ? sup.name : id;
    
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) {
      console.error(`Error deleting duplicate supplier "${name}":`, error.message);
    } else {
      console.log(`Successfully deleted empty duplicate supplier: "${name}"`);
    }
  }

  console.log('✨ Supplier clean-up completed successfully!');
}

cleanDuplicates();
