// 🧠 Smart Arabic & Egyptian Dialect Parser for Cash Flow / Treasury Transactions

// Map of Arabic spoken words to numerical values
const arabicNumberWords = {
  // Egyptian slang units
  'باكو': 1000, 'باكوان': 2000, 'باكوين': 2000,
  'ارنب': 1000000, 'أرنب': 1000000,
  'ورقة': 100, 'ورقتين': 200,
  'قرش': 1, 'جنيه': 1, 'جنية': 1,
  
  // Standard Arabic & Egyptian spoken numbers
  'صفر': 0,
  'واحد': 1, 'واحدة': 1,
  'اثنين': 2, 'اتنين': 2, 'اثنان': 2,
  'ثلاثة': 3, 'تلاتة': 3, 'تلات': 3, 'ثلاث': 3,
  'اربعة': 4, 'أربعة': 4, 'اربع': 4, 'أربع': 4,
  'خمسة': 5, 'خمس': 5,
  'ستة': 6, 'ست': 6,
  'سبعة': 7, 'سبع': 7,
  'ثمانية': 8, 'تمانية': 8, 'تمن': 8, 'ثمان': 8,
  'تسعة': 9, 'تسع': 9,
  'عشرة': 10, 'عشر': 10,
  'حداشر': 11, 'أحد عشر': 11, 'احد عشر': 11,
  'اثنا عشر': 12, 'اتناشر': 12, 'اثناعشر': 12,
  'تلاتاشر': 13, 'ثلاثة عشر': 13,
  'اربعتاشر': 14, 'أربعة عشر': 14,
  'خمسطاشر': 15, 'خمسة عشر': 15,
  'ستاشر': 16, 'ستة عشر': 16,
  'سبعتاشر': 17, 'سبعة عشر': 17,
  'تمنتاشر': 18, 'ثمانية عشر': 18,
  'تسعتاشر': 19, 'تسعة عشر': 19,
  'عشرين': 20, 'عشرون': 20,
  'تلاتين': 30, 'ثلاثين': 30, 'ثلاثون': 30,
  'اربعين': 40, 'أربعين': 40, 'اربعون': 40, 'أربعون': 40,
  'خمسين': 50, 'خمسون': 50,
  'ستين': 60, 'ستون': 60,
  'سبعين': 70, 'سبعون': 70,
  'تمانين': 80, 'ثمانين': 80, 'ثمانون': 80,
  'تسعين': 90, 'تسعون': 90,
  'مية': 100, 'ميه': 100, 'مائة': 100, 'مئة': 100,
  'ميتين': 200, 'مائتين': 200, 'مئتان': 200,
  'تلتماية': 300, 'تلاتمية': 300, 'تلتمية': 300, 'ثلاثمائة': 300,
  'ربعمية': 400, 'أربعمائة': 400, 'اربعمية': 400,
  'خمسمية': 500, 'خمسمائة': 500,
  'ستمية': 600, 'ستمائة': 600,
  'سبعمية': 700, 'سبعمائة': 700,
  'تمنمية': 800, 'ثمانمائة': 800,
  'تسعمية': 900, 'تسعمائة': 900,
  'الف': 1000, 'ألف': 1000, 'الاف': 1000, 'آلاف': 1000, 'تلاف': 1000,
  'الفين': 2000, 'ألفين': 2000, 'الفان': 2000, 'ألفان': 2000,
  'مليون': 1000000, 'ملايين': 1000000
};

// Convert Eastern Arabic numerals (٠-٩) to Western (0-9)
export function normalizeDigits(str) {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[,،]/g, '');
}

