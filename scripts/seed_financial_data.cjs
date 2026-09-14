require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const systemChatId = 999999;

const initialData = {
  liquidity: {
    "خزنة الشركة": 122500,
    "حساب بنك مصر شخصي (والدي)": 14000,
    "حساب بنك مصر بيزنيس (الشركة)": 1000,
    "فودافون كاش": 6000,
    "محفظة بنك مصر": 5500
  },
  receivables: {
    "مهندس خالد الهيئة العربية": 20000,
    "شركة البن ريتشوال (إسلام)": 18000,
    "أم أحمد جارتنا": 3000,
    "محمد صابر": 500,
    "أسعد أسانسير (أقساط)": 22000,
    "هاني مصطفى (أقساط)": 96000,
    "ابراهيم محمد ابراهيم (أقساط)": 27450,
    "أم حسام طارق (أقساط)": 2000
  },
  payables: {
    "طلعت": 107250,
    "أزهار": 200000
  }
};

async function seed() {
  console.log('🚀 Seeding financial center accounts data into public.bot_sessions...');

  const { error } = await supabase
    .from('bot_sessions')
    .upsert({
      chat_id: systemChatId,
      state: 'financial_assets',
      data: initialData,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error seeding financial data:', error.message);
  } else {
    console.log('✅ Financial data seeded successfully!');
  }
}

seed();
