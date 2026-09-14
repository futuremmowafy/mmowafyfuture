require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('⚡ Attempting to create RLS policies for storage.objects...');

  const sql = `
    DROP POLICY IF EXISTS "Allow public upload to contracts" ON storage.objects;
    DROP POLICY IF EXISTS "Allow public read from contracts" ON storage.objects;
    DROP POLICY IF EXISTS "Allow public update to contracts" ON storage.objects;
    DROP POLICY IF EXISTS "Allow public delete from contracts" ON storage.objects;

    CREATE POLICY "Allow public upload to contracts" 
    ON storage.objects 
    FOR INSERT 
    TO public
    WITH CHECK (bucket_id = 'contracts');

    CREATE POLICY "Allow public read from contracts" 
    ON storage.objects 
    FOR SELECT 
    TO public
    USING (bucket_id = 'contracts');

    CREATE POLICY "Allow public update to contracts" 
    ON storage.objects 
    FOR UPDATE 
    TO public
    USING (bucket_id = 'contracts')
    WITH CHECK (bucket_id = 'contracts');

    CREATE POLICY "Allow public delete from contracts" 
    ON storage.objects 
    FOR DELETE 
    TO public
    USING (bucket_id = 'contracts');
  `;

  try {
    const { data, error } = await supabase.rpc('execute_sql_raw', {
      sql_query: sql
    });

    if (error) {
      console.error('❌ Error executing SQL via RPC:', error);
    } else {
      console.log('✅ Storage RLS policies created successfully!', data);
    }
  } catch (err) {
    console.error('❌ Failed to call RPC execute_sql_raw:', err);
  }
}

run();
