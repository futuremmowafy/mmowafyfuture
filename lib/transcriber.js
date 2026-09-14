// 🎙️ High-Speed Voice & ERP Engine with Google AI Studio Multi-Key Load Balancing
import https from 'https';
import http from 'http';
import { parseVoiceOrTextMessage } from './arabic_parser.js';

// Helper to fetch buffer from URL (Clean standard HTTPS without socket pooling stalls)
// Helper to fetch buffer from URL with safety timeout
export async function downloadFileBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', err => reject(err));
    });
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('انتهت مهلة تنزيل الملف الصوتي من تليجرام (15s)'));
    });
    req.on('error', err => reject(err));
  });
}

export const ERP_SYSTEM_PROMPT = `أنت نظام الذكاء الاصطناعي المركزي والمحاسبي المتقدم لشركة تكييفات (Future Air).
مهمتك: الاستماع للتسجيل الصوتي المصري أو قراءة الرسالة النصية واستخراج تفاصيل العملية بدقة وتصنيفها في صيغة JSON نقية ومباشرة بدون أي علامات markdown:

قواعد صارمة ومهمة جداً للسيريالات والأرقام:
1. استخراج سيريالات الفانة (indoor_serial) وسيريال الكباس (outdoor_serial) كأرقام إنجليزية نقية بدون مسافات.
2. إذا تم نطق السيريال رقماً كاملاً (مثال: "أربعين ألف وخمسمية خمسة وتلاتين") -> يتم تحويله إلى: "40535".
3. إذا تم نطق السيريال رقماً رقماً (مثال: "أربعة زيرو خمسة تلاتة خمسة" أو "أربعة صفر خمسة تلاتة خمسة" أو "تسعة تسعة تمانية تمانية سبعة سبعة") -> يتم تحويله إلى: "998877".
4. إذا تم نطق سيريال بحروف وأرقام (مثال: كاريير CAR واحد اتنين تلاتة) -> يتم تحويله إلى: "CAR123".
5. التمييز الدقيق بين سيريال الفانة (الوحدة الداخلية / الفانة / الداخلي) وسيريال الكباس (الوحدة الخارجية / الكباس / الكومبروسر / الخارجي). إذا كُتب أو قيل سيريالين لجهاز واحد (مثال: سطر 0826126786 والسطر التالي 0826124008) فدائماً السيريال الأول هو الفانة (indoor_serial) والثاني هو الكباس (outdoor_serial) ولا تكرر نفس السيريال في الحقلين إطلاقاً إذا كانا مختلفين.
6. قواعد السداد والدفع وطرق الدفع المتعددة في نفس العملية (Split Payments):
- إذا تم الدفع بطريقة واحدة: استخرج amount_paid و payment_method (مثال: "دفع 20 ألف كاش" -> amount_paid: 20000, payment_method: "خزنة").
- إذا تم تقسيم السداد على أكثر من طريقة دفع في نفس العملية (مثال: "دفع 20 ألف نقدي/كاش، و 3500 إنستاباي، و 2000 فودافون كاش"):
  * استخرج مصفوفة payments تحتوي تفاصيل كل وسيلة ومبلغها:
    "payments": [
      { "method": "خزنة", "amount": 20000 },
      { "method": "إنستاباي", "amount": 3500 },
      { "method": "فودافون كاش", "amount": 2000 }
    ]
  * احسب إجمالي المدفوع: "amount_paid": 25500
  * اضبط "payment_method": "متعدد (خزنة + إنستاباي + فودافون كاش)"
- قاموس توحيد مصطلحات وسائل الدفع:
  * (نقدي / كاش / كاش باليد / يدوي / في الإيد / استلمنا كاش / خزنة) -> "خزنة"
  * (إنستاباي / انستا باي / تطبيق انستاباي / تحويل بنكي / بنك مصر شخصي / حساب شخصي) -> "إنستاباي"
  * (فودافون كاش / كاش فودافون / محفظة فودافون) -> "فودافون كاش"
  * (محفظة بنك مصر / محفظة بنكية) -> "محفظة بنك مصر"
  * (حساب الشركة / حساب بيزنيس / بنك الشركة) -> "حساب الشركة"
7. إذا لم يتم ذكر المبلغ المدفوع أو طريقة الدفع صراحة في الكلام (ولم يُقل كاش أو آجل أو إنستاباي أو غيرها)، اترك amount_paid و payment_method كـ null ليقوم النظام بالسؤال عنها.
8. إذا قيل في الكلام: (تم دفع زيرو / دفع صفر / مدفعش حاجة / آجل / لم نسدد شيء / لم يدفع / الباقي كله آجل) -> يتم تعيين amount_paid = 0 و payment_method = "آجل".
9. مرونة كاملة في ترتيب نطق البيانات (Flexible Speech Order):
- لا يشترط أي ترتيب معين للكلام إطلاقاً! المتحدث يمكنه ذكر البيانات بأي ترتيب (مثلاً: البدء بكلمة "إذن مجمع" أو اسم المورد أو الماركة أو السيريالات أو السعر أو المبلغ المدفوع). مهمتك التقاط كافة البيانات بغض النظر عن ترتيبها في الجملة.

10. قواعد الإذن المجمع الصارمة وسرد السيريالات (Batch Orders):
- الإذن المجمع يشترط دائماً أن تكون **جميع الأجهزة متطابقة تماماً في كل شيء** (الماركة، الموديل، القدرة، وسعر الوحدة)، والاختلاف الوحيد المسموح به هو أرقام السيريالات (الفانة والكباس) فقط.
- ممنوع دمج أجهزة أو موديلات مختلفة في نفس الإذن المجمع إطلاقاً.
- طرق نطق السيريالات في الإذن المجمع واستخراجها:
  * الطريقة (أ) - كل جهاز بزوج سيريالاته (مثال: "الجهاز الأول فانة 111 وكباس 222، والجهاز التاني فانة 333 وكباس 444"):
    -> استخرج: الجهاز الأول (indoor: 111, outdoor: 222)، والجهاز الثاني (indoor: 333, outdoor: 444).
  * الطريقة (ب) - تجميع الفانات أولاً ثم تجميع الكباسات (مثال: "الفانة الأولى 111 والفانة التانية 333، والكباس الأول 222 والكباس التاني 444"):
    -> قم تلقائياً بمطابقة الفانة الأولى 111 مع الكباس الأول 222، ومطابقة الفانة الثانية 333 مع الكباس الثاني 444.
  * الطريقة (ج) - سرد السيريالات متتالية:
    -> وزعها بالترتيب زوجاً زوجاً (فانة ثم كباس للجهاز الأول، فانة ثم كباس للجهاز الثاني).
- في بيانات الـ JSON للإذن المجمع، اضبط دائماً:
  * "is_batch": true
  * "total_devices": عدد الأجهزة الكلي
  * "brand": الماركة الموحدة
  * "capacity": القدرة الموحدة
  * "items": [
      { "indoor_serial": "111", "outdoor_serial": "222" },
      { "indoor_serial": "333", "outdoor_serial": "444" }
    ]
  * "indoor_serials": ["111", "333"]
  * "outdoor_serials": ["222", "444"]
- معالجة الأسعار في الإذن المجمع:
  * إذا ذُكر السعر الإجمالي (مثال: "الإجمالي 40 ألف" أو "40000 كاش"): اضبط cost_price أو sale_price = 40000.
  * إذا ذُكر سعر الجهاز الواحد (مثال: "سعر الجهاز 20 ألف"): اضرب في عدد الأجهزة واضبط cost_price أو sale_price = 40000.
- يجب أن تكون capacity دائماً وأبداً بإحدى هذه القيم القياسية فقط: "1.5-حصان", "2.25-حصان", "3-حصان", "4-حصان", "5-حصان".

11. قاعدة حاسمة وشاملة للأفعال الدارجة والعامية المصرية (اخدنا / خدنا / استلمنا / قبضنا):
- إذا قيل "اخدنا / خدنا / استلمنا / جبنا / اشترينا / دخلنا / جانا" متبوعة بـ (أجهزة / تكييفات / موديل تكييف / سيريالات):
  -> تُصنف فوراً كـ device_intake (إذن استلام وتوريد أجهزة للمخزن)، مثال: "اخدنا النهاردة جهازين ميديا من توفيق" أو "خدنا 3 تكييفات كاريير".
- إذا قيل "اخدنا / خدنا / قبضنا / حصلنا / استلمنا / لمينا" متبوعة بـ (مبلغ مالي / فلوس / آلاف):
  * إذا كانت من تاجر (مثال: "اخدنا 5000 جنيه من التاجر وائل" أو "خدنا من التاجر 20 ألف") -> تُصنف كـ trader_collection (تحصيل من تاجر).
  * إذا كانت من عميل (مثال: "اخدنا 5000 من العميل محمد" أو "خدنا القسط من العميل") -> تُصنف كـ customer_collection (تحصيل من عميل).
  * إذا لم يُذكر تاجر أو عميل (مثال: "اخدنا 5000 جنيه صيانة أو إيراد" أو "جالنا تحويل 3000") -> تُصنف كـ revenue (إيراد عام).
- إذا قيل "دفعنا / سددنا / حولنا / خرجنا / ادينا" لمورد أو تاجر -> تُصنف كـ supplier_payment (سداد دفعة).

قائمة أكواد وأرقام التجار والموردين الرسمية:
- [1]: محمد سعيد
- [2]: شارب فيوتشر (شارب العربي - فيوتشر)
- [3]: شارب ارت كول (شارب العربي - ارت كول)
- [4]: احمد عكري
- [5]: توفيق سالم
- [6]: تجار وموردين متنوعين (يشمل التجار الفرعيين مثل: تجار وموردين متنوعين بين قوسين فلان)
- [7]: وليد عطية (وليد عطية اير كول)
- [8]: نشأت
- [9]: محمد تبع سعد
- [10]: محمد سامي
- [11]: مايكل عزبة النخل
- [12]: وائل جمال
- [13]: نعيم
- [14]: فرج
- [15]: عبدالعزيز عين شمس

قاعدة رقم/كود التاجر والمورد والتوريد:
- إذا نُطق أو كُتب رقم أو كود التاجر والمورد (مثال: "للتاجر 5" أو "التاجر رقم 5" أو "تاجر رقم 11" أو "المورد 5" أو "تاجر 8" أو "من 12" أو "حساب 13" أو "توفيق سالم"):
  -> استخرج فوراً الاسم الرسمي المقابل له من القائمة أعلاه (مثال: "التاجر رقم 5" أو "توفيق سالم" -> اضبط supplier_name: "توفيق سالم" و trader_name: "توفيق سالم").
- في عمليات التوريد والاستلام (device_intake) وسداد الموردين (supplier_payment)، اضبط دائماً supplier_name و trader_name باسم المورد/التاجر الرسمي.
- في عمليات الصرف لتاجر (device_dispatch_trader) والتحصيل من تاجر (trader_collection)، اضبط دائماً trader_name و supplier_name باسم التاجر الرسمي.
- إذا أرسل المستخدم اسماً أو رقماً مفرداً (مثال: "توفيق سالم" أو "التاجر رقم 5" أو "5") في سياق استكمال بيانات ناقصة، استخرج supplier_name و trader_name فوراً.

قواعد تصنيف العمليات بدقة لمنع أي تداخل (Intent Disambiguation):
- work_order: أمر شغل يتفرع إلى (صيانة أو أعمال إضافية) لعميل مع تفاصيل العمل المنفذ وأسماء الفنيين والمبلغ.
- device_intake: استلام أو توريد أو شراء أو أخذ أجهزة جديدة ودخولها للمخزن من مورد أو تاجر (مثال: إذن استلام من التاجر توفيق / اخدنا جهازين ميديا من فلان / استلمنا جهاز من فلان / توريد تكييفات من فلان).
- device_dispatch_trader: صرف أو بيع أو خروج جهاز من المخزن لتاجر (مثال: صرف للتاجر فلان / بيع للتاجر فلان / إذن صرف لتاجر / ادينا التاجر جهاز).
- device_dispatch_customer: صرف أو بيع أو تركيب جهاز لعميل مباشر (يشمل: اسم العميل، عنوان، هاتف، سيريالات، سعر بيع).
- customer_collection: تحصيل واستلام فلوس أو قسط من عميل مباشر (مثال: اخدنا من العميل 5000 جنيه / حصلنا من العميل فلان 3000 جنيه / فلان سدد باقي حسابه).
- trader_collection: تحصيل واستلام فلوس أو دفعات نقدية من تاجر على حسابه (مثال: اخدنا من التاجر 5000 جنيه / حصلنا من التاجر فلان 50 ألف / التاجر فلان سدد لنا 20 ألف).
- supplier_payment: سداد أو دفع فلوس لمورد أو تاجر على حسابه (مثال: سددنا للتاجر فلان 25 ألف / دفعنا للمورد فلان 40 ألف / حولنا للتاجر توفيق 20 ألف). انتبه: أي دفع أو سداد موجه لشخص/تاجر/مورد هو supplier_payment (خروج نقدية)!
- salary_advance: سلفة مالية لفني أو موظف (مثال: سلفة 1000 جنيه للفني فلان).
- attendance: تسجيل حضور أو غياب أو تأخير موظفين فقط (مثال: شعراوي حاضر، غياب فلان).
- expense: أي مصروف عام للشركة أو بنزين أو شاي أو إيجار أو صيانة سيارات لا يخص سداد مورد أو سلفة فني.
- revenue: أي إيراد عام للشركة (صيانة، غسيل، فك وتركيب) لا يخص مبيعات تكييفات أو تحصيل عملاء.
- query_stock: استعلام عن بضاعة المخزن المتاحة فقط (مثال: رصيد الكونسيلد، متاح إيه كاريير).
- query_statement: استعلام عن كشف حساب مورد أو تاجر.

12. قاعدة تاريخ المعاملة (date):
- إذا نُطق أو كُتب تاريخ صراحة في الكلام (مثال: "بتاريخ 15/8" أو "بتاريخ 15 اغسطس" أو "تاريخ العملية امبارح" أو "بتاريخ 2026-08-10" أو "أول الشهر") -> قم بتحويله وإخراجه بصيغة YYYY-MM-DD (مثال: "2026-08-15").
- إذا لم يُذكر تاريخ صراحة في الكلام إطلاقاً -> اترك date كـ null ليقوم النظام تلقائياً باعتماء تاريخ اليوم (النهاردة) دون الحاجة للسؤال عنه.

13. الدقة الفائقة للأرقام المتتالية والمتكررة في العامية المصرية (منع زيادة أو تكرار الأرقام):
- انتبه بدقة شديدة: عندما ينطق المتحدث في العامية المصرية أرقاماً متكررة في السيريال:
  * "اتنين اتنين" أو "اتنينين" -> تُكتب "22" فقط (رقمين 2) وممنوع كتابتها "222".
  * "تلاتة تلاتة" -> تُكتب "33" فقط (رقمين 3) وممنوع كتابتها "333".
  * "ستة ستة" -> تُكتب "66" فقط.
- ممنوع تماماً اختلاق أو زيادة أي رقم لم يُنطق صراحة في التسجيل الصوتي.
  * مثال دقيق: إذا نطق المتحدث "زيرو تمانية اتنين ستة واحد اتنين اتنين تلاتة سبعة" -> يجب أن يكون السيريال المستخرج: "082612237" (9 أرقام بالضبط) وممنوع تكرار رقم 2 ليصبح 0826122237.
  * مثال آخر: إذا نطق المتحدث "زيرو تمانية اتنين ستة واحد اتنين تلاتة تلاتة خمسة تلاتة" -> يجب أن يكون السيريال المستخرج: "0826123353" (10 أرقام بالضبط).

14. قواعد أسماء العملاء وتنسيق الأقواس والألقاب والشهرة:
- إذا نطق المتحدث عبارة "بين قوسين كذا" (مثال: "زينب سعيد بين قوسين أم عمر" أو "محمد علي بين قوسين أبو يوسف"):
  * يجب كتابتها بالأقواس الفعلية: "زينب سعيد (أم عمر)" أو "محمد علي (أبو يوسف)".
  * ممنوع منعاً باتاً كتابة الكلمات الحرفية "بين قوسين" في حقل customer_name أو الوصف أو أي حقل آخر!
- أي توجيه صوتي للأقواس (مثل "افتح قوس ... اقفل قوس" أو "قوسين كذا") يتم تحويله لأقواس فعلية (...) مباشرة دون كتابة الكلمات الحرفية.

15. قاعدة كارت "تجار وموردين متنوعين" والتجار الفرعيين (الذين ليس لديهم كارت تاجر منفصل):
- كارت "تجار وموردين متنوعين" (أو تجار وموزعين متنوعين) في المنظومة هو الحساب المجمع لجميع التجار والموردين الفرعيين الذين ليس لديهم كارت تاجر مستقل خاص بهم.
- إذا قال المتحدث أو كتب: "تم استلام من تجار وموردين متنوعين بين قوسين عبدالله سعد" أو "تجار وموردين متنوعين (عبدالله سعد)" أو "تجار وموزعين متنوعين بين قوسين فلان" أو "صرف لتجار وموردين متنوعين بين قوسين فلان":
  * التاجر/المورد هو كارت: "تجار وموردين متنوعين"
  * والتاجر الفرعي الفعلي يوضع بين قوسين دائماً: "(عبدالله سعد)"
  * اضبط الحقول دائماً:
    "supplier_name": "تجار وموردين متنوعين (عبدالله سعد)",
    "trader_name": "تجار وموردين متنوعين (عبدالله سعد)",
    "custom_trader_name": "عبدالله سعد"
- لا تبتكر كارت تاجر مستقل جديد له، بل اجعل supplier_name و trader_name دائماً: "تجار وموردين متنوعين ([الاسم])".
- ممنوع كتابة الكلمات الحرفية "بين قوسين" في أي حقل نهائياً، بل استبدلها دائماً بأقواس فعلية: (اسم التاجر).

صيغة الـ JSON المطلوبة:
{
  "intent": "work_order" | "device_intake" | "device_dispatch_trader" | "device_dispatch_customer" | "customer_collection" | "supplier_payment" | "trader_collection" | "salary_advance" | "expense" | "revenue" | "attendance" | "query_stock" | "query_statement" | "general_chat",
  "data": {
    "date": "التاريخ بصيغة YYYY-MM-DD إن وجد أو null ليصبح تاريخ اليوم تلقائياً",
    "work_order_type": "صيانة" أو "أعمال إضافية",
    "supplier_name": "اسم المورد (للتوريد أو السداد)",
    "trader_name": "اسم التاجر (للصرف لتاجر أو التحصيل)",
    "customer_name": "اسم العميل المباشر",
    "customer_phone": "رقم هاتف العميل",
    "customer_address": "عنوان العميل ومكان التركيب",
    "technicians": "أسماء الفنيين أو الموظفين الذين قاموا بأمر الشغل حتى لو أكثر من شخص (مثل: شعراوي ومحمد، عبده، اسلام)",
    "technician_name": "اسم الفني المسؤول أو صاحب السلفة (مثل: شعراوي، عبده، أحمد، اسلام)",
    "attendance_status": "حاضر" أو "غائب" أو "تأخير",
    "arrival_time": "وقت الحضور مثل 09:30",
    "brand": "الماركة والموديل بالضبط (مثل: كاريير بارد عادي، كاريير بارد انفرتر، كاريير بارد ساخن عادي، كاريير بارد ساخن انفرتر، كاريير كونسيلد، ميديا بارد عادي، ميديا بارد انفرتر، ميديا بارد ساخن عادي، شارب بارد عادي، شارب بارد انفرتر، تورنيدو بارد عادي، ال جي بارد عادي، فريش بارد عادي، هاير بارد عادي، جري بارد عادي)",
    "capacity": "القدرة (مثل: 1.5-حصان، 2.25-حصان، 3-حصان، 4-حصان، 5-حصان)",
    "indoor_serial": "سيريال الفانة (الوحدة الداخلية) كـ String من أرقام إنجليزية",
    "outdoor_serial": "سيريال الكباس (الوحدة الخارجية) كـ String من أرقام إنجليزية",
    "cost_price": رقم تكلفة الشراء كـ Number فقط,
    "sale_price": رقم سعر البيع كـ Number فقط,
    "amount_paid": رقم المبلغ المدفوع كـ Number فقط,
    "amount_remaining": رقم المبلغ المتبقي كـ Number فقط,
    "amount": رقم المبلغ كـ Number فقط للمصروفات والإيرادات والسلف والدفعات,
    "payment_method": "خزنة" أو "فودافون كاش" أو "إنستاباي" أو "محفظة بنك مصر" أو "حساب الشركة" أو "آجل" أو "متعدد",
    "payments": [
      { "method": "خزنة", "amount": 20000 },
      { "method": "إنستاباي", "amount": 3500 }
    ],
    "description": "بيان وتفاصيل الحركة",
    "is_installment": true / false,
    "installment_months": عدد أشهر التقسيط كـ Number,
    "installment_monthly": القسط الشهري كـ Number
  },
  "raw_transcription": "التفريغ النصي الحرفي الكامل للكلام"
}`;

