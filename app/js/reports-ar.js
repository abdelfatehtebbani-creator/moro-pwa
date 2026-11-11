// Arabic texts of the reports. The reports are built in English (reports.js); on an Arabic screen the
// built report is read through this dictionary: its title, subtitle, column names and the fixed words
// of its cells (types, statuses, stores, months). Names of items and parties come in Arabic from the data.
const W = {
  // titles
  'Fast Moving Items Report': 'الأصناف سريعة الحركة', 'Sensitive Items Report': 'الأصناف الحساسة', 'Items at or below minimum stock': 'الأصناف عند الحد الأدنى أو دونه',
  'Stock with expiry': 'المخزون وتواريخ الصلاحية', 'Inventory changes': 'تغيرات المخزون', 'Consumption by item': 'الاستهلاك حسب الصنف',
  'Consumption by department': 'الاستهلاك حسب القسم', 'Item consumption (summary)': 'صرف الصنف (ملخص)', 'Item consumption (detailed)': 'صرف الصنف (تفصيلي)',
  'Item receipts (summary)': 'استلام الصنف (ملخص)', 'Item receipts (detailed)': 'استلام الصنف (تفصيلي)', 'Price differences': 'فروق الأسعار',
  'Traceability: materials issued and their batches': 'التتبع: المواد المصروفة ودفعاتها', 'Shop orders: time of each step': 'طلبيات المحلات: وقت كل مرحلة',
  'Shop orders: received short': 'طلبيات المحلات: استلام ناقص', 'Shop orders: could not be supplied': 'طلبيات المحلات: ما تعذّر توفيره',
  'Shop sales (invoices)': 'مبيعات المحلات (الفواتير)', 'Cost and margin of the shop invoices': 'التكلفة والهامش لفواتير المحلات',
  'Sales by channel': 'المبيعات حسب القناة', 'Cash (QR)': 'النقد (ر.ق)', 'Draft': 'مسودة', 'Sent': 'مُرسلة', 'Returned': 'مُعادة',
  'Cash: the shifts of the day; the other channels: the daily sales sheet': 'النقد: نوبات اليوم؛ بقية القنوات: يومية المبيعات',
  'Shop takings': 'مقبوضات المحلات', 'Takings (QR)': 'المقبوضات (ر.ق)', 'Takings − invoiced (QR)': 'المقبوضات − المفوتر (ر.ق)',
  'Takings: the cash its cashiers declared; takings − invoiced below zero: it sold less than it received': 'المقبوضات: ما صرّح به كاشيرو المحل؛ المقبوضات − المفوتر تحت الصفر: باع أقل مما استلم',
  'Line': 'السطر', 'Difference = received − declared (negative: short)': 'الفرق = المستلم − المصرّح به (السالب: عجز)',
  'Cashier': 'الكاشير', 'Shifts': 'النوبات', 'Declared (QR)': 'المصرّح به (ر.ق)', 'Received (QR)': 'المستلم (ر.ق)', 'Difference (QR)': 'الفرق (ر.ق)', 'Not received yet': 'لم يُستلم بعد',
  'Losses: disposals, count differences, returns and goods lost on the way': 'الخسائر: الإتلاف وفروق الجرد والمرتجعات والضائع في الطريق',
  // subtitle parts
  'Sent → approved → ready → loaded → delivered → received': 'إرسال ← اعتماد ← جاهزة ← تحميل ← تسليم ← استلام',
  'Balance on that day at the last purchase price before it': 'الرصيد في ذلك اليوم بسعر آخر شراء قبله', 'No price: never bought': 'بلا سعر: لم يُشترَ قط',
  'Cost: recipe ingredients or the item at its last purchase price': 'التكلفة: مكوّنات الوصفة أو الصنف بسعر آخر شراء',
  'Empty: no cost known (no recipe, special product)': 'فارغ: تكلفة غير معروفة (بلا وصفة، منتج خاص)',
  'A shop margin leaves out the lines without cost': 'هامش المحل لا يشمل الأسطر بلا تكلفة', 'Negative = stock lost': 'السالب = مخزون مفقود',
  'Batch worked out by "first received, first out"': 'الدفعة محسوبة بقاعدة "الوارد أولًا يُصرف أولًا"',
  // columns
  'Item': 'الصنف', 'Unit': 'الوحدة', 'Quantity': 'الكمية', 'Shop': 'المحل', 'Value (QR)': 'القيمة (ر.ق)', 'Total': 'الإجمالي', 'Store': 'المخزن',
  'Order': 'الطلبية', 'Order date': 'تاريخ الطلبية', 'Department': 'القسم', 'Date': 'التاريخ', 'Supplier': 'المورد', 'Supplier / Department': 'المورد / القسم',
  'Received': 'استُلم', 'Reason': 'السبب', 'Quantity issued': 'الكمية المصروفة', 'Expiry date': 'تاريخ الصلاحية', 'Category': 'الفئة', 'Used': 'المستهلك',
  'Unit cost (QR)': 'تكلفة الوحدة (ر.ق)', 'Type': 'النوع', 'Total quantity': 'إجمالي الكمية', 'Total (QR)': 'الإجمالي (ر.ق)', 'Suggested order': 'الطلب المقترح',
  'Store items (QR)': 'مواد المخزن (ر.ق)', 'Status': 'الحالة', 'Short': 'الناقص', 'Share': 'النسبة', 'Sent': 'الإرسال', 'Sales (QR)': 'المبيعات (ر.ق)',
  'Received on': 'تاريخ الاستلام', 'Reason / document': 'السبب / المستند', 'Ready': 'جاهزة', 'Product': 'المنتج', 'Price type': 'نوع السعر',
  'Price (QR)': 'السعر (ر.ق)', 'Period': 'الفترة', 'Per': 'لكل', 'Note': 'ملاحظة', 'Month': 'الشهر', 'Minimum stock': 'الحد الأدنى', 'Margin (QR)': 'الهامش (ر.ق)',
  'Margin %': 'الهامش %', 'Loaded': 'التحميل', 'Line': 'السطر', 'Last issue': 'آخر صرف', 'Item / shop': 'الصنف / المحل', 'Issue slip': 'إذن الصرف',
  'Invoices': 'الفواتير', 'Invoice no.': 'رقم الفاتورة', 'Hours sent → received': 'الساعات من الإرسال إلى الاستلام', 'Handed': 'سُلّم',
  'Final products (QR)': 'المنتج النهائي (ر.ق)', 'Expiry': 'الصلاحية', 'Direction': 'الاتجاه', 'Department / store': 'القسم / المخزن', 'Delivered': 'التسليم',
  'Days without issue': 'أيام بلا صرف', 'Days of cover': 'أيام التغطية', 'Days left': 'الأيام المتبقية', 'Date issued': 'تاريخ الصرف', 'Daily average': 'المعدل اليومي',
  'Current balance': 'الرصيد الحالي', 'Cost (QR)': 'التكلفة (ر.ق)', 'Batch source': 'مصدر الدفعة', 'Balance': 'الرصيد', 'Available': 'المتاح', 'Approved': 'الاعتماد',
  'Dispatching and delivery record': 'سجل صرف وتسليم المنتجات', 'Loading time': 'وقت التحميل', 'Batch No.': 'رقم التشغيلة',
  'Production date': 'تاريخ الإنتاج', 'Quantity and unit': 'الكمية ووحدتها', 'Branch / recipient – address': 'الفرع / الجهة المستلمة – عنوان الوجهة', 'Vehicle no.': 'رقم المركبة', 'Driver': 'اسم السائق', 'Temperature when leaving (°C)': 'درجة الحرارة عند المغادرة (°م)', 'Temperature on arrival (°C)': 'درجة الحرارة عند الوصول (°م)',
  'Departure time': 'وقت المغادرة', 'Recipient (confirmed)': 'المستلم (تأكيد الاستلام)', 'Handed over by': 'مسؤول التسليم', '#': 'م',
  // cells
  'Food': 'غذائي', 'Packaging': 'تغليف', 'Chilled foods': 'مواد مبرّدة', 'Dry foods': 'مواد جافة', 'Final products': 'المنتج النهائي', 'Cleaning': 'مواد تنظيف',
  'No expiry': 'بلا صلاحية', 'Expired': 'منتهي الصلاحية', 'Expires Today': 'ينتهي اليوم', 'Never issued': 'لم يُصرف قط', 'Incoming': 'وارد', 'Outgoing': 'صادر',
  'Latest': 'الأحدث', 'Highest': 'الأعلى', 'Lowest': 'الأدنى', 'Disposal': 'إتلاف', 'Count difference': 'فرق جرد', 'Adjustment': 'تسوية',
  'Return: expired': 'مرتجع: منتهي الصلاحية', 'Return: damaged': 'مرتجع: تالف', 'Lost on the way': 'ضائع في الطريق', 'receipt difference': 'فرق استلام',
  'Damaged': 'تالف', 'Short in the trip': 'ناقص في الرحلة', 'Loading error': 'خطأ في التحميل', 'Other': 'أخرى', 'Not known': 'غير معروف',
  'Receipt': 'استلام', 'Opening balance': 'رصيد افتتاحي', 'Department return': 'مرتجع قسم', 'Production': 'إنتاج', 'Stock adjustment': 'تسوية مخزون',
  'Shop return': 'مرتجع محل', 'Stock count': 'جرد', 'Weekly': 'أسبوعي', 'Monthly': 'شهري', 'Yearly': 'سنوي',
  'damaged': 'تالف', 'short_in_trip': 'ناقص في الرحلة', 'loading_error': 'خطأ في التحميل', 'other': 'أخرى', 'expired': 'منتهي الصلاحية', 'unsold': 'لم يُبع', 'complaint': 'شكوى زبون',
  'January': 'يناير', 'February': 'فبراير', 'March': 'مارس', 'April': 'أبريل', 'May': 'مايو', 'June': 'يونيو', 'July': 'يوليو', 'August': 'أغسطس',
  'September': 'سبتمبر', 'October': 'أكتوبر', 'November': 'نوفمبر', 'December': 'ديسمبر', 'No data': 'لا توجد بيانات', 'No data.': 'لا توجد بيانات.',
};

