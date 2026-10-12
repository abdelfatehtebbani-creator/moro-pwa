// Arabic / English texts. Server error codes are translated here (err.<code>).
const DICT = {
  ar: {
    app_name: 'MORO', app_sub: 'نظام إدارة المخزون', company: 'حلويات العكر',
    lang_other: 'English',
    // auth
    login_title: 'تسجيل الدخول', username: 'اسم المستخدم', pin: 'الرمز (PIN)', login: 'دخول',
    setup_title: 'أول تشغيل: حساب المدير', setup_hint: 'لا يوجد أي مستخدم بعد. أنشئ حسابك كمدير للنظام.',
    display_name: 'الاسم الظاهر', pin_repeat: 'أعد كتابة الرمز', create_admin: 'إنشاء الحساب والدخول',
    pin_mismatch: 'الرمزان غير متطابقين', logout: 'تسجيل الخروج', signed_out: 'انتهت الجلسة، سجّل الدخول من جديد',
    // nav
    nav_main: 'الرئيسية', nav_ops: 'العمليات', nav_admin: 'الإدارة',
    dashboard: 'لوحة التحكم', receive: 'استلام البضاعة', issue: 'صرف للأقسام', production: 'الإنتاج',
    requests: 'طلبات الأقسام', reports: 'التقارير', masters: 'المواد والموردون', users: 'المستخدمون', more: 'المزيد',
    // roles
    role_admin: 'مدير', role_storekeeper: 'أمين المخزن', role_purchasing: 'مسؤول المشتريات', role_production: 'مسؤول الإنتاج',
    // sync
    online: 'متصل', offline: 'دون اتصال', updated_at: 'آخر تحديث {t}', refreshing: 'جارٍ التحديث…',
    // dashboard
    kpi_items: 'مواد متوفرة في المخزن', kpi_low: 'مواد عند الحد الأدنى أو أقل', kpi_exp: 'صلاحية خلال 30 يومًا',
    kpi_today: 'حركات اليوم (استلام / صرف)', lookup: 'بحث سريع عن مادة', lookup_hint: 'اكتب أي جزء من اسم المادة',
    items_count: '{n} مادة', item: 'المادة', unit: 'الوحدة', balance: 'الرصيد', min_stock: 'الحد الأدنى',
    last_expiry: 'آخر صلاحية', available: 'المتاح', expiry: 'الصلاحية', days_left: '{n} يوم', expired: 'منتهية',
    alerts: 'تنبيهات', tab_low: 'الحد الأدنى', tab_exp: 'الصلاحية', recent: 'آخر الحركات', date: 'التاريخ',
    party: 'المورد / القسم', qty: 'الكمية', doc: 'الفاتورة / الإذن', kind: 'النوع',
    no_low: 'لا توجد مواد عند الحد الأدنى', no_exp: 'لا توجد مواد تنتهي خلال 30 يومًا', no_rows: 'لا توجد بيانات',
    edit_min: 'تعديل الحد الأدنى', edit_min_for: 'الحد الأدنى لـ {name}', save: 'حفظ', cancel: 'إلغاء', saved: 'تم الحفظ',
    food: 'غذائي', packaging: 'تغليف', click_to_edit: 'انقر على مادة لتعديل حدها الأدنى', open_requests: 'طلبات بانتظار التنفيذ: {n}',
    kind_RECEIPT: 'استلام', kind_ISSUE: 'صرف', kind_SUPPLIER_RETURN: 'مرتجع لمورد', kind_DEPT_RETURN: 'مرتجع من قسم',
    kind_PROD_CONSUME: 'إنتاج (مكوّن)', kind_PROD_OUTPUT: 'إنتاج (منتج)', kind_OPENING: 'رصيد افتتاحي', kind_ADJUST: 'تسوية',
    soon_title: 'قيد البناء', soon_text: 'هذه الشاشة ضمن المرحلة {p} من الخطة.',
    // errors
    'err.offline': 'لا يوجد اتصال بالإنترنت', 'err.server_error': 'حدث خطأ في الخادم، حاول مرة أخرى',
    'err.login_failed': 'اسم المستخدم أو الرمز غير صحيح', 'err.login_locked': 'محاولات كثيرة خاطئة. حاول بعد {d} دقائق',
    'err.pin_format': 'الرمز من 4 إلى 8 أرقام', 'err.username_format': 'اسم المستخدم: 3 إلى 30 حرفًا لاتينيًا أو رقمًا',
    'err.username_taken': 'اسم المستخدم مستعمل', 'err.already_setup': 'تم إنشاء حساب المدير مسبقًا، سجّل الدخول',
    'err.forbidden': 'ليست لديك صلاحية لهذه العملية', 'err.busy': 'الخادم مشغول، حاول بعد لحظات',
    'err.auth_required': 'سجّل الدخول من جديد', 'err.auth_expired': 'انتهت الجلسة، سجّل الدخول من جديد',
    'err.min_invalid': 'أدخل رقمًا صحيحًا', 'err.not_found': 'السجل غير موجود',
  },
  en: {
    app_name: 'MORO', app_sub: 'Inventory management', company: 'ALAKER SWEETS',
    lang_other: 'العربية',
    login_title: 'Sign in', username: 'Username', pin: 'PIN', login: 'Sign in',
    setup_title: 'First run: admin account', setup_hint: 'There are no users yet. Create your account as system admin.',
    display_name: 'Display name', pin_repeat: 'Repeat PIN', create_admin: 'Create account and sign in',
    pin_mismatch: 'The PINs do not match', logout: 'Sign out', signed_out: 'Your session ended, please sign in again',
    nav_main: 'Main', nav_ops: 'Operations', nav_admin: 'Administration',
    dashboard: 'Dashboard', receive: 'Goods receiving', issue: 'Department issues', production: 'Production',
    requests: 'Department requests', reports: 'Reports', masters: 'Items & suppliers', users: 'Users', more: 'More',
    role_admin: 'Admin', role_storekeeper: 'Storekeeper', role_purchasing: 'Purchasing', role_production: 'Production manager',
    online: 'Online', offline: 'Offline', updated_at: 'Updated {t}', refreshing: 'Updating…',
    kpi_items: 'Items in stock', kpi_low: 'Items at or below minimum', kpi_exp: 'Expiring within 30 days',
    kpi_today: "Today's movements (in / out)", lookup: 'Quick item search', lookup_hint: 'Type any part of the item name',
    items_count: '{n} items', item: 'Item', unit: 'Unit', balance: 'Balance', min_stock: 'Min. stock',
    last_expiry: 'Last expiry', available: 'Available', expiry: 'Expiry', days_left: '{n} days', expired: 'Expired',
    alerts: 'Alerts', tab_low: 'Minimum', tab_exp: 'Expiry', recent: 'Latest movements', date: 'Date',
    party: 'Supplier / department', qty: 'Qty', doc: 'Invoice / slip', kind: 'Type',
    no_low: 'No items at minimum stock', no_exp: 'Nothing expires within 30 days', no_rows: 'No data',
    edit_min: 'Edit minimum stock', edit_min_for: 'Minimum stock for {name}', save: 'Save', cancel: 'Cancel', saved: 'Saved',
    food: 'Food', packaging: 'Packaging', click_to_edit: 'Click an item to edit its minimum stock', open_requests: 'Requests waiting: {n}',
    kind_RECEIPT: 'Receipt', kind_ISSUE: 'Issue', kind_SUPPLIER_RETURN: 'Return to supplier', kind_DEPT_RETURN: 'Return from dept.',
    kind_PROD_CONSUME: 'Production (input)', kind_PROD_OUTPUT: 'Production (output)', kind_OPENING: 'Opening balance', kind_ADJUST: 'Adjustment',
    soon_title: 'Being built', soon_text: 'This screen is part of phase {p} of the plan.',
    'err.offline': 'No internet connection', 'err.server_error': 'Server error, please try again',
    'err.login_failed': 'Wrong username or PIN', 'err.login_locked': 'Too many wrong attempts. Try again in {d} minutes',
    'err.pin_format': 'PIN must be 4 to 8 digits', 'err.username_format': 'Username: 3 to 30 Latin letters or digits',
    'err.username_taken': 'Username already used', 'err.already_setup': 'The admin account already exists, please sign in',
    'err.forbidden': "You don't have permission for this", 'err.busy': 'Server busy, try again in a moment',
    'err.auth_required': 'Please sign in again', 'err.auth_expired': 'Your session ended, please sign in again',
    'err.min_invalid': 'Enter a valid number', 'err.not_found': 'Record not found',
  },
};

const LANG_KEY = 'moro.lang';
let lang = (() => { try { return localStorage.getItem(LANG_KEY) || 'ar'; } catch { return 'ar'; } })();

export function getLang() { return lang; }

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ar';
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  applyLang();
}

export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function t(key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) ?? DICT.ar[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

/** Message for a server/network error. */
export function errText(e) {
  const code = e && e.code ? e.code : 'server_error';
  const key = 'err.' + code;
  const msg = t(key, { d: e.detail });
  return msg === key ? t('err.server_error') + ' (' + code + ')' : msg;
}
