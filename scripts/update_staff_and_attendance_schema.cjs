require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateStaffAndSchema() {
  console.log('⚡ Starting staff table cleanup and attendance schema update...');

  // 1. Alter attendance table to add arrival_time column
  try {
    const { error: alterError } = await supabase.rpc('execute_sql_raw', {
      sql_query: 'alter table public.attendance add column if not exists arrival_time time without time zone;'
    });
    
    // If RPC execute_sql_raw doesn't exist, we will instruct the user to run it in SQL Editor.
    if (alterError) {
      console.log('Note: RPC execute_sql_raw failed, we will provide SQL query for user to run.');
    } else {
      console.log('Successfully added arrival_time column via RPC.');
    }
  } catch (err) {
    console.log('Note: RPC execute_sql_raw not available on client.');
  }

  // 2. Clean and reset staff/technicians
  const activeStaff = ['شعراوي', 'عبده', 'أحمد', 'اسلام'];
  
  // Fetch existing technicians
  const { data: allTechs } = await supabase.from('technicians').select('*');
  
  if (allTechs) {
    for (const tech of allTechs) {
      if (!activeStaff.includes(tech.name)) {
        // Delete inactive technician
        const { error: delErr } = await supabase.from('technicians').delete().eq('id', tech.id);
        if (delErr) {
          console.error(`Could not delete historical reference tech ${tech.name}:`, delErr.message);
        } else {
          console.log(`Deleted inactive technician: ${tech.name}`);
        }
      }
    }
  }

  // Ensure active staff exist
  for (const name of activeStaff) {
    const { data: existing } = await supabase.from('technicians').select('id').eq('name', name).maybeSingle();
    if (!existing) {
      const { data: inserted, error } = await supabase
        .from('technicians')
        .insert({ name: name, monthly_salary: 6000 })
        .select('id')
        .single();
      
      if (error) {
        console.error(`Error inserting active staff ${name}:`, error.message);
      } else {
        console.log(`Created active staff: ${name}`);
      }
    } else {
      console.log(`Active staff already exists: ${name}`);
    }
  }

  console.log('✅ Staff update completed.');
}

updateStaffAndSchema();
