// What changed in each version, shown once to every user after the app updates itself
// ("What's new"), with what they need to do. Newest first. Add an entry with every release.
//   todo: for everyone; admin: only for users who manage users (the admin).
export const CHANGELOG = [
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