// Extract payment method / account
export function extractPaymentMethod(text) {
  const lower = text.toLowerCase();
  if (lower.includes('فودافون') || lower.includes('vodafone') || lower.includes('كاش موبايل') || lower.includes('فودا كاش') || lower.includes('فودافونكاش')) {
    return 'فودافون كاش';
  }
  if (lower.includes('انستا') || lower.includes('إنستا') || lower.includes('instapay') || lower.includes('انستاباي')) {
    return 'إنستا باي';
  }
  if (lower.includes('محفظة بنك مصر') || lower.includes('محفظه بنك مصر') || lower.includes('محفظة') || lower.includes('محفظه') || lower.includes('bm wallet') || lower.includes('المحفظة الذكية')) {
    return 'محفظة بنك مصر';
  }
  if (lower.includes('بيزنيس') || lower.includes('بيزنس') || lower.includes('شركات') || lower.includes('حساب الشركة') || lower.includes('حساب بيزنيس') || lower.includes('بنك مصر بيزنيس') || lower.includes('business')) {
    return 'حساب الشركة';
  }
  if (lower.includes('تحويل بنكي') || lower.includes('تحويل بنك') || lower.includes('بنك') || lower.includes('حساب شخصي') || lower.includes('حساب والدي') || lower.includes('البنك شخصي') || lower.includes('تحويل')) {
    return 'تحويل بنكي';
  }
  // Default to company cash safe
  return 'خزنة';
}

// Extract transaction type: إيراد (income) vs مصروف (expense)
export function extractTransactionType(text) {
  const expenseKeywords = [
    'صرفت', 'صرفنا', 'مصروف', 'مصاريف', 'دفعت', 'دفعنا', 'اشتريت', 'اشترينا',
    'خرجت', 'خرجنا', 'سحبت', 'سحبنا', 'فاتورة', 'فواتير', 'ايجار', 'إيجار',
    'شاي', 'سكر', 'سلفه', 'سلفة', 'بنزين', 'سولار', 'اكل', 'أكل', 'غدا', 'غداء', 'عشا', 'عشاء',
    'قطع غيار', 'نقل', 'شحن', 'مصاريف نثرية', 'صيانة سيارة', 'ضيافة', 'مواصلات', 'اجرة', 'أجرة'
  ];

  const incomeKeywords = [
    'دخلت', 'دخلنا', 'استلمت', 'استلمنا', 'قبضت', 'قبضنا', 'حطيت', 'حطينا',
    'ايراد', 'إيراد', 'ايرادات', 'إيرادات', 'تحصيل', 'مبيعات', 'ارباح', 'أرباح',
    'دفعة', 'مقدم', 'عربون', 'ايداع', 'إيداع', 'زيادة', 'كسبنا', 'صيانة تكييف'
  ];

  const lower = text.toLowerCase();
  
  let expenseScore = 0;
  let incomeScore = 0;

  for (const w of expenseKeywords) {
    if (lower.includes(w)) expenseScore += 2;
  }
  for (const w of incomeKeywords) {
    if (lower.includes(w)) incomeScore += 2;
  }

  // If text starts with explicitly negative or positive action
  if (/^(صرفت|دفعت|اشتريت|خرجت|سحبت|مصروف)/.test(lower)) expenseScore += 5;
  if (/^(دخلت|استلمت|قبضت|حطيت|ايراد|إيراد|تحصيل)/.test(lower)) incomeScore += 5;

  return incomeScore > expenseScore ? 'إيراد' : 'مصروف';
}

// Parse spoken words and digit combinations into a clean number
export function parseArabicAmount(text) {
  if (!text) return null;
  const clean = normalizeDigits(text);

  // 1. Direct regex for numeric digits (e.g. 1500, 150.50, 2,500, 2500ج, 2500 جنيه)
  const digitMatch = clean.match(/(?:بـ?|بمبلغ|قيمة|مبلغ|حوالي)?\s*(\d+(?:\.\d+)?)\s*(?:ج|جنيه|جنية|ج\.م|egp|le)?/i);
  if (digitMatch && Number(digitMatch[1]) > 0) {
    let baseAmount = Number(digitMatch[1]);
    
    // Check if followed by "ألف" / "الف" (e.g. "50 الف" -> 50000)
    const afterMatch = clean.slice(digitMatch.index + digitMatch[0].length);
    if (/^\s*(?:الف|ألف|آلاف|تلاف)/.test(afterMatch)) {
      baseAmount *= 1000;
    } else if (/^\s*(?:مليون|ملايين)/.test(afterMatch)) {
      baseAmount *= 1000000;
    }
    return baseAmount;
  }

  // 2. Spoken Compound Phrases (e.g. "ألفين وخمسمية", "ألف ونص", "خمسة آلاف وربعمية")
  let total = 0;
  const words = clean.split(/[\s،,]+/);
  
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^(و|بـ|ب)/, '');
    
    if (w === 'نص' || w === 'نصف') {
      if (total >= 1000) total += 500;
      else if (total >= 100) total += 50;
      else total += 0.5;
    } else if (w === 'ربع') {
      if (total >= 1000) total += 250;
      else if (total >= 100) total += 25;
      else total += 0.25;
    } else if (arabicNumberWords[w] !== undefined) {
      const val = arabicNumberWords[w];
      if (val === 1000 && total > 0 && total < 1000) {
        total *= 1000;
      } else if (val === 1000000 && total > 0 && total < 1000000) {
        total *= 1000000;
      } else {
        total += val;
      }
    }
  }

  return total > 0 ? total : null;
}

