// 🎙️ Telegram Voice & Cash Flow & Voice ERP Bot Handlers
import { supabase } from './supabase.js';
import { isAuthorized } from './bot.js';
import {
  parseVoiceOrTextMessage,
  parseAttendanceMessage,
  parseArabicAmount,
  extractPaymentMethod,
  extractAcBrandAndSpecifier,
  extractAcCapacity,
  extractSerialsFromText,
  extractMultipleSerialsFromText,
  extractEgyptianPhoneNumber,
  extractAndNormalizeDate,
  normalizeAcBrand
} from './arabic_parser.js';
import { downloadFileBuffer, parseERPWithGemini, analyzeReceiptPhotoWithGemini, classifyDocumentPhotoWithGemini } from './transcriber.js';
import { userSessions } from './sessions.js';

// Helper: Format Egyptian Currency
function formatEgp(num) {
  return Number(num || 0).toLocaleString('en-US') + ' ج.م';
}

// Helper: Normalize various Arabic / English date strings to YYYY-MM-DD
function normalizeDateStringToIso(dateStr) {
  if (!dateStr) return null;
  const direct = extractAndNormalizeDate(dateStr);
  if (direct) return direct;

  const str = String(dateStr).trim().replace(/[/\\]/g, '-');

  // YYYY-MM-DD or YYYY-M-D
  const matchYmd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (matchYmd) {
    const y = matchYmd[1];
    const m = matchYmd[2].padStart(2, '0');
    const d = matchYmd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or D-M-YYYY
  const matchDmy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (matchDmy) {
    const d = matchDmy[1].padStart(2, '0');
    const m = matchDmy[2].padStart(2, '0');
    const y = matchDmy[3];
    return `${y}-${m}-${d}`;
  }

  // DD-MM or D-M (defaults to current year)
  const matchDm = str.match(/^(\d{1,2})-(\d{1,2})$/);
  if (matchDm) {
    const d = matchDm[1].padStart(2, '0');
    const m = matchDm[2].padStart(2, '0');
    const y = new Date().getFullYear();
    return `${y}-${m}-${d}`;
  }

  return null;
}

// Helper: Remove broken/unprintable characters
function cleanTextString(str) {
  if (!str) return str;
  return String(str)
    .replace(/[\uFFFD\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper: Normalize capacity strings to standard format
function normalizeCapacity(capStr) {
  if (!capStr) return '1.5-حصان';
  let s = cleanTextString(capStr);
  if (/1\.5|حصان ونص|حصان ونصف|واحد ونص/.test(s)) return '1.5-حصان';
  if (/2\.25|2 وربع|اتنين وربع|اثنين وربع/.test(s)) return '2.25-حصان';
  if (/3|تلاتة|تلاته|ثلاثة/.test(s) && !/1\.5|2\.25/.test(s)) return '3-حصان';
  if (/4|أربعة|اربعه/.test(s)) return '4-حصان';
  if (/5|خمسة|خمسه/.test(s)) return '5-حصان';
  if (s.includes('حصان') || s.includes('حصا')) {
    if (s.includes('1.5')) return '1.5-حصان';
    if (s.includes('2.25')) return '2.25-حصان';
    if (s.includes('3')) return '3-حصان';
    if (s.includes('4')) return '4-حصان';
    if (s.includes('5')) return '5-حصان';
  }
  return s || '1.5-حصان';
}

// Helper: Check if AC brand has a full model specifier
function hasAcSpecifier(brandStr) {
  if (!brandStr) return false;
  const b = String(brandStr).toLowerCase().replace(/[أإآ]/g, 'ا');
  return b.includes('بارد ساخن') || b.includes('بارد انفرتر') || b.includes('بارد عادي') || b.includes('كونسيلد') || b.includes('شباك') || b.includes('فري ستاند') || b.includes('سقف');
}

// Payment Methods Map with short codes for safe Telegram callback_data (<= 64 bytes)
const METHOD_CODES = {
  '1': 'خزنة',
  '2': 'فودافون كاش',
  '3': 'إنستا باي',
  '4': 'محفظة بنك مصر',
  '5': 'تحويل بنكي',
  '6': 'حساب الشركة'
};

const METHOD_LABELS = {
  'خزنة': '💵 خزنة الشركة (كاش)',
  'فودافون كاش': '📱 فودافون كاش',
  'إنستا باي': '⚡ إنستا باي',
  'محفظة بنك مصر': '🏦 محفظة بنك مصر',
  'تحويل بنكي': '🏛️ تحويل بنكي (شخصي)',
  'حساب الشركة': '🏢 بنك مصر بيزنيس (الشركة)',
  'آجل': '⏳ آجل على الحساب',
  'بنك': '🏛️ تحويل بنكي (شخصي)'
};

// Helper: Get AI Keys from In-Memory Cache or DB / ENV (5 mins TTL)
let cachedAiKeys = null;
let cachedAiKeysExpiry = 0;

export function invalidateAiKeysCache() {
  cachedAiKeys = null;
  cachedAiKeysExpiry = 0;
}

const FALLBACK_GEMINI_KEY = process.env.GEMINI_API_KEY || '';

export async function getStoredAiKeys() {
  const now = Date.now();
  if (cachedAiKeys && cachedAiKeysExpiry > now) {
    return cachedAiKeys;
  }

  try {
    const { data } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('chat_id', 999999)
      .maybeSingle();

    cachedAiKeys = {
      GEMINI_API_KEY: data?.data?.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || FALLBACK_GEMINI_KEY
    };
    cachedAiKeysExpiry = now + 5 * 60 * 1000;
    return cachedAiKeys;
  } catch (e) {
    return {
      GEMINI_API_KEY: process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || FALLBACK_GEMINI_KEY
    };
  }
}



// Helper: Persistent User Sessions in Supabase
async function setUserSession(userId, sessionData) {
  try {
    if (!userId) return;
    await supabase.from('bot_sessions').upsert({
      chat_id: Number(userId),
      state: 'user_session',
      data: sessionData,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('setUserSession error:', e.message);
  }
}

async function getUserSession(userId) {
  try {
    if (!userId) return null;
    const { data } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('chat_id', Number(userId))
      .maybeSingle();
    return data?.data || null;
  } catch (e) {
    return null;
  }
}

// Helper: Auto-Update Financial Liquidity Balances
async function updateLiquidity(paymentMethod, amountChange) {
  try {
    if (!paymentMethod || paymentMethod === 'آجل' || paymentMethod.includes('آجل') || amountChange === 0) return;
    const { data: rows, error } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('chat_id', 999999)
      .maybeSingle();

    if (error || !rows || !rows.data) return;

    const finData = rows.data;
    const liquidity = finData.liquidity || {};
    const cleanMethod = String(paymentMethod).trim();
    const lower = cleanMethod.toLowerCase();

    // Canonical Account Names in the system:
    // 1. "خزنة الشركة"
    // 2. "فودافون كاش"
    // 3. "حساب بنك مصر شخصي (والدي)"  <-- (InstaPay & Bank Transfer)
    // 4. "حساب بنك مصر بيزنيس (الشركة)" <-- (Company Business Bank Account)
    // 5. "محفظة بنك مصر"             <-- (Electronic Wallet)

    let finalKey = null;
    if (lower.includes('محفظة')) {
      finalKey = 'محفظة بنك مصر';
    } else if (lower.includes('بيزنيس') || lower.includes('شركة') || lower.includes('شركات')) {
      finalKey = 'حساب بنك مصر بيزنيس (الشركة)';
    } else if (lower.includes('إنستا') || lower.includes('انستا') || lower.includes('بنك') || lower.includes('تحويل') || lower.includes('شخصي') || lower.includes('insta')) {
      finalKey = 'حساب بنك مصر شخصي (والدي)';
    } else if (lower.includes('فودافون')) {
      finalKey = 'فودافون كاش';
    } else {
      finalKey = 'خزنة الشركة';
    }

    liquidity[finalKey] = Number(liquidity[finalKey] || 0) + amountChange;

    finData.liquidity = liquidity;
    await supabase
      .from('bot_sessions')
      .update({ data: finData, updated_at: new Date().toISOString() })
      .eq('chat_id', 999999);

    return liquidity[finalKey];
  } catch (e) {
    console.warn('updateLiquidity failed:', e.message);
  }
}

// Helper: Format Payment Method Display for Confirmation Cards (Single or Multi-Method)
function formatPaymentMethodDisplay(data) {
  const splits = Array.isArray(data?.payments) && data.payments.length > 1
    ? data.payments.filter(p => Number(p.amount) > 0)
    : [];

  const amt = Number(data?.amount_paid != null ? data.amount_paid : (data?.amount || 0));

  if (splits.length > 1) {
    let text = `<b>${formatEgp(amt)}</b> (طرق متعددة):\n`;
    splits.forEach((s, idx) => {
      const isLast = idx === splits.length - 1;
      const branch = isLast ? '   └' : '   ├';
      let icon = '💳';
      const m = String(s.method || '').toLowerCase();
      if (m.includes('خزنة') || m.includes('كاش') || m.includes('نقدي')) icon = '💵';
      else if (m.includes('فودافون')) icon = '📱';
      else if (m.includes('إنستا') || m.includes('انستا') || m.includes('بنك') || m.includes('شخصي')) icon = '⚡';
      else if (m.includes('محفظة')) icon = '🏦';
      else if (m.includes('بيزنيس') || m.includes('شركة')) icon = '🏢';
      text += `${branch} ${icon} <b>${formatEgp(s.amount)}</b> (${s.method})\n`;
    });
    return text.trimEnd();
  }

  const method = data?.payment_method || (amt === 0 ? 'آجل' : 'خزنة');
  return `<b>${formatEgp(amt)}</b> (${method})`;
}

// Helper: Process Multi-Method Split Payments in cash_flow & Liquidity
async function processPaymentSplits({ payments, totalAmount, paymentMethod, descriptionPrefix, todayDate, nowIso, txType = 'إيراد' }) {
  const splits = Array.isArray(payments) && payments.length > 1
    ? payments.filter(p => Number(p.amount) > 0)
    : [];

  let firstTxId = null;

  if (splits.length > 1) {
    for (const split of splits) {
      const amt = Number(split.amount || 0);
      const method = split.method || 'خزنة';
      const desc = `${descriptionPrefix} | دفعة: ${formatEgp(amt)} عبر (${method})`;

      const { data: txRow } = await supabase.from('cash_flow').insert({
        type: txType,
        amount: amt,
        description: desc,
        date: todayDate,
        created_at: nowIso
      }).select('id').single();

      if (!firstTxId && txRow) firstTxId = txRow.id;
      await updateLiquidity(method, txType === 'إيراد' ? amt : -amt);
    }
  } else {
    const singleAmt = Number(totalAmount || 0);
    const singleMethod = (splits[0]?.method) || paymentMethod || 'خزنة';
    if (singleAmt > 0) {
      const { data: txRow } = await supabase.from('cash_flow').insert({
        type: txType,
        amount: singleAmt,
        description: `${descriptionPrefix} | ${singleMethod}`,
        date: todayDate,
        created_at: nowIso
      }).select('id').single();

      if (txRow) firstTxId = txRow.id;
      await updateLiquidity(singleMethod, txType === 'إيراد' ? singleAmt : -singleAmt);
    }
  }

  return firstTxId;
}

// Helper: Get Current Safe and Liquidity Summary
async function getLiquiditySummary() {
  try {
    const { data: rows } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('chat_id', 999999)
      .maybeSingle();

    const liquidity = rows?.data?.liquidity || {};
    let msg = `💰 <b>أرصدة الخزينة والوسائل الحالية:</b>\n\n`;

    let total = 0;
    for (const [key, val] of Object.entries(liquidity)) {
      const num = Number(val || 0);
      total += num;
      let icon = '💳';
      if (key.includes('خزنة')) icon = '💵';
      else if (key.includes('فودافون')) icon = '📱';
      else if (key.includes('شخصي') || key.includes('إنستا')) icon = '⚡';
      else if (key.includes('محفظة')) icon = '🏦';
      else if (key.includes('بيزنيس') || key.includes('الشركة')) icon = '🏢';

      msg += `${icon} <b>${key}:</b> ${formatEgp(num)}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━\n`;
    msg += `📊 <b>إجمالي السيولة المتاحة:</b> ${formatEgp(total)}`;
    return msg;
  } catch (e) {
    return 'تعذر قراءة الأرصدة حالياً.';
  }
}

// Helper: Get Fast Suppliers & Traders Accounts Summary
async function getSuppliersSummary() {
  try {
    const [supsRes, txsRes] = await Promise.all([
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('supplier_transactions').select('supplier_id, transaction_type, amount')
    ]);

    const suppliers = supsRes.data || [];
    const allTxs = txsRes.data || [];

    if (suppliers.length === 0) {
      return 'ℹ️ لا يوجد موردين أو تجار مسجلين بالنظام حالياً.';
    }

    let msg = `🏢 <b>كشف حسابات الموردين والتجار (عرض فوري ⚡):</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n\n`;

    let totalOwedToThem = 0;
    let totalOwedToUs = 0;

    suppliers.forEach((sup, idx) => {
      const txs = allTxs.filter(t => t.supplier_id === sup.id);
      let purchased = 0;
      let sold = 0;
      let paid = 0;
      let collected = 0;

      txs.forEach(t => {
        const amt = Number(t.amount || 0);
        if (t.transaction_type === 'شراء') purchased += amt;
        else if (t.transaction_type === 'بيع') sold += amt;
        else if (t.transaction_type === 'دفع') paid += amt;
        else if (t.transaction_type === 'تحصيل') collected += amt;
      });

      const netBalance = (purchased + collected) - (paid + sold);

      if (netBalance > 0) {
        totalOwedToThem += netBalance;
        msg += `${idx + 1}. 🔴 <b>${sup.name}:</b>\n   └ ⚠️ له علينا: <b>${formatEgp(netBalance)}</b>\n\n`;
      } else if (netBalance < 0) {
        const absVal = Math.abs(netBalance);
        totalOwedToUs += absVal;
        msg += `${idx + 1}. 🟢 <b>${sup.name}:</b>\n   └ ✅ لنا عليه: <b>${formatEgp(absVal)}</b>\n\n`;
      } else {
        msg += `${idx + 1}. ⚖️ <b>${sup.name}:</b>\n   └ ⚪ الحساب متزن (0 ج.م)\n\n`;
      }
    });

    const netTotal = totalOwedToThem - totalOwedToUs;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🔴 <b>إجمالي المستحق للموردين (علينا):</b> ${formatEgp(totalOwedToThem)}\n`;
    msg += `🟢 <b>إجمالي المستحق من الموردين (لنا):</b> ${formatEgp(totalOwedToUs)}\n`;
    msg += `⚖️ <b>صافي ذمم الموردين:</b> <b>${formatEgp(Math.abs(netTotal))}</b> ${netTotal > 0 ? '(علينا)' : (netTotal < 0 ? '(لنا)' : '(متزن)')}`;

    return msg;
  } catch (e) {
    console.error('Error fetching suppliers summary:', e);
    return `❌ تعذر قراءة حسابات الموردين: ${e.message}`;
  }
}

// Helper: Get Staff / Technicians List from In-Memory Cache or DB (5 mins TTL)
let cachedStaffList = null;
let cachedStaffExpiry = 0;

export function invalidateStaffCache() {
  cachedStaffList = null;
  cachedStaffExpiry = 0;
}

async function getStaffList() {
  const now = Date.now();
  if (cachedStaffList && cachedStaffExpiry > now) {
    return cachedStaffList;
  }

  try {
    const { data: techRows } = await supabase.from('technicians').select('id, name, monthly_salary').order('name');
    const staffList = [...(techRows || [])];

    // Also gather technicians recorded in attendance or advances if any
    const { data: attRows } = await supabase.from('attendance').select('staff_name').not('staff_name', 'is', null).limit(100);
    if (attRows && attRows.length > 0) {
      attRows.forEach(a => {
        if (a.staff_name && !staffList.some(s => s.name === a.staff_name)) {
          staffList.push({ id: `att_${a.staff_name}`, name: a.staff_name });
        }
      });
    }

    cachedStaffList = staffList;
    cachedStaffExpiry = now + 5 * 60 * 1000;
    return staffList;
  } catch (e) {
    return cachedStaffList || [];
  }
}

// Helper: Find Technician by Name
async function findTechnicianByName(name) {
  if (!name) return null;
  const staff = await getStaffList();
  const cleanSearch = normalizeArabicName(name);
  return staff.find(t => {
    const sNorm = normalizeArabicName(t.name);
    return sNorm === cleanSearch || sNorm.includes(cleanSearch) || cleanSearch.includes(sNorm);
  }) || null;
}

// Helper: Validate technician names against registered staff in DB (Multi-Tiered Fuzzy Match)
async function validateAndMatchTechnicians(techInput) {
  if (!techInput || techInput.trim().length === 0) {
    return { isValid: false, validTechs: [], invalidTechs: [], registeredStaff: [] };
  }

  const staff = await getStaffList(); // [{ id, name, monthly_salary }]
  if (!staff || staff.length === 0) {
    return { isValid: true, validTechs: [techInput], matchedStr: techInput, registeredStaff: [] };
  }

  // Split input into individual tokens (e.g. "محمد وشعراوي" or "محمد أحمد وإبراهيم")
  const rawTokens = techInput
    .split(/[،,و+&/]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && t !== 'فني' && t !== 'الفني' && t !== 'الفنيين' && t !== 'طقم' && t !== 'التركيب');

  if (rawTokens.length === 0) {
    return { isValid: false, validTechs: [], invalidTechs: [techInput], registeredStaff: staff };
  }

  const validTechs = [];
  const invalidTechs = [];

  for (const token of rawTokens) {
    const tokenNorm = normalizeArabicName(token);
    if (!tokenNorm || tokenNorm.length < 2) continue;

    // Search staff list with multi-tiered smart Arabic matching:
    
    // Tier 1: Exact or Full normalized match (e.g. "محمود شعراوي" === "محمود شعراوي")
    let matches = staff.filter(s => normalizeArabicName(s.name) === tokenNorm);

    // Tier 2: Word-level match (e.g. "محمد" matches "محمد أحمد", "شعراوي" matches "محمود شعراوي")
    if (matches.length === 0) {
      matches = staff.filter(s => {
        const sNorm = normalizeArabicName(s.name);
        const sWords = sNorm.split(/\s+/);
        return sWords.some(w => w === tokenNorm || (tokenNorm.length >= 3 && w.startsWith(tokenNorm)));
      });
    }

    // Tier 3: Substring match (e.g. "شعراوي" inside "محمود شعراوي")
    if (matches.length === 0) {
      matches = staff.filter(s => {
        const sNorm = normalizeArabicName(s.name);
        return sNorm.includes(tokenNorm) || tokenNorm.includes(sNorm);
      });
    }

    if (matches.length > 0) {
      // Best match (registered full name e.g. "محمد أحمد" or "محمود شعراوي")
      const bestMatch = matches[0];
      if (!validTechs.includes(bestMatch.name)) {
        validTechs.push(bestMatch.name);
      }
    } else {
      invalidTechs.push(token);
    }
  }

  if (invalidTechs.length > 0) {
    return {
      isValid: false,
      validTechs: validTechs,
      invalidTechs: invalidTechs,
      matchedStr: validTechs.join(' و '),
      registeredStaff: staff
    };
  }

  return {
    isValid: true,
    validTechs: validTechs,
    matchedStr: validTechs.join(' و '),
    registeredStaff: staff
  };
}

function normalizeArabicName(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[أإآءئؤ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ذ/g, 'ز')
    .replace(/ث/g, 'س')
    .replace(/ظ/g, 'ض')
    .replace(/[\s\-_]+/g, ' ')
    .trim()
    .toLowerCase();
}

// Trader / Supplier Official Code Mapping
const TRADER_CODE_MAP = {
  1: 'محمد سعيد',
  2: 'شارب العربي - فيوتشر',
  3: 'شارب العربي - ارت كول',
  4: 'احمد عكري',
  5: 'توفيق سالم',
  6: 'تجار وموردين متنوعين',
  7: 'وليد عطية',
  8: 'نشأت',
  9: 'محمد تبع سعد',
  10: 'محمد سامي',
  11: 'مايكل عزبة النخل',
  12: 'وائل جمال',
  13: 'نعيم',
  14: 'فرج',
  15: 'عبدالعزيز عين شمس'
};

export function normalizeDiverseSupplier(rawName) {
  if (!rawName) return { baseSupplierName: '', subMerchantName: null, fullDisplayName: '', isDiverse: false };
  let str = String(rawName).trim();

  // Clean literal "بين قوسين" into actual parentheses
  str = str.replace(/(?:بين\s+قوسين|قوسين|افتح\s+قوس)\s+([^,()]+)(?:\s+اقفل\s+قوس)?/gi, '($1)').trim();

  const isDiverse = str.includes('متنوعين') || str.includes('تنوعين') || str.includes('متنوع');
  if (!isDiverse) {
    return { baseSupplierName: str, subMerchantName: null, fullDisplayName: str, isDiverse: false };
  }

  let subMerchant = null;
  const matchParen = str.match(/\(([^)]+)\)/);
  if (matchParen) {
    subMerchant = matchParen[1].replace(/^(?:التاجر|المورد|الحاج|عم|أستاذ|استاذ)\s+/gi, '').trim();
  } else {
    const cleanSub = str.replace(/^(?:تجار\s*و*\s*موردين\s*متنوعين|تجار\s*و*\s*موزعين\s*متنوعين|تجار\s*متنوعين|موردين\s*متنوعين|تجار\s*وموردين)/gi, '')
      .replace(/^(?:التاجر|المورد|الحاج|عم|أستاذ|استاذ)\s+/gi, '').trim();
    if (cleanSub && cleanSub.length >= 2) {
      subMerchant = cleanSub;
    }
  }

  const baseSupplierName = 'تجار وموردين متنوعين';
  const fullDisplayName = subMerchant ? `تجار وموردين متنوعين (${subMerchant})` : 'تجار وموردين متنوعين';

  return {
    baseSupplierName,
    subMerchantName: subMerchant,
    fullDisplayName,
    isDiverse: true
  };
}

function getTraderCode(name) {
  if (!name) return null;
  const divInfo = normalizeDiverseSupplier(name);
  if (divInfo.isDiverse) {
    return '6';
  }

  const numMatch = String(name).match(/\b(1[0-5]|[1-9])\b/);
  const norm = normalizeArabicName(name);

  // Direct number check
  if (numMatch && TRADER_CODE_MAP[numMatch[1]]) {
    return numMatch[1];
  }

  for (const [code, supName] of Object.entries(TRADER_CODE_MAP)) {
    const dbNorm = normalizeArabicName(supName);
    if (norm === dbNorm || norm.includes(dbNorm) || dbNorm.includes(norm)) {
      return code;
    }
  }
  return null;
}

function formatTraderDisplayName(name, isTrader = true) {
  if (!name) return '';
  const divInfo = normalizeDiverseSupplier(name);
  if (divInfo.isDiverse) {
    return `<b>[6] ${divInfo.fullDisplayName}</b> <i>(كارت تجار مجمع ✅)</i>`;
  }
  const code = getTraderCode(name);
  const codeBadge = code ? `[${code}] ` : '';
  const roleText = isTrader ? 'تاجر مسجل ✅' : 'مورد مسجل ✅';
  return `<b>${codeBadge}${name}</b> <i>(${roleText})</i>`;
}

function getTraderNameWithCode(name) {
  if (!name) return '';
  const divInfo = normalizeDiverseSupplier(name);
  if (divInfo.isDiverse) {
    return `[6] ${divInfo.fullDisplayName}`;
  }
  const code = getTraderCode(name);
  return code ? `[${code}] ${name}` : name;
}

// Helper: In-Memory Cached Suppliers List (5 mins TTL)
let cachedSuppliers = null;
let cachedSuppliersExpiry = 0;

export function invalidateSuppliersCache() {
  cachedSuppliers = null;
  cachedSuppliersExpiry = 0;
}

async function getAllSuppliersCached() {
  const now = Date.now();
  if (cachedSuppliers && cachedSuppliersExpiry > now) {
    return cachedSuppliers;
  }
  try {
    const { data: allSuppliers } = await supabase.from('suppliers').select('*');
    cachedSuppliers = allSuppliers || [];
    cachedSuppliersExpiry = now + 5 * 60 * 1000;
    return cachedSuppliers;
  } catch (e) {
    return cachedSuppliers || [];
  }
}

// Helper: Check if Supplier / Trader already exists in DB (Smart Fuzzy Matcher)
async function checkExistingSupplier(name) {
  if (!name) return { exists: false, supplier: null };
  const cleanName = String(name).trim();

  // Diverse supplier (تجار وموردين متنوعين) - always map to master card [6]
  const divInfo = normalizeDiverseSupplier(cleanName);
  if (divInfo.isDiverse) {
    const allSuppliers = await getAllSuppliersCached();
    const diverseSup = allSuppliers.find(s => s.name && (s.name.includes('متنوعين') || s.name.includes('تنوعين')));
    if (diverseSup) {
      return {
        exists: true,
        supplier: diverseSup,
        code: '6',
        subMerchant: divInfo.subMerchantName,
        displayName: divInfo.fullDisplayName
      };
    }
  }

  // 0. Check if input is a trader code number (e.g. "5" or "تاجر 5" or "11")
  const codeMatch = cleanName.match(/\b(1[0-5]|[1-9])\b/);
  if (codeMatch && TRADER_CODE_MAP[codeMatch[1]]) {
    const mappedName = TRADER_CODE_MAP[codeMatch[1]];
    const allSuppliers = await getAllSuppliersCached();
    const mappedSup = allSuppliers.find(s => s.name && s.name.includes(mappedName));
    if (mappedSup) return { exists: true, supplier: mappedSup, code: codeMatch[1] };
  }

  const searchNorm = normalizeArabicName(cleanName);
  const allSuppliers = await getAllSuppliersCached();

  if (allSuppliers && allSuppliers.length > 0) {
    // 1. Exact or normalized match
    let match = allSuppliers.find(s => normalizeArabicName(s.name) === searchNorm);
    if (match) return { exists: true, supplier: match, code: getTraderCode(match.name) };

    // 2. Token & Prefix match (e.g. "مايكل عذبة النخل" matches "مايكل عزبة النخل")
    const searchTokens = searchNorm.split(' ').filter(t => t.length >= 3 && !['الحاج', 'التاجر', 'المورد', 'الشركة', 'مؤسسة'].includes(t));
    for (const sup of allSuppliers) {
      const dbNorm = normalizeArabicName(sup.name);
      const dbTokens = dbNorm.split(' ').filter(t => t.length >= 3 && !['الحاج', 'التاجر', 'المورد', 'الشركة', 'مؤسسة'].includes(t));

      const hasMatch = searchTokens.some(st =>
        dbTokens.some(dt =>
          dt === st ||
          dt.startsWith(st) ||
          st.startsWith(dt) ||
          (st.length >= 4 && dt.length >= 4 && st.substring(0, 4) === dt.substring(0, 4))
        )
      );

      if (hasMatch) {
        return { exists: true, supplier: sup, code: getTraderCode(sup.name) };
      }
    }
  }

  // 3. Database ILIKE fallback
  const { data: existing } = await supabase
    .from('suppliers')
    .select('*')
    .ilike('name', `%${cleanName}%`)
    .limit(1)
    .maybeSingle();

  if (existing) return { exists: true, supplier: existing, code: getTraderCode(existing.name) };

  return { exists: false, supplier: null };
}

// Helper: Find or Create Supplier / Trader by Name (Smart Fuzzy Matcher)
async function findOrCreateSupplier(name) {
  if (!name) return null;
  const divInfo = normalizeDiverseSupplier(name);
  if (divInfo.isDiverse) {
    const allSuppliers = await getAllSuppliersCached();
    const diverseSup = allSuppliers.find(s => s.name && (s.name.includes('متنوعين') || s.name.includes('تنوعين')));
    if (diverseSup) return diverseSup;
  }
  const check = await checkExistingSupplier(name);
  if (check.exists && check.supplier) return check.supplier;

  // Create new supplier only if no match at all
  const { data: newSup } = await supabase
    .from('suppliers')
    .insert({ name: name.trim() })
    .select()
    .single();

  invalidateSuppliersCache();
  return newSup;
}

// Short key registry for Telegram callback_data (< 64 bytes) with Supabase persistence
const TX_KEY_REGISTRY = new Map();

function registerTxAction(actionKey) {
  if (!actionKey) return '';
  const keyStr = String(actionKey);
  if (keyStr.length <= 40) return keyStr;
  const shortId = `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  TX_KEY_REGISTRY.set(shortId, keyStr);
  setTimeout(() => TX_KEY_REGISTRY.delete(shortId), 24 * 60 * 60 * 1000);

  // Asynchronously persist to bot_sessions (chat_id: 888888) so restarts never wipe keys
  supabase.from('bot_sessions').select('data').eq('chat_id', 888888).maybeSingle().then(({ data }) => {
    const existing = data?.data || {};
    existing[shortId] = keyStr;
    supabase.from('bot_sessions').upsert({ chat_id: 888888, state: 'tx_registry', data: existing, updated_at: new Date().toISOString() }).catch(() => {});
  }).catch(() => {});

  return shortId;
}

async function resolveTxAction(shortKey) {
  if (!shortKey) return '';
  if (TX_KEY_REGISTRY.has(shortKey)) {
    return TX_KEY_REGISTRY.get(shortKey);
  }

  // Fallback to Supabase persistent registry
  if (shortKey.startsWith('k_')) {
    try {
      const { data } = await supabase.from('bot_sessions').select('data').eq('chat_id', 888888).maybeSingle();
      if (data?.data?.[shortKey]) {
        TX_KEY_REGISTRY.set(shortKey, data.data[shortKey]);
        return data.data[shortKey];
      }
    } catch (e) {}
  }

  return shortKey;
}

// Helper: Build Concise Action Keyboard (Clean, Document Upload, Payment Method & Undo)
function buildTransactionKeyboard(actionKey) {
  if (!actionKey) return undefined;
  const rawKey = String(actionKey);
  const safeKey = registerTxAction(rawKey);
  const rows = [];

  // 1. Optional document attachment button (إذن / استلام / عقد / محضر تركيب / فاتورة)
  rows.push([{ text: '📸 رفع صورة (إذن / استلام / عقد / فاتورة)', callback_data: `att_${safeKey}` }]);

  // 2. If there is a cash_flow ID present in the actionKey, offer "change payment method"
  let cfId = null;
  if (rawKey.startsWith('cf_')) cfId = rawKey.replace('cf_', '');
  else if (rawKey.startsWith('suppay_')) cfId = rawKey.split('_')[1];
  else if (rawKey.startsWith('trdcol_')) cfId = rawKey.split('_')[1];
  else if (rawKey.startsWith('custcol_')) cfId = rawKey.split('_')[1];
  else if (rawKey.startsWith('advance_') || rawKey.startsWith('workorder_')) cfId = rawKey.split('_')[1];
  else if (rawKey.startsWith('intake_') || rawKey.startsWith('dispcust_') || rawKey.startsWith('disptrd_')) {
    const parts = rawKey.split('_');
    if (parts[2] && parts[2] !== '0') cfId = parts[2];
  }

  if (cfId && cfId !== '0') {
    const safeCfId = registerTxAction(cfId);
    rows.push([{ text: '💳 تغيير وسيلة الدفع', callback_data: `chg_${safeCfId}` }]);
  }
  rows.push([{ text: '🗑️ تراجع / حذف العملية', callback_data: `undo_${safeKey}` }]);
  return { inline_keyboard: rows };
}

// Helper: Process and Save Staff Attendance to DB
async function processAndSaveAttendance(ctx, attData) {
  const { status, matchedTechs, arrivalTime } = attData;
  const now = new Date();
  const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const timeDisplay = arrivalTime ? arrivalTime.slice(0, 5) : now.toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });

  const successNames = [];
  for (const tech of matchedTechs) {
    const payload = {
      technician_id: tech.id,
      date: todayDate,
      status: status,
      arrival_time: status === 'غائب' ? null : (arrivalTime || now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour12: false }))
    };

    const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'technician_id,date' });
    if (!error) {
      const cleanName = tech.name.split('|')[0].trim();
      successNames.push(cleanName);
    }
  }

  const statusIcon = status === 'حاضر' ? 'حاضر ✅' : (status === 'غائب' ? 'غائب ❌' : 'تأخير ⚠️');
  const dateStr = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });

  let replyMsg = `📋 <b>تم تسجيل حضور وانصراف الموظف بنجاح! 🎯</b>\n\n`;
  replyMsg += `👤 <b>الموظف:</b> ${successNames.join(' ، ')}\n`;
  replyMsg += `📌 <b>الحالة:</b> ${statusIcon}\n`;
  if (status !== 'غائب') {
    replyMsg += `🕒 <b>وقت الحضور:</b> <b>${timeDisplay}</b> (بالدقيقة)\n`;
  }
  replyMsg += `📅 <b>التاريخ:</b> ${dateStr}\n`;

  const firstTechId = matchedTechs[0]?.id;
  const keyboard = {
    inline_keyboard: [
      [
        { text: '❌ تحويل لـ غائب', callback_data: `st_abs_${firstTechId}` },
        { text: '⚠️ تحويل لـ تأخير', callback_data: `st_lat_${firstTechId}` }
      ],
      [
        { text: '⚪ إلغاء التسجيل', callback_data: `st_clr_${firstTechId}` },
        { text: '👥 كشف حضور اليوم', callback_data: 'today_attendance' }
      ]
    ]
  };

  return ctx.reply(replyMsg, { parse_mode: 'HTML', reply_markup: keyboard });
}

