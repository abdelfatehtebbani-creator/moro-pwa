// What changed in each version, shown once to every user after the app updates itself
// ("What's new"), with what they need to do. Newest first. Add an entry with every release.
//   todo: for everyone; admin: only for users who manage users (the admin).
export const CHANGELOG = [
  {
    v: '0.9.220', date: '2026-11-13',
    ar: {"news": ["(نسخة التطوير) القائمة الجانبية: كل مجموعة (المخازن، دورة الطلبيات، المشتريات والمالية…) تنطوي بالضغط على عنوانها، ويتذكر الجهاز اختيارك. المجموعة المطوية التي فيها عمل ينتظرك تظهر بجانب عنوانها نقطة برتقالية، وفتح شاشة منها يفتحها."]},
    en: {"news": ["(Development copy) Side menu: each group (Stores, Order cycle, Purchasing and finance…) folds with a press on its title, remembered on this device. A folded group with work waiting shows an orange dot by its title, and opening one of its screens unfolds it."]},
  },
  {
    v: '0.9.219', date: '2026-11-12',
    ar: {"news": ["نافذة المنتج النهائي: «تكلفة المنتج» صارت خانة مثل باقي الخانات، تظهر لكل منتج نهائي. ومن لا وصفة له تقول له الخانة ذلك."]},
    en: {"news": ["Final product window: \"Product cost\" is a field like the others, shown for every final product; for one with no recipe it says so."]},
  },
  {
    v: '0.9.218', date: '2026-11-12',
    ar: {"news": ["نافذة المنتج النهائي: تفاصيل التكلفة صارت مطوية تحت سطر واحد «تكلفة المنتج: … QR». يُفتح لرؤية المواد والتشغيل وزر التكلفة المخصصة و«اعتمادها سعرًا»."]},
    en: {"news": ["Final product window: the cost detail folds under one line \"Product cost: … QR\"; open it for the materials, running costs, the own-costs button and \"Use as price\"."]},
  },
  {
    v: '0.9.217', date: '2026-11-12',
    ar: {"news": ["«تصحيح وحدة الأساس» صار أسرع بكثير: الخادم يعيد كتابة سطور المادة نفسها فقط بدل كل السجل. ووزن الوحدة في المادة العامة يتعدل مع الوحدة الجديدة."]},
    en: {"news": ["\"Change the stock unit\" is much faster: the server rewrites only the item's own rows instead of the whole record. What one unit holds of its generic material follows the new unit."]},
  },
  {
    v: '0.9.216', date: '2026-11-12',
    ar: {"news": ["الوصفات: عند اختيار منتج له وصفة تظهر تحته تكلفته (المواد، التشغيل، الكاملة) وزر «تكلفة تشغيل مخصصة لهذا المنتج»."]},
    en: {"news": ["Recipes: picking a product with a recipe shows its cost under it (materials, running costs, full) and the \"This product's own running costs\" button."]},
  },
  {
    v: '0.9.215', date: '2026-11-12',
    ar: {"news": ["الوصفات: جزء «وصفة المنتج» ينطوي مثل «تكاليف التشغيل» و«المواد العامة»."]},
    en: {"news": ["Recipes: the \"Product recipe\" part folds like \"Running costs\" and \"Generic materials\"."]},
  },
  {
    v: '0.9.214', date: '2026-11-12',
    ar: {"news": ["تكلفة تشغيل مخصصة لمنتج واحد: في نافذة المنتج النهائي زر «تكلفة تشغيل مخصصة لهذا المنتج». تكتب تقديرات تكاليفه (كهرباء، عمالة…) لكمية منه، فتُقسم عليها وتحل محل النسبة العامة لهذا المنتج وحده، ووصفته كما هي. وزر «الرجوع إلى النسبة العامة» يلغيها."]},
    en: {"news": ["One product's own running costs: the final product window has \"This product's own running costs\". Write its estimated costs (electricity, labour…) for a quantity of it; divided by that quantity they replace the factory's rate for this product only, its recipe unchanged. \"Back to the factory's rate\" removes it."]},
  },
  {
    v: '0.9.213', date: '2026-11-12',
    ar: {"news": ["تكاليف التشغيل: المدير الذي له صلاحيات مخصصة يأخذ صلاحية «تكاليف التشغيل» تلقائيًا، فيظهر له القسم في «الوصفات»."]},
    en: {"news": ["Running costs: an admin with their own set of ticks gets the \"Running costs\" tick automatically, so the section shows in Recipes."]},
  },
  {
    v: '0.9.212', date: '2026-11-12',
    ar: {"news": ["تكاليف التشغيل: في «الوصفات» قسم جديد يكتب فيه المدير تكاليف فترة (كهرباء، رواتب، غاز، إيجار…). النظام يقسمها على تكلفة مواد ما أُنتج في الفترة، فتخرج نسبة (مثل 25%) تُضاف فوق تكلفة مواد كل منتج. نافذة المنتج تعرض: المواد، التشغيل، التكلفة الكاملة. ويدخل ذلك في تقرير الهامش وتنبيه «التكلفة فوق السعر»."]},
    en: {"news": ["Running costs: the Recipes tab has a new section where the admin writes the costs of a period (electricity, salaries, gas, rent…). They are divided by the material cost of what was produced in the period, giving a rate (like 25%) added on top of each product's material cost. The product window shows materials, running costs and the full cost; the margin report and the cost-over-price alert use it."]},
  },
  {
    v: '0.9.211', date: '2026-11-12',
    ar: {"news": ["مخزن جديد «العُدّة والأدوات» للعتاد الذي لا يُستهلك: السكاكين والصواني والماكنات وغيرها. يُستلم ويُصرف ويُجرد مثل باقي المخازن، دون تاريخ صلاحية ودون مادة عامة. يعطيه المدير لمن يعمل فيه من «المستخدمون»، وينشئ له مكان تخزين من «أماكن التخزين»."]},
    en: {"news": ["A new store \"Equipment and tools\" for what is not used up: knives, trays, machines and the like. Received, issued and counted like the other stores, with no expiry date and no generic material. The admin gives it to the people who work in it (Users) and creates a storage location for it (Storage locations)."]},
  },
  {
    v: '0.9.210', date: '2026-11-12',
    ar: {"news": ["المادة الأولية الجديدة (المواد الجافة والمبردة) لا تُحفظ دون مادتها العامة وكم تحوي وحدتها. تختار المادة العامة من القائمة، أو تنشئ واحدة جديدة من نفس النافذة. المواد الحالية تُربط من نفس النافذة عند تعديلها.", "الجهاز المشترك: من «المستخدمون» ← «إعدادات عامة» ← «الجهاز المشترك في المصنع» يخفي المدير أقسامًا (فلا تظهر ولا يظهر موظفوها) ويوقف أي بطاقة من القائمة: تسجيل إنتاج، طلبيات المحلات، طلب مواد."]},
    en: {"news": ["A new raw material (dry and chilled stores) is not saved without its generic material and what one of its units holds. Pick the generic material from the list, or create a new one in the same window. Current items are linked from the same window when edited.", "Shared device: in Users → General settings → The shared device in the factory, the admin hides departments (they and their people do not show) and switches off any menu card: record production, shop orders, ask the store."]},
  },
  {
    v: '0.9.209', date: '2026-11-12',
    ar: {"news": ["طباعة قائمة الأسعار: الصفحة المطبوعة تعرض جداول الأقسام بالأعمدة المختارة بدل نص غريب."]},
    en: {"news": ["Price list printing: the printed page shows each department's table with the chosen columns instead of odd text."]},
  },
  {
    v: '0.9.208', date: '2026-11-12',
    ar: {"news": ["طباعة قائمة الأسعار: نافذة اختيار الأعمدة تعرض مربعات الأعمدة بدل نص غريب."]},
    en: {"news": ["Price list printing: the column choice shows the column boxes again instead of odd text."]},
  },
  {
    v: '0.9.207', date: '2026-11-12',
    ar: {"news": ["الإنتاج لا يخصم مكونات الوصفات من المخزن حاليًا: يزيد رصيد المنتج النهائي فقط، والوصفة تظهر للعرض وتُستعمل للتكلفة وسجل التشغيلة. يفعّل المدير الخصم من «المستخدمون» ← «إعدادات عامة» ← «الإنتاج يخصم مكونات الوصفة من المخزن» عندما تكتمل الوصفات."]},
    en: {"news": ["Producing no longer takes the recipe's ingredients from the stores for now: it only raises the final product's stock; the recipe is shown and used for the cost and the batch record. The admin switches taking on in Users → General settings when the recipes are complete."]},
  },
  {
    v: '0.9.206', date: '2026-11-12',
    ar: {"news": ["المواد العامة للوصفات: في صفحة «الوصفات» قسم جديد «المواد العامة». أنشئ مادة عامة مثل «سمنة نباتية» بوحدة الكيلو، واربط بها البراندات مع ما تحويه وحدة كل براند (مثل 4*4 كغ = 16 كغ). تُكتب الوصفة بالمادة العامة (تظهر بعلامة ◆)، وعند الإنتاج يُخصم من البراند المتوفر، الأقدم استلامًا أولًا. شاشة الإنتاج تعرض المتاح من كل البراندات بالكيلو، وسجل التشغيلة يذكر البراند الذي استُعمل فعلًا. التكلفة تُحسب من أسعار البراندات المتوفرة، وإن نفدت كلها فمن آخر براند اشتُري."]},
    en: {"news": ["Generic materials for recipes: the Recipes tab has a new \"Generic materials\" section. Create one like \"Vegetable ghee\" in KG and link the brands with how much one unit of each holds (4*4 kg = 16 KG). A recipe is written with the generic material (marked ◆); producing takes the brand in the store, the oldest received first. The production screen shows what all the brands hold in KG, and the batch record names the brand really used. The cost comes from the prices of the brands in the store, or the brand bought last when none is left."]},
  },
  {
    v: '0.9.205', date: '2026-11-12',
    ar: {"news": ["الوصفات: خانة «المنتج» صارت قائمة بالمنتجات النهائية، وفوقها فلتر «القسم الذي ينتجه». بجانب كل منتج قسمه، وعلامة «له وصفة» إن كانت له وصفة."]},
    en: {"news": ["Recipes: the product field is now a list of the final products, with a filter by the department that makes them above it. Each product shows its department and whether it has a recipe."]},
  },
  {
    v: '0.9.204', date: '2026-11-11',
    ar: {"news": ["طلبات الأقسام: في السطر الذي رصيده صفر تبدأ خانة «للصرف الآن» بصفر بدل الكمية المطلوبة."]},
    en: {"news": ["Department requests: on a line with nothing in stock, \"Issue now\" starts at 0 instead of the quantity asked for."]},
  },
  {
    v: '0.9.203', date: '2026-11-11',
    ar: {"news": ["الجهاز المشترك: لوحة مفاتيح على الشاشة تظهر عند لمس خانة البحث في «طلب مواد»، بالعربية أو الإنجليزية، والقائمة تصغر فوقها فلا يختفي شيء خلفها. والبحث لا يفرّق بين أ وإ وا، ولا بين ى وي، ولا بين ة وه."]},
    en: {"news": ["Shared device: an on-screen keyboard opens when the search field in \"Ask the store\" is touched, in Arabic or English; the list shrinks above it so nothing is hidden. The search treats the forms of alef, yaa and taa marbuta alike."]},
  },
  {
    v: '0.9.202', date: '2026-11-11',
    ar: {"news": ["الجهاز المشترك: أيقونة «طلب مواد» صارت عربة تسوق بعجلات."]},
    en: {"news": ["Shared device: the \"Ask the store\" icon is now a shopping cart on wheels."]},
  },
  {
    v: '0.9.201', date: '2026-11-11',
    ar: {"news": ["طلبات الأقسام: السطر الذي رصيده في المخزن صفر يظهر بخلفية حمراء وعلامة «نفد» بجانب الرصيد."]},
    en: {"news": ["Department requests: a line with nothing in stock shows with a red background and an \"Out of stock\" mark beside the balance."]},
  },
  {
    v: '0.9.200', date: '2026-11-11',
    ar: {"news": ["الجهاز المشترك: أمين المخزن لم يعد في قائمة الأسماء، وشريط الأقسام في الأعلى يُظهر كل الأقسام في سطرين عند الحاجة.", "طلبات الأقسام: مسؤول القسم يطلب لقسمه فقط؛ إن كان له قسم واحد يظهر اسمه بدل خانة الاختيار."]},
    en: {"news": ["Shared device: the storekeeper is no longer in the names list, and the departments bar at the top shows every department, on two lines when needed.", "Department requests: a section head asks for their own departments only; with one department, its name shows instead of the choice."]},
  },
  {
    v: '0.9.199', date: '2026-11-11',
    ar: {"news": ["الجهاز المشترك في المصنع: شاشة لمسية واحدة لكل الأقسام المنتجة (صفحة kiosk.html). يضغط الموظف على اسمه، ثم يكتب رمزه على لوحة الأرقام، ثم يسجّل إنتاجًا أو يسلّم أسطر طلبيات المحلات أو يطلب مواد من المخزن. كل عملية تُحفظ باسمه، ويخرج الجهاز تلقائيًا بعدها وبعد دقيقة بلا لمس. لا تمرير في أي اتجاه، والقوائم الطويلة صفحات."], "admin": "لتفعيل الجهاز: شغّل عليه ملف MORO-kiosk.bat (يفتح Chrome بملء الشاشة)، وادخل باسمك ورمزك مرة واحدة. للإغلاق: Alt+F4."},
    en: {"news": ["The shared device in the factory: one touch screen for every producing department (kiosk.html). A person presses their name, types their PIN on the keypad, then records a production, hands shop-order lines or asks the store for materials. Every entry is theirs, and the device signs out after it and after a minute without a touch. Nothing scrolls; long lists are pages."], "admin": "To set up the device: run MORO-kiosk.bat on it (Chrome full screen) and sign in once with your name and PIN. To close it: Alt+F4."},
  },
  {
    v: '0.9.198', date: '2026-11-11',
    ar: {"news": ["سجل صرف وتسليم المنتجات: عنوان عمود الفرع والعنوان صار «الجهة المستلمة»."]},
    en: {"news": ["Dispatching record: the branch and address column is now headed \"Destination\"."]},
  },
  {
    v: '0.9.197', date: '2026-11-11',
    ar: {"news": ["سجل صرف وتسليم المنتجات: سطر مراجعة الجودة مقسّم إلى أجزاء قصيرة بتواريخ رقمية، فيُقرأ بالعربية بترتيبه الصحيح."]},
    en: {"news": ["Dispatching record: the quality review line is in short parts with numeric dates, so it reads in order in Arabic."]},
  },
  {
    v: '0.9.196', date: '2026-11-11',
    ar: {"news": ["سجل صرف وتسليم المنتجات: الجدول كاملًا في PDF (صفحة بالعرض)، ومراجعة مسؤول الجودة ظاهرة في Excel على عرض الجدول، والفرع وعنوان الوجهة في عمود واحد، وزر حفظ المراجعة داخل الشاشة."]},
    en: {"news": ["Dispatching record: the whole table in the PDF (landscape page), the quality review visible in Excel across the table, the branch and the destination address in one column, and the review save button within the screen."]},
  },
  {
    v: '0.9.195', date: '2026-11-11',
    ar: {"news": ["سجل صرف وتسليم المنتجات: مربع «مراجعة مسؤول الجودة» يظهر الآن لمستخدمي سلامة الغذاء ذوي الصلاحيات المخصصة، واختفت كلمة null التي كانت تظهر تحت الجدول."]},
    en: {"news": ["Dispatching record: the \"Quality officer review\" box now shows for food safety users with custom permissions, and the stray \"null\" under the table is gone."]},
  },
  {
    v: '0.9.194', date: '2026-11-11',
    ar: {"news": ["استلام الطلبية: يكتب الكاشير درجة حرارة المنتجات عند الوصول مع الكميات، وتظهر في سجل الصرف والتسليم بجانب حرارة المغادرة."], "todo": "الكاشير: عند تأكيد استلام الطلبية اكتب درجة حرارة المنتجات عند الوصول."},
    en: {"news": ["Receiving an order: the cashier writes the temperature of the products on arrival with the quantities, shown in the dispatching record beside the temperature when leaving."], "todo": "Cashiers: when confirming an order received, write the temperature of the products on arrival."},
  },
  {
    v: '0.9.193', date: '2026-11-11',
    ar: {"news": ["مدة صلاحية المنتج النهائي: خانة جديدة بجانب سعره. عند كل إنتاج يُحسب تاريخ الانتهاء تلقائيًا من يوم الإنتاج وهذه المدة، ويظهر في سجل الصرف والتسليم وفي تقارير الصلاحية."], "admin": "اكتب مدة الصلاحية بالأيام لكل منتج نهائي في شاشة المواد. من يعدّل السعر يعدّل المدة."},
    en: {"news": ["Final product shelf life: a new field beside its price. At each production the expiry is worked out from the production day and this shelf life, and shows in the dispatching record and the expiry reports."], "admin": "Write the shelf life in days for each final product in the materials screen. Whoever sets the price sets it."},
  },
  {
    v: '0.9.192', date: '2026-11-11',
    ar: {"news": ["الرحلات: يختار مسؤول التوزيع المركبة عند تجهيز الرحلة. تظهر مركبة السائق تلقائيًا ويمكن تغييرها."]},
    en: {"news": ["Trips: distribution chooses the vehicle when making the trip. The driver’s vehicle is filled in and can be changed."]},
  },
  {
    v: '0.9.191', date: '2026-11-11',
    ar: {"news": ["سجل صرف وتسليم المنتجات لسلامة الغذاء، في التقارير: لكل منتج حُمّل في رحلة التاريخ ووقت التحميل ورقم التشغيلة وتاريخ الإنتاج والكمية والفرع والمركبة والسائق ودرجة الحرارة ووقت المغادرة والمستلم ومسؤول التسليم، ويُصدَّر PDF أو Excel. ويراجع مسؤول الجودة كل يوم: نعم أو لا مع ملاحظة."], "todo": "السائق: بعد تحميل كل طلبيات الرحلة اكتب رقم المركبة ودرجة حرارة المنتجات واضغط «انطلقت»، ثم سلّم. رقم المركبة يُحفظ للرحلات التالية.", "admin": "يمكن كتابة رقم مركبة كل سائق في شاشة المستخدمين. المستخدمون بصلاحيات مخصصة يحتاجون تفعيل «سجل صرف وتسليم المنتجات» في التقارير، و«مراجعة سجل صرف وتسليم المنتجات» تحت سجل التشغيلات."},
    en: {"news": ["The dispatching and delivery record for food safety, in the reports: for each product loaded on a trip, the date and loading time, batch number, production date, quantity, branch, vehicle, driver, temperature, departure time, recipient and who handed it over, saved as PDF or Excel. The quality officer reviews each day: yes or no, with a note."], "todo": "Drivers: once every order of the trip is loaded, write the vehicle number and the temperature of the products and press \"Leaving\", then deliver. The vehicle number is kept for the next trips.", "admin": "Each driver’s vehicle number can be written in the users screen. Users with custom permissions need \"Dispatching and delivery record\" ticked under reports, and \"Review the dispatching and delivery record\" under batch records."},
  },
  {
    v: '0.9.190', date: '2026-11-10',
    ar: { news: ['المواد: خانة البحث تأخذ السطر كله بجانب فلتر القسم، والأزرار في سطر تحتها.'] },
    en: { news: ['Materials: the search takes the whole line beside the department filter, with the buttons on the line under it.'] },
  },
  {
    v: '0.9.189', date: '2026-11-10',
    ar: { news: ['الاستلام بلا خانة إضافية: سجل التشغيلات يستعمل رقم الفاتورة رقمًا لتشغيلة المورد.'] },
    en: { news: ['Receiving without an extra field: the batch records use the invoice number as the supplier lot.'] },
  },
  {
    v: '0.9.188', date: '2026-11-10',
    ar: { news: ["سلامة الغذاء: دور جديد \"سلامة الغذاء\" يتابع الإنتاج وصلاحية المواد ولا يعدّل المخزون. كل إنتاج يأخذ رقم تشغيلة (مثل B-2026-1110-01)، وشاشة \"سجل التشغيلات\" تعرض لكل تشغيلة المواد التي دخلتها (من وصفة المنتج، أو مما صُرف لقسمه يوم الإنتاج حتى تكتمل الوصفات) ودفعاتها: المورد ورقم التشغيلة وتاريخ الاستلام والصلاحية. يكمل المسؤول الوردية والأوقات والتحقق ويطبعه بتصميم سجل المصنع. وفي الاستلام خانة اختيارية \"رقم تشغيلة المورد\"."] },
    en: { news: ["Food safety: a new \"Food safety\" role follows production and the expiry of materials, changing no stock. Every production gets a batch number (like B-2026-1110-01), and the \"Batch records\" screen shows for each batch the materials that went into it (from the product recipe, or what was issued to its department that day until the recipes are in) and their lots: supplier, lot number, date received and expiry. The officer completes the shift, the times and the checks and prints it in the factory form. Receiving has an optional \"Supplier lot No.\" field."] },
  },
  {
    v: '0.9.187', date: '2026-11-10',
    ar: { news: ['الدليل كله بالإنجليزية أيضًا: الكاشير، وم.التوزيع، وأمين المخزن، ومدير الفروع، والمدير العام، والمدير، والتقارير، والمصطلحات، إلى جانب ما تُرجم من قبل.'] },
    en: { news: ['The whole guide is in English too: cashier, distribution, storekeeper, branch manager, general manager, admin, reports and terms, with the chapters translated before.'] },
  },
  {
    v: '0.9.186', date: '2026-11-09',
    ar: { news: ['الدليل: شرح الشاشة التي فتحته منها يظهر أولًا في إطار مميز، ثم فصول دورك، والأساسيات ودورة الطلبية والتقارير والمصطلحات في الآخر.'] },
    en: { news: ['The guide: the screen you opened it from comes first, in a framed box, then the chapters of your role, and the basics, the order cycle, reports and terms last.'] },
  },
  {
    v: '0.9.185', date: '2026-11-09',
    ar: { news: ['الدليل: زر "؟" يفتحه، وداخله يصير "✕" فيعيدك إلى الشاشة التي كنت فيها.'] },
    en: { news: ['The guide: "?" opens it, and inside it the button becomes "✕" and takes you back to the screen you were on.'] },
  },
  {
    v: '0.9.184', date: '2026-11-09',
    ar: { news: ["الدليل داخل التطبيق: صفحة \"الدليل\" تعرض شرح شاشات دورك وعملك اليومي، مع بحث. وزر \"؟\" أعلى كل شاشة يفتح الفصل الذي يشرحها. بالإنجليزية: الأساسيات ودورة الطلبية والسائق والأقسام المنتجة والمحاسب والمشتريات، وبقية الفصول تظهر بالعربية حتى تُترجم."] },
    en: { news: ["The guide inside the app: a \"Guide\" page explains your role's screens and daily work, with a search, and the \"?\" at the top of every screen opens the chapter for it. In English: the basics, the order cycle, the driver, the producing departments, the accountant and purchasing; the other chapters show in Arabic until translated."] },
  },
  {
    v: '0.9.183', date: '2026-11-09',
    ar: { news: ['المرتجعات: بعد تثبيت القرار أو تأكيد الاستلام تتحدّث القائمة وحدها حالما يصل إلى الخادم، فلا يبقى "قيد الإرسال…" ظاهرًا.'] },
    en: { news: ['Returns: after a decision or a confirmation the list refreshes by itself once the server has it, so "Sending…" no longer stays on.'] },
  },
  {
    v: '0.9.182', date: '2026-11-09',
    ar: { news: ['على الهاتف: بطاقة الرحلة عند السائق لا تخرج عن الشاشة، وأزرار الفترة في "فروعي" صارت مقروءة.'] },
    en: { news: ['On the phone: the trip card stays inside the screen for the driver, and the period buttons in "My branches" are readable.'] },
  },
  {
    v: '0.9.181', date: '2026-11-09',
    ar: { news: ['على الهاتف: التبويبات الكثيرة (مثل اعتماد الطلبيات) تنزل إلى سطر ثانٍ بدل أن تدفع الصفحة خارج الشاشة.'] },
    en: { news: ['On the phone: many tabs (like Approve orders) go on to a second line instead of pushing the page off the screen.'] },
  },
  {
    v: '0.9.180', date: '2026-11-09',
    ar: { news: ["المرتجعات: الكاشير يختار وجهة المرتجع (المصنع أو سلوى). مرتجع سلوى يقرر فيه مدير فرعها، وما يصلح يعود إلى رصيدها فورًا. ومرتجع المصنع الذي يقرر مدير الإنتاج أنه يصلح لا يدخل الرصيد حتى يؤكد أمين المخزن ما وصل فعلًا (تبويب \"للاستلام في المخزن\")، والنقص يحتاج سببًا ويصل خبره لمن قرر."] },
    en: { news: ["Returns: the cashier chooses where the return goes (the factory or Salwa). Salwa returns are decided by its branch manager, and what is fit is back in its stock at once. A factory return the production manager finds fit enters the stock only when the storekeeper confirms what came in (\"To take into the store\" tab); a shortfall needs a reason and is reported to whoever decided."] },
  },
  {
    v: '0.9.179', date: '2026-11-09',
    ar: { news: ['استلام البضاعة: خانة أمر الشراء تعرض أولًا أوامر المورد التي فيها المادة المختارة، مع الكمية المطلوبة والمتبقي منها، ولا تعرض الأوامر التي استُلمت كل موادها.'] },
    en: { news: ['Receiving: the purchase order field lists first the supplier orders that hold the chosen item, with the quantity ordered and what is left, and no longer offers orders received in full.'] },
  },
  {
    v: '0.9.178', date: '2026-11-09',
    ar: { news: ['الوصفات: خانة المنتج تقترح أسماء المنتجات النهائية، فتُربط الوصفة بمنتجها دون خطأ في الاسم.'] },
    en: { news: ['Recipes: the product field offers the names of the final products, so a recipe is linked to its product without a mistyped name.'] },
  },
  {
    v: '0.9.176', date: '2026-11-08',
    ar: { news: ["الوصفات: خيار \"للتكلفة فقط\". الوصفة تحسب تكلفة المنتج (مثل سمنة العكر: نسبة الحيواني × سعره + نسبة النباتي × سعره) من آخر سعر شراء لكل مادة، ولا يُخصم شيء من المخزن عند الإنتاج. في نافذة المنتج يظهر \"التكلفة حسب الوصفة\" بتفصيلها وزر \"اعتمادها سعرًا\"، وفي الرئيسية يُنبَّه المدير إذا صارت التكلفة أعلى من السعر بعد شراء جديد."] },
    en: { news: ["Recipes: a \"For the cost only\" option. The recipe prices the product (like Al Aker ghee: animal share \u00d7 its price + vegetable share \u00d7 its price) from the latest purchase price of each material, and producing it takes nothing from the stores. The product window shows \"Cost from the recipe\" with its detail and a \"Use it as the price\" button; the admin's home tells when a new purchase makes the cost pass the price."] },
  },
  {
    v: '0.9.175', date: '2026-11-08',
    ar: { news: ['المستخدمون: فلترة حسب الدور (مع عدد كل دور) وبحث بالاسم.'] },
    en: { news: ['Users: filter by role (with how many in each) and search by name.'] },
  },
  {
    v: '0.9.174', date: '2026-11-08',
    ar: { news: ['طلبيات سلوى: الرمز في أول الرقم، مثل S-O00022.'] },
    en: { news: ['Salwa orders: the mark comes first, like S-O00022.'] },
  },
  {
    v: '0.9.173', date: '2026-11-08',
    ar: { news: ['الإنتاج: بعد "تأكيد الإنتاج" تفرغ خانتا المنتج والكمية معًا، فيظهر أن التسجيل تم.'] },
    en: { news: ['Production: after "Confirm production" both the product and the quantity are emptied, so it is clear it was recorded.'] },
  },
  {
    v: '0.9.172', date: '2026-11-08',
    ar: { news: ["\"لم تُرسل (مرتجع)\" في تجهيز الطلبيات يظهر فقط ما دامت البضاعة عند م.التوزيع، ويختفي بعد تحميلها مع السائق أو لطلبيات سلوى. وطلبية من أصناف سلوى فقط تأخذ هي أيضًا الرمز -S."] },
    en: { news: ["\"Not sent (return)\" in Prepare orders shows only while the goods are still with distribution; it goes once they are loaded with the driver, and for Salwa orders. An order of Salwa products only also takes the -S mark."] },
  },
  {
    v: '0.9.171', date: '2026-11-08',
    ar: { news: ["توصيل سلوى المباشر: عند إرسال الطلبية تنفصل سطور أصناف سلوى تلقائيًا في طلبية مرتبطة (رقمها مثل 1045-S)، معتمدة فورًا، تذهب مباشرة إلى سلوى. في \"تجهيز الطلبيات\" يكتب مدير سلوى أو كاشيرها الكميات (ويعدّلها إن لزم) ثم يضغط \"تسليم للسائق\" ويختار السائق الموجود: تُنشأ الرحلة محمَّلة دون م.التوزيع. ثم يوصلها السائق ويستلمها المحل كالعادة. م.التوزيع يراها في المتابعة فقط."] },
    en: { news: ["Salwa direct delivery: when an order is sent, the lines of Salwa products leave it in a linked order (No. like 1045-S), approved at once, straight to Salwa. In \"Prepare orders\" Salwa's manager or cashier writes the quantities (changing them if needed) and presses \"Give to the driver\", choosing the driver who is there: the trip is made, loaded, without distribution. The driver delivers and the shop receives as usual. Distribution sees it in the follow-up only."] },
  },
  {
    v: '0.9.170', date: '2026-11-07',
    ar: { news: ["إنتاج سلوى: كاشير المحل الذي يعمل فيه القسم يستطيع أيضًا تسليم سطوره للسائق من \"تجهيز الطلبيات\" (لا يرى غيرها)، إلى جانب مدير الفرع."] },
    en: { news: ["Salwa production: the cashier of the shop where the department works can also hand its lines to the driver from \"Prepare orders\" (and sees no others), as well as the branch manager."] },
  },
  {
    v: '0.9.169', date: '2026-11-07',
    ar: { news: ["مدير الفرع يستطيع أيضًا أن يكون مسؤول قسم يعمل في فرعه (مثل إنتاج سلوى): يُختار له القسم في شاشة المستخدمين، فيستلم سطور الطلبيات ويسجّل إنتاجها ويسلّمها للسائق."] },
    en: { news: ["A branch manager may also head a department working in their branch (like Salwa production): choose it in Users, and they get its order lines, record its production and hand it to the driver."] },
  },
  {
    v: '0.9.168', date: '2026-11-07',
    ar: { news: ["إنتاج سلوى: للقسم المنتج خانة \"مكان القسم\" (المصنع أو محل). قسم يعمل في محل، مثل إنتاج سلوى، تُربط به أصنافه، فيطلبها المحل في طلبيته العادية، ويجهّزها رئيس القسم في سلوى. وتظهر سطوره لـ م.التوزيع وفي حمولة السائق تحت \"يُستلم من سلوى\"."] },
    en: { news: ["Salwa production: a producing department has \"Where it works\" (the factory or a shop). A department working in a shop, like Salwa production, has its products; shops order them in their usual order, its head prepares them there, and its lines show to distribution and in the driver's load as \"Picked up at Salwa\"."] },
  },
  {
    v: '0.9.167', date: '2026-11-07',
    ar: { news: ["مدير الفروع: دور جديد يُربط بفرع أو أكثر في شاشة المستخدمين. شاشة \"فروعي\" تعرض لفروعه الطلبيات وتأخرها، ونوبات الكاشير وفروق المقبوضات، ويوميات المبيعات، والمرتجعات وما استُلم ناقصًا. لا يعتمد شيئًا، ويستطيع إضافة ملاحظة على طلبية (تظهر عند م.التوزيع والكاشير) أو على يومية مبيعات (تظهر عند المحاسب). وتصله تنبيهات فروعه: نقص الاستلام، والمرتجعات، ونوبة أُغلقت دون مبلغ، وفرق المقبوضات."] },
    en: { news: ["Branch manager: a new role linked to one or more branches in Users. The \"My branches\" screen shows their orders and how late they are, the cashiers' shifts and takings differences, the daily sales sheets, returns and what was received short. They approve nothing and may add a note to an order (seen by distribution and the cashier) or to a daily sales sheet (seen by the accountant). They are told of their branches' short receipts, returns, shifts closed without an amount and takings differences."] },
  },
  {
    v: '0.9.166', date: '2026-11-07',
    ar: { news: ["الأطراف: نوع جديد \"خاص\" لصاحب المصنع ومصانعه الأخرى. يُصرف لها ويُرتجع منها كالأقسام، وتظهر في تقارير الاستهلاك، ولا تدخل في دورة الطلبيات ولا الكاشير ولا الحسابات. يحوّل المدير القسم إليها من نافذة تعديله."] },
    en: { news: ["Parties: a new kind \"Special\" for the factory owner and his other factories. Issued to and returned from like departments, shown in the consumption reports, outside the shop-order cycle, cashiers and accounts. The admin turns a department into one from its edit window."] },
  },
  {
    v: '0.9.164', date: '2026-11-07',
    ar: { news: ['الموردون والأقسام: خيار "إظهار غير النشطة" كما في المواد؛ غير النشطة مخفية حتى تختاره.'] },
    en: { news: ['Suppliers & departments: a "Show inactive" option as in Materials; inactive ones are hidden until it is ticked.'] },
  },
  {
    v: '0.9.163', date: '2026-11-07',
    ar: { news: ['الأطراف: المدير يستطيع تحويل قسم إلى محل (أو العكس) من نافذة تعديله، فيبقى رقمه وكل صرفياته. المحلات تظهر في شاشة الصرف وفي تقارير استهلاك الأقسام.'] },
    en: { news: ['Parties: the admin can turn a department into a shop (or back) from its edit window; its ID and every issue stay. Shops appear in the issue screen and in the department consumption reports.'] },
  },
  {
    v: '0.9.162', date: '2026-11-07',
    ar: { news: ['المستخدمون: إضافة كاشير لا تطلب المحل بعد الآن؛ الكاشير يختار محله عند فتح النوبة.'] },
    en: { news: ['Users: adding a cashier no longer asks for the shop; the cashier chooses it when opening the shift.'] },
  },
  {
    v: '0.9.161', date: '2026-11-07',
    ar: { news: ['المواد: خانة "كل الأقسام" فيها أيضًا المخازن الأربعة (المبرَّدة، الجافة، التغليف، التنظيف) لعرض موادها وطباعة قائمتها.'] },
    en: { news: ['Materials: the "All departments" filter also lists the four stores (chilled, dry, packaging, cleaning), to show and print their materials.'] },
  },
  {
    v: '0.9.160', date: '2026-11-07',
    ar: { news: ['استيراد المنتجات: عمود اختياري old_name لتغيير اسم منتج موجود دون إنشاء منتج مكرر (يبقى رقمه وتاريخه، والاسم القديم يُحفظ). ويقرأ أيضًا الملف المفصول بعلامات Tab من Excel.'] },
    en: { news: ['Import products: an optional old_name column renames an existing product instead of making a duplicate (its ID and history stay, the old name is kept). Tab-separated files from Excel are read too.'] },
  },
  {
    v: '0.9.159', date: '2026-11-07',
    ar: { news: ['استيراد المنتجات والأسماء العربية: يقرأ ملف CSV المحفوظ من Excel بالعربية كما هو، فلا تظهر الحروف العربية مشوّهة.'] },
    en: { news: ['Importing products and Arabic names: a CSV file saved by Excel in Arabic is read as it is, so Arabic letters are no longer garbled.'] },
  },
  {
    v: '0.9.158', date: '2026-11-06',
    ar: { news: ['طباعة قائمة الأسعار: تختار قبلها الأعمدة التي تُطبع (الرقم، الاسم الإنجليزي، الاسم العربي، الوحدة، السعر)، ويُحفظ اختيارك.'] },
    en: { news: ['Printing the price list: choose the columns first (ID, English name, Arabic name, unit, price); your choice is kept.'] },
  },
  {
    v: '0.9.157', date: '2026-11-06',
    ar: { news: ['المواد: عمود "السعر" بدل الحد الأدنى في القائمة، وزر "طباعة قائمة الأسعار" للقسم المختار (أو لكل الأقسام).'] },
    en: { news: ['Materials: a Price column in place of the minimum in the list, and a "Print the price list" button for the department chosen (or every department).'] },
  },
  {
    v: '0.9.156', date: '2026-11-05',
    ar: { news: ['استيراد المنتجات: القسم يُعرف بأي طريقة كُتب بها ("Kunafa" أو "الكنافة" أو "Section (الكنافة) Kunafa")، فيذهب المنتج إلى القسم الموجود ولا يُنشأ قسم مكرر. المعاينة تُظهر القسم الذي طابقه برقمه.'] },
    en: { news: ['Import products: a department is recognised however it is written ("Kunafa", "الكنافة" or "Section (الكنافة) Kunafa"), so the product goes to the existing one and no duplicate is made. The preview shows the department matched, with its ID.'] },
  },
  {
    v: '0.9.155', date: '2026-11-05',
    ar: { news: ['المواد: زر "استيراد المنتجات" للمدير، يقرأ قائمة أسعار (ملف CSV: القسم، الاسم، الاسم العربي، الوحدة، السعر) ويعرض قبل الحفظ ما سيُضاف وما سيُحدّث وما يُترك، ثم يحفظها دفعة واحدة. القسم غير الموجود يُنشأ قسمًا منتجًا، والاسم الذي لمادة خام لا يتحول إلى منتج.'] },
    en: { news: ['Materials: an "Import products" button for the admin reads a price list (a CSV file: department, name, Arabic name, unit, price), shows what will be added, updated or left out, then saves it at once. A missing department is created as a producing one; a name used by a raw material is never turned into a product.'] },
  },
  {
    v: '0.9.154', date: '2026-11-05',
    ar: { news: ['اعتماد الطلبيات: تبويب "المتابعة" بكل طلبية من إرسالها حتى فوترتها، بمراحلها ومدة مرحلتها ولون التأخر، ورقم المتأخرة على التبويب والقائمة. والكاشير: عند الخروج ونوبته مفتوحة يُطلب منه إنهاؤها بالمبلغ، والكاشير التالي يستطيع استلام محل تُرك مفتوحًا، فتُغلق النوبة دون مبلغ ويكملها المحاسب.'] },
    en: { news: ['Approve orders: a Follow-up tab with every order from sending to its invoice, its stage, how long it has been there and a colour when late, with the number of late ones on the tab and the menu. The cashier: signing out with a shift open asks to end it with its amount; the next cashier can take over a shop left open, its shift closing without an amount for the accountant to complete.'] },
  },
  {
    v: '0.9.153', date: '2026-11-05',
    ar: { news: ['الحسابات: تاريخ بداية للحسابات (يوم التثبيت افتراضيًا)، وتبويب "الرصيد الافتتاحي" يكتب فيه المحاسب ما علينا لكل مورد وما عند كل محل في ذلك اليوم. ما قبل البداية لا يُحسب، فتبدأ الأرصدة من صفر حتى يُكتب الافتتاحي.'] },
    en: { news: ['Accounts: a day the accounts start (the install day by default), and an Opening balances tab where the accountant writes what was owed to each supplier and held by each shop that day. What came before is not counted, so balances start at zero until an opening balance is written.'] },
  },
  {
    v: '0.9.152', date: '2026-11-05',
    ar: { news: ['لوحة المدير العام: شاشة قراءة فقط بدور "مدير عام"، في سبعة تبويبات (نظرة عامة، المبيعات، الربحية، المخزون، الخسائر، الموردون، الخدمة)، لكل فترة مقارنة بالفترة التي قبلها، مع رسوم وطباعة.'] },
    en: { news: ['The general manager screen: read only, with a General manager role, in seven tabs (overview, sales, profitability, stock, losses, suppliers, service), each period against the one before, with charts and print.'] },
  },
  {
    v: '0.9.151', date: '2026-11-05',
    ar: { news: ['المواد والموردون: نافذة الحفظ تُغلق حالما يحفظ الخادم، وتُقرأ البيانات من جديد في الخلفية بدل انتظار طلب ثانٍ بطيء.'] },
    en: { news: ['Items and suppliers: the save window closes as soon as the server has saved; the data is read again in the background instead of waiting for a second slow request.'] },
  },
  {
    v: '0.9.150', date: '2026-11-05',
    ar: { news: ['القسم الإنتاجي: إن لم يكفِ رصيد منتج القسم للطلبيات يظهر الرقم على "الإنتاج" والإشعار "إنتاج مطلوب"، وبعد الإنتاج ينتقل الرقم إلى "تجهيز الطلبيات" مع إشعار "جاهز للتجهيز".'] },
    en: { news: ['Producing departments: when a department product\u2019s stock does not cover the orders, the number shows on Production with a Production needed message; once made, the number moves to Prepare orders with a Ready to prepare message.'] },
  },
  {
    v: '0.9.149', date: '2026-11-04',
    ar: { news: ['الإنتاج: المنتجات التي تنتظرها طلبيات المحلات تظهر أولًا في خانة "المنتج" لكل قسم، مع الكمية الناقصة (المطلوب ناقص الرصيد). واختيار منتج منها يملأ "الكمية" بها.'] },
    en: { news: ['Production: the products the shop orders wait for come first in Product for each department, with the quantity still to make (ordered less stock); choosing one fills Quantity with it.'] },
  },
  {
    v: '0.9.148', date: '2026-11-04',
    ar: { news: ['اعتماد أوامر الشراء والصندوق، وإرسال المرتجع وقراره، فورية وتُرسل في الخلفية. وأرصدة الحسابات تُحسب بمرور واحد على الحركات بدل مرور لكل مورد، فصار تحميلها أسرع بكثير.'] },
    en: { news: ['Approving LPOs and cash sheets, sending a return and deciding it are immediate and sent in the background. The account balances read the movements once instead of once per supplier, so they load much faster.'] },
  },
  {
    v: '0.9.147', date: '2026-11-04',
    ar: { news: ['الرحلات: إنشاء الرحلة وتحميل السائق وتسليمه وإلغاء الرحلة فورية وتُرسل في الخلفية، ونموذج "رحلة جديدة" يفتح فورًا بما كان آخر مرة.'] },
    en: { news: ['Trips: creating a trip, the driver loading and delivering, and cancelling are immediate and sent in the background; the New trip form opens at once with what was there last time.'] },
  },
  {
    v: '0.9.146', date: '2026-11-04',
    ar: { news: ['تجهيز الطلبيات: تظهر الأسطر فورًا من آخر مرة ثم تُحدَّث في الخلفية، ولا تُعاد رسم الصفحة بعد التسليم للتوزيع إلا إن تغيّرت الأسطر، ويبقى موضع التمرير.'] },
    en: { news: ['Prepare orders: the lines show at once from last time and are checked in the background; after handing to distribution the page is drawn again only if the lines changed, and the scroll stays.'] },
  },
  {
    v: '0.9.145', date: '2026-11-04',
    ar: { news: ['الطلبيات: الاعتماد والرفض والتوجيه وإغلاق الناقص واعتماد الفرق والاستلام والإلغاء فورية، وتُرسل في الخلفية. البطاقة تقول "يُرسل" حتى تصل، ولا تعرض أزرارها مرة ثانية.'] },
    en: { news: ['Orders: approve, reject, route, close the short, accept the difference, receive and cancel are immediate and sent in the background. The card says sending until it arrives and offers no button twice.'] },
  },
  {
    v: '0.9.144', date: '2026-11-04',
    ar: { news: ['طلبيتي: الإرسال والحفظ فوريان، والطلبية تُرسل إلى الخادم في الخلفية (وتنتظر الاتصال إن انقطع). تظهر "طلبية في الطريق" حتى تصل.'] },
    en: { news: ['My order: sending and saving are immediate; the order goes to the server in the background (and waits for the connection if it is lost). An on-the-way note shows until it arrives.'] },
  },
  {
    v: '0.9.143', date: '2026-11-04',
    ar: { news: ['سرعة: إشعارات الهاتف تُرسل بعد الرد على الحفظ في طلب ثانٍ، فلا ينتظرها من يحفظ. وإضافة سطر إلى سجل التدقيق أو جدول طويل لم تعد تقرأ الجدول كله.'] },
    en: { news: ['Speed: phone messages go out after the save has answered, in a second request, so the person saving does not wait for them. Adding a row to the audit log or a long sheet no longer reads the whole sheet.'] },
  },
  {
    v: '0.9.142', date: '2026-11-04',
    ar: { news: ['سرعة: الحفظ يكتب تغييراته دفعة واحدة في آخر العملية بدل كتابة كل سطر وحده، ولا يعيد قراءة الجداول تحت القفل إن لم يكتب أحد. والبحث في الجداول بفهرس، فصار تحميل البيانات وقائمة الطلبيات أسرع بكثير.'] },
    en: { news: ['Speed: a save writes its changes together at the end instead of one row at a time, and does not read the sheets again under the lock when nobody wrote. Lookups use an index, so loading the data and the orders list are much faster.'] },
  },
  {
    v: '0.9.141', date: '2026-11-04',
    ar: { news: ['لوحة التحكم: "مقبوضات اليوم" صارت خانة مستقلة في شجرة الصلاحيات (لوحة التحكم ← مقبوضات اليوم للمحلات)، للمدير فقط افتراضيًا، فلا تظهر لأمناء المخازن.'] },
    en: { news: ['Dashboard: Today’s takings is its own tick in the permission tree (Dashboard → Shops’ takings of the day), the admin only by default, so storekeepers no longer see it.'] },
  },
  {
    v: '0.9.140', date: '2026-11-04',
    ar: { news: ['نافذة تأكيد إرسال الطلبية: الأسطر مجمّعة حسب القسم ثم المخزن ثم المنتجات الخاصة، مع عدد كل مجموعة.'] },
    en: { news: ['The order send window: lines grouped by department, then store, then special products, with the count of each.'] },
  },
  {
    v: '0.9.139', date: '2026-11-04',
    ar: { news: ['طلبيتي: لا إرسال ولا حفظ إن بقيت مادة أو كمية مكتوبة لم تُضف، ويومض زر "إضافة إلى الإذن". ونافذة الإرسال تعرض أسطر الطلبية لمراجعتها قبل التأكيد.'] },
    en: { news: ['My order: nothing is sent or saved while an item or quantity is typed and not added; the Add button flashes. The send window lists the lines to check before confirming.'] },
  },
  {
    v: '0.9.138', date: '2026-11-04',
    ar: { news: ['الحسابات: "دفعة جديدة" للموردين فقط. وكشف حساب المحل يُبنى وحده: الفواتير عليه، ويومية المبيعات المعتمدة له، فالرصيد ما استلمه المحل ولم يقابله بيع.'] },
    en: { news: ['Accounts: New payment is for suppliers only. A shop statement builds itself: invoices against its approved daily sales, so the balance is what it received and has not sold.'] },
  },
  {
    v: '0.9.137', date: '2026-11-04',
    ar: { news: ['شجرة الصلاحيات: الحسابات صارت تبويبًا تبويبًا (الأرصدة، كشف حساب، دفعة جديدة، مطابقة أوامر الشراء، مقبوضات النوبات، يومية المبيعات)، لكل منها خانته.'] },
    en: { news: ['Permission tree: Accounts by tab (balances, statement, new payment, purchase orders matched, shift takings, daily sales), each with its own tick.'] },
  },
  {
    v: '0.9.136', date: '2026-11-04',
    ar: { news: ['مقبوضات النوبات: إن اختلف المستلم عن المصرّح به يكتب المحاسب "الإجراء المتخذ" (إلزامي). والمدير يرى "فروق المقبوضات" بإجراءاتها في تبويب المقبوضات، ورقمًا في قراراتك لكل فرق جديد حتى يطّلع عليه.'] },
    en: { news: ['Shift takings: when received differs from declared, the accountant writes the action taken (required). The admin sees Takings differences with their actions in the takings tab, and a number in Your decisions for each new one until looked at.'] },
  },
  {
    v: '0.9.135', date: '2026-11-04',
    ar: { news: ['يومية المبيعات: المحلات وإعداد القنوات تنطوي، وخانة النقد بشكل بقية الخانات. واليوميات للاعتماد في جدول واحد: المحلات في الأسطر والقنوات في الأعمدة، مع الإجمالي وزر اعتماد الكل.'] },
    en: { news: ['Daily sales: the shops and the channels settings fold, and the cash field looks like the others. The sheets to approve in one table: shops in rows, channels in columns, with totals and Approve all.'] },
  },
  {
    v: '0.9.134', date: '2026-11-04',
    ar: { news: ['يومية المبيعات في الحسابات: لكل محل ويوم النقد من النوبات، والبطاقة والتطبيقات يكتبها المحاسب، ثم يرسلها للمدير فيعتمدها أو يعيدها. القنوات تُضبط في شاشة المستخدمين (qlub للؤلؤة وحدها). وتقرير "المبيعات حسب القناة"، والهامش ولوحة التحكم يقرآن اليومية.'] },
    en: { news: ['Daily sales sheet in Accounts: per shop and day, cash from the shifts, card and apps typed by the accountant, sent to the admin to approve or return. Channels set in the users screen (qlub for the Pearl only). A Sales by channel report; margin and dashboard read the sheet.'] },
  },
  {
    v: '0.9.133', date: '2026-11-04',
    ar: { news: ['إصلاح: بعد كل تحديث للتطبيق تُقرأ الصلاحيات من جديد، فتظهر الشاشات والتبويبات الجديدة دون انتظار تغيّر في البيانات.'] },
    en: { news: ['Fix: after each app update the permissions are read again, so new screens and tabs show without waiting for a data change.'] },
  },
  {
    v: '0.9.132', date: '2026-11-04',
    ar: { news: ['الحسابات: عمود الطرف صار "المورد / المحل" بدل "المورد / القسم".'] },
    en: { news: ['Accounts: the party column reads Supplier / shop.'] },
  },
  {
    v: '0.9.131', date: '2026-11-04',
    ar: { news: ['تقرير التكلفة والهامش: لكل محل مقبوضاته في الفترة والفرق بينها وبين ما فوتر له. ولوحة التحكم: بطاقة مقبوضات اليوم لكل محل، مع النوبات المفتوحة.'] },
    en: { news: ['Cost and margin report: each shop with its takings in the period and the difference against what it was invoiced. The dashboard: a card of today\u2019s takings per shop, with the shifts still open.'] },
  },
  {
    v: '0.9.130', date: '2026-11-04',
    ar: { news: ['مقبوضات النوبات: في شاشة الحسابات تبويب جديد، يستلم فيه المحاسب نقد كل نوبة مغلقة ويكتب ما استلمه فيظهر الفرق. وتقرير جديد "مقبوضات المحلات" لكل يوم ومحل وكاشير.'] },
    en: { news: ['Shift takings: a new tab in Accounts where the accountant receives the cash of each closed shift; the difference shows. A new report, Shop takings, per day, shop and cashier.'] },
  },
  {
    v: '0.9.129', date: '2026-11-04',
    ar: { news: ['الكاشير: عند إنهاء النوبة يكتب المبلغ المحصّل فيها (وملاحظة)، ويُحفظ لكل نوبة. والشاشة الرئيسية للمدير: "قراراتك" و"عمل الفريق" في إطارين منفصلين.'] },
    en: { news: ['The cashier: ending a shift asks the amount collected in it (and a note), kept for each shift. The admin home: Your decisions and Team work in two separate frames.'] },
  },
  {
    v: '0.9.128', date: '2026-11-04',
    ar: { news: ['المدير: رقم الإصدار وتغيير اللغة وتسجيل الخروج على الشريط العلوي في كل الشاشات.'] },
    en: { news: ['The admin: the version, the language and sign out on the top bar of every screen.'] },
  },
  {
    v: '0.9.127', date: '2026-11-04',
    ar: { news: ['"قراراتك" تُحسب من صلاحية الاعتماد نفسها (أوامر الشراء، الصندوق، الجرد، الطلبيات الخاصة) لا من الشاشة. وخانة "حساب المطوّر" في شاشة المستخدمين: يرى كل شيء ولا تُعرض عليه القرارات ولا تصله إشعارات الأدوار.'] },
    en: { news: ['Your decisions are counted by the approval itself (purchase orders, cash, stock counts, special orders), not by the screen. A Developer account tick in the users screen: sees everything, is shown no decisions and gets no role messages.'] },
  },
  {
    v: '0.9.126', date: '2026-11-04',
    ar: { news: ['إصلاح: "قراراتك" و"عمل الفريق" في الشاشة الرئيسية للمدير كانا يعرضان نصًا خاطئًا بدل الأسماء والأرقام.'] },
    en: { news: ['Fix: Your decisions and Team work on the admin home screen showed wrong text instead of the names and numbers.'] },
  },
  {
    v: '0.9.125', date: '2026-11-04',
    ar: { news: ['الشاشة الرئيسية للمدير: "بانتظارك" صار قسمين: "قراراتك" لما لا يقرره غيرك، و"عمل الفريق" سطر أرقام لما ينتظر مستخدمين آخرين.'] },
    en: { news: ['The admin home screen: Waiting for you is now two parts: Your decisions, for what nobody else decides, and Team work, a line of numbers for what waits for other users.'] },
  },
  {
    v: '0.9.124', date: '2026-11-04',
    ar: { news: ['الشاشة الرئيسية للمدير: "بانتظارك" في الأعلى بالشاشات التي عليها رقم، ثم المفضلة (النجمة على كل شاشة، حتى 6)، ثم خمس مجموعات قابلة للطي: المخازن، دورة الطلبيات، المشتريات والمالية، المتابعة، الإدارة. والقائمة الجانبية بالمجموعات نفسها.'] },
    en: { news: ['The admin home screen: Waiting for you at the top with the screens that have a number, then favourites (the star on each screen, up to 6), then five folding groups: stores, order cycle, purchasing and finance, follow-up, admin. The side menu uses the same groups.'] },
  },
  {
    v: '0.9.123', date: '2026-11-04',
    ar: { news: ['التقارير تتبع لغة الشاشة: بالعربية العنوان والأعمدة والكلمات الثابتة وأسماء الأصناف، في المعاينة والطباعة وExcel وواتساب، من اليمين إلى اليسار.'] },
    en: { news: ['Reports follow the screen language: in Arabic the title, columns, fixed words and item names, in the preview, print, Excel and WhatsApp, right to left.'] },
  },
  {
    v: '0.9.122', date: '2026-11-03',
    ar: { news: ['الاستلام: خانة "أمر الشراء (اختياري)" تعرض أوامر الشراء المعتمدة للمورد المختار، فتصير مطابقة أوامر الشراء في الحسابات دقيقة لكل استلام يحمل رقمه.'] },
    en: { news: ['Receiving: a Purchase order (optional) field lists the approved LPOs of the chosen supplier, so the purchase order matching in Accounts is exact for each receipt that names it.'] },
  },
  {
    v: '0.9.121', date: '2026-11-03',
    ar: { news: ['للمحاسب: إقفال الفترة حتى تاريخ (في شاشة المستخدمين)، وتقرير قيمة المخزون في تاريخ، وتقرير التكلفة والهامش، وتقرير الخسائر يضم المرتجعات التالفة والمنتهية والضائع في الطريق. وشاشة الحسابات: أرصدة الموردين والمحلات، وكشف حساب، وتسجيل الدفعات، ومطابقة أوامر الشراء.'] },
    en: { news: ['For the accountant: the period closed until a date (users screen), stock value on a date, cost and margin, and the losses report with returns damaged or expired and goods lost on the way. The Accounts screen: supplier and shop balances, statements, payments, and purchase orders matched.'] },
  },
  {
    v: '0.9.120', date: '2026-11-03',
    ar: { news: ['الطلبية الخاصة: "مواد من القائمة (اختياري)" مطوية وتُفتح بالضغط. م.المشتريات: خانة "للتوزيع / للمحل مباشرة" فارغة ويجب اختيارها قبل التسليم.'] },
    en: { news: ['Special order: Items from the list (optional) is folded and opens on a press. Purchasing: To distribution / Straight to the shop starts empty and must be chosen before handing.'] },
  },
  {
    v: '0.9.119', date: '2026-11-03',
    ar: { news: ['المنتج الخاص المشترى: م.المشتريات يسلّمه للتوزيع أو للمحل مباشرة. الطلبية التي كل ما فيها سُلّم للمحل مباشرة لا تحتاج رحلة، وتظهر للكاشير "وصلت" ليستلمها. والسائق لا يرى في حمولته ما سُلّم للمحل مباشرة.'] },
    en: { news: ['A bought special product: purchasing hands it to distribution or straight to the shop. An order whose every line went straight to the shop needs no trip and shows as arrived for the cashier to receive. The driver load leaves out what went straight to the shop.'] },
  },
  {
    v: '0.9.118', date: '2026-11-03',
    ar: { news: ['المنتج الخاص الموجَّه إلى المشتريات: م.المشتريات يختار من المخزن (يذهب إلى أمين المخزن ويُخصم من الرصيد)، أو شراء بسعر نهائي يكتبه ثم يسلّمه هو للتوزيع، أو غير متوفر بسبب (يصل الكاشير إشعار). سعر الكاشير تقديري.'] },
    en: { news: ['A special product sent to purchasing: from the store (to the storekeeper, taken from the balance), buy at a final price written by purchasing who hands it to distribution, or not available with a reason (the cashier is told). The cashier price is an estimate.'] },
  },
  {
    v: '0.9.117', date: '2026-11-03',
    ar: { news: ['رحلة جديدة: الطلبية الخاصة بإطار ملوّن وموعدها واسم الزبون وعنوانه، وترسل مع أي سائق. النقص: كل مخزن أو قسم يرى نقصه وحده. صلاحيات تجهيز الطلبيات بالعربية. المنتج الخاص الموجَّه إلى المشتريات يظهر في طلبات الشراء الخاصة.'] },
    en: { news: ['New trip: a special order has a coloured frame with its time, customer and address, and goes with any driver. Shortages: each store or department sees its own. Prepare orders permissions in Arabic. A special product routed to purchasing shows in Special purchase requests.'] },
  },
  {
    v: '0.9.116', date: '2026-11-03',
    ar: { news: ['الطلبية الخاصة: في "طلبيتي" يختار الكاشير طلبية خاصة، يكتب الزبون وتاريخ ووقت ومكان التسليم، ويصف المنتج بسعره المتفق عليه مع حتى 3 صور. مدير الإنتاج يوجّه كل منتج إلى قسمه أو إلى المشتريات، والقسم يراه في تجهيز الطلبيات بموعده. السائق يرى العنوان والهاتف، والتسليم عند الزبون يُعدّ استلامًا، والفاتورة على المحل.'] },
    en: { news: ['Special orders: in My order the cashier picks a special order, writes the customer, date, time and place, and describes the product with the agreed price and up to 3 photos. The production manager sends each product to its department or to purchasing; the department sees it in Prepare orders with its deadline. The driver sees the address and phone; delivery at the customer counts as received, invoiced to the shop.'] },
  },
  {
    v: '0.9.115', date: '2026-11-03',
    ar: { news: ['شاشة المرتجعات: الكاشير يُرجع بضاعة بسببها، فتدخل الحجر ولا تُحسب في الرصيد. مدير الإنتاج يقرر لكل صنف: يعود للمخزن أو تالف أو منتهي الصلاحية. و"إرجاع إلى المخزن" في فرق الاستلام يمر عبر الحجر أيضًا.'] },
    en: { news: ['Returns screen: the cashier returns goods with a reason; they go to quarantine and are not in the balance. The production manager decides each item: back to the store, damaged or expired. A receipt difference back to the store goes through quarantine too.'] },
  },
  {
    v: '0.9.114', date: '2026-11-03',
    ar: { news: ['الفواتير: كل طلبية بانتظار فاتورتها تعرض لكل مادة ما طُلب وما سُلّم وما استُلم، والسطر المختلف ملوّن. وفي جدول البيانات أمر للقراءة فقط: MORO ثم Check for duplicate numbers.'] },
    en: { news: ['Invoices: each order waiting for its invoice shows, for every item, what was ordered, handed and received, with a line that differs in colour. In the spreadsheet, a read-only command: MORO, then Check for duplicate numbers.'] },
  },
  {
    v: '0.9.113', date: '2026-11-02',
    ar: { news: ['فروق الاستلام: خانة المصير فارغة لكل سطر، ويجب أن يختار مسؤول التوزيع (رجع إلى المخزن أو تالف أو مفقود) قبل اعتماد الفرق.'] },
    en: { news: ['Receipt differences: the choice is empty on each line, and distribution must pick (back to the store, or damaged or lost) before accepting.'] },
  },
  {
    v: '0.9.112', date: '2026-11-02',
    ar: { news: ['فروق الاستلام: طلبية استلمها الكاشير ناقصة تظهر في تبويب "فروق الاستلام" عند مسؤول التوزيع، ولا تُفوتر حتى يعتمد الفرق ويختار لكل سطر: رجع إلى المخزن (تعود الكمية إلى الرصيد) أو تالف أو مفقود.'] },
    en: { news: ['Receipt differences: an order received short shows in distribution’s "Receipt differences" tab, and is not invoiced until the difference is accepted with, per line, back to the store (the quantity returns to stock) or damaged or lost.'] },
  },
  {
    v: '0.9.111', date: '2026-11-02',
    ar: { news: ['الكاشير: رقم على تبويب "وصلت" بعدد الطلبيات التي وصلت ولم يؤكَّد استلامها.'] },
    en: { news: ['The cashier: a number on "Delivered" with the orders that arrived and are not yet received.'] },
  },
  {
    v: '0.9.110', date: '2026-11-02',
    ar: { news: ['السائق: تسليم محل قبل محل يسبقه في ترتيب الرحلة يطلب تأكيدًا.'] },
    en: { news: ['The driver: delivering a shop before one earlier in the trip asks for a confirmation.'] },
  },
  {
    v: '0.9.109', date: '2026-11-02',
    ar: { news: ['السائق: لا تسليم قبل تحميل كل طلبيات الرحلة. يظهر زر "تم التسليم" بعد تحميل الجميع.'] },
    en: { news: ['The driver: no delivery before every order of the trip is loaded. "Delivered" shows once all are loaded.'] },
  },
  {
    v: '0.9.108', date: '2026-11-02',
    ar: { news: ['حالات الطلبية بعد الرحلة: "بانتظار التحميل" (أُسندت لرحلة ولم تُحمَّل بعد) ثم "في الطريق" (حمّلها السائق) ثم "وصلت".'] },
    en: { news: ['Order states after the trip: "Waiting to be loaded" (in a trip, not loaded yet), then "On the way" (the driver loaded it), then "Delivered".'] },
  },
  {
    v: '0.9.107', date: '2026-11-02',
    ar: { news: ['إصلاح: زرّا "تم التحميل" و"تم التسليم" عند السائق لم يكونا يحفظان شيئًا منذ النسخة 0.9.104.'] },
    en: { news: ['Fix: the driver’s "Loaded" and "Delivered" buttons saved nothing since version 0.9.104.'] },
  },
  {
    v: '0.9.106', date: '2026-11-02',
    ar: { news: ['اعتماد الطلبيات: رقم على كل تبويب بعدد طلبياته (بانتظار الاعتماد، قيد التجهيز، جاهزة للتوزيع)، وعلى "مرفوضة" عدد ما رُفض منذ آخر فتح لها. يتحدّث مع كل تغيير.'] },
    en: { news: ['Approve orders: a number on each tab with its orders (waiting, being prepared, ready), and on "Rejected" those rejected since it was last opened. It follows every change.'] },
  },
  {
    v: '0.9.105', date: '2026-11-02',
    ar: { news: ['إصلاح: طلبيتان في اللحظة نفسها كانتا تأخذان الرقم نفسه. كل رقم (طلبية، حركة، رحلة، فاتورة…) يُقرأ الآن من جديد داخل القفل.'] },
    en: { news: ['Fix: two orders at the same moment took the same number. Every counter (order, movement, trip, invoice…) is now read afresh inside the lock.'] },
  },
  {
    v: '0.9.104', date: '2026-11-02',
    ar: { news: ['اعتماد الطلبيات أسرع (الإشعارات تُرسل بعد حفظ القرار)، ولا تتحدّث القائمة أثناء إرسال القرار فلا يظهر الزر مرة ثانية. وإن سبقك أحد إلى الطلبية تظهر رسالة واضحة بدل "السجل غير موجود".'] },
    en: { news: ['Approving orders is quicker (messages go out after the decision is saved), and the list does not refresh while a decision is on its way, so the button does not come back. If someone acted on the order first, a clear message replaces "Record not found".'] },
  },
  {
    v: '0.9.103', date: '2026-11-02',
    ar: { news: ['القرص في الشاشة الرئيسية: كلمة «MORO» بخط رقيق وبين علامتي تنصيص.'] },
    en: { news: ['The home screen disc: "MORO" in a thin type, between quotes.'] },
  },
  {
    v: '0.9.101', date: '2026-11-02',
    ar: { news: ['القرص في الشاشة الرئيسية: كلمة MORO أصغر، وجملة Materials Operations & Records Organizer أكبر.'] },
    en: { news: ['The home screen disc: MORO smaller, Materials Operations & Records Organizer larger.'] },
  },
  {
    v: '0.9.100', date: '2026-11-02',
    ar: { news: ['السائق: زر "عرض الحمولة" لكل محل في الرحلة (ما سُلّم من كل مادة وكميته)، و"حمولة الرحلة كاملة" بمجموع كل المحلات، ليطابقها مع ما في السيارة قبل التحميل.'] },
    en: { news: ['The driver: "Show the load" for each shop of the trip (each item handed and its quantity), and "The whole trip’s load" summed over the shops, to check against the car before loading.'] },
  },
  {
    v: '0.9.99', date: '2026-11-02',
    ar: { news: ['إصلاح: التطبيق لم يكن يفتح بعد النسخة 0.9.97.'] },
    en: { news: ['Fix: the app did not open after version 0.9.97.'] },
  },
  {
    v: '0.9.98', date: '2026-11-02',
    ar: { news: ['إشعار على الهاتف لكل خطوة في الطلبية، لمن عليه التصرّف: طلبية جديدة للاعتماد، اعتماد أو رفض للكاشير، نقص في التجهيز، جاهزة للتوزيع، رحلة جديدة أو ملغاة للسائق، في الطريق، وصلت، وطلبية للفوترة. وأرقام على "طلبيتي" و"الرحلات" و"الفواتير" بما ينتظرك.'] },
    en: { news: ['A phone message for every step of an order, to whoever has to act: a new order to approve, approved or rejected for the cashier, short in preparation, ready for distribution, a new or cancelled trip for the driver, on the way, delivered, and an order to invoice. Numbers on "My order", "Trips" and "Invoices" for what waits for you.'] },
  },
  {
    v: '0.9.97', date: '2026-11-02',
    ar: { news: ['طلبية لم تُجهَّز كاملة: في "اعتماد الطلبيات" ← قيد التجهيز، زر "اعتماد ما سُلّم وإغلاق الباقي" ينقلها بما سُلّم إلى الرحلات. إن لم يُسلَّم شيء تُغلق.'] },
    en: { news: ['An order not fully prepared: in "Approve orders" → being prepared, "Accept what was handed, close the rest" sends it on to the trips with what was handed. Nothing handed: it is closed.'] },
  },
  {
    v: '0.9.96', date: '2026-11-02',
    ar: { news: ['القسم منتج أو غير منتج (التنظيف، الإدارة…): علّم "قسم منتج" في نافذة القسم. الأقسام المنتجة وحدها تظهر في "القسم الذي ينتجه" وفي أقسام مسؤول القسم وفلتر المواد.'] },
    en: { news: ['A department makes products or not (cleaning, management…): tick "Producing department" in its window. Only producing departments show in "Made by department", the department head’s departments and the items filter.'] },
  },
  {
    v: '0.9.87', date: '2026-11-01',
    ar: { news: ['أسماء جديدة: "طلبيتي" للكاشير، و"اعتماد الطلبيات" للتوزيع، و"تجهيز الطلبيات" للأقسام والمخازن. الكاشير يبدأ نوبة في المحل الذي يعمل فيه (لا يأخذه كاشير آخر حتى ينهيها)، ويختار المادة بتبويبات المخازن والأقسام. تبويبات للرحلات والفواتير، وفلتر القسم في قائمة المواد.'] },
    en: { news: ['New names: "My order" for the cashier, "Approve orders" for distribution, "Prepare orders" for departments and stores. The cashier starts a shift in the shop they work in (no other cashier can take it until it ends) and picks items by store or department tabs. Tabs for trips and invoices, and a department filter in the items list.'] },
  },
  {
    v: '0.9.86', date: '2026-11-01',
    ar: { news: ['طلبيات المحلات، المرحلة 3: مسؤول التوزيع يُصدر فاتورة الطلبية المستلَمة بالكميات المستلَمة، بقسمين (منتجات نهائية بسعرها النهائي، ومواد المخزن بسعر آخر شراء) والسعر يُجمَّد لحظة الإصدار، وتُطبع بتصميم ورقة الشركة. وأربعة تقارير: توقيتات الطلبيات، فروق الاستلام، ما لم يمكن توفيره، ومبيعات المحلات بمجموع كل قسم.'] },
    en: { news: ['Shop orders, stage 3: distribution issues the invoice of a received order from what was received, in two parts (final products at their final price, store items at their last purchase price), the prices frozen when issued, printed in the company layout. And four reports: order times, received short, could not be supplied, and shop sales with each part’s sum.'] },
  },
  {
    v: '0.9.84', date: '2026-11-01',
    ar: { news: ['طلبيات المحلات، المرحلة 2: مسؤول التوزيع ينشئ رحلة بسائق وطلبيات جاهزة بترتيب التوقف؛ السائق يؤكّد التحميل ثم التسليم لكل محل؛ الكاشير يستلم ويكتب المستلَم، والنقص بسببه. والإنتاج ممكن الآن دون وصفة للمنتجات النهائية.'] },
    en: { news: ['Shop orders, stage 2: distribution makes a trip with a driver and ready orders in stop order; the driver confirms loading then delivery per shop; the cashier receives and enters what came, a shortfall with its reason. Final products can now be produced without a recipe.'] },
  },
  {
    v: '0.9.83', date: '2026-11-01',
    ar: { news: ['طلبيات المحلات داخل مورو، المرحلة 1: الكاشير يكتب طلبية محله ويرسلها لليوم الموالي، ومسؤول التوزيع يعتمدها، وكل سطر يذهب لقسمه المنتِج أو لمخزنه في "طلبيات المحلات"، بتبويبات لكل قسم ومخزن.'] },
    en: { news: ['Shop orders inside MORO, stage 1: the cashier writes the shop’s order for the next day, distribution approves it, and each line goes to the department that makes it or to its store in "Shop orders", with a tab per department and store.'] },
  },
  {
    v: '0.9.83', date: '2026-11-02',
    ar: { news: ['إصلاح: عمليتان محفوظتان في اللحظة نفسها لم تعودا تأخذان الرقم نفسه.'] },
    en: { news: ['Fix: two operations saved at the same moment no longer take the same number.'] },
  },
  {
    v: '0.9.82', date: '2026-11-01',
    ar: { news: ['طلبات الأقسام: الطلب المصروف جزئيًا يُؤرشف مثل غيره، وزر "طلب الباقي" يظهر عند الطالب في تبويبة "جزئي" من الأرشيف فقط.'] },
    en: { news: ['Department requests: a request given in part goes to the archive like the others; "Ask for the rest" shows to the requester in the "partial" tab of the archive only.'] },
  },
  {
    v: '0.9.81', date: '2026-11-01',
    ar: { news: ['طلبات الأقسام عند الطالب: يظهر نموذج الطلب الجديد فقط، وزر "أرشيف الطلبات" يفتح الطلبات السابقة. الطلبات التي يمكن طلب باقيها تظهر تحت النموذج.'] },
    en: { news: ['Department requests for the requester: only the new request shows; "Requests archive" opens the earlier ones. Requests whose rest can be asked for show under the form.'] },
  },
  {
    v: '0.9.80', date: '2026-11-01',
    ar: {
      news: ['أسماء المواد تظهر بالعربية لمن يستعمل التطبيق بالعربية، حين يكون للمادة اسم عربي. الاسم الأصلي لا يتغيّر في البيانات ولا في التقارير، والبحث يقبل الاسمين.',
        'طلبات الأقسام: أمين المخزن يستطيع "رفض الطلب" مع السبب، ويرى الطالب السبب. وبعد اختيار القسم تظهر المواد التي سبق طلبها له لاختيارها بضغطة. والقائمة تتحدّث تلقائيًا دون أن تضيع الكميات المكتوبة.'],
      admin: 'في شاشة المواد زر "استيراد الأسماء العربية" (ملف CSV فيه item_id و name_ar)، وخانة "الاسم بالعربية" في نافذة المادة.',
    },
    en: {
      news: ['Item names show in Arabic to Arabic users when the item has an Arabic name. The name itself does not change in the data or the reports, and search takes both.',
        'Department requests: the storekeeper can "Reject request" with a reason the requester sees. After choosing the department, the items asked for it before show to pick with one press. The list refreshes by itself and keeps the quantities typed.'],
      admin: 'In the items screen, "Import Arabic names" (a CSV file with item_id and name_ar), and an "Arabic name" field in the item window.',
    },
  },
  {
    v: '0.9.79', date: '2026-11-01',
    ar: { news: ['طلبات الأقسام: الشاشة تتحدّث كل 15 ثانية وهي مفتوحة، فيظهر الطلب الجديد في المخزن أسرع.', 'زر "إلغاء الطلب" لمن طلب فقط، ويسأل للتأكيد ثم يلغي مباشرة.'] },
    en: { news: ['Department requests: the screen refreshes every 15 seconds while open, so a new request shows in the store sooner.', '"Cancel request" is for the requester only; it asks to confirm, then cancels at once.'] },
  },
  {
    v: '0.9.78', date: '2026-11-01',
    ar: { news: ['طلبات الأقسام: أمين المخزن يصرف ما يستطيع وتنتهي العملية عنده. إن سمح المخزون بالباقي، يظهر لمن طلب خانة "للصرف الآن" وزر "طلب الباقي"؛ وإن لم يطلبه فهو مكتفٍ بما سُلّم. ولا يرى أمين المخزن إلا طلبات وسطور مخازنه.',
      'رقم على أيقونة "طلبات الأقسام" بعدد الطلبات التي تنتظرك، وسطر "طلبات بانتظار التنفيذ" في الشاشة الرئيسية.'] },
    en: { news: ['Department requests: the storekeeper gives what they can and is done. When the stock allows the rest, the requester sees "To issue now" and "Ask for the rest"; not asking keeps what was given. A storekeeper sees only the requests and lines of their stores.',
      'A number on the "Department requests" icon with the requests waiting for you, and a "Requests waiting" line on the home screen.'] },
  },
  {
    v: '0.9.76', date: '2026-11-01',
    ar: { news: ['طلبات الأقسام: بعد الضغط على "صرف الطلب" يتعطل الزر وتظهر "قيد الإرسال…" حتى يرد الخادم، فلا يُصرف الطلب مرتين.'] },
    en: { news: ['Department requests: after "Issue request" the button stays off and shows "Sending…" until the server answers, so a request is not issued twice.'] },
  },
  {
    v: '0.9.75', date: '2026-11-01',
    ar: { news: ['اسم المستخدم الداخل يظهر أعلى كل شاشة.'] },
    en: { news: ['The name of the signed-in user shows at the top of every screen.'] },
  },
  {
    v: '0.9.74', date: '2026-11-01',
    ar: { news: ['نسخة التطوير (DIV) فقط: الدخول باسم المستخدم دون رمز، للتجربة. الإنتاج لم يتغيّر.'] },
    en: { news: ['The development copy (DIV) only: sign in with the username, no PIN, for testing. Production is unchanged.'] },
  },
  {
    v: '0.9.73', date: '2026-11-01',
    ar: {
      news: ['طلبات الأقسام: لا يُضاف سطر إلى الطلب إن كانت الكمية أكبر من المتوفر في المخزن، ويظهر المتاح.',
        'لوحة التحكم لها الآن خانة "دخول الشاشة" في شجرة الصلاحيات، فلا تظهر إلا لمن عُلّمت له.'],
      admin: 'كل من كان يرى لوحة التحكم ما زال يراها. لإخفائها عن مستخدم أزل علامة "لوحة التحكم ← دخول الشاشة" من صلاحياته.',
    },
    en: {
      news: ['Department requests: a line is not added when the quantity is more than the stock, and the available quantity shows.',
        'The dashboard now has an "Open the screen" tick in the permissions tree, and shows only to users who have it.'],
      admin: 'Everyone who saw the dashboard still sees it. To hide it from a user, untick "Dashboard → Open the screen".',
    },
  },
  {
    v: '0.9.72', date: '2026-11-01',
    ar: { news: ['على الهاتف: خانة البحث في شاشة المواد والموردين تأخذ صفًا كاملًا، والفلتر والزر تحتها.'] },
    en: { news: ['On the phone: the search box in the items and suppliers screen takes a full row, with the filter and the button below it.'] },
  },
  {
    v: '0.9.71', date: '2026-10-31',
    ar: { news: ['صلاحية المخزون تُحسب الآن من آخر الاستلامات: الرصيد الموجود يُغطّى من أحدث استلام رجوعًا حتى تكتمل الكمية، ولكل جزء صلاحية استلامه. مثلًا 17 كيس سكر من آخر استلامات صلاحيتها 31-Mar-28 تظهر كلها بهذا التاريخ. المرتجعات من الأقسام لا تُحسب دفعة جديدة. ويتبع تقرير "تتبّع المواد ودفعاتها" القاعدة نفسها: الصرف يأخذ من الأقدم استلامًا.'] },
    en: { news: ['The expiry of the stock now comes from the latest receipts: the balance is covered from the newest receipt back until the quantity is complete, each part with the expiry of its receipt. For example 17 bags of sugar from receipts expiring 31-Mar-28 all show that date. Returns from departments are not a new batch. The traceability report follows the same rule: issues take from the oldest received.'] },
  },
  {
    v: '0.9.70', date: '2026-10-31',
    ar: {
      news: ['تبويبة جديدة "التحليل البياني" في شاشة التقارير: المشتريات شهريًا، وأكبر الموردين، وقيمة المخزون، وتطوّر سعر مادة، والصرف للأقسام، وأكثر المواد صرفًا، والصلاحية، والإتلاف وفروق الجرد، والمواد تحت الحد الأدنى، وأكياس القهوة، وطلبات المحلات. المبالغ تظهر فقط لمن يرى الأسعار.',
        'ثلاثة تقارير جديدة: "المواد الراكدة"، و"أيام التغطية واقتراح الطلب"، و"الإتلاف وفروق الجرد".'],
      admin: 'تعلّم "التحليل البياني" في التقارير لمن تريد أن يراه (المدير يراه تلقائيًا). ومن له صلاحيات مخصصة تعلّم له التقارير الثلاثة الجديدة.',
    },
    en: {
      news: ['A new "Charts" tab in the reports screen: purchases per month, top suppliers, stock value, price of an item, issues to departments, most issued items, expiry, disposals and count differences, items below minimum, coffee bags and shop orders. Amounts show only to users who see prices.',
        'Three new reports: "Slow-moving stock", "Days of cover and suggested order" and "Disposals and count differences".'],
      admin: 'Tick "Charts" under reports for whoever should see it (the admin has it already). Users with custom permissions need the three new reports ticked.',
    },
  },
  {
    v: '0.9.69', date: '2026-10-31',
    ar: { news: ['في أوامر الشراء والمشتريات النقدية: الأمر أو الورقة المفتوحة (جديدة أو للعرض) تظهر أعلى الشاشة، والجدول تحتها.'] },
    en: { news: ['In purchase orders and cash purchases: the open LPO or sheet (new or viewed) shows at the top, with the list below it.'] },
  },
  {
    v: '0.9.68', date: '2026-10-30',
    ar: { news: ['حاسبة أكياس القهوة: الكميات تظهر برقم عشري واحد (مثل 25.5 كغ). وزر جديد "حفظ كقيم افتراضية" يجعل القيم المكتوبة في الحاسبة هي القيم الافتراضية في كل الأجهزة، و"استرجاع القيم الافتراضية" يعيدها.'] },
    en: { news: ['Coffee bag calculator: quantities show one decimal (like 25.5 kg). A new "Save as defaults" button makes the values in the calculator the defaults on every device, and "Back to the defaults" brings them back.'] },
  },
  {
    v: '0.9.67', date: '2026-10-30',
    ar: { news: ['يستطيع المدير أن يحدّد لكل مستخدم ما يُسمح له في كل مخزن على حدة: الاستلام، والصرف، وطلبات الأقسام، وطلبات المحلات، والجرد، ووحدات المواد. مثلًا: استلام وصرف في المواد الجافة، وصرف فقط في التغليف.'],
      admin: 'في شاشة المستخدمين، تحت المخازن، جدول "العمليات المسموحة في كل مخزن". المستخدمون الحاليون كل العمليات مسموحة لهم كما كانت.' },
    en: { news: ['The admin can set, for each user, what they may do in each store separately: receiving, issuing, department requests, shop orders, counts and item units. For example: receive and issue in Dry foods, issue only in Packaging.'],
      admin: 'In the users screen, under the stores, a table "Operations allowed in each store". Existing users keep every operation as before.' },
  },
  {
    v: '0.9.66', date: '2026-10-30',
    ar: { news: ['في شاشة الاستلام، جدول "سجلات الاستلام" فيه عمود جديد لتاريخ الصلاحية بعد الكمية.'] },
    en: { news: ['In the goods receiving screen, the "Receiving records" table has a new expiry date column after the quantity.'] },
  },
  {
    v: '0.9.65', date: '2026-10-28',
    ar: { news: ['بعد 5 دقائق دون أي حركة (يغيّرها المدير من شاشة المستخدمين ← إعدادات عامة) تعود الشاشة إلى الرئيسية، وتبقى الشاشة التي كنت فيها خلفها بكل ما كتبته. زرها يظهر بحلقة برتقالية وكلمة "متابعة" ويعيدها كما تركتها. وإن اخترت شاشة أخرى وفيها بيانات لم تُحفظ، يسألك التطبيق أولًا.'] },
    en: { news: ['After 5 minutes without any activity (the admin can change it in the users screen, General settings) the app goes back to the home screen, keeping the screen you were on behind it with everything you typed. Its button shows an orange ring and "Continue" and brings it back as you left it. If you choose another screen while it has unsaved data, the app asks first.'] },
  },
  {
    v: '0.9.64', date: '2026-10-28',
    ar: { news: ['القائمة الجانبية بلا لون داكن: الشاشات أزرار بيضوية مرتبة عموديًا، بأسلوب الشاشة الرئيسية.'] },
    en: { news: ['The side menu is no longer dark: the screens are pill-shaped buttons in a column, in the style of the home screen.'] },
  },
  {
    v: '0.9.63', date: '2026-10-28',
    ar: {
      news: ['تقرير جديد "تتبّع المواد ودفعاتها" للتحقيق الصحي: لكل مادة صُرفت لقسم في فترة: الكمية وتاريخ الصرف، وتاريخ صلاحية الدفعة التي خرجت منها، والمورد ورقم فاتورة استلامها. الدفعة تُستنتج بقاعدة "الأقرب انتهاءً يُصرف أولًا".'],
      admin: 'من له صلاحيات مخصصة تعلّم له "تتبّع المواد ودفعاتها" في التقارير.',
    },
    en: {
      news: ['A new "Traceability: materials and their batches" report for health inquiries: for every material issued to a department in a period, the quantity and date, the expiry of the batch it came from, and that batch\u2019s supplier and invoice number. The batch is worked out by "first to expire, first out".'],
      admin: 'Users with custom permissions need "Traceability of materials and batches" ticked under reports.',
    },
  },
  {
    v: '0.9.62', date: '2026-10-27',
    ar: {
      news: [
        'شاشة جديدة "طلبيات المحلات": طلبيات المواد الأولية التي يرسلها كاشير المحل من مسار تصل هنا، ويُحجز رصيدها فورًا. يجهّز أمين كل مخزن أسطره (كاملة أو جزئية أو "لا يمكن توفيره" مع السبب) ثم يسلّمها للتوزيع، فيُسجَّل الصرف للمحل.',
        'المحلات جهات جديدة بجانب الموردين والأقسام، والإتلاف حركة جديدة في شاشة الصرف بسبب إلزامي.',
        'النقص والأصناف خارج القائمة (شراء خاص) تظهر لمسؤول المشتريات ليقرر فيها.',
      ],
      todo: 'أمين المخزن: تابع شاشة "طلبيات المحلات" وجهّز أسطر مخزنك ثم سلّمها للتوزيع.',
      admin: 'من له صلاحيات مخصصة تعلّم له صلاحيات "طلبيات المحلات" (لأمناء المخازن) و"الشراء الخاص" (لمسؤول المشتريات).',
    },
    en: {
      news: [
        'A new "Shop orders" screen: raw-material orders sent by shop cashiers from Masar arrive here and their stock is reserved at once. Each storekeeper prepares the lines of their store (in full, in part, or "cannot supply" with a reason) and hands them to distribution, which records the issue to the shop.',
        'Shops are a new kind of party beside suppliers and sections, and disposal is a new movement in the issue screen with a required reason.',
        'Shortages and items outside the list (special purchases) go to the purchasing officer to decide.',
      ],
      todo: 'Storekeeper: follow the "Shop orders" screen, prepare the lines of your store and hand them to distribution.',
      admin: 'Users with custom permissions need "Shop orders" (storekeepers) and "Special purchases" (purchasing) ticked.',
    },
  },
  {
    v: '0.8.40', date: '2026-10-27',
    ar: { news: ['في الشاشة الرئيسية خلف القرص الدوار ثلاثة عقارب (الساعة والدقيقة والثانية) تعرض وقت جهازك.'] },
    en: { news: ['On the home screen, three hands (hour, minute and second) behind the turning disc show your device\u2019s time.'] },
  },
  {
    v: '0.8.39', date: '2026-10-27',
    ar: {
      news: [
        'تبويب "أكياس القهوة" فيه الآن ثلاثة أقسام: الحاسبة، وتجهيز الأكياس، والمخزون والسجل.',
        'تجهيز الأكياس: يُدخل أمين المخزن القهوة الخضراء المأخوذة ووزنها بعد التحميص وعدد الأكياس المعبأة؛ تنقص القهوة الخضراء وكيس فارغ (Coffee Pouch) لكل كيس معبأ من المخزون، ويزيد صنف COFFEE BAG 200G، ويُحسب الهدر الفعلي مقابل نسب الحاسبة.',
        'تسليم الأكياس للزبون من شاشة "صرف للأقسام" كأي صنف، وتظهر التسليمات في سجل القهوة.',
      ],
      todo: 'أمين المخزن: سجّل كل دفعة أكياس من "تجهيز الأكياس" بالكميات الحقيقية.',
      admin: 'أضف "مؤسسة الجيش" مرة واحدة في شاشة المواد والموردين كجهة صرف. من له صلاحيات مخصصة تعلّم له "تجهيز أكياس القهوة".',
    },
    en: {
      news: [
        'The "Coffee bags" tab now has three parts: the calculator, preparing bags, and stock & history.',
        'Preparing bags: the storekeeper enters the green coffee taken, its weight after roasting and the bags filled; the green coffee and one empty pouch (Coffee Pouch) per bag leave the stock, COFFEE BAG 200G is added, and the real loss is set against the calculator.',
        'Bags go to the customer from the "Department issues" screen like any item, and appear in the coffee history.',
      ],
      todo: 'Storekeeper: record every batch of bags from "Prepare bags" with the real quantities.',
      admin: 'Add the army customer once in the materials and suppliers screen as an issue destination. Users with custom permissions need "Prepare coffee bags" ticked.',
    },
  },
  {
    v: '0.8.38', date: '2026-10-27',
    ar: { news: ['على الهاتف تظهر الشاشة الرئيسية دون الشريط السفلي، وأزرار حسابك (ما الجديد، تغيير الرمز، اللغة، الخروج) أسفل الشاشات. يعود الشريط في باقي الشاشات.'] },
    en: { news: ['On the phone the home screen shows without the bottom bar, with your account buttons (What\u2019s new, change PIN, language, sign out) under the screens. The bar is back on every other screen.'] },
  },
  {
    v: '0.8.37', date: '2026-10-27',
    ar: {
      news: [
        'في الشاشة الرئيسية على الحاسوب اختفى الشريط الجانبي، وصارت الشاشات أزرارًا دائرية موزعة بالتساوي على دائرة حول القرص. يعود الشريط الجانبي في باقي الشاشات.',
        'أزرار حسابك (ما الجديد، الإشعارات، تغيير الرمز، اللغة، الخروج) موزعة على جانبي الدائرة في الشاشة الرئيسية.',
      ],
    },
    en: {
      news: [
        'On a computer the home screen no longer shows the side menu, and the screens are round buttons spread evenly on a circle around the disc. The side menu is back on every other screen.',
        'Your account buttons (what\'s new, notifications, change PIN, language, sign out) are on both sides of the circle on the home screen.',
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