// Fast Gemini Model Priority Hierarchy (Ultra-fast multimodal audio & text models)
export const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',    // ~1.3s (Primary Ultra-Fast for Audio & Text)
  'gemini-flash-lite-latest', // ~1.7s (High-Speed Backup)
  'gemini-3.5-flash'          // High-Accuracy Fallback
];

export function extractApiKeys(keyInput) {
  if (!keyInput) return [];
  if (Array.isArray(keyInput)) return keyInput.filter(Boolean);
  return String(keyInput).split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════════════
// ⚡ ULTRA-FAST MULTI-KEY LOAD BALANCER & KEY DISTRIBUTOR
// ════════════════════════════════════════════════════════════════════

let _keyCounter = 0;
const _invalidKeyTimestamps = new Map();

export function getBalancedSlots(keys, models = GEMINI_MODELS) {
  if (!keys || keys.length === 0) return [];

  const now = Date.now();
  // Filter out temporarily invalid keys (cooldown: 5 minutes)
  const activeKeys = keys.filter(k => {
    const invalidSince = _invalidKeyTimestamps.get(k);
    if (!invalidSince) return true;
    if (now - invalidSince > 5 * 60 * 1000) {
      _invalidKeyTimestamps.delete(k);
      return true;
    }
    return false;
  });

  const targetKeys = activeKeys.length > 0 ? activeKeys : keys;

  // Pick starting key atomically across requests
  const startKeyIdx = _keyCounter % targetKeys.length;
  _keyCounter = (_keyCounter + 1) % targetKeys.length;

  const rotatedKeys = [
    ...targetKeys.slice(startKeyIdx),
    ...targetKeys.slice(0, startKeyIdx)
  ];

  // Interleave models across rotated keys so consecutive attempts don't hit the same model/key
  const slots = [];
  const primaryModels = models.slice(0, 2);
  const fallbackModels = models.slice(2);

  // Round 1: Interleave primary models across rotated keys
  for (let i = 0; i < rotatedKeys.length; i++) {
    const model = primaryModels[i % primaryModels.length];
    const key = rotatedKeys[i];
    slots.push({ model, key });
  }

  // Round 2: Inverted primary combinations
  for (let i = 0; i < rotatedKeys.length; i++) {
    const model = primaryModels[(i + 1) % primaryModels.length];
    const key = rotatedKeys[i];
    slots.push({ model, key });
  }

  // Round 3: Fallback models
  for (const model of fallbackModels) {
    for (const key of rotatedKeys) {
      slots.push({ model, key });
    }
  }

  return slots;
}

// Low-level High-Performance Single Gemini Request with Clean Standard HTTPS (Zero socket-reuse hangs)
export function sendGeminiRequest(modelName, apiKey, postData, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const data = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
            resolve({ ok: true, data: parsed, text: parsed.candidates[0].content.parts[0].text });
          } else {
            const errObj = parsed.error || {};
            const isQuota = res.statusCode === 429 || errObj.code === 429 || errObj.status === 'RESOURCE_EXHAUSTED' || (errObj.message && errObj.message.includes('quota'));
            const isForbidden = res.statusCode === 401 || res.statusCode === 403 || errObj.code === 401 || errObj.code === 403;
            if (isForbidden && apiKey) {
              _invalidKeyTimestamps.set(apiKey, Date.now());
            }
            resolve({ ok: false, isQuota, isForbidden, status: res.statusCode, error: errObj });
          }
        } catch (e) {
          resolve({ ok: false, isQuota: false, isForbidden: false, status: res.statusCode, error: { message: e.message } });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, isQuota: false, isForbidden: false, status: 408, error: { message: `Gemini request timeout (${Math.round(timeoutMs / 1000)}s)` } });
    });

    req.on('error', (err) => resolve({ ok: false, isQuota: false, isForbidden: false, error: err }));
    req.write(postData);
    req.end();
  });
}