// Helper: Get Today's Full Attendance Summary Board
async function getTodayAttendanceSummary() {
  try {
    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    
    const [techsRes, attRes] = await Promise.all([
      supabase.from('technicians').select('id, name').order('name'),
      supabase.from('attendance').select('*').eq('date', todayDate)
    ]);

    const techs = techsRes.data || [];
    const att = attRes.data || [];

    if (techs.length === 0) return 'لا يوجد موظفين مسجلين.';

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let unrecordedCount = 0;

    let msg = `👥 <b>كشف حضور وانصراف الموظفين اليوم (${todayDate}):</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n\n`;

    techs.forEach((t, idx) => {
      const cleanName = t.name.split('|')[0].trim();
      const role = t.name.includes('|') ? t.name.split('|')[1].trim() : '';
      const record = att.find(a => a.technician_id === t.id);

      if (!record || !record.status) {
        unrecordedCount++;
        msg += `${idx + 1}. ⚪ <b>${cleanName}</b> ${role ? `(${role})` : ''}\n   └ الحالة: <i>لم يتم التسجيل بعد</i>\n\n`;
      } else if (record.status === 'حاضر') {
        presentCount++;
        const time = record.arrival_time ? record.arrival_time.slice(0, 5) : '--:--';
        msg += `${idx + 1}. 🟢 <b>${cleanName}</b> ${role ? `(${role})` : ''}\n   └ حاضر ✅ - الساعة: <b>${time}</b>\n\n`;
      } else if (record.status === 'غائب') {
        absentCount++;
        msg += `${idx + 1}. 🔴 <b>${cleanName}</b> ${role ? `(${role})` : ''}\n   └ غائب ❌\n\n`;
      } else if (record.status === 'تأخير') {
        lateCount++;
        const time = record.arrival_time ? record.arrival_time.slice(0, 5) : '--:--';
        msg += `${idx + 1}. 🟡 <b>${cleanName}</b> ${role ? `(${role})` : ''}\n   └ متأخر ⚠️ - الساعة: <b>${time}</b>\n\n`;
      }
    });

    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🟢 <b>حاضر:</b> ${presentCount} | 🔴 <b>غائب:</b> ${absentCount} | 🟡 <b>تأخير:</b> ${lateCount} | ⚪ <b>لم يسجل:</b> ${unrecordedCount}`;
    return msg;
  } catch (e) {
    return `❌ تعذر قراءة كشف الحضور: ${e.message}`;
  }
}

// Helper: Get Available Warehouse Devices Summary
async function getWarehouseInventorySummary(filterBrand = '', filterCap = '') {
  try {
    let { data: devs, error } = await supabase
      .from('devices')
      .select('brand, capacity, serial_number, cost_price, status, installment_notes')
      .eq('status', 'متاح')
      .order('brand');

    if (error) throw error;
    if (!devs || devs.length === 0) {
      return '📦 <b>المخزن فارغ حالياً:</b> لا توجد أجهزة متوفرة في المخزن (جميع الأجهزة تم صرفها وتركيبها).';
    }

    let filtered = devs;
    if (filterBrand) {
      filtered = filtered.filter(d => (d.brand || '').toLowerCase().includes(filterBrand.toLowerCase()));
    }
    if (filterCap) {
      const cleanCap = filterCap.replace(/[\s-]/g, '').toLowerCase();
      filtered = filtered.filter(d => (d.capacity || '').replace(/[\s-]/g, '').toLowerCase().includes(cleanCap));
    }

    if (filtered.length === 0) {
      return `📦 <b>المخزن:</b> لا توجد أجهزة متوفرة حالياً تطابق <i>${filterBrand} ${filterCap}</i>.`;
    }

    const groups = {};
    let totalCost = 0;

    filtered.forEach(d => {
      const key = `${(d.brand || 'تكييف').trim()} ${(d.capacity || '').replace(/-/g, ' ').trim()}`;
      if (!groups[key]) groups[key] = { count: 0, serials: [], cost: 0 };
      groups[key].count++;
      groups[key].cost += Number(d.cost_price || 0);
      totalCost += Number(d.cost_price || 0);
      if (d.serial_number) {
        const outMatch = (d.installment_notes || '').match(/\[سيريال كباس:\s*([^\]]+)\]/);
        const outdoor = d.outdoor_serial || (outMatch ? outMatch[1] : null);
        const sStr = outdoor ? `فانة: ${d.serial_number} / كباس: ${outdoor}` : d.serial_number;
        groups[key].serials.push(sStr);
      }
    });

    let msg = `📦 <b>كشف بضاعة وأجهزة المخزن المتوفرة (${filtered.length} جهاز):</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n\n`;

    let idx = 1;
    for (const [model, info] of Object.entries(groups)) {
      msg += `${idx}. ❄️ <b>${model}:</b>\n`;
      msg += `   └ 🔢 العدد: <b>${info.count} ${info.count === 1 ? 'جهاز' : (info.count === 2 ? 'جهازين' : 'أجهزة')}</b>\n`;
      if (info.serials.length > 0) {
        msg += `   └ 🏷️ السيريالات:\n     <code>${info.serials.slice(0, 10).join('\n     ')}</code>\n`;
        if (info.serials.length > 10) msg += `     <i>+ ${info.serials.length - 10} أجهزة أخرى...</i>\n`;
      }
      msg += `\n`;
      idx++;
    }

    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `📦 <b>إجمالي الأجهزة:</b> <b>${filtered.length} جهاز</b>\n`;
    if (totalCost > 0) {
      msg += `💰 <b>إجمالي القيمة التقديرية للبضاعة:</b> ${formatEgp(totalCost)}`;
    }

    return msg;
  } catch (e) {
    console.error('Error fetching inventory summary:', e);
    return `❌ تعذر قراءة بضاعة المخزن: ${e.message}`;
  }
}

// Helper: Calculate Levenshtein Distance for Smart Fuzzy Serial Matching
function getLevenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const s1 = String(a).toLowerCase();
  const s2 = String(b).toLowerCase();
  const matrix = [];
  for (let i = 0; i <= s2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s1.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[s2.length][s1.length];
}

// Helper: Find Device in Warehouse by Indoor or Outdoor Serial with Exact & Smart Fuzzy Matching
async function findDeviceInWarehouse(serial, allowFuzzy = false) {
  if (!serial) return { found: false };
  const cleanSerial = String(serial).trim();

  // 1. Try indoor serial first
  let { data: dev } = await supabase
    .from('devices')
    .select('*, suppliers(name)')
    .eq('serial_number', cleanSerial)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let matchType = dev ? 'indoor' : null;

  // 2. Try outdoor serial
  if (!dev) {
    const { data: devOut } = await supabase
      .from('devices')
      .select('*, suppliers(name)')
      .eq('outdoor_serial', cleanSerial)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (devOut) {
      dev = devOut;
      matchType = 'outdoor';
    }
  }

  // 3. Try inside installment_notes (outdoor serial tag)
  if (!dev) {
    const { data: devNotes } = await supabase
      .from('devices')
      .select('*, suppliers(name)')
      .or(`installment_notes.ilike.%[سيريال كباس: ${cleanSerial}]%,installment_notes.ilike.%[الوحدة الخارجية: ${cleanSerial}]%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (devNotes) {
      dev = devNotes;
      matchType = 'outdoor';
    }
  }

  if (dev) {
    return {
      found: true,
      exact: true,
      matchType: matchType || (dev.serial_number === cleanSerial ? 'indoor' : 'outdoor'),
      device: dev,
      isAvailable: dev.status === 'متاح'
    };
  }

  // 4. Smart Fuzzy Matching against Warehouse Devices (Only if explicitly allowed for sales/dispatch to catch voice transcription digit-stutter)
  if (allowFuzzy && cleanSerial.length >= 6) {
    try {
      const { data: allDevs } = await supabase
        .from('devices')
        .select('*, suppliers(name)')
        .eq('status', 'متاح')
        .order('created_at', { ascending: false })
        .limit(100);

      if (allDevs && allDevs.length > 0) {
        const cleanLower = cleanSerial.toLowerCase();
        let bestDev = null;
        let bestMatchType = 'indoor';
        let minDistance = 999;

        for (const candidateDev of allDevs) {
          const serialsToCheck = [];
          if (candidateDev.serial_number) {
            serialsToCheck.push({ s: String(candidateDev.serial_number).trim().toLowerCase(), type: 'indoor' });
          }
          if (candidateDev.outdoor_serial) {
            serialsToCheck.push({ s: String(candidateDev.outdoor_serial).trim().toLowerCase(), type: 'outdoor' });
          }
          
          const noteMatch = (candidateDev.installment_notes || '').match(/\[سيريال كباس:\s*([^\]]+)\]/);
          if (noteMatch && noteMatch[1]) {
            serialsToCheck.push({ s: noteMatch[1].trim().toLowerCase(), type: 'outdoor' });
          }

          for (const item of serialsToCheck) {
            // Only allow fuzzy match when lengths differ by exactly 1 (e.g. repeated/stuttered digit like 08261128444 vs 0826112844)
            // NEVER match same-length serials where digits are substituted (e.g. 0826112854 vs 0826112844 are completely different units!)
            if (Math.abs(cleanLower.length - item.s.length) === 1) {
              const dist = getLevenshteinDistance(cleanLower, item.s);
              if (dist === 1 && dist < minDistance) {
                minDistance = dist;
                bestDev = candidateDev;
                bestMatchType = item.type;
              }
            }
          }
        }

        if (bestDev && minDistance === 1) {
          return {
            found: true,
            exact: false,
            fuzzyDistance: minDistance,
            matchType: bestMatchType,
            device: bestDev,
            isAvailable: bestDev.status === 'متاح'
          };
        }
      }
    } catch (fuzzyErr) {
      console.warn('findDeviceInWarehouse fuzzy lookup error:', fuzzyErr.message);
    }
  }

  return { found: false };
}

// Helper: Thorough Multi-Serial Duplicate Checker for Intake (Single & Batch)
async function checkIntakeSerialDuplicates(itemsToCheck, isBatch = false) {
  const duplicates = [];
  const seenInRequest = new Map(); // cleanSerial -> { role, deviceIndex }

  for (const item of itemsToCheck) {
    const devIdx = item.index || 1;

    // 1. Check Indoor Serial
    if (item.indoor) {
      const cleanIn = String(item.indoor).trim();
      if (cleanIn.length >= 3) {
        if (seenInRequest.has(cleanIn)) {
          const prev = seenInRequest.get(cleanIn);
          duplicates.push({
            serial: cleanIn,
            inputRole: 'فانة',
            deviceIndex: devIdx,
            isInternalDuplicate: true,
            internalReason: `مكرر داخل نفس الإذن (تم إدخاله كـ ${prev.role} في الجهاز رقم ${prev.deviceIndex})`
          });
        } else {
          seenInRequest.set(cleanIn, { role: 'فانة', deviceIndex: devIdx });
        }

        const existing = await findDeviceInWarehouse(cleanIn, false);
        if (existing.found && existing.exact) {
          duplicates.push({
            serial: cleanIn,
            inputRole: 'فانة',
            deviceIndex: devIdx,
            isInternalDuplicate: false,
            matchType: existing.matchType || 'indoor',
            device: existing.device,
            isAvailable: existing.isAvailable
          });
        }
      }
    }

    // 2. Check Outdoor Serial
    if (item.outdoor) {
      const cleanOut = String(item.outdoor).trim();
      if (cleanOut.length >= 3) {
        if (seenInRequest.has(cleanOut)) {
          const prev = seenInRequest.get(cleanOut);
          duplicates.push({
            serial: cleanOut,
            inputRole: 'كباس',
            deviceIndex: devIdx,
            isInternalDuplicate: true,
            internalReason: `مكرر داخل نفس الإذن (تم إدخاله كـ ${prev.role} في الجهاز رقم ${prev.deviceIndex})`
          });
        } else {
          seenInRequest.set(cleanOut, { role: 'كباس', deviceIndex: devIdx });
        }

        const existingOut = await findDeviceInWarehouse(cleanOut, false);
        if (existingOut.found && existingOut.exact) {
          duplicates.push({
            serial: cleanOut,
            inputRole: 'كباس',
            deviceIndex: devIdx,
            isInternalDuplicate: false,
            matchType: existingOut.matchType || 'outdoor',
            device: existingOut.device,
            isAvailable: existingOut.isAvailable
          });
        }
      }
    }
  }

  return duplicates;
}

// Helper: Format All Duplicate Serials into One Comprehensive Alert Message
function formatDuplicateSerialsAlert(duplicates, isBatch = false) {
  if (!duplicates || duplicates.length === 0) return null;

  const digitsIcons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let msg = `⚠️ <b>تنبيه: تم العثور على سيريالات مسجلة بالفعل في المخزن!</b>\n`;
  msg += `<i>لا يمكن تسجيل إذن الاستلام لوجود (${duplicates.length}) سيريالات مكررة:</i>\n\n`;

  duplicates.forEach((d, idx) => {
    const icon = digitsIcons[idx] || `[${idx + 1}]`;
    const devLabel = isBatch ? ` (الجهاز رقم ${d.deviceIndex})` : '';
    const inputRoleLabel = d.inputRole === 'فانة' ? '🧊 سيريال الفانة المدخل' : '🔥 سيريال الكباس المدخل';

    msg += `${icon} <b>${inputRoleLabel}${devLabel}:</b> <code>${d.serial}</code>\n`;

    if (d.isInternalDuplicate) {
      msg += `   ⚠️ <b>السبب:</b> ${d.internalReason}\n\n`;
    } else {
      const regRoleText = d.matchType === 'indoor' ? 'فانة (وحدة داخلية)' : 'كباس (وحدة خارجية)';
      const devBrand = d.device?.brand || 'تكييف';
      const devCap = d.device?.capacity ? ` ${d.device.capacity}` : '';
      const devDesc = `${devBrand}${devCap}`.trim();
      const statusText = d.device?.status === 'متاح'
        ? '🟢 متاح حالياً بالمخزن'
        : `🔴 ${d.device?.status || 'غير متاح'}${d.device?.customer_name ? ` (مصروف لـ: ${d.device.customer_name})` : ''}`;
      const supText = d.device?.suppliers?.name ? ` | المورد السابق: ${d.device.suppliers.name}` : '';

      msg += `   📍 <b>مسجل في المخزن كـ:</b> ${regRoleText}\n`;
      msg += `   🏷️ <b>تابع لجهاز:</b> ${devDesc}\n`;
      msg += `   📊 <b>الحالة في النظام:</b> ${statusText}${supText}\n\n`;
    }
  });

  msg += `💡 <i>يرجى مراجعة وتصحيح هذه السيريالات لتفادي التكرار في المخزن، ثم إعادة إرسال العملية.</i>`;
  return msg;
}

// Helper: Check compatibility between Fan device and Compressor device
function checkSerialCompatibility(fanDev, compDev) {
  if (!fanDev || !compDev) return { isCompatible: true };
  if (fanDev.id && compDev.id && fanDev.id === compDev.id) return { isCompatible: true };

  const fanBrandRaw = (fanDev.brand || '').trim();
  const compBrandRaw = (compDev.brand || '').trim();
  const fanCapRaw = (fanDev.capacity || '').trim();
  const compCapRaw = (compDev.capacity || '').trim();

  const fanDesc = `${fanBrandRaw} ${fanCapRaw}`.trim();
  const compDesc = `${compBrandRaw} ${compCapRaw}`.trim();

  // 1. Capacity check
  const fanCapNorm = fanCapRaw.replace(/[^0-9.]/g, '');
  const compCapNorm = compCapRaw.replace(/[^0-9.]/g, '');
  if (fanCapNorm && compCapNorm && fanCapNorm !== compCapNorm) {
    return {
      isCompatible: false,
      reason: `اختلاف القدرة (${fanCapRaw} للفانة مقابل ${compCapRaw} للكباس)`,
      fanDesc,
      compDesc
    };
  }

  // 2. Main Brand check
  const getBaseBrand = (str) => {
    const s = str.toLowerCase().replace(/[أإآ]/g, 'ا');
    const brands = ['كاريير', 'ميديا', 'شارب', 'فريش', 'ال جي', 'جري', 'تورنيدو', 'هاير', 'سامسونج', 'يونيون اير'];
    for (const b of brands) {
      if (s.includes(b)) return b;
    }
    return s.split(' ')[0] || '';
  };

  const fanBase = getBaseBrand(fanBrandRaw);
  const compBase = getBaseBrand(compBrandRaw);
  if (fanBase && compBase && fanBase !== compBase) {
    return {
      isCompatible: false,
      reason: `اختلاف الماركة (${fanBrandRaw} للفانة مقابل ${compBrandRaw} للكباس)`,
      fanDesc,
      compDesc
    };
  }

  // 3. Cool/Heat check
  const normFan = fanBrandRaw.toLowerCase().replace(/[أإآ]/g, 'ا');
  const normComp = compBrandRaw.toLowerCase().replace(/[أإآ]/g, 'ا');

  const fanIsHeat = normFan.includes('ساخن');
  const compIsHeat = normComp.includes('ساخن');
  if (fanIsHeat !== compIsHeat) {
    return {
      isCompatible: false,
      reason: `اختلاف نظام التشغيل (${fanIsHeat ? 'الفانة بارد ساخن' : 'الفانة بارد فقط'} بينما ${compIsHeat ? 'الكباس بارد ساخن' : 'الكباس بارد فقط'})`,
      fanDesc,
      compDesc
    };
  }

  // 4. Inverter check
  const fanIsInverter = normFan.includes('انفرتر');
  const compIsInverter = normComp.includes('انفرتر');
  if (fanIsInverter !== compIsInverter) {
    return {
      isCompatible: false,
      reason: `اختلاف تقنية المحرك (${fanIsInverter ? 'الفانة انفرتر' : 'الفانة عادي'} بينما ${compIsInverter ? 'الكباس انفرتر' : 'الكباس عادي'})`,
      fanDesc,
      compDesc
    };
  }

  // 5. Concealed vs Split check
  const fanIsConcealed = normFan.includes('كونسيلد') || normFan.includes('مركزي');
  const compIsConcealed = normComp.includes('كونسيلد') || normComp.includes('مركزي');
  if (fanIsConcealed !== compIsConcealed) {
    return {
      isCompatible: false,
      reason: `اختلاف نوع التكييف (${fanIsConcealed ? 'الفانة كونسيلد' : 'الفانة اسبليت'} بينما ${compIsConcealed ? 'الكباس كونسيلد' : 'الكباس اسبليت'})`,
      fanDesc,
      compDesc
    };
  }

  return { isCompatible: true, fanDesc, compDesc };
}