// Clean description: removes transaction verbs, payment methods, and amount tokens
export function cleanDescription(text, type, amount, paymentMethod) {
  if (!text) return type === 'مصروف' ? 'مصروفات ونثريات بالخزنة' : 'إيراد نقدي بالخزنة';

  let desc = text
    .replace(/(?:صرفت|صرفنا|دفعت|دفعنا|اشتريت|اشترينا|دخلت|دخلنا|استلمت|استلمنا|قبضت|قبضنا|حطيت|حطينا)/gi, '')
    .replace(/(?:مبلغ|قيمة|بمبلغ|بـ|حوالي)\s*\d+/gi, '')
    .replace(/\b\d+\s*(?:ج|جنيه|جنية|ج\.م|egp|le)?\b/gi, '')
    .replace(/(?:الفين|ألفين|الف|ألف|آلاف|تلاف|خمسمية|ستمية|سبعمية|تمنمية|تسعمية|ربعمية|تلتماية|تلتمية|مية|ميتين)\s*(?:و[^\s]+)?/gi, '')
    .replace(/(?:فودافون كاش|فودافون|إنستا باي|انستاباي|انستا باي|إنستاباي|محفظة بنك مصر|المحفظة الذكية|محفظة|حساب الشركة|حساب بيزنيس|بنك مصر بيزنيس|بيزنيس|شركات|تحويل بنكي|تحويل بنك|حساب شخصي|حساب والدي|على البنك|في البنك|خزنة|كاش)/gi, '')
    .replace(/(?:في الخزنة|من الخزنة|للخزنة|في الدرج|من الدرج|في المحفظة|من المحفظة|على حسابي|على الحساب|من الحساب)/gi, '')
    .replace(/(?:جنيه|جنية|ج\.م)/gi, '')
    .trim();

  // Remove leading/trailing prepositions (و / ف / ب / من / إلى / في / عشان / من الـ)
  desc = desc
    .replace(/^(?:و|ف|ب|من|إلى|الي|في|عشان|لـ|علشان)\s+/gi, '')
    .replace(/\s+(?:من الـ|من ال|من|إلى|الي|في|عشان|لـ)$/gi, '')
    .replace(/^[،,\-\.]+\s*/, '')
    .trim();

  if (!desc || desc.length < 2) {
    desc = type === 'مصروف' ? 'مصروفات ونثريات بالخزنة' : 'إيراد نقدي بالخزنة';
  }

  return desc;
}