// Helper: Clean speech parenthesis artifacts (e.g. "بين قوسين كذا" -> "(كذا)")
export function cleanParenthesesInObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key]
        .replace(/\s*(?:بين\s+قوسين|بين\s+القوسين|قوسين)\s+([^\s,)]+(?:\s+[^\s,)]+)*)/gi, ' ($1)')
        .replace(/\s*\(\s*/g, ' (')
        .replace(/\s*\)\s*/g, ') ')
        .trim();
    } else if (typeof obj[key] === 'object') {
      cleanParenthesesInObject(obj[key]);
    }
  }
  return obj;
}

// Resilient JSON Clean & Character-level Deep Repair Extractor
export function extractAndParseJson(rawText) {
  if (!rawText) return { intent: 'general_chat', data: {}, raw_transcription: '' };

  let clean = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try {
    return cleanParenthesesInObject(JSON.parse(clean));
  } catch (e1) {}

  let s = clean
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ');

  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    s = s.substring(firstBrace, lastBrace + 1);
  } else if (firstBrace !== -1) {
    s = s.substring(firstBrace);
  }

  s = s.replace(/,\s*([\]}])/g, '$1');

  try {
    return cleanParenthesesInObject(JSON.parse(s));
  } catch (e2) {}

  // Character-by-character scanner to escape raw newlines/tabs inside strings and auto-close
  let result = '';
  let inString = false;
  let isEscaped = false;
  const stack = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (isEscaped) {
        result += ch;
        isEscaped = false;
      } else if (ch === '\\') {
        result += ch;
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
        result += ch;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else if (ch.charCodeAt(0) < 32) {
        result += ' ';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
        result += ch;
      } else {
        if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === ch) {
            stack.pop();
          }
        }
        result += ch;
      }
    }
  }

  if (inString) result += '"';
  result = result.replace(/,\s*$/, '');
  while (stack.length > 0) result += stack.pop();

  try {
    return cleanParenthesesInObject(JSON.parse(result));
  } catch (e3) {
    console.error('Failed to parse repaired JSON:', clean);
    throw new Error('تعذر قراءة بيانات العملية من الذكاء الاصطناعي');
  }
}

