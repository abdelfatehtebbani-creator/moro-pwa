// What changed in each version, shown once to every user after the app updates itself
// ("What's new"), with what they need to do. Newest first. Add an entry with every release.
//   todo: for everyone; admin: only for users who manage users (the admin).
export const CHANGELOG = [
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