// 👥 Employee Attendance & Absence Parser
export function parseAttendanceMessage(rawText, staffList = []) {
  if (!rawText) return null;
  const clean = normalizeDigits(rawText.trim()).toLowerCase();

  // 1. Check if the message contains attendance/absence/delay keywords
  const isAttendanceKeyword = /(?:حضر|حاضر|جه|جاء|وصل|موجود|دلوقتي|سجل حضور|اثبت حضور|غايب|غائب|ماجاش|مجاش|مش جاي|إجازة|اجازة|اعتذر|غاب|غياب|متأخر|تأخير|اتأخر|متاخر)/.test(clean);
  if (!isAttendanceKeyword) return null;

  // Don't treat money/safe transactions (e.g. "صرفت 150 جنيه شاي") as attendance
  const isFinancial = /(?:صرفت|صرفنا|دفعت|دفعنا|اشتريت|اشترينا|دخلت|استلمت|قبضت|حطيت|فودافون كاش|انستا باي|إنستا باي|محفظة|خزنة|كاش|جنيه|جنية|ج\.م)\b/.test(clean);
  if (isFinancial && !/(?:حضور|غياب|تأخير)/.test(clean)) {
    return null;
  }

  // 2. Determine Status: 'حاضر' | 'غائب' | 'تأخير'
  let status = 'حاضر';
  if (/(?:غايب|غائب|ماجاش|مجاش|مش جاي|إجازة|اجازة|اعتذر|غاب|غياب)/.test(clean)) {
    status = 'غائب';
  } else if (/(?:متأخر|تأخير|اتأخر|متاخر)/.test(clean)) {
    status = 'تأخير';
  } else if (/(?:حضر|حاضر|جه|جاء|وصل|موجود|سجل حضور|اثبت حضور|دلوقتي)/.test(clean)) {
    status = 'حاضر';
  }

  // 3. Match Employee(s)
  const matchedTechs = [];
  const isAll = /(?:الكل|كلهم|الشباب|العمال كلهم|كل الموظفين|الجميع)/.test(clean);

  if (isAll) {
    matchedTechs.push(...staffList);
  } else {
    for (const tech of staffList) {
      const nameOnly = tech.name.split('|')[0].trim().toLowerCase();
      
      // Exact full name match
      if (clean.includes(nameOnly)) {
        matchedTechs.push(tech);
        continue;
      }

      // Check specific employee names
      if (nameOnly.startsWith('محمد') && (clean.includes('محمد احمد') || (clean.includes('محمد') && !clean.includes('أحمد ميدو') && !clean.includes('احمد ميدو')))) {
        matchedTechs.push(tech);
        continue;
      }

      if (nameOnly.startsWith('أحمد') || nameOnly.startsWith('احمد')) {
        if (clean.includes('ميدو') || clean.includes('أحمد') || clean.includes('احمد') || clean.includes('السائق')) {
          if (!clean.includes('محمد احمد') && !clean.includes('محمد ')) {
            matchedTechs.push(tech);
            continue;
          }
        }
      }

      if (nameOnly.startsWith('عبده') || nameOnly.startsWith('عبد الرحمن')) {
        if (clean.includes('عبده') || clean.includes('عبد الرحمن') || clean.includes('عبدالله') || clean.includes('عبد')) {
          matchedTechs.push(tech);
          continue;
        }
      }

      if (nameOnly.startsWith('شعراوي')) {
        if (clean.includes('شعراوي') || clean.includes('الشعراوي')) {
          matchedTechs.push(tech);
          continue;
        }
      }

      if (nameOnly.startsWith('اسلام') || nameOnly.startsWith('إسلام')) {
        if (clean.includes('اسلام') || clean.includes('إسلام')) {
          matchedTechs.push(tech);
          continue;
        }
      }

      if (nameOnly.startsWith('هشام')) {
        if (clean.includes('هشام')) {
          matchedTechs.push(tech);
          continue;
        }
      }
    }
  }

  if (matchedTechs.length === 0) {
    return null; // No staff matched
  }

  // 4. Extract Arrival Time (to the exact minute)
  let arrivalTime = null;
  if (status !== 'غائب') {
    // Check if a specific time is mentioned (e.g. "الساعة 10 ونص", "الساعة 4", "10:30")
    const timeMatch = clean.match(/(?:الساعة|الساعه|ساعة|ساعه)?\s*(\d{1,2})(?::(\d{2}))?\s*(ونص|وربع|وتلت|وثلث|إلا ربع|الا ربع|صباحا|صباحاً|الصبح|مساء|مساءً|العصر|الظهر|بالليل)?/);
    
    if (timeMatch && timeMatch[1] && Number(timeMatch[1]) >= 1 && Number(timeMatch[1]) <= 24) {
      let hour = Number(timeMatch[1]);
      let minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
      const modifier = timeMatch[3] || '';

      if (modifier.includes('نص')) minute = 30;
      else if (modifier.includes('ربع') && !modifier.includes('إلا') && !modifier.includes('الا')) minute = 15;
      else if (modifier.includes('تلت') || modifier.includes('ثلث')) minute = 20;
      else if (modifier.includes('إلا ربع') || modifier.includes('الا ربع')) {
        minute = 45;
        hour = (hour - 1 + 24) % 24;
      }

      if ((modifier.includes('العصر') || modifier.includes('الظهر') || modifier.includes('مساء') || modifier.includes('بالليل')) && hour < 12) {
        hour += 12;
      } else if (hour >= 1 && hour <= 6 && !modifier.includes('الصبح')) {
        // Business context: in Egypt 1..6 PM is afternoon
        hour += 12;
      }

      arrivalTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    } else {
      // Exact current local time in Cairo
      const now = new Date();
      const cairoTimeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour12: false });
      arrivalTime = cairoTimeStr; // "14:48:15"
    }
  }

  return {
    rawText,
    isAttendance: true,
    status,
    matchedTechs,
    arrivalTime
  };
}