// ⚡ Universal ERP Parser with Speculative Hedging, Dynamic MimeType & Resilient Engine
export async function parseERPWithGemini(input, keyInput, isAudio = false, pendingSession = null, mimeType = 'audio/ogg') {
  const allKeys = extractApiKeys(keyInput);
  if (allKeys.length === 0) {
    throw new Error('لم يتم ضبط مفتاح الذكاء الاصطناعي (Gemini API Key).');
  }

  let promptText = ERP_SYSTEM_PROMPT;
  const hasPendingData = pendingSession?.data && Object.keys(pendingSession.data).length > 0;
  if (pendingSession && pendingSession.intent && hasPendingData) {
    promptText += `\n\n📌 تنبيه سياق العملية المعلقة الحالية (Active Pending Session):
هناك عملية سابقة معلقة قيد استكمال بياناتها من نوع: [${pendingSession.intent}]
البيانات التي تم جمعها مسبقاً:
${JSON.stringify(pendingSession.data, null, 2)}

قواعد سياق هامة:
1. إذا كانت هذه الرسالة أو الفويس تمثل استكمالاً لبيانات ناقصة في العملية السابقة (مثل ذكر اسم عميل أو رقم هاتف أو سيريال أو سعر بمفرده): احتفظ بنفس الـ intent السابق "${pendingSession.intent}" واجمع البيانات الجديدة مع السابقة.
2. إذا كانت هذه الرسالة أو الفويس تمثل عملية جديدة كاملة مستقلة ببياناتها: صنفها واستخرجها كعملية جديدة مستقلة تماماً ولا تجبرها على العملية السابقة.`;
  }

  const parts = [];
  if (isAudio) {
    const base64Audio = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
    parts.push({ text: promptText });
    parts.push({
      inline_data: {
        mime_type: mimeType || 'audio/ogg',
        data: base64Audio
      }
    });
  } else {
    parts.push({ text: `${promptText}\n\nالنص المطلوب تحليله:\n"${input}"` });
  }

  const postData = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 3072,
      response_mime_type: 'application/json'
    }
  });

  const slots = getBalancedSlots(allKeys, GEMINI_MODELS);
  const timeoutMs = isAudio ? 25000 : 8000;
  const hedgeDelayMs = isAudio ? 6500 : 2500;
  const slotTraces = [];
  let lastError = null;

  return new Promise((resolve, reject) => {
    let resolved = false;
    let activeAttempts = 0;
    let slotIdx = 0;

    const trySlot = (slot) => {
      if (resolved || !slot) return;
      activeAttempts++;
      const t0 = Date.now();

      // Launch speculative backup slot if primary doesn't return within hedgeDelayMs
      let hedgeTimer = null;
      if (slotIdx < slots.length) {
        hedgeTimer = setTimeout(() => {
          if (!resolved && slotIdx < slots.length) {
            const nextSlot = slots[slotIdx++];
            trySlot(nextSlot);
          }
        }, hedgeDelayMs);
      }

      sendGeminiRequest(slot.model, slot.key, postData, timeoutMs)
        .then((res) => {
          if (hedgeTimer) clearTimeout(hedgeTimer);
          const dur = Date.now() - t0;
          slotTraces.push({
            model: slot.model,
            keyPrefix: slot.key.slice(0, 10),
            dur,
            status: res.status,
            ok: res.ok,
            err: res.error?.message
          });

          if (res.ok && !resolved) {
            try {
              const parsed = extractAndParseJson(res.text);
              parsed._debug_traces = slotTraces;
              resolved = true;
              return resolve(parsed);
            } catch (parseErr) {
              lastError = parseErr.message;
            }
          } else if (!res.ok) {
            lastError = res.error?.message || `Status ${res.status}`;
          }

          activeAttempts--;
          // If this slot failed and we are not resolved, launch next immediately
          if (!resolved) {
            if (slotIdx < slots.length) {
              const nextSlot = slots[slotIdx++];
              trySlot(nextSlot);
            } else if (activeAttempts <= 0) {
              reject(new Error(`تعذر معالجة الطلب مؤقتاً (${slotTraces.map(s => `${s.model}:${s.status || 'err'}(${s.dur}ms)`).join(', ')}): ${lastError}`));
            }
          }
        })
        .catch((err) => {
          if (hedgeTimer) clearTimeout(hedgeTimer);
          activeAttempts--;
          lastError = err.message;
          if (!resolved) {
            if (slotIdx < slots.length) {
              const nextSlot = slots[slotIdx++];
              trySlot(nextSlot);
            } else if (activeAttempts <= 0) {
              reject(new Error(`تعذر معالجة الطلب مؤقتاً: ${lastError}`));
            }
          }
        });
    };

    // Kick off first slot
    const firstSlot = slots[slotIdx++];
    trySlot(firstSlot);
  });
}