// texts with a number or a date in them
const P = [
  [/^Period: (.+)  to  (.+)$/, (m) => 'الفترة: ' + m[1] + ' إلى ' + m[2]],
  [/^Date: (.+)$/, (m) => 'التاريخ: ' + m[1]],
  [/^Stores: (.+)$/, (m) => 'المخازن: ' + m[1].split(', ').map(word).join('، ')],
  [/^Slow-moving stock \(no issue for (\d+) days or more\)$/, (m) => 'المخزون الراكد (بلا صرف منذ ' + m[1] + ' يومًا أو أكثر)'],
  [/^Days of cover \(use of the last (\d+) days\)$/, (m) => 'أيام التغطية (استهلاك آخر ' + m[1] + ' يومًا)'],
  [/^Suggested order: enough for another (\d+) days at the same use$/, (m) => 'الطلب المقترح: يكفي ' + m[1] + ' يومًا أخرى بالاستهلاك نفسه'],
  [/^Stock value on (.+)$/, (m) => 'قيمة المخزون في ' + m[1]],
  [/^Products near expiry \(within (\d+) days\)$/, (m) => 'أصناف قريبة الانتهاء (خلال ' + m[1] + ' يومًا)'],
  [/^Multi-month item report (\d+)$/, (m) => 'تقرير الصنف لعدة أشهر ' + m[1]],
  [/^Production summary \((\w+)\)$/, (m) => 'ملخص الإنتاج (' + word(m[1]) + ')'],
  [/^Remaining (\d+) days$/, (m) => 'متبقي ' + m[1] + ' يوم'],
  [/^Week of (.+)$/, (m) => 'أسبوع ' + m[1]],
  [/^Total (.+)$/, (m) => 'إجمالي ' + word(m[1])],
  [/^(.+) \(special\)$/, (m) => m[1] + ' (خاص)'],
];