// Comprehensive Parser
export function parseVoiceOrTextMessage(rawText) {
  const normalized = normalizeDigits(rawText.trim());
  const type = extractTransactionType(normalized);
  const amount = parseArabicAmount(normalized) || 0;
  const paymentMethod = extractPaymentMethod(normalized);
  const description = cleanDescription(normalized, type, amount, paymentMethod);

  return {
    rawText,
    type,
    amount,
    paymentMethod,
    description: `${description} | ${paymentMethod}`
  };
}

// ❄️ AC Brand Names and Patterns
export const AC_BRAND_NAMES = [
  { key: 'كاريير', pattern: /كاريير|كارير|carrier/i },
  { key: 'ميديا', pattern: /ميديا|ميدياوي|midea/i },
  { key: 'شارب', pattern: /شارب|sharp/i },
  { key: 'تورنيدو', pattern: /تورنيدو|تورنادو|tornado/i },
  { key: 'فريش', pattern: /فريش|fresh/i },
  { key: 'هاير', pattern: /هاير|haier/i },
  { key: 'ال جي', pattern: /ال\s*جي|lg/i },
  { key: 'جري', pattern: /جري|gree/i },
  { key: 'يونيون اير', pattern: /يونيون\s*اير|unionaire/i },
  { key: 'امريكول', pattern: /امريكول|americool/i },
  { key: 'سامسونج', pattern: /سامسونج|samsung/i }
];

export function extractBrandBase(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const b of AC_BRAND_NAMES) {
    if (b.pattern.test(lower)) {
      return b.key;
    }
  }
  return null;
}

// ❄️ AC Brand and Model Specifier Extractor
export function extractAcBrandAndSpecifier(text) {
  if (!text) return null;
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const norm = lower.replace(/[أإآ]/g, 'ا');

  const detectedBrand = extractBrandBase(norm);

  // Detect specifiers
  let specifier = '';
  const hasConcealed = norm.includes('كونسيلد') || norm.includes('concealed');
  const hasFreeStand = norm.includes('فري ستاند') || norm.includes('فريستاند') || norm.includes('عمودي');
  const hasWindow = norm.includes('شباك') || norm.includes('window');

  // Hot / Heating checks (In Egyptian HVAC, "ساخن" or "سخن" means "بارد ساخن" because all heating split units are heat pumps)
  const hasHot = !/(?:مش|غير|مش\s+عايز|بدون)\s*(?:ساخن|سخن)/.test(norm) &&
                 (norm.includes('ساخن') || norm.includes('سخن') || norm.includes('تدفئ') || norm.includes('تدفئه'));
  const hasInverter = norm.includes('انفرتر') || norm.includes('inverter');

  if (hasConcealed) {
    specifier = 'كونسيلد';
  } else if (hasFreeStand) {
    specifier = 'فري ستاند';
  } else if (hasWindow) {
    specifier = 'شباك';
  } else if (hasHot) {
    if (hasInverter) {
      specifier = 'بارد ساخن انفرتر';
    } else {
      specifier = 'بارد ساخن عادي';
    }
  } else if (hasInverter) {
    specifier = 'بارد انفرتر';
  } else if (norm.includes('بارد عادي') || (norm.includes('بارد') && !hasInverter && !hasHot) || (norm.includes('عادي') && !hasInverter && !hasHot)) {
    specifier = 'بارد عادي';
  }

  if (detectedBrand && specifier) {
    return `${detectedBrand} ${specifier}`;
  } else if (detectedBrand) {
    return detectedBrand;
  } else if (specifier) {
    return specifier;
  }
  return null;
}