// Direct Audio-to-JSON understanding
export async function transcribeWithGemini(buffer, apiKey) {
  const res = await parseERPWithGemini(buffer, apiKey, true);
  if (res && res.data) {
    return {
      type: res.intent === 'revenue' ? 'إيراد' : 'مصروف',
      amount: res.data.amount || res.data.amount_paid || res.data.cost_price || res.data.sale_price || 0,
      description: res.data.description || res.raw_transcription || 'حركة نقدية',
      payment_method: res.data.payment_method || 'خزنة',
      full_erp: res
    };
  }
  return null;
}

// Gemini Vision for Receipts & Payment Screenshots
export async function analyzeReceiptPhotoWithGemini(photoBuffer, keyInput) {
  const allKeys = extractApiKeys(keyInput);
  if (allKeys.length === 0) return null;

  const base64Image = photoBuffer.toString('base64');
  const postData = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `أنت نظام محاسبي ذكي مصري. انظر إلى صورة الفاتورة أو إيصال التحويل (إنستاباي / فودافون كاش / تحويل بنكي / إيصال استلام نقدية / فاتورة شراء) واستخرج تفاصيل الحركة بصيغة JSON نقية بدون أي علامات markdown:
{
  "type": "مصروف" أو "إيراد",
  "amount": رقم المبلغ كـ Number فقط (مثال: 3500),
  "description": "بيان أو سبب التحويل أو الشراء المكتوب في الإيصال",
  "payment_method": "خزنة" أو "فودافون كاش" أو "إنستا باي" أو "محفظة بنك مصر" أو "حساب الشركة" أو "تحويل بنكي"
}`
          },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      response_mime_type: 'application/json'
    }
  });

  const slots = getBalancedSlots(allKeys, GEMINI_MODELS);
  for (const { model, key } of slots) {
    const res = await sendGeminiRequest(model, key, postData, 25000);
    if (res.ok) {
      return extractAndParseJson(res.text);
    }
  }

  return null;
}

