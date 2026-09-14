import { supabase } from '../lib/supabase.js';

console.log('⏳ Testing Supabase connection...');
try {
  const { data, error } = await supabase.from('bot_sessions').select('chat_id').limit(1);
  
  if (error) {
    if (error.code === 'PGRST116' || error.message.includes('not found')) {
      console.log('✅ Connection to Supabase is successful! Credentials are correct.');
    } else if (error.message.includes('relation "public.bot_sessions" does not exist')) {
      console.log('⚠️ Connected to Supabase successfully, but the tables do not exist yet.');
      console.log('👉 Please make sure to execute the SQL query in "supabase_schema.sql" in the Supabase SQL editor.');
    } else {
      console.error('❌ Supabase returned an error:', error);
    }
  } else {
    console.log('✅ Connection to Supabase successful! bot_sessions table is reachable.');
  }
} catch (err) {
  console.error('❌ Unexpected error during connection test:', err);
}