// ⚡ AC Brand Normalizer (Ensures "ساخن" or "سخن" is always normalized to "بارد ساخن")
export function normalizeAcBrand(brandStr, textContext = '') {
  let res = (brandStr || '').trim();
  const rawCtx = (textContext || '').trim();
  const normCtx = rawCtx.toLowerCase().replace(/[أإآ]/g, 'ا');

  // If brand is missing, extract from textContext
  if (!res && rawCtx) {
    const extracted = extractAcBrandAndSpecifier(rawCtx);
    if (extracted) return extracted;
  }

  if (!res) return res;

  const normBrand = res.toLowerCase().replace(/[أإآ]/g, 'ا');

  // Check for Hot / Heating in brand or context
  const hotInBrand = normBrand.includes('ساخن') || normBrand.includes('سخن') || normBrand.includes('تدفئ') || normBrand.includes('تدفئه');
  const hotInCtx = !/(?:مش|غير|مش\s+عايز|بدون)\s*(?:ساخن|سخن)/.test(normCtx) &&
                   (normCtx.includes('ساخن') || normCtx.includes('سخن') || normCtx.includes('تدفئ') || normCtx.includes('تدفئه'));
  const isHot = hotInBrand || hotInCtx;

  // Check for Inverter
  const invInBrand = normBrand.includes('انفرتر') || normBrand.includes('inverter');
  const invInCtx = normCtx.includes('انفرتر') || normCtx.includes('inverter');
  const isInverter = invInBrand || invInCtx;

  // Base brand name (e.g. ميديا, كاريير, شارب)
  const brandName = extractBrandBase(res) || extractBrandBase(rawCtx);

  // If Concealed / Free Stand / Window
  if (normBrand.includes('كونسيلد') || normCtx.includes('كونسيلد')) {
    return brandName ? `${brandName} كونسيلد` : res;
  }
  if (normBrand.includes('فري ستاند') || normBrand.includes('عمودي') || normCtx.includes('فري ستاند')) {
    return brandName ? `${brandName} فري ستاند` : res;
  }
  if (normBrand.includes('شباك') || normCtx.includes('شباك')) {
    return brandName ? `${brandName} شباك` : res;
  }

  // If Hot: MUST be "بارد ساخن" (either "بارد ساخن عادي" or "بارد ساخن انفرتر")
  if (isHot) {
    const specifier = isInverter ? 'بارد ساخن انفرتر' : 'بارد ساخن عادي';
    if (brandName) {
      return `${brandName} ${specifier}`;
    }
    // If no brand name detected, replace or prepend "بارد"
    if (res.includes('بارد ساخن')) {
      return isInverter && !res.includes('انفرتر') ? res.replace(/عادي/g, '').trim() + ' انفرتر' : res;
    }
    if (/ساخن\s*انفرتر|سخن\s*انفرتر/.test(res)) {
      return res.replace(/ساخن\s*انفرتر|سخن\s*انفرتر/g, 'بارد ساخن انفرتر');
    }
    if (/ساخن\s*عادي|سخن\s*عادي/.test(res)) {
      return res.replace(/ساخن\s*عادي|سخن\s*عادي/g, 'بارد ساخن عادي');
    }
    if (/ساخن|سخن/.test(res)) {
      return res.replace(/ساخن|سخن/g, specifier);
    }
    if (res.includes('بارد عادي')) {
      return res.replace('بارد عادي', specifier);
    }
    return `${res} ${specifier}`.trim();
  }

  // If Not Hot, but Inverter
  if (isInverter) {
    if (brandName) {
      return `${brandName} بارد انفرتر`;
    }
    if (res.includes('بارد عادي')) {
      return res.replace('بارد عادي', 'بارد انفرتر');
    }
  }

  return res;
}

