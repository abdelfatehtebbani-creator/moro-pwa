// What changed in each version, shown once to every user after the app updates itself
// ("What's new"), with what they need to do. Newest first. Add an entry with every release.
//   todo: for everyone; admin: only for users who manage users (the admin).
export const CHANGELOG = [
  {
    v: '0.8.37', date: '2026-10-27',
    ar: {
      news: [
        'في الشاشة الرئيسية على الحاسوب اختفى الشريط الجانبي، وصارت الشاشات أزرارًا دائرية موزعة بالتساوي على دائرة حول القرص. يعود الشريط الجانبي في باقي الشاشات.',
        'أزرار حسابك (ما الجديد، الإشعارات، تغيير الرمز، اللغة، الخروج) أسفل الشاشة الرئيسية.',
      ],
    },
    en: {
      news: [
        'On a computer the home screen no longer shows the side menu, and the screens are round buttons spread evenly on a circle around the disc. The side menu is back on every other screen.',
        'Your account buttons (what\'s new, notifications, change PIN, language, sign out) are at the bottom of the home screen.',
      ],
    },
  },
  {
    v: '0.8.36', date: '2026-10-27',
    ar: {
      news: [
        'شاشة رئيسية جديدة تظهر بعد الدخول: قرص يدور بشعار الشركة على وجه واسم التطبيق على الآخر، وحوله الشاشات المسموح لك بفتحها. اضغط أي شاشة لتنتقل إليها.',
        'كل الشاشات في مكانها كما كانت، والقائمة الجانبية وشريط الهاتف فيهما "الرئيسية" للعودة إليها.',
      ],
    },
    en: {
      news: [
        'A new home screen after signing in: a turning disc with the company logo on one face and the app name on the other, with the screens you may open around it. Tap a screen to go to it.',
        'Every screen is where it was; the side menu and the phone bar have "Home" to come back to it.',
      ],
    },
  },
  {
    v: '0.8.35', date: '2026-10-27',
    ar: {
      news: [
        'لوحة التحكم (المخزون) تظهر فقط لمن يعمل على المخزون؛ المحاسب يفتح التطبيق مباشرة على أوامر الشراء.',
        'الإشعار على الهاتف يهتز عند وصوله.',
      ],
    },
    en: {
      news: [
        'The dashboard (stock) is shown only to those who work with stock; the accountant opens the app straight on purchase orders.',
        'Notifications vibrate the phone when they arrive.',
      ],
    },
  },
  {
    v: '0.8.34', date: '2026-10-27',
    ar: {
      news: [
        'دور جديد "محاسب": يرى الأوراق النقدية وأوامر الشراء، ويسلّم النقد لمسؤول المشتريات، ولا يكتب الأوراق ولا يعتمدها.',
        'عند اعتماد المدير لورقة نقدية يصل المحاسب إشعار بالمبلغ المعتمد ليسلّمه لمسؤول المشتريات.',
        'تسليم النقد لم يعد ضمن دور المدير.',
      ],
      admin: 'أضف المحاسب من شاشة المستخدمين بدور "محاسب". إن احتجت أن تسلّم النقد بنفسك، علّم لنفسك "تسليم النقد" في صلاحياتك.',
    },
    en: {
      news: [
        'A new "Accountant" role: sees the cash sheets and the purchase orders and hands the cash over to purchasing, but does not write or approve sheets.',
        'When the admin approves a cash sheet, the accountant is notified of the approved amount to hand over to purchasing.',
        'Handing over cash is no longer part of the admin role.',
      ],
      admin: 'Add the accountant from the users screen with the "Accountant" role. If you need to hand over cash yourself, tick "Hand over cash" in your own permissions.',
    },
  },
  {
    v: '0.8.33', date: '2026-10-27',
    ar: {
      news: [
        'في شاشة أوامر الشراء تبويب جديد "المشتريات النقدية" بدل شيت Petty Cash: ورقة يومية بالمصاريف النقدية (مواد من المحلات، مصاريف، دفعات للموردين) تُرسل للمدير للاعتماد ثم تُطبع.',
        'رصيد نقدي متحرك: يُضاف إليه ما يسلّمه المدير، ويُخصم منه كل ورقة مرسلة أو معتمدة.',
        'يستطيع المدير رفض أسطر بعينها مع التعليل عند الاعتماد، ويعرض زر الرصيد النقدي سجل كل تسليم وكل ورقة وتغير الرصيد.',
        'تسليم النقد صلاحية منفصلة، ويصل مسؤول المشتريات إشعار عند كل تسليم. والإشعارات تصل الآن بلغة التطبيق على كل جهاز.',
      ],
      todo: 'مسؤول المشتريات: اكتب مصاريف اليوم النقدية في التبويب الجديد. المبلغ إجباري لكل سطر. المواد تُستلم في المخزن من شاشة الاستلام كالعادة.',
      admin: 'سجّل النقد الذي تسلّمه لمسؤول المشتريات من زر "تسليم نقد" (ابدأ بالمبلغ المتوفر معه اليوم). من له صلاحيات مخصصة تعلّم له "كتابة وإرسال أوراق المشتريات النقدية"، و"تسليم النقد" لمن يسلّم النقد.',
    },
    en: {
      news: [
        'The purchase orders screen has a new "Cash purchases" tab instead of the Petty Cash sheet: a daily sheet of cash payments (shop materials, expenses, supplier payments) sent to the admin for approval, then printed.',
        'A running cash balance: what the admin hands over is added, every sent or approved sheet is taken off.',
        'The admin can refuse single lines with a reason while approving; the cash balance button shows every hand-over and sheet and how the balance changed.',
        'Handing over cash is its own permission and the purchasing officer is notified each time. Notifications now come in the language of the app on each device.',
      ],
      todo: 'Purchasing: write the day’s cash payments in the new tab. Every line needs an amount. Materials are still received in stock from the receive screen.',
      admin: 'Record the cash you give the purchasing officer with "Hand over cash" (start with what they hold today). For users with custom permissions, tick "Write and send cash purchase sheets".',
    },
  },
  {
    v: '0.8.32', date: '2026-10-26',
    ar: {
      news: [
        'حاسبة أكياس القهوة صارت داخل MORO، في قسم "أدوات" من القائمة، بنفس المعادلات: كم تشتري من البن الأخضر قبل التحميص، وكم من كل صنف في الخلطة.',
      ],
      todo: 'لا شيء. القيم التي تكتبها تبقى محفوظة على جهازك.',
      admin: 'الحاسبة مفعّلة للمدير ومسؤول المشتريات. لمنحها لمستخدم آخر علّم "حاسبة أكياس القهوة" في صلاحياته.',
    },
    en: {
      news: [
        'The coffee bag calculator is now inside MORO, under "Tools" in the menu, with the same formulas: how much green coffee to buy before roasting, and how much of each origin in the blend.',
      ],
      todo: 'Nothing. The values you type stay saved on your device.',
      admin: 'The calculator is on for the admin and purchasing. To give it to another user, tick "Coffee bag calculator" in their permissions.',
    },
  },
  {
    v: '0.8.31', date: '2026-10-26',
    ar: {
      news: [
        'إشعارات على الهاتف والحاسوب حتى والتطبيق مغلق: يصل المدير إشعار عند إرسال أمر شراء LPO، ويصل مسؤول المشتريات إشعار عند اعتماده أو رفضه.',
        'يظهر رقم الأوامر المنتظرة على أيقونة التطبيق في الأجهزة التي تدعم ذلك.',
      ],
      todo: 'المدير ومسؤول المشتريات: اضغط "تفعيل الإشعارات" في القائمة على كل جهاز تستعمله، ثم "سماح". على الآيفون أضف التطبيق إلى الشاشة الرئيسية أولًا وافتحه منها.',
    },
    en: {
      news: [
        'Phone and computer notifications, even with the app closed: the admin is told when an LPO is sent, the purchasing officer when it is approved or rejected.',
        'The number of waiting LPOs shows on the app icon where the device supports it.',
      ],
      todo: 'Admin and purchasing: tap "Turn on notifications" in the menu on every device you use, then "Allow". On an iPhone add the app to the home screen first and open it from there.',
    },
  },
  {
    v: '0.8.30', date: '2026-10-26',
    ar: {
      news: [
        'بطاقة حركات اليوم في لوحة التحكم تعرض الآن آخر الحركات مع السعر والصافي ومن أدخلها، لمتابعة صحة الإدخال (السعر والمورد).',
        'فلترة الحركات: الكل، استلام، صرف. علامة ✎ تعني أن الحركة عُدّلت بعد إدخالها.',
      ],
      todo: 'لا شيء. افتح بطاقة حركات اليوم لترى الجديد.',
    },
    en: {
      news: [
        'The dashboard card of today’s movements now lists the latest movements with price, net amount and who entered them, to check the entries (price and supplier).',
        'Filter the movements: all, receipts, issues. A ✎ mark means the movement was edited after entry.',
      ],
      todo: 'Nothing. Open the today’s movements card to see it.',
    },
  },
  {
    v: '0.8.29', date: '2026-10-26',
    ar: {
      news: [
        'شاشة جديدة "أوامر الشراء LPO": يكتب مسؤول المشتريات أمر الشراء ويرسله للمدير، ويطبعه بعد الاعتماد بنفس شكل النموذج الورقي.',
        'عند اختيار المورد تظهر المواد التي ورّدها من قبل بآخر سعر، وعند اختيار مادة تظهر أسعار شرائها من هذا المورد وكل الموردين الآخرين لها.',
        'رقم على أيقونة الشاشة: للمدير عدد الأوامر التي تنتظر اعتماده، ولمسؤول المشتريات الأوامر التي اعتُمدت أو رُفضت.',
        'بطاقة المورد فيها الآن الهاتف والفاكس والبريد والشخص المسؤول، وتُطبع على أمر الشراء.',
      ],
      todo: 'مسؤول المشتريات: أكمل بيانات الاتصال للموردين من "المواد والموردون". الرقم المقترح لأول أمر هو 320 ويمكن تغييره.',
      admin: 'راجع الشروط وبيانات الشركة من زر "إعدادات LPO". الأوامر المرسلة تظهر لك في الشاشة لتعتمدها أو ترفضها مع ذكر السبب. إن كان لمسؤول المشتريات صلاحيات مخصصة فأضف له "أوامر الشراء LPO" من شاشة المستخدمين.',
    },
    en: {
      news: [
        'New screen "Purchase orders (LPO)": the purchasing officer writes an LPO and sends it to the admin, then prints it after approval in the same layout as the paper form.',
        'Choosing a supplier lists what it supplied before with the last price; choosing an item shows the prices paid to this supplier and every other supplier of it.',
        'A number on the screen icon: for the admin the LPOs awaiting approval, for the purchasing officer the LPOs approved or rejected.',
        'The supplier card now has tel, fax, e-mail and contact person, printed on the LPO.',
      ],
      todo: 'Purchasing: fill in the contact details of the suppliers in "Items & suppliers". The first LPO number proposed is 320 and can be changed.',
      admin: 'Check the terms and company block from "LPO settings". Sent LPOs appear on the screen for you to approve, or reject with a reason. If the purchasing officer has a custom permission set, tick "Purchase orders (LPO)" for them in Users.',
    },
  },
  {
    v: '0.8.28', date: '2026-10-25',
    ar: {
      news: [
        'عند كل تحديث يظهر لك هذا الإشعار مرة واحدة: ما الجديد وما يجب عليك فعله.',
        'تجده لاحقًا من زر "ما الجديد" في القائمة.',
      ],
      todo: 'لا شيء. واصل عملك كالمعتاد.',
    },
    en: {
      news: [
        'After every update this notice appears once: what is new and what you need to do.',
        'You can open it again from "What\'s new" in the menu.',
      ],
      todo: 'Nothing. Carry on as usual.',
    },
  },
];

/** -1 / 0 / 1 for two versions like 0.8.27 */
export function cmpVersion(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