// Helper: Normalize Egyptian name compound words (e.g., عبد الغني -> عبدالغني)
function getNormalizedNameWords(nameStr) {
  const norm = str => String(str || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
  const rawWords = norm(nameStr).split(/\s+/).filter(Boolean);
  const words = [];
  for (let i = 0; i < rawWords.length; i++) {
    const w = rawWords[i];
    if ((w === 'عبد' || w === 'ابو' || w === 'ام' || w === 'ابن') && i + 1 < rawWords.length) {
      words.push(w + rawWords[i + 1]);
      i++;
    } else {
      words.push(w);
    }
  }
  return words;
}

// Helper: Smart Customer Identification by Phone / Name
async function findExistingCustomer(phone, name) {
  if (!phone && !name) return null;

  // 1. Match by Phone Number (Highest precision)
  if (phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '').slice(-9);
    if (cleanPhone.length >= 8) {
      const { data } = await supabase
        .from('devices')
        .select('customer_name, customer_phone, customer_address')
        .not('customer_name', 'is', null)
        .ilike('customer_phone', `%${cleanPhone}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) return { matchType: 'phone', customer: data };
    }
  }

  // 2. Match by Name (Multi-word anchor to prevent false matches across different people)
  if (name) {
    const words = getNormalizedNameWords(name);
    if (words.length >= 1) {
      const firstWord = words[0];
      const secondWord = words.length >= 2 ? words[1] : null;

      let queryPattern = `${firstWord}%`;
      if (secondWord) {
        queryPattern = `${firstWord}%${secondWord}%`;
      }

      const { data: candidates } = await supabase
        .from('devices')
        .select('customer_name, customer_phone, customer_address')
        .not('customer_name', 'is', null)
        .ilike('customer_name', queryPattern)
        .order('created_at', { ascending: false })
        .limit(10);

      if (candidates && candidates.length > 0) {
        const match = candidates.find(c => {
          const cWords = getNormalizedNameWords(c.customer_name || '');
          if (cWords.length === 0) return false;
          if (words.length === 1) {
            return words[0] === cWords[0];
          } else {
            // Compare first TWO words to avoid matching "صلاح عبدالغني" with "صلاح عبدالهادي"
            return words[0] === cWords[0] && cWords.length >= 2 && words[1] === cWords[1];
          }
        });

        if (match) return { matchType: 'name', customer: match };
      }
    }
  }

  return null;
}

// Helper: Normalize & Pair Batch Items from Voice / Text Input
function normalizeBatchItems(workingData) {
  if (workingData.capacity) workingData.capacity = normalizeCapacity(workingData.capacity);
  if (workingData.brand) workingData.brand = normalizeAcBrand(cleanTextString(workingData.brand));

  let items = Array.isArray(workingData.items) ? [...workingData.items] : [];

  function parseSerialList(val) {
    if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
    if (!val) return [];
    const str = String(val).trim();
    if (str.includes(',') || str.includes(';') || str.includes('\n') || /\s+/.test(str)) {
      return str.split(/[,;\n\s]+/).map(s => s.trim()).filter(s => s.length >= 3);
    }
    return [str];
  }

  const inSerials = Array.isArray(workingData.indoor_serials) && workingData.indoor_serials.length > 0
    ? workingData.indoor_serials.map(s => String(s).trim()).filter(Boolean)
    : parseSerialList(workingData.indoor_serial);

  const outSerials = Array.isArray(workingData.outdoor_serials) && workingData.outdoor_serials.length > 0
    ? workingData.outdoor_serials.map(s => String(s).trim()).filter(Boolean)
    : parseSerialList(workingData.outdoor_serial);

  const rawCount = Number(workingData.total_devices || workingData.quantity || workingData.device_count || workingData.count || 0);
  const maxLen = Math.max(inSerials.length, outSerials.length, items.length, rawCount);

  if (maxLen > 1 || workingData.is_batch) {
    const finalCount = Math.max(maxLen, 2);
    const perDevCost = workingData.cost_price ? Math.round(Number(workingData.cost_price) / finalCount) : null;
    const perDevSale = workingData.sale_price ? Math.round(Number(workingData.sale_price) / finalCount) : null;

    if (items.length === 0) {
      for (let i = 0; i < finalCount; i++) {
        items.push({
          brand: workingData.brand,
          capacity: workingData.capacity,
          indoor_serial: inSerials[i] || null,
          outdoor_serial: outSerials[i] || null,
          cost_price: perDevCost,
          sale_price: perDevSale
        });
      }
    } else {
      for (let i = 0; i < finalCount; i++) {
        if (!items[i]) {
          items.push({
            brand: workingData.brand,
            capacity: workingData.capacity,
            indoor_serial: inSerials[i] || null,
            outdoor_serial: outSerials[i] || null,
            cost_price: perDevCost,
            sale_price: perDevSale
          });
        } else {
          if (!items[i].indoor_serial && inSerials[i]) items[i].indoor_serial = inSerials[i];
          if (!items[i].outdoor_serial && outSerials[i]) items[i].outdoor_serial = outSerials[i];
          if (!items[i].cost_price && perDevCost) items[i].cost_price = perDevCost;
          if (!items[i].sale_price && perDevSale) items[i].sale_price = perDevSale;
        }
      }
    }
  }

  if (items.length > 0) {
    items.forEach(it => {
      if (!it.brand && workingData.brand) it.brand = workingData.brand;
      it.capacity = normalizeCapacity(it.capacity || workingData.capacity);
      if (it.brand) it.brand = normalizeAcBrand(cleanTextString(it.brand));
    });
  }

  return items;
}

// Helper: Find Previous Work Orders / Maintenance for a Customer
async function findPreviousCustomerWorkOrders(phone, name) {
  if (!phone && !name) return { hasPrevious: false };

  try {
    const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '').slice(-9) : null;
    const nameWords = name ? String(name).trim().split(/\s+/) : [];
    const queryName = nameWords.length >= 2 ? `${nameWords[0]}%${nameWords[1]}` : (nameWords[0] || null);

    // 1. Check in cash_flow for past work orders
    const { data: rows } = await supabase
      .from('cash_flow')
      .select('*')
      .ilike('description', '%أمر شغل%')
      .order('created_at', { ascending: false })
      .limit(25);

    if (rows && rows.length > 0) {
      for (const row of rows) {
        const desc = row.description || '';
        const matchesPhone = cleanPhone && desc.includes(cleanPhone);
        const matchesName = queryName && (
          (nameWords[0] && desc.includes(nameWords[0]) && nameWords[1] && desc.includes(nameWords[1])) ||
          (name && desc.includes(name))
        );

        if (matchesPhone || matchesName) {
          const createdDate = new Date(row.created_at || row.date);
          const daysAgo = Math.max(0, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));
          const dateStr = createdDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });

          // Extract previous details
          let prevDetails = 'صيانة سابقة';
          const matchDetails = desc.match(/أمر شغل \([^)]+\):\s*([^|]+)/);
          if (matchDetails) prevDetails = matchDetails[1].trim();

          // Extract previous technicians
          let prevTechs = 'غير محدد';
          const matchTechs = desc.match(/(?:الفنيين|الفني):\s*([^|\]]+)/);
          if (matchTechs) prevTechs = matchTechs[1].trim();

          return {
            hasPrevious: true,
            previousOrder: {
              id: row.id,
              dateStr: dateStr,
              daysAgo: daysAgo,
              details: prevDetails,
              technicians: prevTechs,
              amount: Number(row.amount || 0),
              amountStr: formatEgp(row.amount || 0)
            }
          };
        }
      }
    }

    // 2. Also check in devices if customer had a past device installed (for technician background)
    if (cleanPhone || queryName) {
      let devQuery = supabase
        .from('devices')
        .select('*, technicians(name)')
        .not('customer_name', 'is', null)
        .order('installed_at', { ascending: false })
        .limit(5);

      if (cleanPhone && cleanPhone.length >= 8) {
        devQuery = devQuery.ilike('customer_phone', `%${cleanPhone}%`);
      } else if (queryName) {
        devQuery = devQuery.ilike('customer_name', `%${queryName}%`);
      }

      const { data: devs } = await devQuery;
      if (devs && devs.length > 0 && devs[0].status === 'تم التركيب') {
        const d = devs[0];
        const installDate = new Date(d.installed_at || d.created_at);
        const daysAgo = Math.max(0, Math.floor((Date.now() - installDate.getTime()) / (1000 * 60 * 60 * 24)));
        const dateStr = installDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
        const techName = d.technicians?.name || 'فني سابق';

        return {
          hasPrevious: true,
          previousOrder: {
            id: d.id,
            dateStr: dateStr,
            daysAgo: daysAgo,
            details: `تركيب جهاز سابق (${d.brand || 'تكييف'} ${d.capacity || ''})`,
            technicians: techName,
            amount: Number(d.sale_price || 0),
            amountStr: formatEgp(d.sale_price || 0),
            isDeviceInstallation: true
          }
        };
      }
    }
  } catch (err) {
    console.error('Error finding previous work orders:', err);
  }

  return { hasPrevious: false };
}

// Helper: Cached Sandbox Tag (2 mins TTL)
let cachedSandboxTag = '';
let cachedSandboxExpiry = 0;

export function invalidateSandboxCache() {
  cachedSandboxExpiry = 0;
}

async function getSandboxTag() {
  const now = Date.now();
  if (cachedSandboxExpiry > now) {
    return cachedSandboxTag;
  }
  try {
    const { data: row } = await supabase.from('bot_sessions').select('data').eq('chat_id', 999999).maybeSingle();
    if (row?.data?.sandbox_active === true) {
      cachedSandboxTag = `\n\n🧪 <b>[وضع التجربة والاختبار مفعل 🟢 - البيانات الحقيقية محفوظة]</b>`;
    } else {
      cachedSandboxTag = '';
    }
    cachedSandboxExpiry = now + 2 * 60 * 1000;
    return cachedSandboxTag;
  } catch (e) {
    return '';
  }
}

// 🎯 UNIVERSAL ERP VALIDATOR & CONFIRMATION CARDS DISPATCHER
async function handleParsedERPAction(ctx, erpResult, fromId) {
  const { intent, data = {}, raw_transcription = '' } = erpResult;
  const userSession = fromId ? await getUserSession(fromId) : null;
  const sbTag = await getSandboxTag();

  // 1. Conversational Slot-Filling: Merge with previous pending session if exists
  let workingData = { ...data };
  let workingIntent = intent;

  // Normalize AC brand and specifier using speech/text context (e.g. mapping "ساخن" to "بارد ساخن")
  if (workingData.brand || raw_transcription) {
    const normB = normalizeAcBrand(workingData.brand, raw_transcription);
    if (normB) workingData.brand = normB;
  }

  // 0. Smart direct date extraction (e.g. "بتاريخ 1-9-2026", "بتاريخ 1-9", "امبارح", "15 اغسطس")
  if (raw_transcription) {
    const directDate = extractAndNormalizeDate(raw_transcription);
    if (directDate) {
      workingData.date = directDate;
    }
  }

  if (workingData.date) {
    workingData.date = normalizeDateStringToIso(workingData.date) || workingData.date;
  }

  const prevPendingData = userSession?.pending_erp_session?.data || {};
  const hasValidPendingData = Object.keys(prevPendingData).length > 0;

  if (userSession?.pending_erp_session && hasValidPendingData) {
    const sessionAge = Date.now() - (userSession.pending_erp_session.timestamp || 0);
    if (sessionAge < 15 * 60 * 1000) {
      if (raw_transcription && raw_transcription.match(/إلغاء|تراجع|مسح|cancel/i)) {
        if (fromId) await setUserSession(fromId, {});
        return ctx.reply('🗑️ <b>تم إلغاء وتصفير العملية المعلقة بنجاح.</b>', { parse_mode: 'HTML' });
      }

      // Check if user is explicitly starting a brand new full operation
      const isExplicitNewFullOperation = 
        (intent === 'device_dispatch_customer' && (data.customer_name || data.customer_phone) && (data.sale_price || data.indoor_serial)) ||
        (intent === 'device_intake' && (data.supplier_name || data.trader_name) && (data.cost_price || data.indoor_serial)) ||
        (intent === 'device_dispatch_trader' && (data.trader_name || data.supplier_name) && (data.sale_price || data.indoor_serial)) ||
        (intent === 'work_order' && data.customer_name && data.description) ||
        (intent === 'expense' || intent === 'revenue') ||
        (intent === 'query_stock' || intent === 'query_statement' || intent === 'attendance') ||
        (intent === 'supplier_payment' && data.supplier_name && (data.amount || data.amount_paid)) ||
        (intent === 'trader_collection' && (data.trader_name || data.supplier_name) && (data.amount || data.amount_paid)) ||
        (intent === 'customer_collection' && data.customer_name && (data.amount || data.amount_paid));

      if (isExplicitNewFullOperation) {
        if (fromId) await setUserSession(fromId, {});
        workingIntent = intent;
        workingData = { ...data };
      } else {
        // Active conversational slot-filling continuation
        workingIntent = userSession.pending_erp_session.intent;
        const prevData = prevPendingData;

        // Merge previous fields into workingData
        for (const [k, v] of Object.entries(prevData)) {
          if (workingData[k] == null || workingData[k] === '') {
            workingData[k] = v;
          }
        }

        const rawTextToFill = (raw_transcription || '').trim();

        // 1. Merchant / Supplier / Trader Smart Filling
        if (['device_intake', 'device_dispatch_trader', 'supplier_payment', 'trader_collection'].includes(workingIntent)) {
          if (!workingData.supplier_name && workingData.trader_name) {
            workingData.supplier_name = workingData.trader_name;
          }
          if (!workingData.trader_name && workingData.supplier_name) {
            workingData.trader_name = workingData.supplier_name;
          }

          if (!workingData.supplier_name || !workingData.trader_name) {
            // Check if user input is trader code or name
            const supCheck = await checkExistingSupplier(rawTextToFill);
            if (supCheck.exists && supCheck.supplier) {
              const resName = supCheck.displayName || supCheck.supplier.name;
              workingData.supplier_name = resName;
              workingData.trader_name = resName;
              if (supCheck.subMerchant) workingData.custom_trader_name = supCheck.subMerchant;
            } else if (rawTextToFill.length >= 2 && !rawTextToFill.match(/^(?:سيريال|فانة|كباس|بارد|ساخن|انفرتر|كونسيلد|حصان|\d{4,})/)) {
              const cleanedName = rawTextToFill.replace(/^(?:التاجر|المورد|الحاج|محل|شركة)\s+/i, '').trim();
              if (cleanedName.length >= 2) {
                const nameCheck = await checkExistingSupplier(cleanedName);
                const resolvedName = nameCheck.exists ? (nameCheck.displayName || nameCheck.supplier?.name || cleanedName) : cleanedName;
                workingData.supplier_name = resolvedName;
                workingData.trader_name = resolvedName;
                if (nameCheck.subMerchant) workingData.custom_trader_name = nameCheck.subMerchant;
              }
            }
          }

          // Normalize diverse supplier format if present
          const curSupName = workingData.supplier_name || workingData.trader_name;
          if (curSupName) {
            const divInfo = normalizeDiverseSupplier(curSupName);
            if (divInfo.isDiverse) {
              workingData.supplier_name = divInfo.fullDisplayName;
              workingData.trader_name = divInfo.fullDisplayName;
              if (divInfo.subMerchantName) workingData.custom_trader_name = divInfo.subMerchantName;
            }
          }
        }

        // 2. AC Brand and Specifier
        if (['device_intake', 'device_dispatch_customer', 'device_dispatch_trader'].includes(workingIntent)) {
          if (!workingData.brand || !hasAcSpecifier(workingData.brand)) {
            const detectedBrandSpec = extractAcBrandAndSpecifier(rawTextToFill);
            if (detectedBrandSpec) {
              if (!workingData.brand) {
                workingData.brand = detectedBrandSpec;
              } else if (!hasAcSpecifier(workingData.brand)) {
                if (detectedBrandSpec.startsWith(workingData.brand)) {
                  workingData.brand = detectedBrandSpec;
                } else {
                  workingData.brand = `${workingData.brand} ${detectedBrandSpec}`.trim();
                }
              }
            }
          }
          if (workingData.brand || rawTextToFill) {
            const normB = normalizeAcBrand(workingData.brand, rawTextToFill);
            if (normB) workingData.brand = normB;
          }

          // 3. AC Capacity
          if (!workingData.capacity) {
            const detectedCap = extractAcCapacity(rawTextToFill);
            if (detectedCap) workingData.capacity = detectedCap;
          }

          // 4. Serials (indoor / outdoor) - Multi-Device and Single-Device Smart Parsing
          const multiSerials = extractMultipleSerialsFromText(rawTextToFill);
          const hasMultipleSerials = (multiSerials.indoors && multiSerials.indoors.length > 1) || (multiSerials.outdoors && multiSerials.outdoors.length > 1);
          const isBatchMode = Boolean(workingData.is_batch || hasMultipleSerials || (Number(workingData.total_devices || 0) > 1));

          if (isBatchMode) {
            workingData.is_batch = true;
            const targetLen = Math.max(
              Number(workingData.total_devices || 0),
              multiSerials.indoors.length,
              multiSerials.outdoors.length,
              Array.isArray(workingData.items) ? workingData.items.length : 0,
              2
            );
            workingData.total_devices = targetLen;

            if (!Array.isArray(workingData.items) || workingData.items.length < targetLen) {
              const prevItems = Array.isArray(workingData.items) ? [...workingData.items] : [];
              workingData.items = [];
              for (let i = 0; i < targetLen; i++) {
                workingData.items.push(prevItems[i] || {
                  brand: workingData.brand,
                  capacity: workingData.capacity,
                  indoor_serial: null,
                  outdoor_serial: null
                });
              }
            }

            // Fill empty indoor serials sequentially
            let inIdx = 0;
            for (let i = 0; i < workingData.items.length; i++) {
              if (!workingData.items[i].indoor_serial && multiSerials.indoors[inIdx]) {
                workingData.items[i].indoor_serial = multiSerials.indoors[inIdx];
                inIdx++;
              } else if (multiSerials.indoors[i] && multiSerials.indoors.length > 1) {
                workingData.items[i].indoor_serial = multiSerials.indoors[i];
              }
            }

            // Fill empty outdoor serials sequentially
            let outIdx = 0;
            for (let i = 0; i < workingData.items.length; i++) {
              if (!workingData.items[i].outdoor_serial && multiSerials.outdoors[outIdx]) {
                workingData.items[i].outdoor_serial = multiSerials.outdoors[outIdx];
                outIdx++;
              } else if (multiSerials.outdoors[i] && multiSerials.outdoors.length > 1) {
                workingData.items[i].outdoor_serial = multiSerials.outdoors[i];
              }
            }

            workingData.indoor_serials = workingData.items.map(it => it.indoor_serial).filter(Boolean);
            workingData.outdoor_serials = workingData.items.map(it => it.outdoor_serial).filter(Boolean);
            workingData.indoor_serial = workingData.indoor_serials.join(', ');
            workingData.outdoor_serial = workingData.outdoor_serials.join(', ');
          } else {
            if (!workingData.indoor_serial && multiSerials.indoor) workingData.indoor_serial = multiSerials.indoor;
            if (!workingData.outdoor_serial && multiSerials.outdoor) workingData.outdoor_serial = multiSerials.outdoor;
          }
        }

        // 5. Prices & Amounts
        const extractedAmt = parseArabicAmount(rawTextToFill);
        if (rawTextToFill.match(/زيرو|صفر|\b0\b|آجل|اجل|باقي|مفيش|مدفعش|لم يدفع|لم ندفع|لم نسدد/i)) {
          workingData.amount_paid = 0;
          if (!workingData.payment_method || workingData.payment_method !== 'آجل') {
            workingData.payment_method = 'آجل';
          }
        } else if (extractedAmt && extractedAmt > 0) {
          if (workingIntent === 'device_intake' && (!workingData.cost_price || Number(workingData.cost_price) <= 0)) {
            workingData.cost_price = extractedAmt;
          } else if ((workingIntent === 'device_dispatch_customer' || workingIntent === 'device_dispatch_trader') && (!workingData.sale_price || Number(workingData.sale_price) <= 0)) {
            workingData.sale_price = extractedAmt;
          } else if (workingData.amount_paid == null) {
            workingData.amount_paid = extractedAmt;
          } else if (workingData.amount == null || Number(workingData.amount) <= 0) {
            workingData.amount = extractedAmt;
          }
        }

        // 6. Payment Method
        if (!workingData.payment_method || (workingData.payment_method === 'آجل' && workingData.amount_paid > 0)) {
          const pm = extractPaymentMethod(rawTextToFill);
          if (pm && rawTextToFill.match(/خزنة|كاش|انستا|إنستا|فودافون|محفظة|حساب الشركة|تحويل/i)) {
            workingData.payment_method = pm;
          }
        }

        // 7. Customer Phone & Name
        if (['device_dispatch_customer', 'work_order', 'customer_collection'].includes(workingIntent)) {
          if (!workingData.customer_phone) {
            const detectedPhone = extractEgyptianPhoneNumber(rawTextToFill);
            if (detectedPhone) workingData.customer_phone = detectedPhone;
          }
          if (!workingData.customer_name && rawTextToFill.length >= 2 && !rawTextToFill.match(/\d{4,}/) && !extractPaymentMethod(rawTextToFill)) {
            workingData.customer_name = rawTextToFill.replace(/^(?:العميل|الحاج|أستاذ|استاذ|دكتور|مهندس)\s+/i, '').trim();
          }
        }
      }
    }
  }

  // Auto calculate sum if split payments array is provided
  if (Array.isArray(workingData.payments) && workingData.payments.length > 0) {
    const sumSplits = workingData.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    if (sumSplits > 0) {
      workingData.amount_paid = sumSplits;
      if (workingData.amount == null || workingData.amount === 0) {
        workingData.amount = sumSplits;
      }
      if (!workingData.payment_method || workingData.payment_method === 'خزنة') {
        workingData.payment_method = 'طرق متعددة';
      }
    }
  }

  // 1b. Smart Disambiguation: Distinguish Paying TO (سداد لـ) vs Collecting FROM (تحصيل من)
  const rawText = (raw_transcription || workingData.description || '').toLowerCase();
  const isPaymentTo = /سداد\s+(?:دفعة\s+)?(?:نقدي\s+)?(?:لـ|للتاجر|للمورد|لحساب|ل)|دفع(?:نا)?\s+(?:لـ|للتاجر|للمورد|ل)|حول(?:نا)?\s+(?:لـ|للتاجر|للمورد|ل)|خرج\s+لـ|تسديد\s+لـ/i.test(rawText);
  const isCollectionFrom = /تحصيل\s+(?:من|دفعة)|استلم(?:نا)?\s+من|حصل(?:نا)?\s+من|دفع\s+لنا|سدد\s+لنا|اخدنا\s+(?:\d+|مبلغ|فلوس|ألف|الف|قسط)|خدنا\s+(?:\d+|مبلغ|فلوس|ألف|الف|قسط)/i.test(rawText);

  if (workingIntent === 'trader_collection' && isPaymentTo && !isCollectionFrom) {
    workingIntent = 'supplier_payment';
    workingData.supplier_name = workingData.supplier_name || workingData.trader_name;
  } else if (workingIntent === 'supplier_payment' && isCollectionFrom && !isPaymentTo) {
    workingIntent = 'trader_collection';
    workingData.trader_name = workingData.trader_name || workingData.supplier_name;
  }

  // 1c. Smart Disambiguation: Distinguish Intake/Receiving (استلام / توريد من) vs Dispatch (صرف / بيع لـ)
  const isDeviceIntake = /استلام|توريد|شراء|إذن\s+استلام|اذن\s+استلام|إذن\s+توريد|اذن\s+توريد|استلمنا|وارد\s+للمخزن|اخدنا\s+(?:النهاردة\s+)?(?:جهاز|تكييف|أجهز|عدد|\d+\s+جهاز)|خدنا\s+(?:النهاردة\s+)?(?:جهاز|تكييف|أجهز|عدد|\d+\s+جهاز)/i.test(rawText);
  const isDeviceDispatch = /صرف|إذن\s+صرف|اذن\s+صرف|بيع|خرج\s+من\s+المخزن|تسليم\s+ل/i.test(rawText);

  if ((workingIntent === 'device_dispatch_trader' || workingIntent === 'device_dispatch_customer') && isDeviceIntake && !isDeviceDispatch) {
    workingIntent = 'device_intake';
    workingData.supplier_name = workingData.supplier_name || workingData.trader_name || workingData.customer_name;
    if (workingData.sale_price && (!workingData.cost_price || workingData.cost_price === 0)) {
      workingData.cost_price = workingData.sale_price;
    }
  } else if (workingIntent === 'device_intake' && isDeviceDispatch && !isDeviceIntake) {
    workingIntent = workingData.customer_name ? 'device_dispatch_customer' : 'device_dispatch_trader';
    workingData.trader_name = workingData.trader_name || workingData.supplier_name;
    if (workingData.cost_price && (!workingData.sale_price || workingData.sale_price === 0)) {
      workingData.sale_price = workingData.cost_price;
    }
  }

  // 2. Intents Handling & Mandatory Checks
  switch (workingIntent) {
    // 🔍 Query Stock
    case 'query_stock': {
      const summary = await getWarehouseInventorySummary(workingData.brand, workingData.capacity);
      return ctx.reply(summary, { parse_mode: 'HTML' });
    }

    // 🏢 Query Statement / Suppliers
    case 'query_statement': {
      const summary = await getSuppliersSummary();
      return ctx.reply(summary, { parse_mode: 'HTML' });
    }

    // 👥 Staff Attendance Intent
    case 'attendance': {
      const staffList = await getStaffList();
      const attData = parseAttendanceMessage(raw_transcription || '', staffList);
      if (attData) {
        return processAndSaveAttendance(ctx, attData);
      }
      if (workingData.technician_name) {
        const tech = await findTechnicianByName(workingData.technician_name);
        if (tech) {
          return processAndSaveAttendance(ctx, {
            status: workingData.attendance_status || 'حاضر',
            matchedTechs: [tech],
            arrivalTime: workingData.arrival_time || null
          });
        }
      }
      return ctx.reply('⚠️ لم أتمكن من التعرف على اسم الموظف لتسجيل الحضور.');
    }

    // 🏠 Dispatch to Direct Customer (صرف لعميل مباشر)
    case 'device_dispatch_customer': {
      const batchItems = normalizeBatchItems(workingData);
      const isBatch = batchItems.length > 1;

      // Smart Customer Auto-Recognition & Pre-filling (Address & Phone)
      let matchedCustomerNote = '';
      if (workingData.customer_name || workingData.customer_phone) {
        const custMatch = await findExistingCustomer(workingData.customer_phone, workingData.customer_name);
        if (custMatch && custMatch.customer) {
          matchedCustomerNote = ` <i>(🌟 عميل مسجل: ${custMatch.customer.customer_name})</i>`;
          if (!workingData.customer_name && custMatch.customer.customer_name) {
            workingData.customer_name = custMatch.customer.customer_name;
          }
          if (!workingData.customer_phone && custMatch.customer.customer_phone) {
            workingData.customer_phone = custMatch.customer.customer_phone;
          }
          if (!workingData.customer_address && custMatch.customer.customer_address) {
            workingData.customer_address = custMatch.customer.customer_address;
          }
        }
      }

      const missing = [];
      if (!workingData.customer_name) missing.push('👤 اسم العميل');
      if (!workingData.customer_phone) missing.push('📱 رقم هاتف العميل');
      if (!workingData.customer_address) missing.push('📍 عنوان العميل ومكان التركيب');
      if (!workingData.sale_price || Number(workingData.sale_price) <= 0) missing.push('💰 إجمالي سعر البيع للعميل');

      if (isBatch) {
        const verifiedItems = [];
        let totalBatchCost = 0;
        let totalBatchSale = Number(workingData.sale_price || 0);

        for (let i = 0; i < batchItems.length; i++) {
          const it = batchItems[i];
          const inSer = it.indoor_serial;
          const outSer = it.outdoor_serial;

          if (!inSer) {
            missing.push(`🧊 سيريال الفانة للجهاز (${i + 1})`);
            continue;
          }
          if (!outSer) {
            missing.push(`🔥 سيريال الكباس للجهاز (${i + 1})`);
            continue;
          }

          const devCheck = await findDeviceInWarehouse(inSer);
          if (!devCheck.found || !devCheck.isAvailable) {
            if (devCheck.found && !devCheck.isAvailable) {
              return ctx.reply(`⛔ <b>خطأ أمان: لا يمكن إتمام الإذن المجمع!</b>\n\n📌 <b>الجهاز (${i + 1}) - سيريال الفانة:</b> <code>${inSer}</code>\n👤 <b>تم صرفه وتركيبه مسبقاً لـ:</b> ${devCheck.device.customer_name || 'عميل سابق'}\n🕒 <b>الحالة في النظام:</b> ${devCheck.device.status}`, { parse_mode: 'HTML' });
            } else {
              return ctx.reply(`❌ <b>خطأ مخزن: الجهاز (${i + 1}) غير موجود في المخزن!</b>\n\n🧊 <b>سيريال الفانة:</b> <code>${inSer}</code>\n🔥 <b>سيريال الكباس:</b> <code>${outSer}</code>\n\n⚠️ <i>يرجى التأكد من السيريالات المتاحة في المخزن عبر /inventory.</i>`, { parse_mode: 'HTML' });
            }
          }

          const outCheck = await findDeviceInWarehouse(outSer);
          if (!outCheck.found) {
            return ctx.reply(`❌ <b>خطأ مخزن: كباس الجهاز (${i + 1}) غير موجود بالمخزن!</b>\n\n🔥 <b>سيريال الكباس:</b> <code>${outSer}</code>\n🧊 <b>سيريال الفانة:</b> <code>${inSer}</code>\n\n⚠️ <i>يرجى التأكد من السيريال أو فحص المخزن عبر أمر /inventory.</i>`, { parse_mode: 'HTML' });
          } else if (!outCheck.isAvailable) {
            return ctx.reply(`⛔ <b>خطأ أمان: كباس الجهاز (${i + 1}) مصروف مسبقاً!</b>\n\n📌 <b>سيريال الكباس:</b> <code>${outSer}</code>\n👤 <b>مصروف لـ:</b> ${outCheck.device.customer_name || 'عميل سابق'}\n🕒 <b>الحالة في النظام:</b> ${outCheck.device.status}`, { parse_mode: 'HTML' });
          }

          // Compatibility check between Fan and Compressor for this unit
          const compCheck = checkSerialCompatibility(devCheck.device, outCheck.device);
          if (!compCheck.isCompatible) {
            return ctx.reply(`⚠️ <b>عذراً، كباس الجهاز (${i + 1}) غير متوافق مع الفانة!</b>\n\n🧊 <b>الفانة:</b> <code>${inSer}</code> (${compCheck.fanDesc})\n🔥 <b>الكباس:</b> <code>${outSer}</code> (${compCheck.compDesc})\n\n❌ <b>سبب عدم التوافق:</b> ${compCheck.reason}.\n\n⚠️ <i>لا يمكن صرف فانة مع كباس بمواصفات مختلفة.</i>`, { parse_mode: 'HTML' });
          }

          // Consistency check: Ensure all units in batch are the exact same model and capacity
          if (verifiedItems.length > 0) {
            const firstDev = verifiedItems[0];
            const batchMatchCheck = checkSerialCompatibility(firstDev, devCheck.device);
            if (!batchMatchCheck.isCompatible) {
              return ctx.reply(`⚠️ <b>خطأ إذن مجمع: الجهاز (${i + 1}) مختلف عن باقي الأجهزة في الإذن!</b>\n\n📌 <b>نوع أجهزة الإذن المجمع:</b> ${firstDev.brand} (${firstDev.capacity})\n❌ <b>الجهاز (${i + 1}) المدخل:</b> ${devCheck.device.brand} (${devCheck.device.capacity}) - سيريال: <code>${inSer}</code>\n\n⚠️ <i>الإذن المجمع يشترط أن تكون جميع الأجهزة متطابقة تماماً في الموديل والقدرة. يرجى تعديل السيريال أو عمل إذن صرف منفصل.</i>`, { parse_mode: 'HTML' });
            }
          }

          totalBatchCost += Number(devCheck.device.cost_price || 0);
          verifiedItems.push({
            id: devCheck.device.id,
            brand: devCheck.device.brand || it.brand || workingData.brand || 'تكييف',
            capacity: devCheck.device.capacity || it.capacity || workingData.capacity || '1.5-حصان',
            indoor_serial: devCheck.device.serial_number || inSer,
            outdoor_serial: outCheck.device.outdoor_serial || devCheck.device.outdoor_serial || outSer,
            cost_price: Number(devCheck.device.cost_price || 0),
            sale_price: it.sale_price ? Number(it.sale_price) : Math.round(totalBatchSale / batchItems.length),
            supplier_name: devCheck.device.suppliers?.name || ''
          });
        }

        if (verifiedItems.length > 0) {
          workingData.brand = verifiedItems[0].brand || workingData.brand;
          workingData.capacity = verifiedItems[0].capacity || workingData.capacity;
        }
        workingData.items = verifiedItems;
        workingData.is_batch = true;
        workingData.cost_price = totalBatchCost;
      } else {
        const indoor = workingData.indoor_serial;
        const outdoor = workingData.outdoor_serial;
        let devCheck = null;

        if (!indoor) {
          missing.push('🧊 سيريال الفانة (الوحدة الداخلية)');
        } else {
          devCheck = await findDeviceInWarehouse(indoor);
          if (!devCheck.found || !devCheck.isAvailable) {
            if (devCheck.found && !devCheck.isAvailable) {
              return ctx.reply(`⛔ <b>خطأ أمان: لا يمكن إتمام عملية الصرف!</b>\n\n📌 <b>سيريال الفانة:</b> <code>${devCheck.device.serial_number}</code>\n👤 <b>تم صرفه وتركيبه مسبقاً لـ:</b> ${devCheck.device.customer_name || 'عميل سابق'}\n🕒 <b>الحالة في النظام:</b> ${devCheck.device.status}\n\n⚠️ <i>لا يمكن تكرار صرف نفس السيريال مرتين.</i>`, { parse_mode: 'HTML' });
            } else {
              return ctx.reply(`❌ <b>خطأ مخزن: هذا الجهاز غير موجود في المخزن!</b>\n\n🧊 <b>سيريال الفانة:</b> <code>${indoor}</code>\n${outdoor ? `🔥 <b>سيريال الكباس:</b> <code>${outdoor}</code>\n` : ''}❄️ <b>الماركة المطلوبة:</b> ${workingData.brand || 'تكييف'} ${workingData.capacity ? `(${workingData.capacity})` : ''}\n\n⚠️ <i>لا يمكن صرف جهاز غير مسجل في بضاعة المخزن المتاحة لدينا.</i>\n🔍 يرجى فحص بضاعة المخزن عبر أمر /inventory أو تسجيل إذن توريد واستلام للجهاز أولاً.`, { parse_mode: 'HTML' });
            }
          }

          workingData.db_device_id = devCheck.device.id;
          workingData.brand = devCheck.device.brand || workingData.brand;
          workingData.capacity = devCheck.device.capacity || workingData.capacity;
          workingData.indoor_serial = devCheck.device.serial_number;
          workingData.outdoor_serial = workingData.outdoor_serial || null;
          workingData.cost_price = devCheck.device.cost_price;
          workingData.supplier_name = devCheck.device.suppliers?.name || workingData.supplier_name;
        }

        if (!workingData.outdoor_serial) {
          missing.push('🔥 سيريال الكباس (الوحدة الخارجية)');
        } else {
          const outCheck = await findDeviceInWarehouse(workingData.outdoor_serial);
          const fanBrandDesc = devCheck?.device ? `${devCheck.device.brand || 'تكييف'} ${devCheck.device.capacity || ''}` : '';
          if (!outCheck.found) {
            return ctx.reply(`❌ <b>خطأ مخزن: سيريال الكباس غير موجود في المخزن!</b>\n\n🔥 <b>سيريال الكباس المدخل:</b> <code>${workingData.outdoor_serial}</code>\n${indoor ? `🧊 <b>سيريال الفانة المطلوب صرفها:</b> <code>${indoor}</code> ${fanBrandDesc ? `(${fanBrandDesc})` : ''}\n` : ''}\n⚠️ <i>عذراً، سيريال الكباس المدخل غير مسجل في بضاعة المخزن المتاحة لدينا. يرجى التأكد من السيريال أو فحص المخزن عبر أمر /inventory.</i>`, { parse_mode: 'HTML' });
          } else if (!outCheck.isAvailable) {
            return ctx.reply(`⛔ <b>خطأ أمان: لا يمكن إتمام عملية الصرف!</b>\n\n📌 <b>سيريال الكباس:</b> <code>${workingData.outdoor_serial}</code>\n👤 <b>تم صرفه مسبقاً لـ:</b> ${outCheck.device.customer_name || 'عميل سابق'}\n🕒 <b>الحالة في المنظومة:</b> ${outCheck.device.status}\n\n⚠️ <i>لا يمكن تكرار صرف نفس الكباس مرتين. يرجى التأكد من الكباس المتاح بالمخزن.</i>`, { parse_mode: 'HTML' });
          } else if (devCheck?.device) {
            const compCheck = checkSerialCompatibility(devCheck.device, outCheck.device);
            if (!compCheck.isCompatible) {
              return ctx.reply(`⚠️ <b>عذراً، سيريال الكباس غير متوافق مع سيريال الفانة!</b>\n\n🧊 <b>الفانة المطلوبة:</b> <code>${indoor}</code> (${compCheck.fanDesc})\n🔥 <b>الكباس المدخل:</b> <code>${workingData.outdoor_serial}</code> (${compCheck.compDesc})\n\n❌ <b>سبب عدم التوافق:</b> ${compCheck.reason}.\n\n⚠️ <i>لا يمكن صرف فانة مع كباس بمواصفات أو موديل مختلف. يرجى اختيار سيريال كباس متوافق ومتاح في المخزن.</i>`, { parse_mode: 'HTML' });
            }
          }
        }
      }

      if (workingData.amount_paid == null && !workingData.is_installment) {
        missing.push('💵 المبلغ المدفوع من العميل (أو حدد: كاش بالكامل / آجل)');
      }

      if (workingData.amount_paid > 0 && (!workingData.payment_method || workingData.payment_method === 'آجل')) {
        missing.push('💳 وسيلة الدفع (خزنة / فودافون كاش / إنستاباي / محفظة بنك مصر / حساب الشركة / تحويل بنكي)');
      }

      if (missing.length > 0) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: { intent: 'device_dispatch_customer', data: workingData, timestamp: Date.now() }
          });
        }
        let warnMsg = `⚠️ <b>تم استلام طلب صرف لعميل مباشر (${workingData.customer_name || 'عميل'})، ولكن ينقصنا:</b>\n\n`;
        missing.forEach(m => warnMsg += `• ${m}\n`);
        warnMsg += `\n🎙️ <i>يرجى إرسال البيانات الناقصة في فويس أو رسالة لتجهيز أمر الصرف.</i>`;
        return ctx.reply(warnMsg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }]] }
        });
      }

      // Ready for confirmation
      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'device_dispatch_customer', data: workingData, timestamp: Date.now() }
        });
      }

      const remaining = workingData.amount_remaining != null ? Number(workingData.amount_remaining) : Math.max(0, Number(workingData.sale_price || 0) - Number(workingData.amount_paid || 0));

      let card = '';
      if (isBatch) {
        const commonBrand = workingData.items[0]?.brand || workingData.brand || 'تكييف';
        const commonCapacity = workingData.items[0]?.capacity || workingData.capacity || '1.5-حصان';
        const count = workingData.items.length;
        const unitSale = Math.round(Number(workingData.sale_price || 0) / count);

        // Enforce identical specifications across all batch items
        workingData.brand = commonBrand;
        workingData.capacity = commonCapacity;
        workingData.items.forEach(it => {
          it.brand = commonBrand;
          it.capacity = commonCapacity;
          it.sale_price = unitSale;
        });

        card = `📦 <b>مراجعة وتأكيد إذن صرف مجمع لعميل مباشر (${count} أجهزة متطابقة):</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `👤 <b>العميل:</b> ${workingData.customer_name}${matchedCustomerNote}\n`;
        card += `📱 <b>الهاتف:</b> ${workingData.customer_phone}\n`;
        card += `📍 <b>العنوان:</b> ${workingData.customer_address}\n`;
        card += `❄️ <b>الموديل والقدرة:</b> ${commonBrand} (${commonCapacity})\n`;
        card += `🔢 <b>العدد:</b> ${count} أجهزة | 💵 <b>سعر الجهاز:</b> ${formatEgp(unitSale)}\n\n`;
        card += `📋 <b>سيريالات الأجهزة:</b>\n`;
        workingData.items.forEach((it, idx) => {
          card += `<b>${idx + 1}.</b> 🧊 فانة: <code>${it.indoor_serial}</code> ┃ 🔥 كباس: <code>${it.outdoor_serial}</code>\n`;
        });
        card += `\n💰 <b>إجمالي سعر البيع:</b> <b>${formatEgp(workingData.sale_price)}</b>\n`;
        card += `💵 <b>المبلغ المدفوع:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
        card += `⏳ <b>المتبقي على العميل:</b> <b>${formatEgp(remaining)}</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `⚠️ <i>تأكد من صحة أجهزة الإذن المجمع أعلاه، ثم اضغط على تأكيد للتنفيذ الفوري.</i>`;
      } else {
        card = `📋 <b>مراجعة وتأكيد إذن صرف جهاز لعميل مباشر (مطابق للمخزن ✅):</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `👤 <b>العميل:</b> ${workingData.customer_name}${matchedCustomerNote}\n`;
        card += `📱 <b>الهاتف:</b> ${workingData.customer_phone}\n`;
        card += `📍 <b>العنوان:</b> ${workingData.customer_address}\n`;
        card += `❄️ <b>الجهاز:</b> ${workingData.brand || 'تكييف'} ${workingData.capacity ? `(${workingData.capacity})` : ''}\n`;
        card += `🧊 <b>سيريال الفانة (الداخلي):</b> <code>${workingData.indoor_serial}</code>\n`;
        if (workingData.outdoor_serial) {
          card += `🔥 <b>سيريال الكباس (الخارجي):</b> <code>${workingData.outdoor_serial}</code>\n`;
        }
        if (workingData.supplier_name) {
          card += `🏢 <b>المورد الأصلي:</b> ${workingData.supplier_name}\n`;
        }
        card += `👨‍🔧 <b>الفني المسؤول:</b> ${workingData.technician_name || 'غير محدد'}\n`;
        card += `💰 <b>سعر البيع:</b> <b>${formatEgp(workingData.sale_price)}</b>\n`;
        card += `💵 <b>المبلغ المدفوع:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
        card += `⏳ <b>المتبقي على العميل:</b> <b>${formatEgp(remaining)}</b>\n`;
        if (workingData.is_installment) {
          card += `📅 <b>نظام التقسيط:</b> ${workingData.installment_months || 12} شهر × ${formatEgp(workingData.installment_monthly || 0)}\n`;
        }
        const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
        card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `⚠️ <i>تأكد من صحة البيانات أعلاه، ثم اضغط على تأكيد للتنفيذ الفوري.</i>`;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: isBatch ? '✅ تأكيد صرف وتثبيت الإذن المجمع' : '✅ تأكيد وتنفيذ الصرف فوراً', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل أي بيانات في الإذن', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء العملية وتصفير البيانات', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }

    // 📤 Dispatch to Trader (صرف لتاجر)
    case 'device_dispatch_trader': {
      if (!workingData.trader_name && workingData.supplier_name) {
        workingData.trader_name = workingData.supplier_name;
      }
      if (workingData.trader_name) {
        const traderCheck = await checkExistingSupplier(workingData.trader_name);
        if (traderCheck.exists && traderCheck.supplier) {
          workingData.trader_name = traderCheck.displayName || traderCheck.supplier.name;
        }
      }
      const batchItems = normalizeBatchItems(workingData);
      const isBatch = batchItems.length > 1;

      const missing = [];
      if (!workingData.trader_name) missing.push('🤝 اسم التاجر');
      if (!workingData.sale_price || Number(workingData.sale_price) <= 0) missing.push('💰 إجمالي سعر البيع للتاجر');

      if (isBatch) {
        const verifiedItems = [];
        let totalBatchCost = 0;
        let totalBatchSale = Number(workingData.sale_price || 0);

        for (let i = 0; i < batchItems.length; i++) {
          const it = batchItems[i];
          const inSer = it.indoor_serial;
          const outSer = it.outdoor_serial;

          if (!inSer) {
            missing.push(`🧊 سيريال الفانة للجهاز (${i + 1})`);
            continue;
          }
          if (!outSer) {
            missing.push(`🔥 سيريال الكباس للجهاز (${i + 1})`);
            continue;
          }

          const devCheck = await findDeviceInWarehouse(inSer);
          if (!devCheck.found || !devCheck.isAvailable) {
            if (devCheck.found && !devCheck.isAvailable) {
              return ctx.reply(`⛔ <b>خطأ أمان: لا يمكن إتمام الإذن المجمع للتاجر!</b>\n\n📌 <b>الجهاز (${i + 1}) - سيريال الفانة:</b> <code>${inSer}</code>\n👤 <b>تم صرفه مسبقاً لـ:</b> ${devCheck.device.customer_name || 'تاجر سابق'}\n🕒 <b>الحالة في النظام:</b> ${devCheck.device.status}`, { parse_mode: 'HTML' });
            } else {
              return ctx.reply(`❌ <b>خطأ مخزن: الجهاز (${i + 1}) غير موجود في المخزن!</b>\n\n🧊 <b>سيريال الفانة:</b> <code>${inSer}</code>\n🔥 <b>سيريال الكباس:</b> <code>${outSer}</code>`, { parse_mode: 'HTML' });
            }
          }

          const outCheck = await findDeviceInWarehouse(outSer);
          if (!outCheck.found) {
            return ctx.reply(`❌ <b>خطأ مخزن: كباس الجهاز (${i + 1}) غير موجود بالمخزن!</b>\n\n🔥 <b>سيريال الكباس:</b> <code>${outSer}</code>\n🧊 <b>سيريال الفانة:</b> <code>${inSer}</code>\n\n⚠️ <i>يرجى التأكد من السيريال أو فحص المخزن عبر أمر /inventory.</i>`, { parse_mode: 'HTML' });
          } else if (!outCheck.isAvailable) {
            return ctx.reply(`⛔ <b>خطأ أمان: كباس الجهاز (${i + 1}) مصروف مسبقاً!</b>\n\n📌 <b>سيريال الكباس:</b> <code>${outSer}</code>\n👤 <b>مصروف لـ:</b> ${outCheck.device.customer_name || 'عميل سابق'}\n🕒 <b>الحالة في النظام:</b> ${outCheck.device.status}`, { parse_mode: 'HTML' });
          }

          // Compatibility check between Fan and Compressor for this unit
          const compCheck = checkSerialCompatibility(devCheck.device, outCheck.device);
          if (!compCheck.isCompatible) {
            return ctx.reply(`⚠️ <b>عذراً، كباس الجهاز (${i + 1}) غير متوافق مع الفانة!</b>\n\n🧊 <b>الفانة:</b> <code>${inSer}</code> (${compCheck.fanDesc})\n🔥 <b>الكباس:</b> <code>${outSer}</code> (${compCheck.compDesc})\n\n❌ <b>سبب عدم التوافق:</b> ${compCheck.reason}.\n\n⚠️ <i>لا يمكن صرف فانة مع كباس بمواصفات مختلفة.</i>`, { parse_mode: 'HTML' });
          }

          // Consistency check: Ensure all units in batch are the exact same model and capacity
          if (verifiedItems.length > 0) {
            const firstDev = verifiedItems[0];
            const batchMatchCheck = checkSerialCompatibility(firstDev, devCheck.device);
            if (!batchMatchCheck.isCompatible) {
              return ctx.reply(`⚠️ <b>خطأ إذن مجمع: الجهاز (${i + 1}) مختلف عن باقي الأجهزة في الإذن!</b>\n\n📌 <b>نوع أجهزة الإذن المجمع:</b> ${firstDev.brand} (${firstDev.capacity})\n❌ <b>الجهاز (${i + 1}) المدخل:</b> ${devCheck.device.brand} (${devCheck.device.capacity}) - سيريال: <code>${inSer}</code>\n\n⚠️ <i>الإذن المجمع يشترط أن تكون جميع الأجهزة متطابقة تماماً في الموديل والقدرة. يرجى تعديل السيريال أو عمل إذن صرف منفصل.</i>`, { parse_mode: 'HTML' });
            }
          }

          totalBatchCost += Number(devCheck.device.cost_price || 0);
          verifiedItems.push({
            id: devCheck.device.id,
            brand: devCheck.device.brand || it.brand || workingData.brand || 'تكييف',
            capacity: devCheck.device.capacity || it.capacity || workingData.capacity || '1.5-حصان',
            indoor_serial: devCheck.device.serial_number || inSer,
            outdoor_serial: outCheck.device.outdoor_serial || devCheck.device.outdoor_serial || outSer,
            cost_price: Number(devCheck.device.cost_price || 0),
            sale_price: it.sale_price ? Number(it.sale_price) : Math.round(totalBatchSale / batchItems.length),
            supplier_name: devCheck.device.suppliers?.name || ''
          });
        }

        if (verifiedItems.length > 0) {
          workingData.brand = verifiedItems[0].brand || workingData.brand;
          workingData.capacity = verifiedItems[0].capacity || workingData.capacity;
        }
        workingData.items = verifiedItems;
        workingData.is_batch = true;
        workingData.cost_price = totalBatchCost;
      } else {
        const indoor = workingData.indoor_serial;
        const outdoor = workingData.outdoor_serial;
        let devCheck = null;

        if (!indoor) {
          missing.push('🧊 سيريال الفانة (الوحدة الداخلية)');
        } else {
          devCheck = await findDeviceInWarehouse(indoor);
          if (!devCheck.found || !devCheck.isAvailable) {
            if (devCheck.found && !devCheck.isAvailable) {
              return ctx.reply(`⛔ <b>خطأ أمان: لا يمكن إتمام عملية الصرف!</b>\n\n📌 <b>سيريال الفانة:</b> <code>${devCheck.device.serial_number}</code>\n👤 <b>تم صرفه مسبقاً لـ:</b> ${devCheck.device.customer_name || 'تاجر سابق'}\n🕒 <b>الحالة في النظام:</b> ${devCheck.device.status}\n\n⚠️ <i>لا يمكن تكرار صرف نفس السيريال مرتين.</i>`, { parse_mode: 'HTML' });
            } else {
              return ctx.reply(`❌ <b>خطأ مخزن: هذا الجهاز غير موجود في المخزن!</b>\n\n🧊 <b>سيريال الفانة:</b> <code>${indoor}</code>\n${outdoor ? `🔥 <b>سيريال الكباس:</b> <code>${outdoor}</code>\n` : ''}❄️ <b>الماركة المطلوبة:</b> ${workingData.brand || 'تكييف'} ${workingData.capacity ? `(${workingData.capacity})` : ''}\n\n⚠️ <i>لا يمكن صرف جهاز غير مسجل في بضاعة المخزن المتاحة لدينا.</i>\n🔍 يرجى فحص بضاعة المخزن عبر أمر /inventory أو تسجيل إذن توريد للجهاز أولاً.`, { parse_mode: 'HTML' });
            }
          }

          workingData.db_device_id = devCheck.device.id;
          workingData.brand = devCheck.device.brand || workingData.brand;
          workingData.capacity = devCheck.device.capacity || workingData.capacity;
          workingData.indoor_serial = devCheck.device.serial_number;
          workingData.outdoor_serial = workingData.outdoor_serial || null;
          workingData.cost_price = devCheck.device.cost_price;
          workingData.supplier_name = devCheck.device.suppliers?.name || workingData.supplier_name;
        }

        if (!workingData.outdoor_serial) {
          missing.push('🔥 سيريال الكباس (الوحدة الخارجية)');
        } else {
          const outCheck = await findDeviceInWarehouse(workingData.outdoor_serial);
          const fanBrandDesc = devCheck?.device ? `${devCheck.device.brand || 'تكييف'} ${devCheck.device.capacity || ''}` : '';
          if (!outCheck.found) {
            return ctx.reply(`❌ <b>خطأ مخزن: سيريال الكباس غير موجود في المخزن!</b>\n\n🔥 <b>سيريال الكباس المدخل:</b> <code>${workingData.outdoor_serial}</code>\n${indoor ? `🧊 <b>سيريال الفانة المطلوب صرفها:</b> <code>${indoor}</code> ${fanBrandDesc ? `(${fanBrandDesc})` : ''}\n` : ''}\n⚠️ <i>عذراً، سيريال الكباس المدخل غير مسجل في بضاعة المخزن المتاحة لدينا. يرجى التأكد من السيريال أو فحص المخزن عبر أمر /inventory.</i>`, { parse_mode: 'HTML' });
          } else if (!outCheck.isAvailable) {
            return ctx.reply(`⛔ <b>خطأ أمان: لا يمكن إتمام عملية الصرف!</b>\n\n📌 <b>سيريال الكباس:</b> <code>${workingData.outdoor_serial}</code>\n👤 <b>تم صرفه مسبقاً لـ:</b> ${outCheck.device.customer_name || 'تاجر سابق'}\n🕒 <b>الحالة في المنظومة:</b> ${outCheck.device.status}\n\n⚠️ <i>لا يمكن تكرار صرف نفس الكباس مرتين. يرجى التأكد من الكباس المتاح بالمخزن.</i>`, { parse_mode: 'HTML' });
          } else if (devCheck?.device) {
            const compCheck = checkSerialCompatibility(devCheck.device, outCheck.device);
            if (!compCheck.isCompatible) {
              return ctx.reply(`⚠️ <b>عذراً، سيريال الكباس غير متوافق مع سيريال الفانة!</b>\n\n🧊 <b>الفانة المطلوبة:</b> <code>${indoor}</code> (${compCheck.fanDesc})\n🔥 <b>الكباس المدخل:</b> <code>${workingData.outdoor_serial}</code> (${compCheck.compDesc})\n\n❌ <b>سبب عدم التوافق:</b> ${compCheck.reason}.\n\n⚠️ <i>لا يمكن صرف فانة مع كباس بمواصفات أو موديل مختلف. يرجى اختيار سيريال كباس متوافق ومتاح في المخزن.</i>`, { parse_mode: 'HTML' });
            }
          }
        }
      }

      if (workingData.amount_paid == null) {
        missing.push('💵 المبلغ المسدد حالياً (أو حدد: آجل بالكامل)');
      }

      if (workingData.amount_paid > 0 && (!workingData.payment_method || workingData.payment_method === 'آجل')) {
        missing.push('💳 وسيلة الدفع (خزنة / فودافون كاش / إنستاباي / محفظة بنك مصر / حساب الشركة / تحويل بنكي)');
      }

      if (missing.length > 0) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: { intent: 'device_dispatch_trader', data: workingData, timestamp: Date.now() }
          });
        }
        let warnMsg = `⚠️ <b>تم استلام طلب صرف لتاجر (${workingData.trader_name || 'تاجر'})، ولكن ينقصنا:</b>\n\n`;
        missing.forEach(m => warnMsg += `• ${m}\n`);
        warnMsg += `\n🎙️ <i>يرجى إرسال البيانات الناقصة لتجهيز أمر الصرف.</i>`;
        return ctx.reply(warnMsg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }]] }
        });
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'device_dispatch_trader', data: workingData, timestamp: Date.now() }
        });
      }

      const remaining = workingData.amount_remaining != null ? Number(workingData.amount_remaining) : Math.max(0, Number(workingData.sale_price || 0) - Number(workingData.amount_paid || 0));

      const traderCheck = await checkExistingSupplier(workingData.trader_name);
      if (traderCheck.exists && traderCheck.supplier) {
        workingData.trader_name = traderCheck.displayName || traderCheck.supplier.name;
      }
      const traderDisplayName = traderCheck.exists
        ? formatTraderDisplayName(workingData.trader_name, true)
        : `<b>${workingData.trader_name}</b> <i>(⚠️ تاجر جديد - سيتم فتح حساب له)</i>`;

      let card = '';
      if (isBatch) {
        const commonBrand = workingData.items[0]?.brand || workingData.brand || 'تكييف';
        const commonCapacity = workingData.items[0]?.capacity || workingData.capacity || '1.5-حصان';
        const count = workingData.items.length;
        const unitSale = Math.round(Number(workingData.sale_price || 0) / count);

        // Enforce identical specifications across all batch items
        workingData.brand = commonBrand;
        workingData.capacity = commonCapacity;
        workingData.items.forEach(it => {
          it.brand = commonBrand;
          it.capacity = commonCapacity;
          it.sale_price = unitSale;
        });

        card = `📦 <b>مراجعة وتأكيد إذن صرف مجمع لتاجر (${count} أجهزة متطابقة):</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `🤝 <b>التاجر:</b> ${traderDisplayName}\n`;
        card += `❄️ <b>الموديل والقدرة:</b> ${commonBrand} (${commonCapacity})\n`;
        card += `🔢 <b>العدد:</b> ${count} أجهزة | 💵 <b>سعر الجهاز:</b> ${formatEgp(unitSale)}\n\n`;
        card += `📋 <b>سيريالات الأجهزة:</b>\n`;
        workingData.items.forEach((it, idx) => {
          card += `<b>${idx + 1}.</b> 🧊 فانة: <code>${it.indoor_serial}</code> ┃ 🔥 كباس: <code>${it.outdoor_serial}</code>\n`;
        });
        card += `\n💰 <b>إجمالي سعر البيع للتاجر:</b> <b>${formatEgp(workingData.sale_price)}</b>\n`;
        card += `💵 <b>المبلغ المسدد:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
        card += `⏳ <b>المتبقي في حساب التاجر:</b> <b>${formatEgp(remaining)}</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `⚠️ <i>تأكد من صحة البيانات ثم اضغط تأكيد للتنفيذ الفوري.</i>`;
      } else {
        card = `📋 <b>مراجعة وتأكيد إذن صرف جهاز لتاجر (مطابق للمخزن ✅):</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `🤝 <b>التاجر:</b> ${traderDisplayName}\n`;
        card += `❄️ <b>الجهاز:</b> ${workingData.brand || 'تكييف'} ${workingData.capacity ? `(${workingData.capacity})` : ''}\n`;
        card += `🧊 <b>سيريال الفانة:</b> <code>${workingData.indoor_serial}</code>\n`;
        if (workingData.outdoor_serial) {
          card += `🔥 <b>سيريال الكباس:</b> <code>${workingData.outdoor_serial}</code>\n`;
        }
        card += `💰 <b>سعر البيع للتاجر:</b> <b>${formatEgp(workingData.sale_price)}</b>\n`;
        card += `💵 <b>المبلغ المسدد:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
        card += `⏳ <b>المتبقي في حساب التاجر:</b> <b>${formatEgp(remaining)}</b>\n`;
        const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
        card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `⚠️ <i>تأكد من صحة البيانات ثم اضغط تأكيد.</i>`;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: isBatch ? '✅ تأكيد صرف وتثبيت الإذن المجمع للتاجر' : '✅ تأكيد وتنفيذ الصرف للتاجر', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل أي بيانات في الإذن', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء وتصفير البيانات', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }
    // 📥 Device Intake / Purchase from Supplier (استلام وتوريد أجهزة)
    case 'device_intake': {
      if (!workingData.supplier_name && workingData.trader_name) {
        workingData.supplier_name = workingData.trader_name;
      }
      if (workingData.supplier_name) {
        const supCheck = await checkExistingSupplier(workingData.supplier_name);
        if (supCheck.exists && supCheck.supplier) {
          workingData.supplier_name = supCheck.displayName || supCheck.supplier.name;
        }
      }


      const batchItems = normalizeBatchItems(workingData);
      const isBatch = batchItems.length > 1;

      const missing = [];
      if (!workingData.supplier_name) missing.push('🏢 اسم المورد');
      if (!workingData.brand) {
        missing.push('❄️ ماركة وموديل التكييف (مثال: ميديا بارد انفرتر)');
      } else if (!hasAcSpecifier(workingData.brand)) {
        missing.push(`❄️ نوع وموديل التكييف (${workingData.brand}): اختر الموديل بالكامل (بارد عادي / بارد انفرتر / بارد ساخن عادي / بارد ساخن انفرتر / كونسيلد)`);
      }
      if (!workingData.capacity) missing.push('⚡ القدرة بالحصان');
      if (!workingData.cost_price || Number(workingData.cost_price) <= 0) missing.push('💰 تكلفة سعر الشراء من المورد');

      // Prepare items list for serial checking
      const itemsToCheck = (isBatch && batchItems.length > 0)
        ? batchItems.map((it, idx) => ({ index: idx + 1, indoor: it.indoor_serial, outdoor: it.outdoor_serial }))
        : [{ index: 1, indoor: workingData.indoor_serial, outdoor: workingData.outdoor_serial }];

      if (isBatch) {
        for (let i = 0; i < batchItems.length; i++) {
          const it = batchItems[i];
          if (!it.indoor_serial) missing.push(`🧊 سيريال الفانة للجهاز (${i + 1})`);
          if (!it.outdoor_serial) missing.push(`🔥 سيريال الكباس للجهاز (${i + 1})`);
        }
        workingData.items = batchItems;
        workingData.is_batch = true;
      } else {
        if (!workingData.indoor_serial) missing.push('🧊 سيريال الفانة (الوحدة الداخلية)');
        if (!workingData.outdoor_serial) missing.push('🔥 سيريال الكباس (الوحدة الخارجية)');
      }

      // Check all serials for duplicates across the entire voice/operation (Unified single alert)
      const duplicates = await checkIntakeSerialDuplicates(itemsToCheck, isBatch);
      if (duplicates.length > 0) {
        const alertMsg = formatDuplicateSerialsAlert(duplicates, isBatch);
        return ctx.reply(alertMsg, { parse_mode: 'HTML' });
      }

      if (workingData.amount_paid == null) {
        missing.push('💵 المبلغ المدفوع للمورد (أو حدد: آجل بالكامل)');
      }

      if (workingData.amount_paid > 0 && (!workingData.payment_method || workingData.payment_method === 'آجل')) {
        missing.push('💳 وسيلة الدفع (خزنة / فودافون كاش / إنستاباي / محفظة بنك مصر / حساب الشركة / تحويل بنكي)');
      }

      if (missing.length > 0) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: { intent: 'device_intake', data: workingData, timestamp: Date.now() }
          });
        }

        const baseBrand = (workingData.brand || 'تكييف').trim();
        let keyboard = {
          inline_keyboard: [[{ text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }]]
        };
        let hasModelButtons = false;

        if (workingData.brand && !hasAcSpecifier(workingData.brand)) {
          hasModelButtons = true;
          keyboard.inline_keyboard = [
            [
              { text: `❄️ ${baseBrand} بارد عادي`, callback_data: `quickbrand_${encodeURIComponent(baseBrand + ' بارد عادي')}` },
              { text: `⚡ ${baseBrand} بارد انفرتر`, callback_data: `quickbrand_${encodeURIComponent(baseBrand + ' بارد انفرتر')}` }
            ],
            [
              { text: `🔥 ${baseBrand} بارد ساخن عادي`, callback_data: `quickbrand_${encodeURIComponent(baseBrand + ' بارد ساخن عادي')}` },
              { text: `⚡🔥 ${baseBrand} بارد ساخن انفرتر`, callback_data: `quickbrand_${encodeURIComponent(baseBrand + ' بارد ساخن انفرتر')}` }
            ],
            [
              { text: `🏢 ${baseBrand} كونسيلد`, callback_data: `quickbrand_${encodeURIComponent(baseBrand + ' كونسيلد')}` }
            ],
            [
              { text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }
            ]
          ];
        }

        let warnMsg = `⚠️ <b>تم استلام طلب توريد واستلام أجهزة من (${workingData.supplier_name || 'مورد'})، ولكن ينقصنا:</b>\n\n`;
        missing.forEach(m => warnMsg += `• ${m}\n`);
        if (hasModelButtons) {
          warnMsg += `\n🎙️ <i>يرجى تحديد الموديل من الأزرار بالأسفل أو إرسال البيانات الناقصة لتسجيل إذن الاستلام.</i>`;
        } else {
          warnMsg += `\n🎙️ <i>يرجى إرسال البيانات الناقصة في فويس أو رسالة لتسجيل إذن الاستلام.</i>`;
        }
        return ctx.reply(warnMsg, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'device_intake', data: workingData, timestamp: Date.now() }
        });
      }

      const remaining = workingData.amount_remaining != null ? Number(workingData.amount_remaining) : Math.max(0, Number(workingData.cost_price || 0) - Number(workingData.amount_paid || 0));

      const supplierCheck = await checkExistingSupplier(workingData.supplier_name);
      if (supplierCheck.exists && supplierCheck.supplier) {
        workingData.supplier_name = supplierCheck.displayName || supplierCheck.supplier.name;
      }
      const supplierDisplayName = supplierCheck.exists
        ? formatTraderDisplayName(workingData.supplier_name, false)
        : `<b>${workingData.supplier_name}</b> <i>(⚠️ مورد جديد - سيتم فتح حساب له)</i>`;

      let card = '';
      if (isBatch) {
        const commonBrand = workingData.brand || workingData.items[0]?.brand || 'تكييف';
        const commonCapacity = workingData.capacity || workingData.items[0]?.capacity || '1.5-حصان';
        const count = workingData.items.length;
        const unitCost = Math.round(Number(workingData.cost_price || 0) / count);

        // Enforce identical specifications across all batch items
        workingData.brand = commonBrand;
        workingData.capacity = commonCapacity;
        workingData.items.forEach(it => {
          it.brand = commonBrand;
          it.capacity = commonCapacity;
          it.cost_price = unitCost;
        });

        card = `📦 <b>مراجعة وتأكيد إذن توريد واستلام مجمع (${count} أجهزة متطابقة):</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `🏢 <b>المورد:</b> ${supplierDisplayName}\n`;
        card += `❄️ <b>الموديل والقدرة:</b> ${commonBrand} (${commonCapacity})\n`;
        card += `🔢 <b>العدد:</b> ${count} أجهزة | 💰 <b>تكلفة الجهاز:</b> ${formatEgp(unitCost)}\n\n`;
        card += `📋 <b>سيريالات الأجهزة:</b>\n`;
        workingData.items.forEach((it, idx) => {
          card += `<b>${idx + 1}.</b> 🧊 فانة: <code>${it.indoor_serial}</code> ┃ 🔥 كباس: <code>${it.outdoor_serial}</code>\n`;
        });
        card += `\n💰 <b>إجمالي تكلفة الشراء:</b> <b>${formatEgp(workingData.cost_price)}</b>\n`;
        card += `💵 <b>المسدد للمورد:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
        card += `⏳ <b>المتبقي للمورد في حسابه:</b> <b>${formatEgp(remaining)}</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `⚠️ <i>تأكد من صحة السيريالات والأسعار ثم اضغط تأكيد لإدخالها المخزن فوراً.</i>`;
      } else {
        card = `📋 <b>مراجعة وتأكيد إذن توريد واستلام جهاز بالمخزن:</b>\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `🏢 <b>المورد:</b> ${supplierDisplayName}\n`;
        card += `❄️ <b>الموديل:</b> ${workingData.brand}\n`;
        card += `⚡ <b>القدرة:</b> ${workingData.capacity}\n`;
        card += `🧊 <b>سيريال الفانة (الداخلي):</b> <code>${workingData.indoor_serial}</code>\n`;
        card += `🔥 <b>سيريال الكباس (الخارجي):</b> <code>${workingData.outdoor_serial}</code>\n`;
        card += `💰 <b>تكلفة الشراء:</b> <b>${formatEgp(workingData.cost_price)}</b>\n`;
        card += `💵 <b>المسدد للمورد:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
        card += `⏳ <b>المتبقي للمورد في حسابه:</b> <b>${formatEgp(remaining)}</b>\n`;
        const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
        card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
        card += `━━━━━━━━━━━━━━━\n`;
        card += `⚠️ <i>تأكد من صحة السيريالات والأسعار ثم اضغط تأكيد لإدخاله المخزن فوراً.</i>`;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: isBatch ? '✅ تأكيد إدخال الأجهزة المجمعة للمخزن' : '✅ تأكيد إدخال الجهاز للمخزن', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل أي بيانات في الإذن', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء وتصفير البيانات', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }

    // 🤝 Supplier Payment (سداد دفعة لمورد)
    case 'supplier_payment': {
      if (!workingData.supplier_name && workingData.trader_name) {
        workingData.supplier_name = workingData.trader_name;
      }
      if (workingData.supplier_name) {
        const supCheck = await checkExistingSupplier(workingData.supplier_name);
        if (supCheck.exists && supCheck.supplier) {
          workingData.supplier_name = supCheck.displayName || supCheck.supplier.name;
        }
      }
      const amt = Number(workingData.amount || workingData.amount_paid || 0);

      // If no supplier name was mentioned, fallback to general expense movement!
      if (!workingData.supplier_name) {
        workingData.type = 'مصروف';
        workingData.amount = amt;
        workingData.description = workingData.description || raw_transcription || `تحويل <b>${formatEgp(amt)}</b>`;
        return handleParsedERPAction(ctx, { intent: 'expense', data: workingData, raw_transcription }, fromId);
      }

      const missing = [];
      if (amt <= 0) missing.push('💰 المبلغ المسدد');
      if (!workingData.payment_method) missing.push('💳 وسيلة الدفع (خزنة / فودافون كاش / إنستاباي / محفظة بنك مصر / حساب الشركة / تحويل بنكي)');

      if (missing.length > 0) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: { intent: 'supplier_payment', data: workingData, timestamp: Date.now() }
          });
        }
        let warnMsg = `⚠️ <b>تم استلام طلب سداد دفعة لمورد (${workingData.supplier_name})، ولكن ينقصنا:</b>\n\n`;
        missing.forEach(m => warnMsg += `• ${m}\n`);
        warnMsg += `\n🎙️ <i>يرجى إرسال البيانات الناقصة لتجهيز إذن السداد.</i>`;
        return ctx.reply(warnMsg, { parse_mode: 'HTML' });
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      workingData.amount = amt;
      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'supplier_payment', data: workingData, timestamp: Date.now() }
        });
      }

      const supplierCheck = await checkExistingSupplier(workingData.supplier_name);
      if (supplierCheck.exists && supplierCheck.supplier) {
        workingData.supplier_name = supplierCheck.displayName || supplierCheck.supplier.name;
      }
      const supplierDisplayName = supplierCheck.exists
        ? formatTraderDisplayName(workingData.supplier_name, false)
        : `<b>${workingData.supplier_name}</b> <i>(⚠️ مورد جديد - سيتم فتح حساب له)</i>`;

      let card = `📋 <b>مراجعة وتأكيد سداد دفعة لمورد:</b>\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `🏢 <b>المورد:</b> ${supplierDisplayName}\n`;
      card += `💰 <b>المبلغ المسدد:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
      const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
      if (workingData.description) card += `📝 <b>البيان:</b> ${workingData.description}\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `⚠️ <i>سيتم خصم المبلغ من الخزنة وخصمه من حساب المورد عند التأكيد.</i>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ تأكيد سداد الدفعة للمورد', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل البيانات', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء العملية', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }

    // 🤝 Trader Collection (تحصيل دفعة من تاجر)
    case 'trader_collection': {
      if (!workingData.trader_name && workingData.supplier_name) {
        workingData.trader_name = workingData.supplier_name;
      }
      if (workingData.trader_name) {
        const traderCheck = await checkExistingSupplier(workingData.trader_name);
        if (traderCheck.exists && traderCheck.supplier) {
          workingData.trader_name = traderCheck.displayName || traderCheck.supplier.name;
        }
      }
      const amt = Number(workingData.amount || workingData.amount_paid || 0);

      // If no trader name was mentioned, fallback to general revenue movement!
      if (!workingData.trader_name) {
        workingData.type = 'إيراد';
        workingData.amount = amt;
        workingData.description = workingData.description || raw_transcription || `تحصيل/تحويل <b>${formatEgp(amt)}</b>`;
        return handleParsedERPAction(ctx, { intent: 'revenue', data: workingData, raw_transcription }, fromId);
      }

      const missing = [];
      if (amt <= 0) missing.push('💰 المبلغ المحصل');
      if (!workingData.payment_method) missing.push('💳 وسيلة التحصيل (خزنة / فودافون كاش / إنستاباي / محفظة بنك مصر / حساب الشركة / تحويل بنكي)');

      if (missing.length > 0) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: { intent: 'trader_collection', data: workingData, timestamp: Date.now() }
          });
        }
        let warnMsg = `⚠️ <b>تم استلام طلب تحصيل دفعة من تاجر (${workingData.trader_name})، ولكن ينقصنا:</b>\n\n`;
        missing.forEach(m => warnMsg += `• ${m}\n`);
        warnMsg += `\n🎙️ <i>يرجى إرسال البيانات الناقصة لتجهيز إذن التحصيل.</i>`;
        return ctx.reply(warnMsg, { parse_mode: 'HTML' });
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      workingData.amount = amt;
      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'trader_collection', data: workingData, timestamp: Date.now() }
        });
      }

      const traderCheck = await checkExistingSupplier(workingData.trader_name);
      if (traderCheck.exists && traderCheck.supplier) {
        workingData.trader_name = traderCheck.displayName || traderCheck.supplier.name;
      }
      const traderDisplayName = traderCheck.exists
        ? formatTraderDisplayName(workingData.trader_name, true)
        : `<b>${workingData.trader_name}</b> <i>(⚠️ تاجر جديد - سيتم فتح حساب له)</i>`;

      const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      let card = `📋 <b>مراجعة وتأكيد تحصيل دفعة من تاجر:</b>\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `🤝 <b>التاجر:</b> ${traderDisplayName}\n`;
      card += `💰 <b>المبلغ المحصل:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
      card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
      if (workingData.description) card += `📝 <b>البيان:</b> ${workingData.description}\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `⚠️ <i>سيتم إضافة المبلغ للخزنة وخصمه من المديونية في حساب التاجر.</i>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ تأكيد تحصيل الدفعة', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل البيانات', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء العملية', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }

    // 👤 Customer Collection (تحصيل دفعة/متبقي من عميل مباشر)
    case 'customer_collection': {
      const amt = Number(workingData.amount || workingData.amount_paid || 0);

      // If no customer name was mentioned, fallback to general revenue movement!
      if (!workingData.customer_name) {
        workingData.type = 'إيراد';
        workingData.amount = amt;
        workingData.description = workingData.description || raw_transcription || `تحصيل/تحويل <b>${formatEgp(amt)}</b>`;
        return handleParsedERPAction(ctx, { intent: 'revenue', data: workingData, raw_transcription }, fromId);
      }

      const missing = [];
      if (amt <= 0) missing.push('💰 المبلغ المحصل');
      if (!workingData.payment_method) missing.push('💳 وسيلة التحصيل (خزنة / فودافون كاش / إنستاباي / محفظة بنك مصر / حساب الشركة / تحويل بنكي)');

      if (missing.length > 0) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: { intent: 'customer_collection', data: workingData, timestamp: Date.now() }
          });
        }
        let warnMsg = `⚠️ <b>تم استلام طلب تحصيل دفعة من عميل، ولكن ينقصنا:</b>\n\n`;
        missing.forEach(m => warnMsg += `• ${m}\n`);
        warnMsg += `\n🎙️ <i>يرجى إرسال البيانات الناقصة لتجهيز إذن التحصيل.</i>`;
        return ctx.reply(warnMsg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }]] }
        });
      }

      // Check customer in database to see existing debt / remaining
      const custMatch = await findExistingCustomer(workingData.customer_phone, workingData.customer_name);
      let customerNote = '';
      if (custMatch) {
        customerNote = ` <i>(🌟 عميل مسجل: ${custMatch.customer.customer_name})</i>`;
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      workingData.amount = amt;
      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'customer_collection', data: workingData, timestamp: Date.now() }
        });
      }

      const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      let card = `📋 <b>مراجعة وتأكيد تحصيل دفعة/سداد متبقي من عميل:</b>\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `👤 <b>العميل:</b> ${workingData.customer_name}${customerNote}\n`;
      card += `💰 <b>المبلغ المحصل:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
      card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
      if (workingData.description) card += `📝 <b>البيان:</b> ${workingData.description}\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `⚠️ <i>سيتم إضافة المبلغ للرصيد والسيولة وتنزيل المبلغ من مديونية العميل في سجل الأجهزة والعملاء فور التأكيد.</i>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ تأكيد تحصيل الدفعة من العميل', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل البيانات', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء العملية', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }

    // 🛠️ Work Order (أمر شغل: صيانة / أعمال إضافية)
    case 'work_order': {
      const missing = [];

      // 1. Determine or validate branch (صيانة / أعمال إضافية)
      let woType = workingData.work_order_type;
      const combinedText = `${workingData.description || ''} ${raw_transcription || ''}`.toLowerCase();
      if (!woType) {
        if (combinedText.match(/نحاس|مواسير|حامل|حوامل|دفن|تكسير|كهرباء|تمديد|متر مواسير|قاعدة|إضافية|اضافية/)) {
          woType = 'أعمال إضافية';
          workingData.work_order_type = 'أعمال إضافية';
        } else if (combinedText.match(/غسيل|شحن|شحنة|فريون|صيانة|تصليح|إصلاح|عطل|تسريب|لحام|تنظيف|فك|تركيب|من برة|من برا|شغل/)) {
          woType = 'صيانة';
          workingData.work_order_type = 'صيانة';
        }
      }

      if (!woType) {
        missing.push('🛠️ نوع أمر الشغل (صيانة 🧰 / أعمال إضافية ⚡)');
      }

      // 2. Customer Name & Smart Lookup
      let matchedCustomerNote = '';
      if (!workingData.customer_name) {
        missing.push('👤 اسم العميل');
      } else {
        const custMatch = await findExistingCustomer(workingData.customer_phone, workingData.customer_name);
        if (custMatch) {
          matchedCustomerNote = ` <i>(🌟 عميل مسجل: ${custMatch.customer.customer_name})</i>`;
          if (!workingData.customer_phone && custMatch.customer.customer_phone) {
            workingData.customer_phone = custMatch.customer.customer_phone;
          }
          if (!workingData.customer_address && custMatch.customer.customer_address) {
            workingData.customer_address = custMatch.customer.customer_address;
          }
        }
      }

      // 3. Customer Phone & Address
      if (!workingData.customer_phone) {
        missing.push('📱 رقم هاتف العميل');
      }
      if (!workingData.customer_address) {
        missing.push('📍 عنوان ومكان العميل');
      }

      // 4. Work Details / Description
      const workDetails = workingData.description || workingData.work_details;
      if (!workDetails || workDetails.trim().length < 3) {
        missing.push('📝 تفاصيل العمل المنفذ (عملناله إيه بالضبط)');
      }

      // 5. Technicians / Staff (who performed the job)
      const techs = workingData.technicians || workingData.technician_name;
      let techVal = null;
      if (!techs || techs.trim().length === 0) {
        missing.push('👨‍🔧 اسم الفني أو الموظفين المنفذين لأمر الشغل (حتى لو أكثر من فني)');
      } else {
        techVal = await validateAndMatchTechnicians(techs);
        if (!techVal.isValid) {
          if (techVal.invalidTechs.length > 0) {
            const registeredNamesStr = techVal.registeredStaff && techVal.registeredStaff.length > 0 
              ? techVal.registeredStaff.map(s => s.name).join('، ')
              : 'لا يوجد فنيين مسجلين حالياً';
            let matchedNote = techVal.validTechs.length > 0 ? `\n<i>(تم مطابقة المعينين: ${techVal.validTechs.join('، ')} ✅)</i>` : '';
            missing.push(`👨‍🔧 تنبيه: الفني (<b>${techVal.invalidTechs.join('، ')}</b>) غير مسجل في قائمة الموظفين بالمؤسسة!${matchedNote}\n📌 <i>الفنيين والعمال المسجلين بالمؤسسة حالياً: ${registeredNamesStr}</i>`);
          }
        } else {
          workingData.technicians = techVal.matchedStr;
        }
      }

      // 6. Collected Amount & Payment Method
      const amt = workingData.amount_paid != null ? Number(workingData.amount_paid) : (workingData.amount != null ? Number(workingData.amount) : null);
      if (amt == null) {
        missing.push('💰 المبلغ المحصل من العميل (أو حدد: آجل / بدون تحصيل)');
      } else if (amt > 0 && (!workingData.payment_method || workingData.payment_method === 'آجل')) {
        missing.push('💳 وسيلة استلام المبلغ (خزنة / فودافون كاش / إنستاباي / محفظة بنك مصر / حساب الشركة / تحويل بنكي)');
      }

      // If any required field is missing, prompt user with conversational slot-filling
      if (missing.length > 0) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: { intent: 'work_order', data: workingData, timestamp: Date.now() }
          });
        }

        let warnMsg = `⚠️ <b>تم استلام طلب تسجيل أمر شغل (${woType || 'صيانة / أعمال إضافية'})، ولكن ينقصنا:</b>\n\n`;
        missing.forEach(m => warnMsg += `• ${m}\n`);
        warnMsg += `\n🎙️ <i>يرجى إرسال البيانات الناقصة في فويس أو رسالة أو اختر من الأزرار التالية:</i>`;

        const quickButtons = [];
        if (techVal && !techVal.isValid && techVal.registeredStaff && techVal.registeredStaff.length > 0) {
          const techButtons = techVal.registeredStaff.map(s => ({
            text: `👨‍🔧 ${s.name}`,
            callback_data: `quicktech_${encodeURIComponent(s.name)}`
          }));
          for (let i = 0; i < techButtons.length; i += 2) {
            quickButtons.push(techButtons.slice(i, i + 2));
          }
        }
        if (!woType) {
          quickButtons.push([
            { text: '🧰 صيانة (غسيل / فريون / تركيب خارجي)', callback_data: 'quickwotype_صيانة' },
            { text: '⚡ أعمال إضافية (مواسير / حوامل / كهرباء)', callback_data: 'quickwotype_أعمال إضافية' }
          ]);
        }
        if (amt != null && amt > 0 && (!workingData.payment_method || workingData.payment_method === 'آجل')) {
          quickButtons.push([
            { text: '💵 خزنة (كاش)', callback_data: 'quickpay_خزنة' },
            { text: '📱 فودافون كاش', callback_data: 'quickpay_فودافون كاش' },
            { text: '⚡ إنستا باي', callback_data: 'quickpay_إنستا باي' }
          ]);
        }
        quickButtons.push([{ text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }]);

        return ctx.reply(warnMsg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: quickButtons }
        });
      }

      // Ready for confirmation
      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      workingData.amount_paid = amt;
      workingData.amount = amt;
      workingData.work_order_type = woType;
      workingData.technicians = techs;
      workingData.description = workDetails;

      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'work_order', data: workingData, timestamp: Date.now() }
        });
      }

      // Check for previous work order / maintenance history for this customer
      const prevCheck = await findPreviousCustomerWorkOrders(workingData.customer_phone, workingData.customer_name);
      let previousHistoryAlert = '';
      if (prevCheck.hasPrevious) {
        const po = prevCheck.previousOrder;
        previousHistoryAlert = `\n\n🚨 <b>تنبيه فني وإداري: يوجد سجل عمل سابق لهذا العميل! 🔔</b>\n`;
        previousHistoryAlert += `• <b>العمل السابق:</b> ${po.details}\n`;
        previousHistoryAlert += `• <b>الفني المسؤول السابق:</b> 👨‍🔧 <code>${po.technicians}</code>\n`;
        previousHistoryAlert += `• <b>تاريخ الزيارة السابقة:</b> منذ ${po.daysAgo === 0 ? 'اليوم' : `${po.daysAgo} يوم`} (${po.dateStr})\n`;
        previousHistoryAlert += `• <b>المبلغ السابق:</b> 💰 ${po.amountStr}\n`;
        previousHistoryAlert += `⚠️ <i>يرجى الانتباه والتأكد مما إذا كانت المشكلة السابقة لم تُحل لمحاسبة الفني المسؤول.</i>`;
      }

      const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const typeBadge = (woType === 'أعمال إضافية') ? '⚡ أعمال إضافية' : '🧰 صيانة';
      let card = `📋 <b>مراجعة وتأكيد أمر شغل جديد (${typeBadge}):</b>\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `🛠️ <b>النوع:</b> ${typeBadge}\n`;
      card += `👤 <b>العميل:</b> ${workingData.customer_name}${matchedCustomerNote}\n`;
      card += `📱 <b>الهاتف:</b> ${workingData.customer_phone}\n`;
      card += `📍 <b>العنوان:</b> ${workingData.customer_address}\n`;
      card += `📝 <b>العمل المنفذ:</b> ${workingData.description}\n`;
      card += `👨‍🔧 <b>فريق العمل / الفنيين:</b> ${workingData.technicians}\n`;
      card += `💰 <b>المبلغ المحصل:</b> <b>${formatEgp(amt)}</b> (${workingData.payment_method || 'خزنة'})\n`;
      card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
      card += `━━━━━━━━━━━━━━━`;
      card += previousHistoryAlert;
      card += `\n\n⚠️ <i>تأكد من صحة البيانات أعلاه، ثم اضغط تأكيد لتسجيل أمر الشغل وتوريد النقدية للخزنة فوراً.</i>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ تأكيد وتسجيل أمر الشغل فوراً', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل البيانات', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء العملية وتصفير البيانات', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }

    // 👨‍🔧 Salary Advance (سلفة لفني)
    case 'salary_advance': {
      const amt = Number(workingData.amount || 0);
      if (!workingData.technician_name || amt <= 0) {
        return ctx.reply('⚠️ <b>يرجى ذكر اسم الفني ومبلغ السلفة بوضوح</b>\n(مثال: <code>سلفة 1500 جنيه للفني اسلام كاش</code>)', { parse_mode: 'HTML' });
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      workingData.amount = amt;
      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: 'salary_advance', data: workingData, timestamp: Date.now() }
        });
      }

      const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      let card = `📋 <b>مراجعة وتأكيد صرف سلفة لفني:</b>\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `👨‍🔧 <b>الفني:</b> ${workingData.technician_name}\n`;
      card += `💰 <b>مبلغ السلفة:</b> <b>${formatEgp(amt)}</b>\n`;
      card += `💳 <b>الوسيلة:</b> ${workingData.payment_method || 'خزنة'}\n`;
      card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `⚠️ <i>سيتم تسجيل السلفة في كشف الفني وخصم المبلغ من الخزنة فور التأكيد.</i>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ تأكيد صرف السلفة', callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل البيانات', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء السلفة', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }

    // 💵 General Expense or Revenue (مصروف أو إيراد)
    default: {
      const amt = Number(workingData.amount || workingData.amount_paid || 0);
      if (amt <= 0) {
        return ctx.reply(`💡 <b>لم أتمكن من فهم العملية بوضوح.</b>\n\nيرجى قول أو كتابة المطلوب بوضوح:\n• <i>صرف جهاز كاريير بارد عادي 1.5ح للعميل محمد علي...</i>\n• <i>استلمنا جهاز ميديا 2.25ح من توفيق سالم...</i>\n• <i>صرفت 150 جنيه شاي للعمال كاش</i>\n• <i>استلمنا 500 جنيه صيانة فودافون كاش</i>`, { parse_mode: 'HTML' });
      }

      const isRevenue = workingIntent === 'revenue' || workingData.type === 'إيراد';

      // Check if payment method is missing - prompt user with quick-select buttons!
      if (!workingData.payment_method) {
        if (fromId) {
          await setUserSession(fromId, {
            pending_erp_session: {
              intent: isRevenue ? 'revenue' : 'expense',
              data: { ...workingData, amount: amt, type: isRevenue ? 'إيراد' : 'مصروف' },
              timestamp: Date.now()
            }
          });
        }
        let warnMsg = `⚠️ <b>تم استلام طلب تسجيل ${isRevenue ? '🟢 إيراد' : '🔴 مصروف'} بقيمة <b>${formatEgp(amt)}</b>، ولكن ينقصنا:</b>\n\n`;
        warnMsg += `• 💳 <b>وسيلة الدفع / المحفظة</b>\n\n`;
        warnMsg += `🎙️ <i>يرجى الضغط على الوسيلة أدناه أو قولها في فويس:</i>`;
        return ctx.reply(warnMsg, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '💵 خزنة الشركة (كاش)', callback_data: `quickpay_خزنة` },
                { text: '📱 فودافون كاش', callback_data: `quickpay_فودافون كاش` }
              ],
              [
                { text: '⚡ إنستا باي', callback_data: `quickpay_إنستا باي` },
                { text: '🏦 محفظة بنك مصر', callback_data: `quickpay_محفظة بنك مصر` }
              ],
              [
                { text: '🏛️ تحويل بنكي', callback_data: `quickpay_تحويل بنكي` },
                { text: '🏢 بنك مصر بيزنيس', callback_data: `quickpay_حساب الشركة` }
              ],
              [
                { text: '🗑️ إلغاء العملية', callback_data: 'act_ccl_pending' }
              ]
            ]
          }
        });
      }

      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      workingData.type = isRevenue ? 'إيراد' : 'مصروف';
      workingData.amount = amt;
      workingData.description = workingData.description || raw_transcription || (isRevenue ? 'إيراد عام' : 'مصروف عام');

      if (fromId) {
        await setUserSession(fromId, {
          pending_action: { id: actionId, intent: isRevenue ? 'revenue' : 'expense', data: workingData, timestamp: Date.now() }
        });
      }

      const displayDate = workingData.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const typeIcon = isRevenue ? '🟢 إيراد (دخول نقدية)' : '🔴 مصروف (خروج نقدية)';

      let card = `📋 <b>مراجعة وتأكيد تسجيل حركة خزنة:</b>\n`;
      card += `━━━━━━━━━━━━━━━\n`;
      card += `📌 <b>النوع:</b> ${typeIcon}\n`;
      card += `💰 <b>المبلغ:</b> ${formatPaymentMethodDisplay(workingData)}\n`;
      card += `📝 <b>البيان:</b> ${workingData.description}\n`;
      card += `📅 <b>تاريخ الحركة:</b> <code>${displayDate}</code> ${workingData.date ? '' : '(النهاردة)'}\n`;
      card += `━━━━━━━━━━━━━━━\n`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: `✅ تأكيد تسجيل ${workingData.type}`, callback_data: `act_cnf_${actionId}` }
          ],
          [
            { text: '✏️ تعديل البيانات', callback_data: `act_edit_${actionId}` },
            { text: '❌ إلغاء وتراجع', callback_data: `act_ccl_${actionId}` }
          ]
        ]
      };

      return ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  }
}