// ⚡ AC Capacity Extractor & Normalizer
export function extractAcCapacity(text) {
  if (!text) return null;
  const clean = normalizeDigits(text.trim()).toLowerCase();

  if (/1\.5|واحد\s*(?:و|\+)?\s*نص|1\s*و\s*نص|1\.5\s*حصان/.test(clean)) {
    return '1.5-حصان';
  }
  if (/2\.25|اتنين\s*(?:و|\+)?\s*ربع|2\s*و\s*ربع|2\.25\s*حصان/.test(clean)) {
    return '2.25-حصان';
  }
  if (/3(?:\.0)?\s*حصان|تلاتة\s*حصان|3\s*حصان|\b3\b/.test(clean) && !/1\.5|2\.25|4|5/.test(clean)) {
    return '3-حصان';
  }
  if (/4(?:\.0)?\s*حصان|اربعة\s*حصان|أربعة\s*حصان|4\s*حصان|\b4\b/.test(clean)) {
    return '4-حصان';
  }
  if (/5(?:\.0)?\s*حصان|خمسة\s*حصان|5\s*حصان|\b5\b/.test(clean)) {
    return '5-حصان';
  }
  return null;
}

// 🧊 Extract Serials (Indoor & Outdoor)
export function extractSerialsFromText(text) {
  if (!text) return { indoor: null, outdoor: null };
  const clean = normalizeDigits(text.trim());

  let indoor = null;
  let outdoor = null;

  // Check explicit indoor labeled
  const indoorMatch = clean.match(/(?:فانة|فانة|فانة|داخلية|الداخلي|داخلي|الوحدة الداخلية|الفانة)\s*(?:رقم|سيريال|:)?\s*([A-Za-z0-9]{4,20})/i);
  if (indoorMatch) indoor = indoorMatch[1].replace(/[^A-Za-z0-9]/g, '');

  // Check explicit outdoor labeled
  const outdoorMatch = clean.match(/(?:كباس|كمبروسر|كومبروسر|خارجية|الخارجي|خارجي|الوحدة الخارجية|الكباس)\s*(?:رقم|سيريال|:)?\s*([A-Za-z0-9]{4,20})/i);
  if (outdoorMatch) outdoor = outdoorMatch[1].replace(/[^A-Za-z0-9]/g, '');

  // If not labeled explicitly, find raw digit clusters (length 4 to 20)
  if (!indoor || !outdoor) {
    const allMatches = clean.match(/\b\d{4,20}\b/g);
    if (allMatches && allMatches.length > 0) {
      if (!indoor && allMatches[0]) indoor = allMatches[0];
      if (!outdoor && allMatches[1]) outdoor = allMatches[1];
    }
  }

  return { indoor, outdoor };
}

// 📱 Phone Number Extractor
export function extractEgyptianPhoneNumber(text) {
  if (!text) return null;
  const clean = normalizeDigits(text.trim());
  const phoneMatch = clean.match(/(?:\+?20|0020)?(01[0125]\d{8})\b/);
  return phoneMatch ? phoneMatch[1] : null;
}