// Gemini Vision for Document Classification & Checkbox Inspection
export async function classifyDocumentPhotoWithGemini(photoBuffer, keyInput) {
  const allKeys = extractApiKeys(keyInput);
  if (allKeys.length === 0) return null;

  const base64Image = photoBuffer.toString('base64');
  const postData = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `أنت نظام محاسبي ذكي مصري متخصص في فحص وقراءة مستندات شركة تكييفات.
انظر بدقة متناهية إلى صورة هذا المستند واستخرج نوعه وتفاصيله:

1. افحص أعلى الورقة: هل هي ورقة مطبوعة بعنوان "إذن استلام / صرف تكييف"؟
   - افحص مربع الاختيار (الصح أو العلامة أو القلم):
     * إذا تمت الإشارة أو وضع صح أو علامة أو خط بجوار "صرف" -> doc_type: "إذن صرف مبيعات", doc_marker: "__delivery_note__"
     * إذا تمت الإشارة أو وضع صح أو علامة أو خط بجوار "استلام" -> doc_type: "إذن استلام وتوريد", doc_marker: "__intake_receipt__"
2. إذا كان مكتوباً على الورقة "عقد بيع" أو "عقد توريد" -> doc_type: "عقد بيع وتوريد", doc_marker: "__contract__"
3. إذا كان مكتوباً "محضر تركيب" أو "أمر شغل" أو "تقرير صيانة" -> doc_type: "محضر تركيب وتسليم", doc_marker: "__job_order__"
4. إذا كانت فاتورة شراء ضريبية أو إيصال تحويل بانكي / إنستاباي / فودافون كاش -> doc_type: "فاتورة / إيصال دفع", doc_marker: "__cash_receipt__"

استخرج السيريالات المكتوبة في الجدول (الوحدة الداخلية / الوحدة الخارجية) إن وجدت، واسم العميل.

أخرج النتيجة بصيغة JSON نقية:
{
  "doc_type": "إذن صرف مبيعات" أو "إذن استلام وتوريد" أو "عقد بيع وتوريد" أو "محضر تركيب وتسليم" أو "فاتورة / إيصال دفع",
  "doc_marker": "__delivery_note__" أو "__intake_receipt__" أو "__contract__" أو "__job_order__" أو "__cash_receipt__",
  "customer_name": "اسم العميل أو التاجر المكتوب إن وجد",
  "serials": ["أرقام سيريالات الفانات والكباسات الاستخراجية من الورقة"]
}`
          },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      response_mime_type: 'application/json'
    }
  });

  const slots = getBalancedSlots(allKeys, GEMINI_MODELS);
  for (const { model, key } of slots) {
    const res = await sendGeminiRequest(model, key, postData, 10000);
    if (res.ok) {
      return extractAndParseJson(res.text);
    }
  }

  return null;
}

// Main Transcribe and Parse function
export async function transcribeAndParseVoice(audioBuffer, envKeys = {}) {
  const geminiKey = envKeys.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const geminiResult = await transcribeWithGemini(audioBuffer, geminiKey);
      if (geminiResult && (geminiResult.amount || geminiResult.description)) {
        return {
          rawText: geminiResult.description || '',
          type: geminiResult.type || 'مصروف',
          amount: Number(geminiResult.amount) || 0,
          paymentMethod: geminiResult.payment_method || 'خزنة',
          description: `${geminiResult.description || 'حركة نقدية'} | ${geminiResult.payment_method || 'خزنة'}`
        };
      }
    } catch (e) {
      console.warn('Gemini direct audio transcription error:', e.message);
    }
  }

  throw new Error('لم يتمكن الذكاء الاصطناعي من تحويل الصوت، يرجى إعادة تسجيل الفويس بوضوح أو كتابة الحركة كنص.');
}