function word(s) {
  if (typeof s !== 'string' || !s) return s;
  if (W[s] !== undefined) return W[s];
  // a cell or subtitle made of parts: each part on its own
  if (s.includes('  ·  ')) return s.split('  ·  ').map(word).join('  ·  ');
  if (s.includes(' · ')) return s.split(' · ').map(word).join(' · ');
  for (const [re, f] of P) { const m = s.match(re); if (m) return f(m); }
  if (s.includes(': ')) { const i = s.indexOf(': '); const a = s.slice(0, i); if (W[a] !== undefined) return W[a] + ': ' + s.slice(i + 2); }
  return s;
}

/** The report in Arabic (a new object; the English one is left as it is). */
export function localize(rep) {
  return Object.assign({}, rep, {
    title: word(rep.title), subtitle: word(rep.subtitle), rtl: true,
    columns: rep.columns.map((c) => Object.assign({}, c, { label: word(c.label) })),
    rows: rep.rows.map((r) => r.map((v, i) => (rep.columns[i] && rep.columns[i].type === 't' ? word(v) : v))),
    labels: { system: 'نظام إدارة المخزون', printed: 'طُبع: ', records: 'عدد السجلات: ', none: 'لا توجد بيانات',
      note: 'أُنشئ هذا التقرير من MORO. لحفظه ملفًا اختر "حفظ بصيغة PDF" في نافذة الطباعة.' },
  });
}