// 📅 Comprehensive Arabic & Numeric Date Extractor & Normalizer
export function extractAndNormalizeDate(text) {
  if (!text) return null;
  const clean = normalizeDigits(String(text).trim());
  const lower = clean.toLowerCase();

  const now = new Date();
  const cairoDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const [currentYear, currentMonth, currentDay] = cairoDateStr.split('-').map(Number);

  // 1. Relative Dates: "امبارح" / "أمس" (yesterday)
  if (/(?:تاريخ\s+)?(?:امبارح|أمس|البارحة|البارحه)/.test(lower)) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return yesterday.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  }

  // 2. Relative Dates: "اول امبارح" / "أول أمس" (2 days ago)
  if (/(?:تاريخ\s+)?(?:اول\s*امبارح|أول\s*أمس|اول\s*أمس)/.test(lower)) {
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    return twoDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  }

  // 3. "أول الشهر" / "اول الشهر" (first day of current month)
  if (/اول\s*الشهر|أول\s*الشهر/.test(lower)) {
    return `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  }

  // 4. Arabic Month Names mapping
  const arabicMonths = {
    'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4,
    'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'اغسطس': 8, 'أغسطس': 8,
    'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12
  };

  for (const [mName, mNum] of Object.entries(arabicMonths)) {
    const mRegex = new RegExp(`(?:بتاريخ|تاريخ|يوم)?\\s*(\\d{1,2})\\s*(?:من\\s+)?${mName}(?:\\s*(\\d{4}))?`, 'i');
    const match = clean.match(mRegex);
    if (match) {
      const day = Number(match[1]);
      const year = match[2] ? Number(match[2]) : currentYear;
      if (day >= 1 && day <= 31) {
        return `${year}-${String(mNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // 5. Spoken Number Months: e.g. "بتاريخ 1-9-2026", "بتاريخ 1-9", "تاريخ 1/9/2026", "تاريخ 1/9"
  const explicitDateMatch = clean.match(/(?:بتاريخ|تاريخ|يوم)\s*(\d{1,4})[-/](\d{1,2})(?:[-/](\d{2,4}))?/i);
  if (explicitDateMatch) {
    let p1 = Number(explicitDateMatch[1]);
    let p2 = Number(explicitDateMatch[2]);
    let p3 = explicitDateMatch[3] ? Number(explicitDateMatch[3]) : null;

    if (p1 > 1000) {
      const y = p1;
      const m = p2;
      const d = p3 || 1;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    } else {
      const d = p1;
      const m = p2;
      let y = p3 || currentYear;
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  // 6. Direct numeric pattern YYYY-MM-DD or DD-MM-YYYY without "بتاريخ" prefix
  const rawYmd = clean.match(/\b(202\d)[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (rawYmd) {
    return `${rawYmd[1]}-${String(rawYmd[2]).padStart(2, '0')}-${String(rawYmd[3]).padStart(2, '0')}`;
  }

  const rawDmy = clean.match(/\b(\d{1,2})[-/](\d{1,2})[-/](202\d)\b/);
  if (rawDmy) {
    return `${rawDmy[3]}-${String(rawDmy[2]).padStart(2, '0')}-${String(rawDmy[1]).padStart(2, '0')}`;
  }

  return null;
}


// 🧊 Multi-device Serials Extractor (سيريال الفانة الأولى / التانية، كباس أول / تاني)
export function extractMultipleSerialsFromText(text) {
  if (!text) return { indoors: [], outdoors: [], indoor: null, outdoor: null };
  const clean = normalizeDigits(text.trim());
  const lines = clean.split(/\n|,|،|;/);

  const indoors = [];
  const outdoors = [];

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    const isIndoor = /(?:فانة|فانة|داخلية|الداخلي|داخلي|الوحدة الداخلية|الفانة)/i.test(l);
    const isOutdoor = /(?:كباس|كمبروسر|كومبروسر|خارجية|الخارجي|خارجي|الوحدة الخارجية|الكباس)/i.test(l);
    const serialMatch = l.match(/[A-Za-z0-9]{4,25}/g);

    if (serialMatch && serialMatch.length > 0) {
      for (const ser of serialMatch) {
        if (isIndoor && !indoors.includes(ser)) indoors.push(ser);
        else if (isOutdoor && !outdoors.includes(ser)) outdoors.push(ser);
      }
    }
  }

  // Regex matches for ordered lines
  if (indoors.length === 0) {
    const indoorMatches = clean.matchAll(/(?:فانة|داخلية|الوحدة الداخلية|الفانة)[^0-9A-Za-z]*([A-Za-z0-9]{4,25})/gi);
    for (const m of indoorMatches) {
      if (m[1] && !indoors.includes(m[1])) indoors.push(m[1]);
    }
  }

  if (outdoors.length === 0) {
    const outdoorMatches = clean.matchAll(/(?:كباس|خارجية|الوحدة الخارجية|الكباس|كمبروسر)[^0-9A-Za-z]*([A-Za-z0-9]{4,25})/gi);
    for (const m of outdoorMatches) {
      if (m[1] && !outdoors.includes(m[1])) outdoors.push(m[1]);
    }
  }

  // Fallback if numbers are listed without labels
  if (indoors.length === 0 && outdoors.length === 0) {
    const rawDigits = clean.match(/\b[A-Za-z0-9]{5,25}\b/g) || [];
    if (rawDigits.length >= 2) {
      indoors.push(rawDigits[0]);
      outdoors.push(rawDigits[1]);
      if (rawDigits.length >= 4) {
        indoors.push(rawDigits[1]);
        outdoors.push(rawDigits[3]);
      }
    }
  }

  return {
    indoors,
    outdoors,
    indoor: indoors[0] || null,
    outdoor: outdoors[0] || null
  };
}