// Main Handlers Registration
export function registerHandlers(bot) {
  if (!bot) return;

  // Middleware: Security Check
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!isAuthorized(fromId)) {
      console.warn(`Unauthorized access attempt from user ID: ${fromId}`);
      return ctx.reply('⛔ <b>عفواً، هذا البوت خاص بإدارة شركة Future Air فقط.</b>', { parse_mode: 'HTML' });
    }
    return next();
  });

  // Set Telegram Menu Commands
  bot.telegram.setMyCommands([
    { command: 'start', description: '📋 القائمة الرئيسية للعمليات' },
    { command: 'inventory', description: '📦 بضاعة المخزن والسيريالات' },
    { command: 'suppliers', description: '🏢 كشف حسابات الموردين والتجار' },
    { command: 'balance', description: '💵 أرصدة الخزينة والوسائل' },
    { command: 'today', description: '📅 كشف حركات اليوم' },
    { command: 'attendance', description: '👥 كشف حضور الموظفين' }
  ]).catch(err => console.warn('Could not set Telegram menu commands:', err.message));

  // Set Chat Menu Button for Telegram Mini App
  bot.telegram.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: '📱 لوحة التحكم (ERP)',
      web_app: { url: 'https://futureairpro.onrender.com/' }
    }
  }).catch(err => console.warn('Could not set chat menu button:', err.message));

  // /start command
  bot.start(async (ctx) => {
    let msg = `👋 <b>أهلاً بك في المنظومة الصوتية الذكية المتكاملة (Future Air Voice ERP) 🌬️</b>\n\n`;
    msg += `🎙️ <b>تحكم كامل وسريع في كل شيء:</b>\n`;
    msg += `• يمكنك <b>تسجيل فويس مباشر فوراً</b> بأي عملية، والذكاء الاصطناعي سيفهمها ويعرض بطاقة مراجعة قبل التنفيذ.\n`;
    msg += `• أو اضغط على <b>زر لوحة التحكم</b> بالأسفل لفتح التطبيق المصغر التفاعلي للشاشات والجداول فوراً!\n\n`;
    msg += `👇 <b>اختر القسم المطلوب من القائمة أو افتح اللوحة التفاعلية:</b>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📱 فتح التطبيق المصغر (Mini App)', web_app: { url: 'https://futureairpro.onrender.com/' } }
        ],
        [
          { text: '💻 فتح في متصفح الكمبيوتر (رابط مباشر)', url: 'https://futureairpro.onrender.com/' }
        ],
        [
          { text: '📦 المخزن والأجهزة (استلام / صرف)', callback_data: 'menu_devices' }
        ],
        [
          { text: '🏢 الموردين والتجار (حسابات / سداد)', callback_data: 'menu_suppliers' }
        ],
        [
          { text: '💵 الخزنة والمحافظ (مصروفات / سلف)', callback_data: 'menu_safe' }
        ],
        [
          { text: '👥 كشف حضور وغياب الموظفين', callback_data: 'today_attendance' }
        ]
      ]
    };

    return ctx.reply(msg, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // /inventory command
  bot.command(['inventory', 'stock', 'warehouse', 'devices', 'makhzan', 'makzan'], async (ctx) => {
    const waitMsg = await ctx.reply('⏳ <i>جاري فحص وجلب بضاعة المخزن الحالي...</i>', { parse_mode: 'HTML' });
    const summary = await getWarehouseInventorySummary();
    await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  // /attendance command
  bot.command(['attendance', 'hr', 'att', 'staff'], async (ctx) => {
    const waitMsg = await ctx.reply('⏳ <i>جاري جلب كشف حضور وانصراف الموظفين...</i>', { parse_mode: 'HTML' });
    const summary = await getTodayAttendanceSummary();
    await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  // /balance command
  bot.command(['balance', 'safe'], async (ctx) => {
    const summary = await getLiquiditySummary();
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  // /suppliers command
  bot.command(['suppliers', 'traders', 'trader', 'supplier', 'morid'], async (ctx) => {
    const waitMsg = await ctx.reply('⏳ <i>جاري جلب حسابات الموردين والتجار فوراً...</i>', { parse_mode: 'HTML' });
    const summary = await getSuppliersSummary();
    await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  // /today command
  bot.command(['today', 'daily'], async (ctx) => {
    const today = new Date().toISOString().split('T')[0];
    const { data: rows, error } = await supabase
      .from('cash_flow')
      .select('*')
      .gte('created_at', today + 'T00:00:00')
      .order('created_at', { ascending: false });

    if (error || !rows || rows.length === 0) {
      return ctx.reply('ℹ️ لا توجد حركات مسجلة في الخزنة اليوم حتى الآن.');
    }

    let incomeTotal = 0;
    let expenseTotal = 0;
    let listMsg = `📅 <b>كشف حساب حركات الخزنة اليوم (${today}):</b>\n\n`;

    rows.forEach((r, idx) => {
      const isIncome = r.type === 'إيراد';
      const icon = isIncome ? '🟢' : '🔴';
      const amt = Number(r.amount || 0);
      if (isIncome) incomeTotal += amt;
      else expenseTotal += amt;

      const cleanDesc = (r.description || '').replace(/__ATTACHMENT__.*$/, '').trim();
      listMsg += `${idx + 1}. ${icon} <b>${formatEgp(amt)}</b> - ${cleanDesc}\n`;
    });

    const net = incomeTotal - expenseTotal;
    listMsg += `\n━━━━━━━━━━━━━━━\n`;
    listMsg += `🟢 <b>إجمالي الإيرادات اليوم:</b> ${formatEgp(incomeTotal)}\n`;
    listMsg += `🔴 <b>إجمالي المصروفات اليوم:</b> ${formatEgp(expenseTotal)}\n`;
    listMsg += `⚖️ <b>صافي اليوم:</b> <b>${formatEgp(net)}</b>`;

    return ctx.reply(listMsg, { parse_mode: 'HTML' });
  });

  // /cancel command
  bot.command(['cancel', 'elgha', 'ilgha', 'clear', 'reset'], async (ctx) => {
    const fromId = ctx.from?.id;
    if (fromId) {
      await setUserSession(fromId, {});
    }
    return ctx.reply('🗑️ <b>تم إلغاء وتصفير أي عملية معلقة بنجاح! المنظومة جاهزة لاستقبال أي حركة جديدة الآن.</b>', { parse_mode: 'HTML' });
  });

  // 📎 Attach Photo / Document Button Action
  bot.action(/^att_(.+)$/, async (ctx) => {
    const rawInput = ctx.match[1];
    const id = resolveTxAction(rawInput);
    const fromId = ctx.from?.id;
    await ctx.answerCbQuery('📸 في انتظار صورة المستند...');

    if (fromId) {
      const prevSess = await getUserSession(fromId) || {};
      let activeAttachDevId = null;
      let activeAttachTxId = null;

      if (id.startsWith('dispcust_') || id.startsWith('intake_') || id.startsWith('disptrd_')) {
        const parts = id.split('_');
        if (parts[1] && parts[1] !== '0') activeAttachDevId = parts[1];
        if (parts[2] && parts[2] !== '0') activeAttachTxId = parts[2];
      } else {
        activeAttachTxId = id;
      }

      await setUserSession(fromId, {
        ...prevSess,
        activeAttachDevId,
        activeAttachTxId,
        lastDeviceId: activeAttachDevId || prevSess.lastDeviceId,
        lastTxId: activeAttachTxId || prevSess.lastTxId,
        timestamp: Date.now()
      });
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '↩️ إلغاء الإرفاق', callback_data: `cancelatt_${rawInput}` }
        ]
      ]
    };

    return ctx.reply(`📸 <b>(اختياري) يرجى إرسال صورة المستند الآن:</b>\n• إذن صرف 📋\n• إذن استلام / توريد 📦\n• عقد بيع 📑\n• محضر تركيب وتسليم 🛠️\n• فاتورة / إيصال تحويل 💳\n\n✨ <i>سيتم توثيقها وأرشفتها فوراً وربطها بهذه الحركة بالموقع والمنظومة.</i>`, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // ↩️ Cancel Attachment Action
  bot.action(/^cancelatt_(.+)$/, async (ctx) => {
    const fromId = ctx.from?.id;
    if (fromId) {
      const prevSess = await getUserSession(fromId) || {};
      delete prevSess.activeAttachTxId;
      delete prevSess.activeAttachDevId;
      await setUserSession(fromId, prevSess);
    }
    await ctx.answerCbQuery('تم إلغاء الإرفاق');
    return ctx.editMessageText('↩️ <b>تم إلغاء عملية الإرفاق.</b>', { parse_mode: 'HTML' });
  });

  // 🗑️ Delete Specific Attachment Callback
  bot.action(/^delatt_(.+)$/, async (ctx) => {
    const fromId = ctx.from?.id;
    const sess = fromId ? await getUserSession(fromId) : null;
    const urlToDelete = sess?.lastUploadedUrl;

    if (urlToDelete) {
      // 1. Remove from devices if present
      if (sess?.lastDeviceId) {
        const { data: dev } = await supabase.from('devices').select('contract_images').eq('id', sess.lastDeviceId).single();
        if (dev && Array.isArray(dev.contract_images)) {
          const filtered = dev.contract_images.filter(u => u !== urlToDelete);
          await supabase.from('devices').update({ contract_images: filtered }).eq('id', sess.lastDeviceId);
        }
      }

      // 2. Remove from cash_flow if present
      if (sess?.lastTxId && !String(sess.lastTxId).startsWith('dev_')) {
        const { data: cf } = await supabase.from('cash_flow').select('description').eq('id', sess.lastTxId).single();
        if (cf && cf.description && cf.description.includes(urlToDelete)) {
          const cleanDesc = cf.description.replace(`__ATTACHMENT__${urlToDelete}`, '').trim();
          await supabase.from('cash_flow').update({ description: cleanDesc }).eq('id', sess.lastTxId);
        }
      }
    }

    await ctx.answerCbQuery('🗑️ تم حذف المرفق بنجاح');
    return ctx.editMessageText('🗑️ <b>تم حذف هذا المرفق وإلغاء ربطه بنجاح. يمكنك إرسال الصورة الصحيحة الآن.</b>', { parse_mode: 'HTML' });
  });

  // /attach command
  bot.command(['attach', 'doc', 'marfak', 'mrfak'], async (ctx) => {
    const text = ctx.message.text.replace(/^\/(attach|doc|marfak|mrfak)/i, '').trim();
    if (!text) {
      return ctx.reply('ℹ️ <b>طريقة إرفاق مستند لجهاز مسجل مسبقاً:</b>\n\nأرسل الأمر متبوعاً بسيريال الجهاز:\n<code>/attach 5000</code>\n\nأو أرسل الصورة مباشرة واكتب في التعليق (الكابشن) سيريال الجهاز (مثال: <code>محضر تركيب تكييف 5000</code>).', { parse_mode: 'HTML' });
    }

    const devCheck = await findDeviceInWarehouse(text);
    if (!devCheck.found) {
      return ctx.reply(`⚠️ لم يتم العثور على جهاز مسجل بالسيريال [<code>${text}</code>]`, { parse_mode: 'HTML' });
    }

    const fromId = ctx.from?.id;
    if (fromId) {
      await setUserSession(fromId, { activeAttachDevId: devCheck.device.id, timestamp: Date.now() });
    }

    return ctx.reply(`📸 <b>أرسل الآن صورة (محضر التركيب / العقد / إذن الصرف / الفاتورة) للجهاز:</b>\n\n🧊 <b>سيريال:</b> <code>${devCheck.device.serial_number}</code>\n👤 <b>العميل/التاجر:</b> ${devCheck.device.customer_name || 'غير محدد'}\n❄️ <b>النوع:</b> ${devCheck.device.brand || 'تكييف'}\n\nوسيتم ربطها فوراً وتحديث زر "📄 عرض المرفقات" في الموقع 🎯`, { parse_mode: 'HTML' });
  });

  // /set_key command
  bot.command('set_key', async (ctx) => {
    const text = ctx.message.text.replace('/set_key', '').trim();
    if (!text) {
      return ctx.reply(`⚙️ <b>ضبط مفاتيح الذكاء الاصطناعي (Google Gemini):</b>\n\nأرسل الأمر مع المفتاح (أو عدة مفاتيح مجانية مفصولة بفواصل لزيادة الكوتة والسرعة):\n<code>/set_key AQ... , AQ...</code>`, { parse_mode: 'HTML' });
    }

    try {
      const { data: rows } = await supabase.from('bot_sessions').select('*').eq('chat_id', 999999).maybeSingle();
      const finData = rows?.data || {};

      finData.GEMINI_API_KEY = text;

      await supabase.from('bot_sessions').update({ data: finData, updated_at: new Date().toISOString() }).eq('chat_id', 999999);
      invalidateAiKeysCache();
      return ctx.reply('✅ <b>تم حفظ وتفعيل مفاتيح الذكاء الاصطناعي بنجاح! تم تشغيل محرك التناوب التلقائي بين الموديلات فائقة السرعة. 🚀</b>', { parse_mode: 'HTML' });
    } catch (e) {
      return ctx.reply(`❌ فشل حفظ المفتاح: ${e.message}`);
    }
  });

  // 🎙️ Voice & Audio Messages Handler (Blazing Fast Sub-Second Engine)
  bot.on(['voice', 'audio'], async (ctx) => {
    const fromId = ctx.from?.id;
    ctx.sendChatAction('record_voice').catch(() => {});

    const waitMsg = await ctx.reply('⏳ <i>جاري الاستماع للفويس واستخراج بيانات العملية بدقة...</i>', { parse_mode: 'HTML' });

    try {
      const t0 = Date.now();
      const voice = ctx.message.voice || ctx.message.audio;

      // Parallelize Telegram link lookup, Supabase keys & user session concurrently
      const [fileLink, aiKeys, userSession] = await Promise.all([
        ctx.telegram.getFileLink(voice.file_id),
        getStoredAiKeys(),
        fromId ? getUserSession(fromId) : null
      ]);
      const tLink = Date.now() - t0;

      const tDown0 = Date.now();
      const audioBuffer = await downloadFileBuffer(fileLink.href);
      const tDown = Date.now() - tDown0;

      const tAi0 = Date.now();
      const mimeType = voice.mime_type || (ctx.message.voice ? 'audio/ogg' : 'audio/mp3');
      const erpResult = await parseERPWithGemini(audioBuffer, aiKeys.GEMINI_API_KEY, true, userSession?.pending_erp_session, mimeType);
      const tAi = Date.now() - tAi0;

      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});

      // Record performance telemetry asynchronously
      try {
        await supabase.from('bot_sessions').upsert({
          chat_id: 777777,
          state: 'voice_telemetry',
          data: {
            fileLinkMs: tLink,
            downloadMs: tDown,
            geminiMs: tAi,
            totalBeforeActionMs: Date.now() - t0,
            bufferSizeKb: Math.round((audioBuffer?.length || 0) / 1024),
            slotTraces: erpResult?._debug_traces,
            timestamp: new Date().toISOString()
          }
        });
      } catch (telemetryErr) {
        console.warn('Telemetry upsert error:', telemetryErr.message);
      }

      // Process universal ERP intent directly
      await handleParsedERPAction(ctx, erpResult, fromId);

    } catch (err) {
      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
      console.error('Error processing voice message:', err);
      return ctx.reply(`⚠️ <b>تعذر معالجة الفويس:</b> ${err.message}`, { parse_mode: 'HTML' });
    }
  });

  // ⌨️ Text Messages Handler (Blazing Fast Sub-Second Engine)
  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    const fromId = ctx.from?.id;

    ctx.sendChatAction('typing').catch(() => {});

    try {
      const [aiKeys, userSession] = await Promise.all([
        getStoredAiKeys(),
        fromId ? getUserSession(fromId) : null
      ]);
      const erpResult = await parseERPWithGemini(text, aiKeys.GEMINI_API_KEY, false, userSession?.pending_erp_session);
      await handleParsedERPAction(ctx, erpResult, fromId);

    } catch (err) {
      console.error('Error processing text message:', err);
      return ctx.reply(`⚠️ تعذر فهم الرسالة: ${err.message}`);
    }
  });

  // 📷 Photo & Transfer Screenshot Handler
  bot.on(['photo', 'document'], async (ctx) => {
    const caption = ctx.message.caption || '';
    const photos = ctx.message.photo;
    const document = ctx.message.document;

    let fileId = null;
    if (photos && photos.length > 0) {
      fileId = photos[photos.length - 1].file_id;
    } else if (document && (document.mime_type?.startsWith('image/') || document.mime_type === 'application/pdf')) {
      fileId = document.file_id;
    } else {
      return;
    }

    const waitMsg = await ctx.reply('⏳ <i>جاري رفع صورة الفاتورة/التحويل وقراءة تفاصيل الحركة...</i>', { parse_mode: 'HTML' });

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const photoBuffer = await downloadFileBuffer(fileLink.href);

      const aiKeys = await getStoredAiKeys();
      let visionDocInfo = null;
      if (aiKeys.GEMINI_API_KEY) {
        visionDocInfo = await classifyDocumentPhotoWithGemini(photoBuffer, aiKeys.GEMINI_API_KEY).catch(() => null);
      }

      let docMarker = visionDocInfo?.doc_marker || '__receipt__';
      let detectedLabel = visionDocInfo?.doc_type || 'مستند';

      const lowerCap = (caption || '').toLowerCase();
      if (lowerCap.includes('عقد') || lowerCap.includes('contract')) {
        docMarker = '__contract__';
        detectedLabel = 'عقد بيع وتوريد';
      } else if (lowerCap.includes('محضر') || lowerCap.includes('تركيب') || lowerCap.includes('شغل') || lowerCap.includes('job')) {
        docMarker = '__job_order__';
        detectedLabel = 'محضر تركيب وتسليم';
      } else if (lowerCap.includes('استلام') || lowerCap.includes('توريد') || lowerCap.includes('مورد') || lowerCap.includes('intake')) {
        docMarker = '__intake_receipt__';
        detectedLabel = 'إذن استلام وتوريد';
      } else if (lowerCap.includes('صرف') || lowerCap.includes('مبيعات') || lowerCap.includes('delivery_note')) {
        docMarker = '__delivery_note__';
        detectedLabel = 'إذن صرف مبيعات';
      } else if (lowerCap.includes('فاتورة') || lowerCap.includes('إيصال') || lowerCap.includes('ايصال') || lowerCap.includes('تحويل') || lowerCap.includes('إنستا')) {
        docMarker = '__cash_receipt__';
        detectedLabel = 'فاتورة / إيصال دفع';
      }

      const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const fileName = `cash_flow/${uniqueId}${docMarker}.jpg`;

      // Auto-compress photo before upload to save bandwidth & storage
      let uploadBuffer = photoBuffer;
      try {
        const sharpModule = await import('sharp');
        const sharp = sharpModule.default;
        uploadBuffer = await sharp(photoBuffer)
          .resize({ width: 1400, withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
      } catch (sharpErr) {
        console.warn('Sharp compression error, using raw buffer:', sharpErr.message);
      }

      const { error: uploadErr } = await supabase.storage.from('contracts').upload(fileName, uploadBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName);

      const fromId = ctx.from?.id;
      const sess = fromId ? await getUserSession(fromId) : null;
      let isAttached = false;
      let attachSummary = '';

      // Check if caption or vision extracted serials target a specific device
      let targetedDev = null;
      if (caption) {
        const serialMatch = caption.match(/\b\d{3,10}\b/);
        if (serialMatch) {
          const devCheck = await findDeviceInWarehouse(serialMatch[0]);
          if (devCheck.found) targetedDev = devCheck.device;
        }
      }

      if (!targetedDev && visionDocInfo?.serials && Array.isArray(visionDocInfo.serials)) {
        for (const s of visionDocInfo.serials) {
          const cleanS = String(s).replace(/[^0-9]/g, '');
          if (cleanS.length >= 4) {
            const devCheck = await findDeviceInWarehouse(cleanS);
            if (devCheck.found) {
              targetedDev = devCheck.device;
              break;
            }
          }
        }
      }

      let targetDevId = sess?.activeAttachDevId || targetedDev?.id || (sess?.lastDeviceId && (Date.now() - (sess.timestamp || 0) < 2 * 60 * 60 * 1000) ? sess.lastDeviceId : null);
      let activeAttachId = sess?.activeAttachTxId || (sess?.lastTxId && (Date.now() - (sess.timestamp || 0) < 2 * 60 * 60 * 1000) ? sess.lastTxId : null);

      // 🌟 Ultra-smart Fallback: If session was interrupted or missing, auto-detect recent device or transaction from last 2 hours
      if (!activeAttachId && !targetDevId) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        
        // 1. Check most recent device created recently
        const { data: recentDev } = await supabase
          .from('devices')
          .select('id')
          .gte('created_at', twoHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentDev) {
          targetDevId = recentDev.id;
        } else {
          // 2. Check most recent cash_flow created recently without attachment
          const { data: recentCf } = await supabase
            .from('cash_flow')
            .select('*')
            .gte('created_at', twoHoursAgo)
            .not('description', 'ilike', '%__ATTACHMENT__%')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (recentCf) activeAttachId = recentCf.id;
        }
      }

      // 1. Check if we need to attach to devices (contract_images)
      if (targetDevId) {
        const { data: dev } = await supabase.from('devices').select('id, brand, serial_number, customer_name, contract_images, installment_notes').eq('id', targetDevId).maybeSingle();
        if (dev) {
          const batchMatch = (dev.installment_notes || '').match(/#(?:REC|DISP)-\d+/);
          if (batchMatch) {
            const batchId = batchMatch[0];
            const { data: batchDevs } = await supabase.from('devices').select('id, contract_images, serial_number').ilike('installment_notes', `%${batchId}%`);
            if (batchDevs && batchDevs.length > 0) {
              for (const bDev of batchDevs) {
                const bImgs = Array.isArray(bDev.contract_images) ? bDev.contract_images : [];
                if (!bImgs.includes(publicUrl)) {
                  await supabase.from('devices').update({ contract_images: [...bImgs, publicUrl] }).eq('id', bDev.id);
                }
              }
              isAttached = true;
              attachSummary += `📦 <b>إذن مجمع (${batchId}):</b> تم إرفاق المستند بجميع أجهزة الإذن (${batchDevs.length} أجهزة)\n`;
              if (dev.customer_name) attachSummary += `👤 <b>العميل/التاجر:</b> ${dev.customer_name}\n`;
              attachSummary += `📑 <b>تصنيف المستند:</b> ${detectedLabel}\n`;
            }
          } else {
            const existingImgs = Array.isArray(dev.contract_images) ? dev.contract_images : [];
            if (!existingImgs.includes(publicUrl)) {
              await supabase.from('devices').update({ contract_images: [...existingImgs, publicUrl] }).eq('id', targetDevId);
            }
            isAttached = true;
            attachSummary += `🧊 <b>الجهاز:</b> ${dev.brand || 'تكييف'} (سيريال: <code>${dev.serial_number}</code>)\n`;
            if (dev.customer_name) attachSummary += `👤 <b>العميل/التاجر:</b> ${dev.customer_name}\n`;
            attachSummary += `📑 <b>تصنيف المستند:</b> ${detectedLabel}\n`;
          }
        }
      }

      // 2. Check if we need to attach to cash_flow
      if (activeAttachId && !String(activeAttachId).startsWith('dev_')) {
        const { data: row } = await supabase.from('cash_flow').select('*').eq('id', activeAttachId).single();
        if (row) {
          const baseDesc = (row.description || '').replace(/__ATTACHMENT__.*$/, '').trim();
          const updatedDesc = `${baseDesc} __ATTACHMENT__${publicUrl}`;
          await supabase.from('cash_flow').update({ description: updatedDesc }).eq('id', activeAttachId);

          isAttached = true;
          attachSummary += `💰 <b>الحركة المالية:</b> ${row.type} بقيمة <b>${formatEgp(row.amount)}</b>\n📝 <b>البيان:</b> ${baseDesc}\n`;
        }
      }

      if (isAttached) {
        if (fromId) {
          await setUserSession(fromId, { lastTxId: activeAttachId, lastDeviceId: targetDevId, lastUploadedUrl: publicUrl, timestamp: Date.now() });
        }
        await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
        return ctx.reply(`✅ <b>تم إرفاق وتصنيف المستند (${detectedLabel}) بنجاح! 🎯</b>\n\n${attachSummary}🖼️ <a href="${publicUrl}">عرض الصورة المرفوعة في الأرشيف</a>\n\n✨ <i>يظهر زر "📄 عرض المرفق" الآن في الموقع في سجل الأجهزة والعمليات فوراً.</i>`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🗑️ حذف هذا المرفق (إذا رُفع بالخطأ)', callback_data: `delatt_${targetDevId || 'cf'}_${uniqueId}` }
              ]
            ]
          }
        });
      }

      // If no active transaction, parse receipt with Gemini Vision OCR
      let erpResult = null;
      if (caption && caption.trim()) {
        erpResult = await parseERPWithGemini(caption, aiKeys.GEMINI_API_KEY, false);
      } else if (aiKeys.GEMINI_API_KEY) {
        const visionResult = await analyzeReceiptPhotoWithGemini(photoBuffer, aiKeys.GEMINI_API_KEY);
        if (visionResult && visionResult.amount) {
          erpResult = {
            intent: visionResult.type === 'مصروف' ? 'expense' : 'revenue',
            data: {
              amount: Number(visionResult.amount),
              description: visionResult.description || 'إيصال تحويل / فاتورة',
              payment_method: visionResult.payment_method || 'إنستا باي'
            },
            raw_transcription: 'إيصال تحويل'
          };
        }
      }

      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});

      if (erpResult && (erpResult.data?.amount || erpResult.data?.sale_price || erpResult.data?.cost_price)) {
        await handleParsedERPAction(ctx, erpResult, fromId);
      } else {
        return ctx.reply(`📸 <b>تم رفع صورة الفاتورة/التحويل بنجاح! 🎯</b>\n\n💡 <i>يرجى كتابة أو قول تفاصيل الحركة الآن</i>:\n(مثال: <code>تحويل 5000 إنستاباي من عميل</code> أو <code>فاتورة شراء 1200 كاش</code>)\n\nرابط الإيصال المرفق:\n<a href="${publicUrl}">عرض الصورة المرفوعة</a>`, { parse_mode: 'HTML' });
      }

    } catch (err) {
      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
      return ctx.reply(`❌ فشل رفع صورة الإيصال: ${err.message}`);
    }
  });



  // 🔘 Comprehensive 360-Degree Undo Action Callback (Supports Devices, Suppliers, Customers, HR & 24h Expiry)
  bot.action(/^undo_(.+)$/, async (ctx) => {
    const rawInput = ctx.match[1];
    let rawKey = await resolveTxAction(rawInput);

    // Contextual Self-Healing Fallback: If rawKey is an unresolved short key or missing, extract context directly from the message text
    if (!rawKey || rawKey.startsWith('k_') || !rawKey.includes('_')) {
      const msgText = ctx.callbackQuery?.message?.text || '';
      const serialMatch = msgText.match(/(?:السيريال|سيريال|الفانة|فانة)[:\s]+([0-9a-zA-Z]+)/);
      if (serialMatch) {
        const foundSerial = serialMatch[1];
        const { data: matchedDev } = await supabase.from('devices').select('id, serial_number, customer_name').ilike('serial_number', `%${foundSerial}%`).maybeSingle();
        if (matchedDev) {
          const { data: matchedCf } = await supabase.from('cash_flow').select('id').ilike('description', `%${foundSerial}%`).maybeSingle();
          const cfId = matchedCf?.id || '0';

          if (msgText.includes('صرف التاجر') || msgText.includes('للتاجر')) {
            rawKey = `disptrd_${matchedDev.id}_${cfId}`;
          } else if (msgText.includes('صرف العميل') || msgText.includes('للعميل') || msgText.includes('صرف جهاز لعميل')) {
            rawKey = `dispcust_${matchedDev.id}_${cfId}`;
          } else if (msgText.includes('استلام') || msgText.includes('توريد')) {
            rawKey = `intake_${matchedDev.id}_${cfId}`;
          }
        }
      }
    }

    try {
      // Case A: Intake Undo (intake_<devId>_<cfId>)
      if (rawKey.startsWith('intake_')) {
        const parts = rawKey.split('_');
        const devId = parts[1];
        const cfId = parts[2];

        const { data: dev } = await supabase.from('devices').select('*').eq('id', devId).maybeSingle();
        if (!dev) {
          return ctx.answerCbQuery('⚠️ الجهاز محذوف بالفعل أو غير موجود!', { show_alert: true });
        }

        const ageHours = (Date.now() - new Date(dev.created_at || Date.now()).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع عن هذه العملية لأنها تمت منذ أكثر من 24 ساعة!', { show_alert: true });
        }

        const batchMatch = (dev.installment_notes || '').match(/#REC-\d+/);
        let deletedCount = 1;
        let serialsSummary = dev.serial_number;

        if (batchMatch) {
          const batchId = batchMatch[0];
          const { data: batchDevs } = await supabase.from('devices').select('id, serial_number').ilike('installment_notes', `%${batchId}%`);
          if (batchDevs && batchDevs.length > 0) {
            deletedCount = batchDevs.length;
            serialsSummary = batchDevs.map(d => d.serial_number).join(', ');
            const batchIds = batchDevs.map(d => d.id);
            await supabase.from('devices').delete().in('id', batchIds);
          }
          await supabase.from('supplier_transactions').delete().ilike('notes', `%${batchId}%`);
        } else {
          // Delete single device
          await supabase.from('devices').delete().eq('id', devId);
          await supabase.from('supplier_transactions').delete().ilike('notes', `%${dev.serial_number}%`);
        }

        // Revert cash_flow if payment was made
        if (cfId && cfId !== '0') {
          const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
          if (cf) {
            await supabase.from('cash_flow').delete().eq('id', cfId);
            const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
            await updateLiquidity(method, Number(cf.amount || 0));
          }
        }

        await ctx.answerCbQuery('✅ تم التراجع عن توريد الأجهزة وحذفها بالكامل!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن إذن التوريد بالكامل بنجاح!</b>\n\n❌ تم حذف جميع أجهزة الإذن (${deletedCount} أجهزة) [سيريالات: <code>${serialsSummary}</code>] من المخزن وإلغاء القيد من كشف حساب المورد واسترجاع الخزنة.`, { parse_mode: 'HTML' });
      }

      // Case B: Direct Customer Dispatch Undo (dispcust_<devId>_<cfId>)
      if (rawKey.startsWith('dispcust_')) {
        const parts = rawKey.split('_');
        const devId = parts[1];
        const cfId = parts[2];

        const { data: dev } = await supabase.from('devices').select('*').eq('id', devId).maybeSingle();
        if (!dev) {
          return ctx.answerCbQuery('⚠️ الجهاز غير موجود!', { show_alert: true });
        }

        const ageHours = (Date.now() - new Date(dev.installed_at || dev.created_at || Date.now()).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع عن هذه العملية لأنها تمت منذ أكثر من 24 ساعة!', { show_alert: true });
        }

        const batchMatch = (dev.installment_notes || '').match(/#DISP-\d+/);
        let revertedCount = 1;
        let serialsSummary = dev.serial_number;

        const revertPayload = {
          status: 'متاح',
          customer_name: null,
          customer_phone: null,
          customer_address: null,
          sale_price: 0,
          amount_paid: 0,
          amount_remaining: 0,
          installed_at: null,
          installment_months: null,
          installment_monthly: null,
          installment_notes: null
        };

        if (batchMatch) {
          const batchId = batchMatch[0];
          const { data: batchDevs } = await supabase.from('devices').select('id, serial_number').ilike('installment_notes', `%${batchId}%`);
          if (batchDevs && batchDevs.length > 0) {
            revertedCount = batchDevs.length;
            serialsSummary = batchDevs.map(d => d.serial_number).join(', ');
            const batchIds = batchDevs.map(d => d.id);
            await supabase.from('devices').update(revertPayload).in('id', batchIds);
          }
        } else {
          await supabase.from('devices').update(revertPayload).eq('id', devId);
        }

        // Revert cash_flow
        if (cfId && cfId !== '0') {
          const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
          if (cf) {
            await supabase.from('cash_flow').delete().eq('id', cfId);
            const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
            await updateLiquidity(method, -Number(cf.amount || 0));
          }
        }

        await ctx.answerCbQuery('✅ تم التراجع عن الصرف وإعادة الأجهزة للمخزن!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن إذن الصرف بالكامل بنجاح!</b>\n\n❌ تم إلغاء صرف جميع أجهزة الإذن (${revertedCount} أجهزة) [سيريالات: <code>${serialsSummary}</code>] وإعادتها لحالة "متاح" بالمخزن، وتصفير مديونية العميل واسترجاع الخزنة.`, { parse_mode: 'HTML' });
      }

      // Case C: Trader Dispatch Undo (disptrd_<devId>_<cfId>)
      if (rawKey.startsWith('disptrd_')) {
        const parts = rawKey.split('_');
        const devId = parts[1];
        const cfId = parts[2];

        const { data: dev } = await supabase.from('devices').select('*').eq('id', devId).maybeSingle();
        if (!dev) return ctx.answerCbQuery('⚠️ الجهاز غير موجود!', { show_alert: true });

        const ageHours = (Date.now() - new Date(dev.installed_at || dev.created_at || Date.now()).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع عن هذه العملية بعد 24 ساعة!', { show_alert: true });
        }

        const batchMatch = (dev.installment_notes || '').match(/#DISP-\d+/);
        let revertedCount = 1;
        let serialsSummary = dev.serial_number;

        const revertPayload = {
          status: 'متاح',
          customer_name: null,
          sale_price: 0,
          amount_paid: 0,
          amount_remaining: 0,
          installed_at: null,
          installment_notes: null
        };

        if (batchMatch) {
          const batchId = batchMatch[0];
          const { data: batchDevs } = await supabase.from('devices').select('id, serial_number').ilike('installment_notes', `%${batchId}%`);
          if (batchDevs && batchDevs.length > 0) {
            revertedCount = batchDevs.length;
            serialsSummary = batchDevs.map(d => d.serial_number).join(', ');
            const batchIds = batchDevs.map(d => d.id);
            await supabase.from('devices').update(revertPayload).in('id', batchIds);
          }
          await supabase.from('supplier_transactions').delete().ilike('notes', `%${batchId}%`);
        } else {
          await supabase.from('devices').update(revertPayload).eq('id', devId);
          await supabase.from('supplier_transactions').delete().ilike('notes', `%${dev.serial_number}%`);
          if (dev.customer_name) {
            await supabase.from('supplier_transactions').delete().eq('amount', Number(dev.amount_paid || dev.sale_price || 0)).ilike('notes', `%${dev.customer_name}%`);
          }
        }

        if (cfId && cfId !== '0') {
          const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
          if (cf) {
            await supabase.from('cash_flow').delete().eq('id', cfId);
            const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
            await updateLiquidity(method, -Number(cf.amount || 0));
          }
        }

        await ctx.answerCbQuery('✅ تم التراجع عن صرف التاجر وإعادة الأجهزة للمخزن!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن إذن صرف التاجر بالكامل بنجاح!</b>\n\n❌ تم إعادة جميع أجهزة الإذن (${revertedCount} أجهزة) [سيريالات: <code>${serialsSummary}</code>] للمخزن وحذف الحركة من كشف التاجر.`, { parse_mode: 'HTML' });
      }

      // Case D: Supplier Payment Undo (suppay_<cfId>_<supId>)
      if (rawKey.startsWith('suppay_')) {
        const parts = rawKey.split('_');
        const cfId = parts[1];
        const supId = parts[2];

        const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
        if (!cf) return ctx.answerCbQuery('⚠️ الحركة محذوفة بالفعل!', { show_alert: true });

        const ageHours = (Date.now() - new Date(cf.created_at || cf.date || Date.now()).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع بعد 24 ساعة!', { show_alert: true });
        }

        await supabase.from('cash_flow').delete().eq('id', cfId);
        const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
        await updateLiquidity(method, Number(cf.amount || 0));

        if (supId && supId !== '0') {
          await supabase.from('supplier_transactions').delete().eq('supplier_id', supId).eq('transaction_type', 'دفع').eq('amount', cf.amount).order('created_at', { ascending: false }).limit(1);
        }

        await ctx.answerCbQuery('✅ تم التراجع عن سداد المورد بنجاح!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن سداد المورد بنجاح!</b>\n\n❌ تم حذف الدفعة المسددة بقيمة <b>${formatEgp(cf.amount)}</b> واسترجاع رصيد ${method} وتحديث كشف حساب المورد.`, { parse_mode: 'HTML' });
      }

      // Case E: Trader Collection Undo (trdcol_<cfId>_<trdId>)
      if (rawKey.startsWith('trdcol_')) {
        const parts = rawKey.split('_');
        const cfId = parts[1];
        const trdId = parts[2];

        const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
        if (!cf) return ctx.answerCbQuery('⚠️ الحركة محذوفة بالفعل!', { show_alert: true });

        const ageHours = (Date.now() - new Date(cf.created_at || cf.date || Date.now()).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع بعد 24 ساعة!', { show_alert: true });
        }

        await supabase.from('cash_flow').delete().eq('id', cfId);
        const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
        await updateLiquidity(method, -Number(cf.amount || 0));

        if (trdId && trdId !== '0') {
          await supabase.from('supplier_transactions').delete().eq('supplier_id', trdId).eq('transaction_type', 'تحصيل').eq('amount', cf.amount).order('created_at', { ascending: false }).limit(1);
        }

        await ctx.answerCbQuery('✅ تم التراجع عن التحصيل بنجاح!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن تحصيل دفعة التاجر بنجاح!</b>\n\n❌ تم حذف التحصيل بقيمة <b>${formatEgp(cf.amount)}</b> وتحديث كشف حساب التاجر والسيولة.`, { parse_mode: 'HTML' });
      }

      // Case F: Customer Collection Undo (custcol_<cfId>_<devId>_<amt>)
      if (rawKey.startsWith('custcol_')) {
        const parts = rawKey.split('_');
        const cfId = parts[1];
        const devId = parts[2];
        const amt = Number(parts[3] || 0);

        const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
        if (!cf) return ctx.answerCbQuery('⚠️ الحركة محذوفة بالفعل!', { show_alert: true });

        const ageHours = (Date.now() - new Date(cf.created_at || cf.date || Date.now()).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع بعد 24 ساعة!', { show_alert: true });
        }

        await supabase.from('cash_flow').delete().eq('id', cfId);
        const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
        await updateLiquidity(method, -Number(cf.amount || 0));

        if (devId && devId !== '0') {
          const { data: d } = await supabase.from('devices').select('amount_remaining, amount_paid').eq('id', devId).single();
          if (d) {
            await supabase.from('devices').update({
              amount_remaining: Number(d.amount_remaining || 0) + amt,
              amount_paid: Math.max(0, Number(d.amount_paid || 0) - amt)
            }).eq('id', devId);
          }
        }

        await ctx.answerCbQuery('✅ تم التراجع عن تحصيل العميل بنجاح!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن تحصيل العميل بنجاح!</b>\n\n❌ تم إعادة المديونية بقيمة <b>${formatEgp(amt)}</b> على حساب العميل وخصمها من ${method}.`, { parse_mode: 'HTML' });
      }

      // Case F2: Work Order Undo (workorder_<cfId>)
      if (rawKey.startsWith('workorder_')) {
        const cfId = rawKey.split('_')[1];
        if (cfId && cfId !== '0') {
          const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
          if (cf) {
            await supabase.from('cash_flow').delete().eq('id', cfId);
            const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
            await updateLiquidity(method, -Number(cf.amount || 0));
          }
        }
        await ctx.answerCbQuery('✅ تم التراجع عن أمر الشغل بنجاح!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن أمر الشغل بنجاح!</b>\n\n❌ تم حذف قيد أمر الشغل واسترجاع الخزنة.`, { parse_mode: 'HTML' });
      }

      // Case G: Salary Advance Undo (advance_<cfId>_<techId>_<amt>)
      if (rawKey.startsWith('advance_')) {
        const parts = rawKey.split('_');
        const cfId = parts[1];
        const techId = parts[2];
        const amt = Number(parts[3] || 0);

        const { data: cf } = await supabase.from('cash_flow').select('*').eq('id', cfId).maybeSingle();
        if (!cf) return ctx.answerCbQuery('⚠️ الحركة محذوفة بالفعل!', { show_alert: true });

        const ageHours = (Date.now() - new Date(cf.created_at || cf.date || Date.now()).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع بعد 24 ساعة!', { show_alert: true });
        }

        await supabase.from('cash_flow').delete().eq('id', cfId);
        const method = cf.description?.includes(' | ') ? cf.description.split(' | ').pop().trim() : 'خزنة';
        await updateLiquidity(method, Number(cf.amount || 0));

        if (techId && techId !== '0') {
          await supabase.from('salary_advances').delete().eq('technician_id', techId).eq('amount', amt).order('created_at', { ascending: false }).limit(1);
        }

        await ctx.answerCbQuery('✅ تم التراجع عن سلفة الفني بنجاح!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن سلفة الفني بنجاح!</b>\n\n❌ تم حذف السلفة بقيمة <b>${formatEgp(amt)}</b> واسترجاع رصيد ${method} وحذفها من كشف الفني.`, { parse_mode: 'HTML' });
      }

      // Case H: General cash_flow UUID (cf_<id> or raw ID or dev_<id>)
      if (rawKey.startsWith('dev_')) {
        const devId = rawKey.replace('dev_', '');
        const { data: dev } = await supabase.from('devices').select('*').eq('id', devId).maybeSingle();
        if (dev) {
          await supabase.from('devices').delete().eq('id', devId);
          await supabase.from('supplier_transactions').delete().ilike('notes', `%${dev.serial_number}%`);
        }
        await ctx.answerCbQuery('✅ تم التراجع بنجاح!');
        return ctx.editMessageText(`🗑️ <b>تم التراجع عن العملية وحذف الجهاز بنجاح!</b>`, { parse_mode: 'HTML' });
      }

      const cleanId = rawKey.replace(/^cf_/, '');
      const { data: row, error: fetchErr } = await supabase.from('cash_flow').select('*').eq('id', cleanId).maybeSingle();
      if (fetchErr || !row) {
        return ctx.answerCbQuery('⚠️ الحركة محذوفة بالفعل أو غير موجودة!', { show_alert: true });
      }

      const ageHours = (Date.now() - new Date(row.created_at || row.date || Date.now()).getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        return ctx.answerCbQuery('⏰ عذراً، لا يمكن التراجع بعد 24 ساعة!', { show_alert: true });
      }

      await supabase.from('cash_flow').delete().eq('id', cleanId);
      const method = row.description?.includes(' | ') ? row.description.split(' | ').pop().trim() : 'خزنة';
      const reverseFactor = row.type === 'مصروف' ? 1 : -1;
      await updateLiquidity(method, reverseFactor * Number(row.amount || 0));

      await ctx.answerCbQuery('✅ تم حذف الحركة واسترجاع رصيد الخزينة!');
      return ctx.editMessageText(`🗑️ <b>تم التراجع عن الحركة بنجاح!</b>\n\n❌ تم حذف ${row.type} بقيمة <b>${formatEgp(row.amount)}</b> واسترجاع رصيد ${method} لحالته السابقة.`, { parse_mode: 'HTML' });

    } catch (err) {
      console.error('Error undoing transaction:', err);
      return ctx.answerCbQuery(`❌ فشل التراجع: ${err.message}`, { show_alert: true });
    }
  });

  // 💳 Change Payment Method Menu (تغيير الوسيلة)
  bot.action(/^chg_(.+)$/, async (ctx) => {
    const rawInput = ctx.match[1];
    const id = resolveTxAction(rawInput);

    // Enforce 24h security limit
    const { data: row } = await supabase.from('cash_flow').select('*').eq('id', id).maybeSingle();
    if (row && row.created_at) {
      const ageHours = (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        return ctx.answerCbQuery('⏰ عذراً، انتهت مهلة الـ 24 ساعة! لا يمكن تعديل الوسيلة من التليجرام لهذه العملية القديمة (يمكنك التعديل من الموقع).', { show_alert: true });
      }
    }

    await ctx.answerCbQuery();

    const keyboard = {
      inline_keyboard: [
        [
          { text: '💵 خزنة الشركة (كاش)', callback_data: `set_${id}_1` },
          { text: '📱 فودافون كاش', callback_data: `set_${id}_2` }
        ],
        [
          { text: '⚡ إنستا باي', callback_data: `set_${id}_3` },
          { text: '🏦 محفظة بنك مصر', callback_data: `set_${id}_4` }
        ],
        [
          { text: '🏛️ تحويل بنكي (شخصي)', callback_data: `set_${id}_5` },
          { text: '🏢 بنك مصر بيزنيس (شركات)', callback_data: `set_${id}_6` }
        ],
        [
          { text: '↩️ إلغاء والعودة', callback_data: `cancel_${id}` }
        ]
      ]
    };

    return ctx.editMessageText(`💳 <b>اختر وسيلة الدفع الجديدة للحركة:</b>`, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 💳 Set Selected Payment Method
  bot.action(/^set_(.+)_(1|2|3|4|5|6)$/, async (ctx) => {
    const [, id, code] = ctx.match;
    const newMethod = METHOD_CODES[code] || 'خزنة';

    try {
      const { data: row } = await supabase.from('cash_flow').select('*').eq('id', id).single();
      if (!row) return ctx.answerCbQuery('⚠️ الحركة غير موجودة!', { show_alert: true });

      // Enforce 24h security limit
      if (row.created_at) {
        const ageHours = (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
          return ctx.answerCbQuery('⏰ عذراً، انتهت مهلة الـ 24 ساعة! لا يمكن تعديل الوسيلة من التليجرام لهذه العملية القديمة.', { show_alert: true });
        }
      }

      const oldMethod = row.description?.includes(' | ') ? row.description.split(' | ').pop().trim() : 'خزنة';
      const rawDesc = row.description ? row.description.split(' | ')[0] : 'حركة نقدية';
      const updatedDesc = `${rawDesc} | ${newMethod}`;

      await supabase.from('cash_flow').update({ description: updatedDesc }).eq('id', id);

      const amount = Number(row.amount || 0);
      const factor = row.type === 'مصروف' ? -1 : 1;
      await updateLiquidity(oldMethod, -factor * amount);
      await updateLiquidity(newMethod, factor * amount);

      await ctx.answerCbQuery(`✅ تم تحويل الحركة إلى ${newMethod}!`);

      const keyboard = buildTransactionKeyboard(`cf_${id}`);

      return ctx.editMessageText(`✅ <b>تم تعديل وسيلة الحركة بنجاح وتحديث السيولة في الخزنة والموقع!</b>\n\n📌 <b>النوع:</b> ${row.type}\n💰 <b>المبلغ:</b> <b>${formatEgp(amount)}</b>\n💳 <b>الوسيلة الجديدة:</b> ${newMethod}\n\n✨ <i>تم خصم المبلغ من ${oldMethod} وإضافته إلى ${newMethod} وتحديث شاشات المركز المالي فوراً.</i>`, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      return ctx.answerCbQuery(`❌ فشل التعديل: ${err.message}`, { show_alert: true });
    }
  });

  // Cancel menu and restore view
  bot.action(/^cancel_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    await ctx.answerCbQuery();
    const { data: row } = await supabase.from('cash_flow').select('*').eq('id', id).single();
    if (!row) return;

    const keyboard = buildTransactionKeyboard(`cf_${id}`);
    const method = row.description?.includes(' | ') ? row.description.split(' | ').pop().trim() : 'خزنة';
    return ctx.editMessageText(`✅ <b>حركة الخزنة المسجلة:</b>\n\n📌 <b>النوع:</b> ${row.type}\n💰 <b>المبلغ:</b> <b>${formatEgp(row.amount)}</b>\n💳 <b>الوسيلة:</b> ${method}`, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // ⚡ Quick Select Payment Method (for one-tap slot filling)
  bot.action(/^quickpay_(.+)$/, async (ctx) => {
    const method = ctx.match[1];
    const fromId = ctx.from?.id;
    await ctx.answerCbQuery(`تم اختيار ${method}`);

    const userSession = fromId ? await getUserSession(fromId) : null;
    if (!userSession?.pending_erp_session) {
      return ctx.editMessageText('⚠️ <b>انتهت صلاحية الجلسة أو تم إلغاؤها، يرجى إعادة إرسال العملية.</b>', { parse_mode: 'HTML' });
    }

    const pending = userSession.pending_erp_session;
    pending.data.payment_method = method;
    await setUserSession(fromId, {});
    await ctx.deleteMessage().catch(() => {});
    return handleParsedERPAction(ctx, { intent: pending.intent, data: pending.data, raw_transcription: '' }, fromId);
  });

  // ❄️ Quick Select AC Brand Sub-Type (for one-tap model specification)
  bot.action(/^quickbrand_(.+)$/, async (ctx) => {
    const brandType = decodeURIComponent(ctx.match[1]);
    const fromId = ctx.from?.id;
    await ctx.answerCbQuery(`تم اختيار ${brandType}`);

    const userSession = fromId ? await getUserSession(fromId) : null;
    if (!userSession?.pending_erp_session) {
      return ctx.editMessageText('⚠️ <b>انتهت صلاحية الجلسة أو تم إلغاؤها، يرجى إعادة إرسال العملية.</b>', { parse_mode: 'HTML' });
    }

    const pending = userSession.pending_erp_session;
    pending.data.brand = brandType;
    await setUserSession(fromId, {});
    await ctx.deleteMessage().catch(() => {});
    return handleParsedERPAction(ctx, { intent: pending.intent, data: pending.data, raw_transcription: '' }, fromId);
  });

  // 🛠️ Quick Select Work Order Type (صيانة / أعمال إضافية)
  bot.action(/^quickwotype_(.+)$/, async (ctx) => {
    const woType = decodeURIComponent(ctx.match[1]);
    const fromId = ctx.from?.id;
    await ctx.answerCbQuery(`تم اختيار ${woType}`);

    const userSession = fromId ? await getUserSession(fromId) : null;
    if (!userSession?.pending_erp_session) {
      return ctx.editMessageText('⚠️ <b>انتهت صلاحية الجلسة أو تم إلغاؤها، يرجى إعادة إرسال العملية.</b>', { parse_mode: 'HTML' });
    }

    const pending = userSession.pending_erp_session;
    pending.data.work_order_type = woType;
    await setUserSession(fromId, {});
    await ctx.deleteMessage().catch(() => {});
    return handleParsedERPAction(ctx, { intent: pending.intent || 'work_order', data: pending.data, raw_transcription: '' }, fromId);
  });

  // 👨‍🔧 Quick Select Registered Technician (for one-tap technician selection)
  bot.action(/^quicktech_(.+)$/, async (ctx) => {
    const techName = decodeURIComponent(ctx.match[1]);
    const fromId = ctx.from?.id;
    await ctx.answerCbQuery(`تم اختيار الفني ${techName}`);

    const userSession = fromId ? await getUserSession(fromId) : null;
    if (!userSession?.pending_erp_session) {
      return ctx.editMessageText('⚠️ <b>انتهت صلاحية الجلسة أو تم إلغاؤها، يرجى إعادة إرسال العملية.</b>', { parse_mode: 'HTML' });
    }

    const pending = userSession.pending_erp_session;
    pending.data.technicians = techName;

    await setUserSession(fromId, {});
    await ctx.deleteMessage().catch(() => {});
    return handleParsedERPAction(ctx, { intent: pending.intent || 'work_order', data: pending.data, raw_transcription: '' }, fromId);
  });

  // ✅ CONFIRMATION EXECUTION CALLBACK (act_cnf_<actionId>)
  bot.action(/^act_cnf_(.+)$/, async (ctx) => {
    const actionId = ctx.match[1];
    const fromId = ctx.from?.id;
    const sess = fromId ? await getUserSession(fromId) : null;

    const pending = sess?.pending_action;
    if (!pending || pending.id !== actionId) {
      return ctx.answerCbQuery('⚠️ هذه العملية غير موجودة أو تم تنفيذها بالفعل!', { show_alert: true });
    }

    const nowTs = Date.now();
    const executingAt = pending.executing_at || 0;
    if (pending.is_executing && (nowTs - executingAt < 20000)) {
      return ctx.answerCbQuery('⏳ جاري تنفيذ العملية بالفعل، يرجى الانتظار...');
    }

    // 1. Mark as executing to prevent double triggers
    pending.is_executing = true;
    pending.executing_at = nowTs;
    if (fromId) {
      await setUserSession(fromId, { ...sess, pending_action: pending });
    }

    // 2. Immediately replace buttons with a visual loading button
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [
          { text: '⏳ جاري التنفيذ والتثبيت بالمنظومة...', callback_data: 'noop' }
        ]
      ]
    }).catch(() => {});

    await ctx.answerCbQuery('⏳ جاري تنفيذ العملية وتحديث المنظومة...');

    const { intent, data = {} } = pending;

    const safeEditOrReply = async (text, markup) => {
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: markup });
      } catch (editErr) {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: markup });
      }
    };

    try {
      const now = new Date();
      const defaultTodayDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const customDate = normalizeDateStringToIso(data.date);
      const todayDate = customDate || defaultTodayDate;
      const txTimestamp = customDate ? `${customDate}T12:00:00.000Z` : now.toISOString();

      // 1. Dispatch Customer Execution
      if (intent === 'device_dispatch_customer') {
        let matchedTechId = null;
        if (data.technician_name) {
          const tech = await findTechnicianByName(data.technician_name);
          if (tech) matchedTechId = tech.id;
        }

        const salePrice = Number(data.sale_price || 0);
        const amountPaid = Number(data.amount_paid || 0);
        const remaining = data.amount_remaining != null ? Number(data.amount_remaining) : Math.max(0, salePrice - amountPaid);
        const payMethod = data.payment_method || 'خزنة';

        if (data.is_batch && Array.isArray(data.items) && data.items.length > 1) {
          const batchId = `DISP-${Math.floor(100000 + Math.random() * 900000)}`;
          const count = data.items.length;
          const perPaid = Math.round(amountPaid / count);
          let remPaidPool = amountPaid;
          const firstDevId = data.items[0]?.id;

          for (let i = 0; i < data.items.length; i++) {
            const it = data.items[i];
            const thisPaid = (i === count - 1) ? remPaidPool : Math.min(it.sale_price, perPaid);
            remPaidPool -= thisPaid;
            const thisRem = Math.max(0, it.sale_price - thisPaid);

            const batchNote = `[إذن صرف مجمع #${batchId} | عدد ${count} أجهزة | إجمالي الصرف: ${formatEgp(salePrice)}] [سيريال كباس: ${it.outdoor_serial}]`;

            const updPayload = {
              status: 'تم التركيب',
              customer_name: data.customer_name,
              customer_phone: data.customer_phone,
              customer_address: data.customer_address,
              sale_price: it.sale_price,
              amount_paid: thisPaid,
              amount_remaining: thisRem,
              technician_id: matchedTechId || null,
              installed_at: txTimestamp,
              installment_notes: batchNote
            };

            await supabase.from('devices').update(updPayload).eq('id', it.id);
          }

          let insertedTxId = null;
          if (amountPaid > 0) {
            insertedTxId = await processPaymentSplits({
              payments: data.payments,
              totalAmount: amountPaid,
              paymentMethod: payMethod,
              descriptionPrefix: `تحصيل إذن صرف مجمع #${batchId} (${count} أجهزة) للعميل: ${data.customer_name}`,
              todayDate,
              nowIso: txTimestamp,
              txType: 'إيراد'
            });
          }

          await setUserSession(fromId, { lastTxId: insertedTxId, lastDeviceId: firstDevId, timestamp: Date.now() });
          const keyboard = buildTransactionKeyboard(`dispcust_${firstDevId}_${insertedTxId || 0}`);

          return safeEditOrReply(`✅ <b>تم تنفيذ إذن الصرف المجمع (#${batchId}) وتثبيته بالمخزن والمنظومة بنجاح! 🎯</b>\n\n👤 <b>العميل:</b> ${data.customer_name}\n📍 <b>العنوان:</b> ${data.customer_address}\n🔢 <b>عدد الأجهزة المصروفة:</b> ${count} أجهزة\n💰 <b>إجمالي الصرف:</b> ${formatEgp(salePrice)}\n💵 <b>المحصل:</b> ${formatEgp(amountPaid)} (${payMethod})\n⏳ <b>المتبقي:</b> ${formatEgp(remaining)}`, keyboard);
        }

        // Single device handling
        const indoorSerial = data.indoor_serial || `DISP-${Date.now()}`;
        const { data: existingDev } = await supabase
          .from('devices')
          .select('*')
          .eq('serial_number', indoorSerial)
          .maybeSingle();

        const devPayload = {
          brand: data.brand || 'تكييف',
          capacity: data.capacity || '1.5-حصان',
          serial_number: indoorSerial,
          outdoor_serial: data.outdoor_serial || null,
          status: 'تم التركيب',
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          customer_address: data.customer_address,
          sale_price: salePrice,
          amount_paid: amountPaid,
          amount_remaining: remaining,
          technician_id: matchedTechId || existingDev?.technician_id || null,
          installed_at: txTimestamp,
          installment_months: data.installment_months || null,
          installment_monthly: data.installment_monthly || null,
          installment_notes: data.is_installment 
            ? `تقسيط ${data.installment_months} شهر [سيريال كباس: ${data.outdoor_serial || ''}]` 
            : (data.outdoor_serial ? `[سيريال كباس: ${data.outdoor_serial}]` : null)
        };

        const devId = data.db_device_id || existingDev?.id;
        if (devId) {
          let { error: updErr } = await supabase.from('devices').update(devPayload).eq('id', devId);
          if (updErr && updErr.message.includes('outdoor_serial')) {
            delete devPayload.outdoor_serial;
            delete devPayload.installment_months;
            delete devPayload.installment_monthly;
            await supabase.from('devices').update(devPayload).eq('id', devId);
          }

          // Auto-swap compressor on any remaining available device in warehouse if swapped
          if (data.outdoor_serial && existingDev) {
            const { data: otherDev } = await supabase
              .from('devices')
              .select('*')
              .eq('status', 'متاح')
              .neq('id', devId)
              .ilike('installment_notes', `%${data.outdoor_serial}%`)
              .maybeSingle();

            if (otherDev) {
              const oldMatch = (existingDev.installment_notes || '').match(/\[سيريال كباس:\s*([^\]]+)\]/);
              if (oldMatch && oldMatch[1] && oldMatch[1] !== data.outdoor_serial) {
                const oldComp = oldMatch[1].trim();
                const updatedOtherNotes = (otherDev.installment_notes || '').replace(data.outdoor_serial, oldComp);
                await supabase.from('devices').update({ installment_notes: updatedOtherNotes }).eq('id', otherDev.id);
              }
            }
          }
        } else {
          let { error: insErr } = await supabase.from('devices').insert(devPayload);
          if (insErr && insErr.message.includes('outdoor_serial')) {
            delete devPayload.outdoor_serial;
            delete devPayload.installment_months;
            delete devPayload.installment_monthly;
            await supabase.from('devices').insert(devPayload);
          }
        }

        let insertedTxId = null;
        if (amountPaid > 0) {
          insertedTxId = await processPaymentSplits({
            payments: data.payments,
            totalAmount: amountPaid,
            paymentMethod: payMethod,
            descriptionPrefix: `تحصيل بيع جهاز (${data.brand || 'تكييف'} ${data.capacity || ''}) للعميل: ${data.customer_name}`,
            todayDate,
            nowIso: txTimestamp,
            txType: 'إيراد'
          });
        }

        await setUserSession(fromId, { lastTxId: insertedTxId, lastDeviceId: devId, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`dispcust_${devId}_${insertedTxId || 0}`);

        return safeEditOrReply(`✅ <b>تم تنفيذ إذن صرف العميل المباشر وتحديث المنظومة بنجاح! 🎯</b>\n\n👤 <b>العميل:</b> ${data.customer_name}\n📍 <b>العنوان:</b> ${data.customer_address}\n❄️ <b>الجهاز:</b> ${data.brand || 'تكييف'} (${data.capacity || ''})\n🧊 <b>سيريال الفانة:</b> <code>${indoorSerial}</code>\n${data.outdoor_serial ? `🔥 <b>سيريال الكباس:</b> <code>${data.outdoor_serial}</code>\n` : ''}💰 <b>سعر البيع:</b> ${formatEgp(salePrice)}\n💵 <b>المحصل:</b> ${formatEgp(amountPaid)} (${payMethod})\n⏳ <b>المتبقي:</b> ${formatEgp(remaining)}`, keyboard);
      }

      // 2. Dispatch Trader Execution
      if (intent === 'device_dispatch_trader') {
        const divInfo = normalizeDiverseSupplier(data.trader_name);
        const effectiveTraderName = divInfo.isDiverse ? divInfo.fullDisplayName : (data.trader_name || 'تاجر');
        const trader = await findOrCreateSupplier(effectiveTraderName);
        const salePrice = Number(data.sale_price || 0);
        const amountPaid = Number(data.amount_paid || 0);
        const remaining = data.amount_remaining != null ? Number(data.amount_remaining) : Math.max(0, salePrice - amountPaid);
        const payMethod = data.payment_method || 'آجل';

        if (data.is_batch && Array.isArray(data.items) && data.items.length > 1) {
          const batchId = `DISP-${Math.floor(100000 + Math.random() * 900000)}`;
          const count = data.items.length;
          const perPaid = Math.round(amountPaid / count);
          let remPaidPool = amountPaid;
          const firstDevId = data.items[0]?.id;

          for (let i = 0; i < data.items.length; i++) {
            const it = data.items[i];
            const thisPaid = (i === count - 1) ? remPaidPool : Math.min(it.sale_price, perPaid);
            remPaidPool -= thisPaid;
            const thisRem = Math.max(0, it.sale_price - thisPaid);

            const actualTraderTag = (divInfo.isDiverse && divInfo.subMerchantName) ? ` [التاجر الفعلي: ${divInfo.subMerchantName}]` : '';
            const batchNote = `[إذن صرف مجمع #${batchId} | عدد ${count} أجهزة | إجمالي الصرف: ${formatEgp(salePrice)}] [سيريال كباس: ${it.outdoor_serial}]${actualTraderTag}`;

            const updPayload = {
              status: 'تم التركيب',
              customer_name: effectiveTraderName,
              sale_price: it.sale_price,
              amount_paid: thisPaid,
              amount_remaining: thisRem,
              installed_at: txTimestamp,
              installment_notes: batchNote
            };

            await supabase.from('devices').update(updPayload).eq('id', it.id);
          }

          let insertedTxId = null;
          if (trader) {
            await supabase.from('supplier_transactions').insert({
              supplier_id: trader.id,
              transaction_type: 'بيع',
              amount: salePrice,
              notes: `صرف إذن مجمع #${batchId} (${count} أجهزة) للتاجر: ${effectiveTraderName}`,
              created_at: txTimestamp
            });

            if (amountPaid > 0) {
              await supabase.from('supplier_transactions').insert({
                supplier_id: trader.id,
                transaction_type: 'تحصيل',
                amount: amountPaid,
                notes: `تحصيل من التاجر ${effectiveTraderName} عن إذن مجمع #${batchId} | ${payMethod}`,
                created_at: txTimestamp
              });

              insertedTxId = await processPaymentSplits({
                payments: data.payments,
                totalAmount: amountPaid,
                paymentMethod: payMethod,
                descriptionPrefix: `تحصيل إذن صرف مجمع #${batchId} من التاجر: ${effectiveTraderName}`,
                todayDate,
                nowIso: txTimestamp,
                txType: 'إيراد'
              });
            }
          }

          await setUserSession(fromId, { lastTxId: insertedTxId, lastDeviceId: firstDevId, timestamp: Date.now() });
          const keyboard = buildTransactionKeyboard(`disptrd_${firstDevId}_${insertedTxId || 0}`);

          return safeEditOrReply(`✅ <b>تم تنفيذ إذن صرف التاجر المجمع (#${batchId}) بنجاح! 🎯</b>\n\n🤝 <b>التاجر:</b> ${getTraderNameWithCode(effectiveTraderName)}\n🔢 <b>عدد الأجهزة:</b> ${count} أجهزة\n💰 <b>إجمالي القيمة:</b> ${formatEgp(salePrice)}\n💵 <b>المدفوع:</b> ${formatEgp(amountPaid)} (${payMethod})\n⏳ <b>المتبقي بحساب التاجر:</b> ${formatEgp(remaining)}`, keyboard);
        }

        // Single device handling
        const indoorSerial = data.indoor_serial || `TRD-${Date.now()}`;
        const { data: existingDev } = await supabase
          .from('devices')
          .select('*')
          .eq('serial_number', indoorSerial)
          .maybeSingle();

        const actualTraderTag = (divInfo.isDiverse && divInfo.subMerchantName) ? `[التاجر الفعلي: ${divInfo.subMerchantName}]` : '';
        const notesParts = [];
        if (data.outdoor_serial) notesParts.push(`[سيريال كباس: ${data.outdoor_serial}]`);
        if (actualTraderTag) notesParts.push(actualTraderTag);
        const devNotes = notesParts.join(' ') || null;

        const trdPayload = {
          brand: data.brand || 'تكييف',
          capacity: data.capacity || '1.5-حصان',
          serial_number: indoorSerial,
          outdoor_serial: data.outdoor_serial || null,
          status: 'تم التركيب',
          customer_name: effectiveTraderName,
          sale_price: salePrice,
          amount_paid: amountPaid,
          amount_remaining: remaining,
          installed_at: txTimestamp,
          installment_notes: devNotes
        };

        const trdDevId = data.db_device_id || existingDev?.id;
        if (trdDevId) {
          let { error: updErr } = await supabase.from('devices').update(trdPayload).eq('id', trdDevId);
          if (updErr && updErr.message.includes('outdoor_serial')) {
            delete trdPayload.outdoor_serial;
            await supabase.from('devices').update(trdPayload).eq('id', trdDevId);
          }

          // Auto-swap compressor on any remaining available device in warehouse if swapped
          if (data.outdoor_serial && existingDev) {
            const { data: otherDev } = await supabase
              .from('devices')
              .select('*')
              .eq('status', 'متاح')
              .neq('id', trdDevId)
              .ilike('installment_notes', `%${data.outdoor_serial}%`)
              .maybeSingle();

            if (otherDev) {
              const oldMatch = (existingDev.installment_notes || '').match(/\[سيريال كباس:\s*([^\]]+)\]/);
              if (oldMatch && oldMatch[1] && oldMatch[1] !== data.outdoor_serial) {
                const oldComp = oldMatch[1].trim();
                const updatedOtherNotes = (otherDev.installment_notes || '').replace(data.outdoor_serial, oldComp);
                await supabase.from('devices').update({ installment_notes: updatedOtherNotes }).eq('id', otherDev.id);
              }
            }
          }
        } else {
          let { error: insErr } = await supabase.from('devices').insert(trdPayload);
          if (insErr && insErr.message.includes('outdoor_serial')) {
            delete trdPayload.outdoor_serial;
            await supabase.from('devices').insert(trdPayload);
          }
        }

        let insertedTxId = null;
        if (trader) {
          await supabase.from('supplier_transactions').insert({
            supplier_id: trader.id,
            transaction_type: 'بيع',
            amount: salePrice,
            notes: `صرف وبيع تكييف ${data.brand || ''} (${data.capacity || ''}) - سيريال: ${indoorSerial} | التاجر: ${effectiveTraderName}`,
            created_at: txTimestamp
          });

          if (amountPaid > 0) {
            await supabase.from('supplier_transactions').insert({
              supplier_id: trader.id,
              transaction_type: 'تحصيل',
              amount: amountPaid,
              notes: `تحصيل من التاجر ${effectiveTraderName} | ${payMethod}`,
              created_at: txTimestamp
            });

            insertedTxId = await processPaymentSplits({
              payments: data.payments,
              totalAmount: amountPaid,
              paymentMethod: payMethod,
              descriptionPrefix: `تحصيل بيع جهاز من التاجر: ${effectiveTraderName}`,
              todayDate,
              nowIso: txTimestamp,
              txType: 'إيراد'
            });
          }
        }

        await setUserSession(fromId, { lastTxId: insertedTxId, lastDeviceId: trdDevId, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`disptrd_${trdDevId}_${insertedTxId || 0}`);

        return safeEditOrReply(`✅ <b>تم تنفيذ إذن صرف التاجر وتسجيله في حساب التاجر والمخزن بنجاح! 🎯</b>\n\n🤝 <b>التاجر:</b> ${getTraderNameWithCode(effectiveTraderName)}\n❄️ <b>الجهاز:</b> ${data.brand || 'تكييف'} (${data.capacity || ''})\n🧊 <b>السيريال:</b> <code>${indoorSerial}</code>\n💰 <b>إجمالي القيمة:</b> ${formatEgp(salePrice)}\n💵 <b>المدفوع:</b> ${formatEgp(amountPaid)} (${payMethod})\n⏳ <b>المتبقي بحساب التاجر:</b> ${formatEgp(remaining)}`, keyboard);
      }

      // 3. Device Intake Execution
      if (intent === 'device_intake') {
        const divInfo = normalizeDiverseSupplier(data.supplier_name);
        const effectiveSupplierName = divInfo.isDiverse ? divInfo.fullDisplayName : (data.supplier_name || 'مورد');
        const supplier = await findOrCreateSupplier(effectiveSupplierName);
        const costPrice = Number(data.cost_price || 0);
        const amountPaid = Number(data.amount_paid || 0);
        const remaining = data.amount_remaining != null ? Number(data.amount_remaining) : Math.max(0, costPrice - amountPaid);
        const payMethod = data.payment_method || 'آجل';

        if (data.is_batch && Array.isArray(data.items) && data.items.length > 1) {
          const batchId = `REC-${Math.floor(100000 + Math.random() * 900000)}`;
          const count = data.items.length;
          let firstDevId = null;

          for (let i = 0; i < data.items.length; i++) {
            const it = data.items[i];
            const actualSupplierTag = (divInfo.isDiverse && divInfo.subMerchantName) ? ` [المورد الفعلي: ${divInfo.subMerchantName}]` : '';
            const batchNote = `[إذن استلام مجمع #${batchId} | عدد ${count} أجهزة | إجمالي الإذن: ${formatEgp(costPrice)}] [سيريال كباس: ${it.outdoor_serial}]${actualSupplierTag}`;

            const intakePayload = {
              brand: it.brand || data.brand,
              capacity: it.capacity || data.capacity,
              serial_number: it.indoor_serial,
              outdoor_serial: it.outdoor_serial || null,
              cost_price: it.cost_price || Math.round(costPrice / count),
              supplier_id: supplier ? supplier.id : null,
              status: 'متاح',
              installment_notes: batchNote,
              created_at: txTimestamp
            };

            let { error: insErr } = await supabase.from('devices').insert(intakePayload);
            if (insErr && insErr.message.includes('outdoor_serial')) {
              delete intakePayload.outdoor_serial;
              await supabase.from('devices').insert(intakePayload);
            }

            const { data: createdDev } = await supabase.from('devices').select('id').eq('serial_number', it.indoor_serial).order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (i === 0) firstDevId = createdDev?.id;
          }

          let insertedTxId = null;
          if (supplier) {
            const actualSupNote = (divInfo.isDiverse && divInfo.subMerchantName) ? ` | المورد الفعلي: ${divInfo.subMerchantName}` : '';
            await supabase.from('supplier_transactions').insert({
              supplier_id: supplier.id,
              transaction_type: 'شراء',
              amount: costPrice,
              notes: `توريد إذن مجمع #${batchId} (${count} أجهزة) من المورد: ${effectiveSupplierName}${actualSupNote}`,
              created_at: txTimestamp
            });

            if (amountPaid > 0) {
              await supabase.from('supplier_transactions').insert({
                supplier_id: supplier.id,
                transaction_type: 'دفع',
                amount: amountPaid,
                notes: `سداد توريد إذن مجمع #${batchId} للمورد ${effectiveSupplierName} | ${payMethod}`,
                created_at: txTimestamp
              });

              insertedTxId = await processPaymentSplits({
                payments: data.payments,
                totalAmount: amountPaid,
                paymentMethod: payMethod,
                descriptionPrefix: `سداد إذن توريد مجمع #${batchId} للمورد: ${effectiveSupplierName}`,
                todayDate,
                nowIso: txTimestamp,
                txType: 'مصروف'
              });
            }
          }

          await setUserSession(fromId, { lastTxId: insertedTxId, lastDeviceId: firstDevId, timestamp: Date.now() });
          const keyboard = buildTransactionKeyboard(`intake_${firstDevId || 0}_${insertedTxId || 0}`);

          return safeEditOrReply(`✅ <b>تم استلام وتوريد الإذن المجمع (#${batchId}) بالمخزن وحساب المورد بنجاح! 🎯</b>\n\n🏢 <b>المورد:</b> ${getTraderNameWithCode(effectiveSupplierName)}\n🔢 <b>عدد الأجهزة:</b> ${count} أجهزة\n💰 <b>إجمالي تكلفة الشراء:</b> ${formatEgp(costPrice)}\n💵 <b>المسدد للمورد:</b> ${formatEgp(amountPaid)} (${payMethod})\n⏳ <b>المتبقي للمورد:</b> ${formatEgp(remaining)}`, keyboard);
        }

        // Single device handling
        const indoorSerial = data.indoor_serial;
        const actualSupplierTag = (divInfo.isDiverse && divInfo.subMerchantName) ? `[المورد الفعلي: ${divInfo.subMerchantName}]` : '';
        const notesParts = [];
        if (data.outdoor_serial) notesParts.push(`[سيريال كباس: ${data.outdoor_serial}]`);
        if (actualSupplierTag) notesParts.push(actualSupplierTag);
        const devNotes = notesParts.join(' ') || null;

        const intakePayload = {
          brand: data.brand,
          capacity: data.capacity,
          serial_number: indoorSerial,
          outdoor_serial: data.outdoor_serial || null,
          cost_price: costPrice,
          supplier_id: supplier ? supplier.id : null,
          status: 'متاح',
          installment_notes: devNotes,
          created_at: txTimestamp
        };

        let { error: insErr } = await supabase.from('devices').insert(intakePayload);
        if (insErr && insErr.message.includes('outdoor_serial')) {
          delete intakePayload.outdoor_serial;
          await supabase.from('devices').insert(intakePayload);
        }

        const { data: createdDev } = await supabase.from('devices').select('id').eq('serial_number', indoorSerial).order('created_at', { ascending: false }).limit(1).maybeSingle();
        const intakeDevId = createdDev?.id;

        let insertedTxId = null;
        if (supplier) {
          const actualSupNote = (divInfo.isDiverse && divInfo.subMerchantName) ? ` | المورد الفعلي: ${divInfo.subMerchantName}` : '';
          await supabase.from('supplier_transactions').insert({
            supplier_id: supplier.id,
            transaction_type: 'شراء',
            amount: costPrice,
            notes: `توريد تكييف ${data.brand} (${data.capacity}) - سيريال فانة: ${indoorSerial}${data.outdoor_serial ? ` / كباس: ${data.outdoor_serial}` : ''}${actualSupNote}`,
            created_at: txTimestamp
          });

          if (amountPaid > 0) {
            await supabase.from('supplier_transactions').insert({
              supplier_id: supplier.id,
              transaction_type: 'دفع',
              amount: amountPaid,
              notes: `سداد دفعة توريد للمورد ${effectiveSupplierName} | ${payMethod}`,
              created_at: txTimestamp
            });

            insertedTxId = await processPaymentSplits({
              payments: data.payments,
              totalAmount: amountPaid,
              paymentMethod: payMethod,
              descriptionPrefix: `سداد توريد تكييف للمورد: ${effectiveSupplierName}`,
              todayDate,
              nowIso: txTimestamp,
              txType: 'مصروف'
            });
          }
        }

        await setUserSession(fromId, { lastTxId: insertedTxId, lastDeviceId: intakeDevId, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`intake_${intakeDevId}_${insertedTxId || 0}`);

        return safeEditOrReply(`✅ <b>تم استلام وتوريد الجهاز وإضافته للمخزن وحساب المورد بنجاح! 🎯</b>\n\n🏢 <b>المورد:</b> ${getTraderNameWithCode(effectiveSupplierName)}\n❄️ <b>الموديل:</b> ${data.brand}\n⚡ <b>القدرة:</b> ${data.capacity}\n🧊 <b>سيريال الفانة (الداخلي):</b> <code>${indoorSerial}</code>\n${data.outdoor_serial ? `🔥 <b>سيريال الكباس (الخارجي):</b> <code>${data.outdoor_serial}</code>\n` : ''}💰 <b>تكلفة الشراء:</b> ${formatEgp(costPrice)}\n💵 <b>المسدد للمورد:</b> ${formatEgp(amountPaid)} (${payMethod})`, keyboard);
      }

      // 4. Supplier Payment Execution
      if (intent === 'supplier_payment') {
        const divInfo = normalizeDiverseSupplier(data.supplier_name);
        const effectiveSupplierName = divInfo.isDiverse ? divInfo.fullDisplayName : (data.supplier_name || 'مورد');
        const supplier = await findOrCreateSupplier(effectiveSupplierName);
        const amt = Number(data.amount || 0);
        const payMethod = data.payment_method || 'خزنة';

        if (supplier) {
          await supabase.from('supplier_transactions').insert({
            supplier_id: supplier.id,
            transaction_type: 'دفع',
            amount: amt,
            notes: data.description || `سداد دفعة للمورد ${effectiveSupplierName} | ${payMethod}`,
            created_at: txTimestamp
          });
        }

        const insertedTxId = await processPaymentSplits({
          payments: data.payments,
          totalAmount: amt,
          paymentMethod: payMethod,
          descriptionPrefix: data.description || `سداد دفعة للمورد: ${effectiveSupplierName}`,
          todayDate,
          nowIso: txTimestamp,
          txType: 'مصروف'
        });

        await setUserSession(fromId, { lastTxId: insertedTxId, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`suppay_${insertedTxId || 0}_${supplier?.id || 0}`);

        return safeEditOrReply(`✅ <b>تم تسجيل سداد الدفعة للمورد بنجاح! 🎯</b>\n\n🏢 <b>المورد:</b> ${getTraderNameWithCode(effectiveSupplierName)}\n💰 <b>المبلغ:</b> <b>${formatEgp(amt)}</b>\n💳 <b>الوسيلة:</b> ${payMethod}\n📝 <b>البيان:</b> ${data.description || 'سداد دفعة من الحساب'}`, keyboard);
      }

      // 5. Trader Collection Execution
      if (intent === 'trader_collection') {
        const divInfo = normalizeDiverseSupplier(data.trader_name);
        const effectiveTraderName = divInfo.isDiverse ? divInfo.fullDisplayName : (data.trader_name || 'تاجر');
        const trader = await findOrCreateSupplier(effectiveTraderName);
        const amt = Number(data.amount || 0);
        const payMethod = data.payment_method || 'إنستا باي';

        if (trader) {
          await supabase.from('supplier_transactions').insert({
            supplier_id: trader.id,
            transaction_type: 'تحصيل',
            amount: amt,
            notes: data.description || `تحصيل من التاجر ${effectiveTraderName} | ${payMethod}`,
            created_at: txTimestamp
          });
        }

        const insertedTxId = await processPaymentSplits({
          payments: data.payments,
          totalAmount: amt,
          paymentMethod: payMethod,
          descriptionPrefix: data.description || `تحصيل من التاجر: ${effectiveTraderName}`,
          todayDate,
          nowIso: txTimestamp,
          txType: 'إيراد'
        });

        await setUserSession(fromId, { lastTxId: insertedTxId, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`trdcol_${insertedTxId || 0}_${trader?.id || 0}`);

        return safeEditOrReply(`✅ <b>تم تسجيل تحصيل الدفعة من التاجر بنجاح! 🎯</b>\n\n🤝 <b>التاجر:</b> ${getTraderNameWithCode(effectiveTraderName)}\n💰 <b>المبلغ المحصل:</b> <b>${formatEgp(amt)}</b>\n💳 <b>الوسيلة:</b> ${payMethod}\n📝 <b>البيان:</b> ${data.description || 'تحصيل دفعة حساب'}`, keyboard);
      }

      // 5b. Customer Collection Execution (تحصيل من عميل مباشر وتحديث مديونية أجهزته)
      if (intent === 'customer_collection') {
        const custName = data.customer_name;
        const amt = Number(data.amount || 0);
        const payMethod = data.payment_method || 'خزنة';

        const custMatch = await findExistingCustomer(data.customer_phone, custName);
        const resolvedCustName = custMatch ? custMatch.customer.customer_name : custName;

        // 1. Find device(s) of this customer that have amount_remaining > 0
        let { data: custDevs } = await supabase
          .from('devices')
          .select('*')
          .ilike('customer_name', `%${resolvedCustName}%`)
          .gt('amount_remaining', 0)
          .order('installed_at', { ascending: true });

        if (!custDevs || custDevs.length === 0) {
          const firstWord = custName.trim().split(/\s+/)[0];
          const { data: fallbackDevs } = await supabase
            .from('devices')
            .select('*')
            .ilike('customer_name', `%${firstWord}%`)
            .gt('amount_remaining', 0)
            .order('installed_at', { ascending: true });
          custDevs = fallbackDevs || [];
        }

        let devIdToAttach = null;
        let totalDeducted = 0;
        let currentTotalRemaining = 0;

        if (custDevs && custDevs.length > 0) {
          let remToDeduct = amt;
          for (const d of custDevs) {
            devIdToAttach = d.id;
            const currentRem = Number(d.amount_remaining || 0);
            const currentPaid = Number(d.amount_paid || 0);
            const deduction = Math.min(remToDeduct, currentRem);
            const newRem = Math.max(0, currentRem - deduction);
            const newPaid = currentPaid + deduction;
            await supabase.from('devices').update({ amount_remaining: newRem, amount_paid: newPaid }).eq('id', d.id);
            remToDeduct -= deduction;
            totalDeducted += deduction;
            currentTotalRemaining += newRem;
          }
        }

        // 2. Insert into cash_flow & update liquidity
        const insertedTxId = await processPaymentSplits({
          payments: data.payments,
          totalAmount: amt,
          paymentMethod: payMethod,
          descriptionPrefix: `تحصيل دفعة متبقي من العميل: ${custName}`,
          todayDate,
          nowIso: txTimestamp,
          txType: 'إيراد'
        });

        await setUserSession(fromId, { lastTxId: insertedTxId, lastDeviceId: devIdToAttach, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`custcol_${insertedTxId || 0}_${devIdToAttach || 0}_${amt}`);

        let remMsg = currentTotalRemaining > 0 ? `\n⏳ <b>المتبقي على العميل حالياً:</b> <b>${formatEgp(currentTotalRemaining)}</b>` : `\n🎉 <b>تم سداد كامل حساب العميل وأصبح حسابه 0 ج.م ✅</b>`;

        return safeEditOrReply(`✅ <b>تم تسجيل تحصيل الدفعة من العميل وتحديث حسابه والسيولة بنجاح! 🎯</b>\n\n👤 <b>العميل:</b> ${custName}\n💰 <b>المبلغ المحصل:</b> <b>${formatEgp(amt)}</b>\n💳 <b>الوسيلة:</b> ${payMethod}\n📝 <b>البيان:</b> ${data.description || 'سداد متبقي حساب جهاز'}${remMsg}\n\n✨ <i>تم إضافة المبلغ إلى ${payMethod} وتحديث كشف العميل والمركز المالي فوراً.</i>`, keyboard);
      }

      // 5c. Work Order Execution (أمر شغل: صيانة / أعمال إضافية)
      if (intent === 'work_order') {
        const amountPaid = Number(data.amount_paid != null ? data.amount_paid : (data.amount || 0));
        const payMethod = data.payment_method || 'خزنة';
        const workType = data.work_order_type || 'صيانة';
        const techsStr = data.technicians || data.technician_name || 'فني';
        const desc = `أمر شغل (${workType}): ${data.description || 'صيانة/أعمال إضافية'} | العميل: ${data.customer_name} | تليفون: ${data.customer_phone || '_'} | عنوان: ${data.customer_address || '_'} | [الفني: ${techsStr}] | ${payMethod}`;

        let insertedTxId = null;
        if (amountPaid > 0) {
          insertedTxId = await processPaymentSplits({
            payments: data.payments,
            totalAmount: amountPaid,
            paymentMethod: payMethod,
            descriptionPrefix: desc,
            todayDate,
            nowIso: txTimestamp,
            txType: 'إيراد'
          });
        }

        await setUserSession(fromId, { lastTxId: insertedTxId, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`workorder_${insertedTxId || 0}`);

        return ctx.editMessageText(`✅ <b>تم تنفيذ وتسجيل أمر الشغل وتوريد النقدية بنجاح! 🎯</b>\n\n🛠️ <b>نوع أمر الشغل:</b> ${workType}\n👤 <b>العميل:</b> ${data.customer_name}\n📱 <b>الهاتف:</b> ${data.customer_phone || 'غير مسجل'}\n📍 <b>العنوان:</b> ${data.customer_address || 'غير محدد'}\n📝 <b>العمل المنفذ:</b> ${data.description}\n👨‍🔧 <b>فريق العمل / الفنيين:</b> ${techsStr}\n💵 <b>المبلغ المحصل:</b> ${formatEgp(amountPaid)} (${payMethod})`, { parse_mode: 'HTML', reply_markup: keyboard });
      }

      // 6. Salary Advance Execution
      if (intent === 'salary_advance') {
        const tech = await findTechnicianByName(data.technician_name);
        const amt = Number(data.amount || 0);
        const payMethod = data.payment_method || 'خزنة';

        if (tech) {
          await supabase.from('salary_advances').insert({
            technician_id: tech.id,
            amount: amt,
            date: todayDate,
            notes: data.description || 'سلفة نقدية',
            created_at: txTimestamp
          });
        }

        const insertedTxId = await processPaymentSplits({
          payments: data.payments,
          totalAmount: amt,
          paymentMethod: payMethod,
          descriptionPrefix: `سلفة للفني: ${data.technician_name}`,
          todayDate,
          nowIso: txTimestamp,
          txType: 'مصروف'
        });

        await setUserSession(fromId, { lastTxId: insertedTxId, timestamp: Date.now() });
        const keyboard = buildTransactionKeyboard(`advance_${insertedTxId || 0}_${tech?.id || 0}_${amt}`);

        return safeEditOrReply(`✅ <b>تم تسجيل سلفة الفني وخصمها من الخزينة بنجاح! 🎯</b>\n\n👨‍🔧 <b>الفني:</b> ${data.technician_name}\n💰 <b>مبلغ السلفة:</b> <b>${formatEgp(amt)}</b>\n💳 <b>الوسيلة:</b> ${payMethod}`, keyboard);
      }

      // 7. General Expense / Revenue Execution
      const isRevenue = data.type === 'إيراد';
      const amt = Number(data.amount || 0);
      const payMethod = data.payment_method || 'خزنة';

      const insertedTxId = await processPaymentSplits({
        payments: data.payments,
        totalAmount: amt,
        paymentMethod: payMethod,
        descriptionPrefix: data.description,
        todayDate,
        nowIso: txTimestamp,
        txType: isRevenue ? 'إيراد' : 'مصروف'
      });

      await setUserSession(fromId, { lastTxId: insertedTxId, timestamp: Date.now() });
      const keyboard = buildTransactionKeyboard(`cf_${insertedTxId || 0}`);

      return safeEditOrReply(`✅ <b>تم تسجيل ${data.type} في الخزينة وتحديث السيولة بنجاح! 🎯</b>\n\n📌 <b>النوع:</b> ${isRevenue ? '🟢 إيراد' : '🔴 مصروف'}\n💰 <b>المبلغ:</b> <b>${formatEgp(amt)}</b>\n📝 <b>البيان:</b> ${data.description}\n💳 <b>الوسيلة:</b> ${payMethod}`, keyboard);

    } catch (err) {
      console.error('Error confirming action:', err);
      if (fromId) {
        const currentSess = await getUserSession(fromId);
        if (currentSess?.pending_action) {
          currentSess.pending_action.is_executing = false;
          await setUserSession(fromId, currentSess);
        }
      }
      return ctx.editMessageText(`❌ <b>فشل تنفيذ العملية:</b> ${err.message}`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 إعادة المحاولة', callback_data: `act_cnf_${actionId}` }],
            [{ text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }]
          ]
        }
      }).catch(() => ctx.reply(`❌ فشل تنفيذ العملية: ${err.message}`));
    }
  });

  // ❌ CANCEL ACTION CALLBACK (act_ccl_<actionId>)
  bot.action(/^act_ccl_(.+)$/, async (ctx) => {
    const fromId = ctx.from?.id;
    if (fromId) {
      await setUserSession(fromId, {});
    }
    await ctx.answerCbQuery('تم إلغاء العملية');
    return ctx.editMessageText('❌ <b>تم إلغاء العملية وتصفير كافة البيانات بنجاح.</b>', { parse_mode: 'HTML' });
  });

  // ✏️ EDIT PENDING ACTION CALLBACK (act_edit_<actionId>)
  bot.action(/^act_edit_(.+)$/, async (ctx) => {
    const actionId = ctx.match[1];
    const fromId = ctx.from?.id;
    const sess = fromId ? await getUserSession(fromId) : null;
    const pending = sess?.pending_action;

    if (!pending || pending.id !== actionId) {
      return ctx.answerCbQuery('⚠️ هذه العملية غير موجودة أو تم تنفيذها بالفعل!', { show_alert: true });
    }

    await ctx.answerCbQuery('✏️ أرسل التعديل في فويس أو رسالة');

    // Restore into pending_erp_session for slot-filling correction
    await setUserSession(fromId, {
      ...sess,
      pending_erp_session: { intent: pending.intent, data: pending.data, timestamp: Date.now() }
    });

    const displayDate = pending.data.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

    let msg = `✏️ <b>تعديل بيانات الحركة المراجعة:</b>\n\n`;
    msg += `📌 <b>البيانات المسجلة حالياً:</b>\n`;
    if (pending.data.customer_name) msg += `• 👤 <b>الاسم:</b> ${pending.data.customer_name}\n`;
    if (pending.data.trader_name) msg += `• 🤝 <b>التاجر:</b> ${pending.data.trader_name}\n`;
    if (pending.data.supplier_name) msg += `• 🏢 <b>المورد:</b> ${pending.data.supplier_name}\n`;
    if (pending.data.customer_address) msg += `• 📍 <b>العنوان:</b> ${pending.data.customer_address}\n`;
    if (pending.data.customer_phone) msg += `• 📱 <b>الهاتف:</b> ${pending.data.customer_phone}\n`;
    if (pending.data.sale_price) msg += `• 💰 <b>السعر:</b> ${formatEgp(pending.data.sale_price)}\n`;
    if (pending.data.cost_price) msg += `• 💰 <b>التكلفة:</b> ${formatEgp(pending.data.cost_price)}\n`;
    msg += `• 📅 <b>التاريخ:</b> ${displayDate}\n\n`;
    msg += `🎙️ <b>أرسل الآن البيان المراد تصحيحه في فويس أو رسالة نصية:</b>\n`;
    msg += `• <i>"الاسم صلاح عبدالغني السيد"</i>\n`;
    msg += `• <i>"العنوان 5 شارع النصر"</i>\n`;
    msg += `• <i>"التاريخ 15 اغسطس"</i>\n`;
    msg += `• <i>"السعر 25000"</i>\n\n`;
    msg += `✨ <i>سيتم تحديث الإذن فوراً وإعادة عرض الكارت بالبيانات المعدلة.</i>`;

    return ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🗑️ إلغاء العملية وتصفير البيانات', callback_data: 'act_ccl_pending' }
          ]
        ]
      }
    });
  });

  // 🔘 NO-OP Callback for loading state buttons
  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery('⏳ جاري تنفيذ العملية بالمنظومة، يرجى الانتظار ثوانٍ معدودة...');
  });

  // Dashboard Callbacks
  bot.action('today_summary', async (ctx) => {
    await ctx.answerCbQuery();
    const today = new Date().toISOString().split('T')[0];
    const { data: rows } = await supabase
      .from('cash_flow')
      .select('*')
      .gte('created_at', today + 'T00:00:00')
      .order('created_at', { ascending: false });

    let incomeTotal = 0;
    let expenseTotal = 0;
    (rows || []).forEach(r => {
      if (r.type === 'إيراد') incomeTotal += Number(r.amount || 0);
      else expenseTotal += Number(r.amount || 0);
    });

    const net = incomeTotal - expenseTotal;
    let msg = `📊 <b>ملخص حركات الخزينة اليوم:</b>\n\n`;
    msg += `🟢 إجمالي الإيرادات: ${formatEgp(incomeTotal)}\n`;
    msg += `🔴 إجمالي المصروفات: ${formatEgp(expenseTotal)}\n`;
    msg += `⚖️ صافي حركة اليوم: <b>${formatEgp(net)}</b>`;

    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('balance_summary', async (ctx) => {
    await ctx.answerCbQuery();
    const summary = await getLiquiditySummary();
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  bot.action('suppliers_summary', async (ctx) => {
    await ctx.answerCbQuery();
    const summary = await getSuppliersSummary();
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  bot.action('inventory_summary', async (ctx) => {
    await ctx.answerCbQuery();
    const summary = await getWarehouseInventorySummary();
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  bot.action('today_attendance', async (ctx) => {
    await ctx.answerCbQuery();
    const summary = await getTodayAttendanceSummary();
    return ctx.reply(summary, { parse_mode: 'HTML' });
  });

  // 📦 Devices & Warehouse Hub Menu
  bot.action('menu_devices', async (ctx) => {
    await ctx.answerCbQuery();
    const keyboard = {
      inline_keyboard: [
        [
          { text: '👁️ عرض بضاعة وسيريالات المخزن', callback_data: 'inventory_summary' }
        ],
        [
          { text: '📥 استلام وتوريد أجهزة جديدة', callback_data: 'guide_intake' }
        ],
        [
          { text: '📤 صرف وبيع أجهزة تكييف', callback_data: 'menu_dispatch' }
        ],
        [
          { text: '🔙 العودة للقائمة الرئيسية', callback_data: 'menu_main' }
        ]
      ]
    };
    return ctx.reply('📦 <b>قسم المخزن والأجهزة:</b>\nاختر الإجراء المطلوب أو سجل فويس بالعملية مباشرة:', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 📤 Dispatch Submenu (عميل مباشر أو تاجر)
  bot.action('menu_dispatch', async (ctx) => {
    await ctx.answerCbQuery();
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏠 صرف وتركيب لعميل مباشر', callback_data: 'guide_disp_customer' }
        ],
        [
          { text: '🤝 صرف وبيع لتاجر', callback_data: 'guide_disp_trader' }
        ],
        [
          { text: '🔙 رجوع لقسم المخزن', callback_data: 'menu_devices' }
        ]
      ]
    };
    return ctx.reply('📤 <b>إذن صرف وبيع جهاز تكييف:</b>\nهل الصرف لعميل مباشر أم لتاجر؟', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 🏢 Suppliers & Traders Menu
  bot.action('menu_suppliers', async (ctx) => {
    await ctx.answerCbQuery();
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏢 كشف حسابات الموردين والتجار', callback_data: 'suppliers_summary' }
        ],
        [
          { text: '💳 سداد دفعة حساب لمورد', callback_data: 'guide_sup_pay' }
        ],
        [
          { text: '💰 تحصيل دفعة حساب من تاجر', callback_data: 'guide_trd_col' }
        ],
        [
          { text: '🔙 العودة للقائمة الرئيسية', callback_data: 'menu_main' }
        ]
      ]
    };
    return ctx.reply('🏢 <b>قسم الموردين والتجار:</b>\nاختر المطلوب أو سجل فويس بالسداد أو التحصيل:', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 💵 Safe & Liquidity Menu
  bot.action('menu_safe', async (ctx) => {
    await ctx.answerCbQuery();
    const keyboard = {
      inline_keyboard: [
        [
          { text: '💵 أرصدة الخزائن والوسائل', callback_data: 'balance_summary' },
          { text: '📊 كشف حركات اليوم', callback_data: 'today_summary' }
        ],
        [
          { text: '🔴 تسجيل مصروف للخزنة', callback_data: 'guide_expense' },
          { text: '🟢 تسجيل إيراد للخزنة', callback_data: 'guide_revenue' }
        ],
        [
          { text: '👨‍🔧 صرف سلفة لفني', callback_data: 'guide_advance' }
        ],
        [
          { text: '🔙 العودة للقائمة الرئيسية', callback_data: 'menu_main' }
        ]
      ]
    };
    return ctx.reply('💵 <b>قسم الخزينة والمصروفات والسيولة:</b>\nاختر الإجراء المطلوب أو سجل فويس بالعملية:', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 🔙 Main Menu Return
  bot.action('menu_main', async (ctx) => {
    await ctx.answerCbQuery();
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📱 فتح التطبيق المصغر (Mini App)', web_app: { url: 'https://futureairpro.onrender.com/' } }
        ],
        [
          { text: '💻 فتح في متصفح الكمبيوتر (رابط مباشر)', url: 'https://futureairpro.onrender.com/' }
        ],
        [
          { text: '📦 المخزن والأجهزة (استلام / صرف)', callback_data: 'menu_devices' }
        ],
        [
          { text: '🛠️ أوامر الشغل (صيانة / أعمال إضافية)', callback_data: 'guide_work_order' }
        ],
        [
          { text: '🏢 الموردين والتجار (حسابات / سداد)', callback_data: 'menu_suppliers' }
        ],
        [
          { text: '💵 الخزنة والمحافظ (مصروفات / سلف)', callback_data: 'menu_safe' }
        ],
        [
          { text: '👥 كشف حضور وغياب الموظفين', callback_data: 'today_attendance' }
        ]
      ]
    };
    return ctx.reply('👇 <b>القائمة الرئيسية لمنظومة Future Air:</b>\nاختر القسم المطلوب أو سجل فويس بأي عملية فوراً:', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.action('guide_work_order', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `🛠️ <b>تسجيل أمر شغل جديد (صيانة / أعمال إضافية):</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر البيانات بالترتيب:</b>\n\n`;
    msg += `1️⃣ نوع أمر الشغل (صيانة 🧰 أو أعمال إضافية ⚡)\n`;
    msg += `2️⃣ اسم العميل ورقم التليفون والعنوان\n`;
    msg += `3️⃣ تفاصيل العمل المنفذ (غسيل جهازين، شحن فريون، تركيب خارجي، تمديد نحاس...)\n`;
    msg += `4️⃣ المبلغ المحصل وطريقة الدفع (خزنة / فودافون كاش / إنستاباي...)\n`;
    msg += `5️⃣ أسماء الفنيين أو الموظفين المنفذين (حتى لو أكثر من فني)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي الآن...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // 📝 CONCISE GUIDED CHECKLIST CARDS (NO LONG EXAMPLES)
  bot.action('guide_disp_customer', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `🏠 <b>إذن صرف لعميل مباشر:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر البيانات بالترتيب:</b>\n\n`;
    msg += `1️⃣ اسم العميل\n`;
    msg += `2️⃣ رقم الهاتف\n`;
    msg += `3️⃣ العنوان ومكان التركيب\n`;
    msg += `4️⃣ نوع وموديل الجهاز والقدرة\n`;
    msg += `5️⃣ سيريال الفانة وسيريال الكباس\n`;
    msg += `6️⃣ سعر البيع والمبلغ المدفوع (إن وُجد)\n`;
    msg += `7️⃣ الفني المسؤول (اختياري)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي الآن...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('guide_disp_trader', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `🤝 <b>إذن صرف لتاجر:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر البيانات بالترتيب:</b>\n\n`;
    msg += `1️⃣ اسم التاجر\n`;
    msg += `2️⃣ نوع وموديل الجهاز والقدرة أو السيريال\n`;
    msg += `3️⃣ سعر البيع للتاجر\n`;
    msg += `4️⃣ المبلغ المدفوع وطريقة السداد (أو على الحساب)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي الآن...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('guide_intake', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `📥 <b>إذن استلام وتوريد أجهزة:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر البيانات بالترتيب:</b>\n\n`;
    msg += `1️⃣ اسم المورد\n`;
    msg += `2️⃣ نوع وموديل الجهاز والقدرة\n`;
    msg += `3️⃣ سيريال الفانة وسيريال الكباس\n`;
    msg += `4️⃣ تكلفة الشراء\n`;
    msg += `5️⃣ المبلغ المدفوع للمورد وطريقة السداد (أو على الحساب)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي الآن...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('guide_sup_pay', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `💳 <b>سداد دفعة لمورد:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر:</b>\n\n`;
    msg += `1️⃣ اسم المورد\n`;
    msg += `2️⃣ المبلغ المسدد\n`;
    msg += `3️⃣ وسيلة الدفع (خزنة / فودافون كاش / إنستاباي / بنك)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('guide_trd_col', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `💰 <b>تحصيل دفعة من تاجر:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر:</b>\n\n`;
    msg += `1️⃣ اسم التاجر\n`;
    msg += `2️⃣ المبلغ المحصل\n`;
    msg += `3️⃣ وسيلة التحصيل (إنستاباي / فودافون كاش / خزنة)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('guide_advance', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `👨‍🔧 <b>صرف سلفة لفني:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر:</b>\n\n`;
    msg += `1️⃣ اسم الفني\n`;
    msg += `2️⃣ مبلغ السلفة\n`;
    msg += `3️⃣ وسيلة الصرف\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('guide_expense', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `🔴 <b>تسجيل مصروف:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر:</b>\n\n`;
    msg += `1️⃣ المبلغ\n`;
    msg += `2️⃣ بيان وسبب المصروف\n`;
    msg += `3️⃣ وسيلة الدفع\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action('guide_revenue', async (ctx) => {
    await ctx.answerCbQuery();
    let msg = `🟢 <b>تسجيل إيراد:</b>\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎙️ <b>سجل فويس واذكر:</b>\n\n`;
    msg += `1️⃣ المبلغ\n`;
    msg += `2️⃣ سبب الإيراد\n`;
    msg += `3️⃣ وسيلة الاستلام\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `⏳ <i>في انتظار تسجيلك الصوتي...</i>`;
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // Attendance Status Modifiers
  bot.action(/^st_abs_(.+)$/, async (ctx) => {
    const techId = ctx.match[1];
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    try {
      await supabase.from('attendance').upsert({
        technician_id: techId,
        date: todayDate,
        status: 'غائب',
        arrival_time: null
      }, { onConflict: 'technician_id,date' });
      await ctx.answerCbQuery('✅ تم تحويل حالة الموظف إلى غائب!');
      return ctx.reply(`🔴 <b>تم تسجيل حالة الموظف كـ غائب ❌ لهذا اليوم (${todayDate}).</b>`, { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.answerCbQuery(`❌ فشل التعديل: ${err.message}`, { show_alert: true });
    }
  });

  bot.action(/^st_lat_(.+)$/, async (ctx) => {
    const techId = ctx.match[1];
    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    const cairoTime = now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour12: false });
    try {
      await supabase.from('attendance').upsert({
        technician_id: techId,
        date: todayDate,
        status: 'تأخير',
        arrival_time: cairoTime
      }, { onConflict: 'technician_id,date' });
      await ctx.answerCbQuery('✅ تم تحويل حالة الموظف إلى تأخير!');
      return ctx.reply(`🟡 <b>تم تسجيل حالة الموظف كـ تأخير ⚠️ - وقت الوصول: ${cairoTime.slice(0, 5)}</b>`, { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.answerCbQuery(`❌ فشل التعديل: ${err.message}`, { show_alert: true });
    }
  });

  bot.action(/^st_clr_(.+)$/, async (ctx) => {
    const techId = ctx.match[1];
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    try {
      await supabase.from('attendance').delete().eq('technician_id', techId).eq('date', todayDate);
      await ctx.answerCbQuery('✅ تم إلغاء التسجيل!');
      return ctx.reply(`⚪ <b>تم مسح تسجيل اليوم للموظف وأصبح في وضع (لم يتم التسجيل ⚪).</b>`, { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.answerCbQuery(`❌ فشل الإلغاء: ${err.message}`, { show_alert: true });
    }
  });
}
