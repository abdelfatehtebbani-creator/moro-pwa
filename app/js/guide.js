// The user guide inside the app (docs: the review copy published with the guide). One chapter per role, plus the basics;
// a chapter names the screens it explains, so the "?" of a screen opens the right one. English is written chapter by
// chapter; a chapter not translated yet shows in Arabic with a note.
export const GUIDE = [
{
"key": "basics",
"roles": [
"all"
],
"screens": [],
"ar": "<h2>أساسيات يحتاجها الجميع</h2>\n<h3>الدخول والحساب</h3>\n<ul>\n  <li>تدخل باسم المستخدم والرمز (PIN) الذي يعطيك إياه المدير. تغيّره من <span class=\"k\">تغيير الرمز</span> أسفل القائمة.</li>\n  <li>اسمك يظهر أعلى كل شاشة، وبجانبه حالة الاتصال ووقت آخر تحديث. اللغة (عربي / English) تتغيّر بزر واحد.</li>\n  <li>نسيت الرمز؟ المدير يعيد ضبطه من شيت MORO Data ← قائمة MORO ← Reset a user PIN.</li>\n</ul>\n<h3>الشاشة الرئيسية والقائمة</h3>\n<ul>\n  <li>الرئيسية تعرض أزرار شاشاتك فقط، حسب صلاحياتك. على الهاتف تختفي القائمة السفلية في الرئيسية وتعود في باقي الشاشات.</li>\n  <li><b>الأرقام على الأزرار</b> تعني عملًا ينتظرك: طلبيات للاعتماد، رحلات، فواتير، طلبات أقسام، إنتاج مطلوب… وتصلك بها إشعارات على الهاتف إن فعّلتها.</li>\n  <li>بعد 5 دقائق دون حركة تعود الشاشة إلى الرئيسية، وتبقى الشاشة التي كنت فيها خلفها بكل ما كتبته: زرها بحلقة برتقالية وكلمة «متابعة» يعيدها كما تركتها.</li>\n  <li><span class=\"k\">ما الجديد</span> يعرض ما تغيّر في كل نسخة، ويظهر وحده مرة بعد كل تحديث.</li>\n</ul>\n<h3>العمل دون إنترنت والإرسال في الخلفية</h3>\n<ul>\n  <li>أغلب عمليات الحفظ فورية: تُحفظ على جهازك أولًا ثم تُرسل إلى الخادم في الخلفية. أعلى الشاشة يظهر «1 بانتظار الإرسال» حتى تصل.</li>\n  <li>إن انقطع الاتصال، تنتظر العمليات وتُرسل وحدها عند عودته. لا تُعِد إدخال العملية نفسها مرة ثانية.</li>\n  <li>إن رفض الخادم عملية (رصيد غير كافٍ، صلاحية…)، تظهر رسالة حمراء بالسبب، وتحتاج إعادة إدخالها بعد التصحيح.</li>\n</ul>\n<div class=\"tip\">إذا لم تظهر شاشة جديدة أو تغيير أُعلن عنه، أغلق التطبيق وافتحه مرة أو مرتين حتى يأخذ النسخة الجديدة.</div>\n<h3>المخازن الخمسة</h3>\n<div class=\"tbl\"><table>\n  <tr><th>المخزن</th><th>ما فيه</th><th>ملاحظة</th></tr>\n  <tr><td>المواد المبرَّدة CHILLED</td><td>الخضار والألبان والمجمّدات</td><td>بصلاحية</td></tr>\n  <tr><td>المواد الجافة DRY</td><td>الطحين والسكر والمكسرات الخام…</td><td>بصلاحية</td></tr>\n  <tr><td>التغليف PACK</td><td>العلب والأكواب والأكياس</td><td>دون صلاحية</td></tr>\n  <tr><td>مواد التنظيف CLEAN</td><td>المنظفات</td><td>دون صلاحية</td></tr>\n  <tr><td>المنتجات النهائية FINAL</td><td>ما تنتجه الأقسام وتطلبه المحلات</td><td>بسعر ثابت يحدده المدير</td></tr>\n</table></div>\n<h3>الوحدات</h3>\n<ul>\n  <li>لكل مادة <b>وحدة أساس</b> هي أصغر وحداتها (مثلًا PC)، ووحدة كبرى اختيارية (مثلًا 1 BOX = 12 PC).</li>\n  <li>المشتريات تستلم وترى التقارير بوحدة الشراء، وأمين المخزن يصرف ويرى لوحة التحكم بوحدة المخزن. تغيير وحدة العرض لا يغيّر أي رقم محفوظ.</li>\n</ul>\n<h3>الصلاحية (تاريخ الانتهاء)</h3>\n<p>الرصيد يُغطّى من أحدث استلام رجوعًا، ولكل جزء صلاحية استلامه، والصرف يأخذ من الأقدم أولًا. بطاقة الصلاحية في لوحة التحكم تحمرّ وتنبض إذا انتهت صلاحية شيء.</p>",
"en": "<h2>Basics for everyone</h2>\n<h3>Signing in and your account</h3>\n<ul>\n  <li>Sign in with your user name and the PIN the admin gives you. Change it from <span class=\"k\">Change PIN</span> at the bottom of the menu.</li>\n  <li>Your name shows at the top of every screen, with the connection status and the time of the last update. The language (Arabic / English) changes with one button.</li>\n</ul>\n<h3>Home and the menu</h3>\n<ul>\n  <li>Home shows only the screens you may open. On the phone the bottom bar is hidden on Home and comes back on the other screens.</li>\n  <li><b>A number on a button</b> means work is waiting for you: orders to approve, trips, invoices, department requests, production needed… Phone notifications say the same when they are turned on.</li>\n  <li>After 5 minutes without activity the app goes back to Home; the screen you were on stays behind it with everything you typed. Its button has an orange ring and the word \"Continue\".</li>\n  <li><span class=\"k\">What's new</span> shows what changed in each version, once, after each update.</li>\n</ul>\n<h3>Working without internet</h3>\n<ul>\n  <li>Most saves are instant: they are kept on your device first and sent to the server in the background. \"1 waiting to send\" shows at the top until it arrives.</li>\n  <li>If the connection drops, they wait and go by themselves when it is back. Do not enter the same thing twice.</li>\n  <li>If the server refuses something (stock too low, no permission…), a red message gives the reason; enter it again after correcting it.</li>\n</ul>\n<div class=\"tip\">A new screen or a change announced does not show? Close the app and open it once or twice so it takes the new version.</div>\n<h3>The five stores</h3>\n<ul>\n  <li><b>Chilled</b> (vegetables, dairy, frozen) and <b>Dry</b> (flour, sugar, raw nuts): with expiry dates.</li>\n  <li><b>Packaging</b> and <b>Cleaning</b>: no expiry.</li>\n  <li><b>Final products</b>: what the departments make and the shops order, at a fixed price set by the admin.</li>\n</ul>\n<h3>Units</h3>\n<p>Every item has a base unit (its smallest, e.g. PC) and may have one larger unit (e.g. 1 BOX = 12 PC). Changing which unit is shown never changes a saved number.</p>"
},
{
"key": "cycle",
"roles": [
"all"
],
"screens": [],
"ar": "<h2>دورة طلبية المحل من البداية إلى النهاية</h2>\n<div class=\"flow\"><span>الكاشير يرسل</span><i>←</i><span>م.التوزيع يعتمد</span><i>←</i><span>الأقسام والمخازن تجهّز</span><i>←</i><span>م.التوزيع ينشئ رحلة</span><i>←</i><span>السائق يحمّل ويوصل</span><i>←</i><span>الكاشير يستلم</span><i>←</i><span>م.التوزيع يُصدر الفاتورة</span></div>\n<ul>\n  <li><b>أصناف سلوى</b> تنفصل عند الإرسال في طلبية مرتبطة رقمها يبدأ بـ <span class=\"k\">S-</span>، معتمدة فورًا، تجهّزها سلوى وتسلّمها للسائق مباشرة دون م.التوزيع.</li>\n  <li><b>الطلبية الخاصة</b> (لزبون بموعد): يوجّهها مدير الإنتاج إلى القسم أو إلى المشتريات، ويسلّمها السائق للزبون أو للمحل.</li>\n  <li>كل خطوة يصل إشعارها لمن عليه التصرف التالي، والمتابعة عند م.التوزيع تُظهر كل طلبية ومدة مرحلتها ولون التأخر.</li>\n</ul>",
"en": "<h2>A shop order from start to end</h2>\n<div class=\"flow\"><span>The cashier sends</span><i>→</i><span>Distribution approves</span><i>→</i><span>Departments and stores prepare</span><i>→</i><span>Distribution makes a trip</span><i>→</i><span>The driver loads and delivers</span><i>→</i><span>The cashier receives</span><i>→</i><span>Distribution issues the invoice</span></div>\n<ul>\n  <li><b>Salwa products</b> leave the order when it is sent, in a linked order numbered <span class=\"k\">S-…</span>, approved at once; Salwa prepares it and gives it to the driver itself.</li>\n  <li><b>A special order</b> (for a customer, with a time): the production manager sends it to a department or to purchasing.</li>\n  <li>Each step tells whoever acts next; Distribution's Follow-up shows every order, how long it has been in its stage and a colour when late.</li>\n</ul>"
},
{
"key": "cashier",
"roles": [
"cashier"
],
"screens": [
"orders",
"returns"
],
"ar": "<h2>الكاشير</h2>\n<div class=\"screens\"><span>طلبيتي</span><span>المرتجعات</span><span>تجهيز الطلبيات (كاشير سلوى فقط)</span></div>\n<h3>بداية اليوم: النوبة</h3>\n<ol>\n  <li>افتح <span class=\"k\">طلبيتي</span> واختر المحل الذي تعمل فيه، ثم <span class=\"btnname\">بدء النوبة</span>. لا يأخذ كاشير آخر المحل حتى تُنهي نوبتك.</li>\n  <li>إن وجدت المحل مفتوحًا باسم زميل نسي إنهاء نوبته، يسألك التطبيق: <b>استلام المحل</b> يُغلق نوبته دون مبلغ، ويكمله المحاسب.</li>\n</ol>\n<h3>كتابة الطلبية وإرسالها</h3>\n<ol>\n  <li>اختر المادة بتبويبات المخازن والأقسام أو بالبحث، واكتب الكمية، ثم <span class=\"btnname\">إضافة إلى الإذن</span>.</li>\n  <li>احفظها مسودة أو أرسلها. نافذة الإرسال تعرض الأسطر مجمّعة حسب القسم والمخزن لتراجعها قبل التأكيد. الطلبية تُرسل لليوم الموالي.</li>\n  <li>إن بقيت مادة أو كمية مكتوبة لم تُضف، لا يُحفظ شيء ويومض زر «إضافة إلى الإذن».</li>\n</ol>\n<div class=\"tip\">الطلبية فيها أصناف سلوى؟ ستظهر لك طلبيتان: الأصلية، وأخرى برقم يبدأ بـ S- تصلك من سلوى مباشرة.</div>\n<h3>الطلبية الخاصة (لزبون)</h3>\n<p>اختر «طلبية خاصة»: اسم الزبون وهاتفه، وتاريخ ووقت ومكان التسليم (المحل أو عند الزبون مع العنوان)، ووصف المنتج بسعره المتفق عليه مع حتى 3 صور. السعر تقديري حتى يقرره المسؤول.</p>\n<h3>الاستلام</h3>\n<ol>\n  <li>عند وصول الطلبية يظهر رقم على تبويب <span class=\"k\">وصلت</span>.</li>\n  <li>اكتب المستلَم فعلًا لكل سطر. إن نقص شيء، اختر السبب وملاحظة. النقص يذهب إلى م.التوزيع ليقرر.</li>\n</ol>\n<h3>المرتجعات</h3>\n<p>من شاشة <span class=\"k\">المرتجعات</span> ترجع بضاعة من المحل بسببها (تالف، منتهي…). تدخل الحجر، ويقرر مدير الإنتاج مصيرها.</p>\n<h3>نهاية اليوم</h3>\n<ol>\n  <li><span class=\"btnname\">إنهاء النوبة</span> واكتب المبلغ المحصّل وملاحظة إن لزم.</li>\n  <li>إن ضغطت «تسجيل الخروج» ونوبتك مفتوحة، يطلب منك التطبيق إنهاءها بالمبلغ أولًا.</li>\n</ol>\n<h3>كاشير سلوى فقط</h3>\n<p>ما دامت نوبتك في محل سلوى، تظهر لك <span class=\"k\">تجهيز الطلبيات</span> وفيها طلبيات S- وحدها: اكتب الكميات، ثم <span class=\"btnname\">تسليم للسائق</span> واختر السائق الموجود. تُنشأ الرحلة محمَّلة فورًا.</p>\n<div class=\"warn\">لا يمكن تعديل طلبية بعد إرسالها. للتغيير، اطلب من م.التوزيع رفضها ثم أرسل طلبية جديدة.</div>",
"en": ""
},
{
"key": "distribution",
"roles": [
"distribution"
],
"screens": [
"orderapprove",
"trips",
"invoices",
"shoporders"
],
"ar": "<h2>مسؤول التوزيع</h2>\n<div class=\"screens\"><span>اعتماد الطلبيات</span><span>تجهيز الطلبيات (عرض)</span><span>الرحلات</span><span>الفواتير</span><span>التقارير</span></div>\n<h3>اعتماد الطلبيات</h3>\n<ul>\n  <li>التبويبات بأرقامها: <b>بانتظار الاعتماد</b>، <b>قيد التجهيز</b>، <b>جاهزة للتوزيع</b>، <b>فروق الاستلام</b>، <b>مرفوضة</b>، <b>المتابعة</b>.</li>\n  <li>تعتمد الطلبية كما هي أو بتعديل الكميات (0 يحذف السطر)، أو ترفضها بسبب يراه الكاشير.</li>\n  <li>طلبية ناقصة التجهيز: <span class=\"btnname\">اعتماد ما سُلّم وإغلاق الباقي</span> ينقلها بما سُلّم إلى الرحلات.</li>\n  <li>ملاحظة مدير الفرع تظهر باللون البرتقالي على الطلبية وفي المتابعة.</li>\n</ul>\n<h3>المتابعة</h3>\n<p>كل طلبية من إرسالها حتى فوترتها: مرحلتها، ومدة بقائها فيها، ولون التأخر عن الوقت المعتاد. الأوقات المعتادة لكل مرحلة تُضبط أسفل التبويب. طلبيات سلوى (S-) تظهر هنا للعلم فقط.</p>\n<h3>الرحلات</h3>\n<ol>\n  <li><span class=\"btnname\">رحلة جديدة</span>: اختر السائق والطلبيات الجاهزة بترتيب التوقف. الطلبية الخاصة بإطار ملوّن وموعدها.</li>\n  <li>تُلغى الرحلة ما دام لم يُحمَّل منها شيء، فتعود طلبياتها جاهزة.</li>\n  <li>السطور التي تُصنع في سلوى تظهر للسائق تحت «يُستلم من سلوى».</li>\n</ol>\n<h3>فروق الاستلام</h3>\n<p>طلبية استُلمت ناقصة لا تُفوتر حتى تختار لكل سطر مصيره: <b>رجع إلى المخزن</b> (يمر بالحجر)، أو <b>تالف</b>، أو <b>مفقود</b>.</p>\n<h3>الفواتير</h3>\n<p>لكل طلبية مستلَمة فاتورة بقسمين: المنتجات النهائية بسعرها الثابت، ومواد المخزن بآخر سعر شراء. السعر يُجمَّد لحظة الإصدار، وتُطبع بتصميم ورقة الشركة.</p>\n<div class=\"tip\">«لم تُرسل (مرتجع)» في تجهيز الطلبيات متاح فقط ما دامت البضاعة عندك ولم تُحمَّل.</div>",
"en": ""
},
{
"key": "section_head production",
"roles": [
"section_head",
"production"
],
"screens": [
"production",
"shoporders",
"requests",
"returns",
"orderapprove"
],
"ar": "<h2>رئيس القسم ومدير الإنتاج</h2>\n<div class=\"screens\"><span>الإنتاج</span><span>تجهيز الطلبيات</span><span>طلبات الأقسام</span><span>المرتجعات (مدير الإنتاج)</span><span>اعتماد الطلبيات الخاصة (مدير الإنتاج)</span></div>\n<h3>الإنتاج</h3>\n<ol>\n  <li>في خانة <b>المنتج</b> تظهر أولًا المنتجات التي تنتظرها طلبيات المحلات، مع الكمية الناقصة. اختيار أحدها يملأ الكمية.</li>\n  <li>للمنتج بوصفة يُعرض ما سيُخصم من المواد وهل يكفي الرصيد. المنتج دون وصفة (أو بوصفة «للتكلفة فقط») يزيد رصيده دون خصم.</li>\n  <li><span class=\"btnname\">تأكيد الإنتاج</span>: تفرغ الخانتان، ويظهر إشعار في الأسفل.</li>\n</ol>\n<h3>تجهيز الطلبيات</h3>\n<ul>\n  <li>ترى سطور قسمك فقط. اكتب الكمية لكل سطر ثم <span class=\"btnname\">تسليم للتوزيع</span>.</li>\n  <li>لا يُسلَّم منتج قسم قبل إنتاجه: الرصيد يجب أن يكفي. الرقم على «الإنتاج» يعني أن الطلبيات تنتظر إنتاجًا، وبعده ينتقل الرقم إلى «تجهيز الطلبيات».</li>\n  <li><span class=\"btnname\">لا يمكن توفيره</span> بسبب، لما لن يُصنع.</li>\n</ul>\n<h3>مدير الإنتاج وحده</h3>\n<ul>\n  <li><b>كل الأقسام</b>: يرى ويسجّل نيابة عن أي قسم.</li>\n  <li><b>الطلبيات الخاصة</b>: يوجّه كل منتج إلى قسمه أو إلى المشتريات.</li>\n  <li><b>المرتجعات في الحجر</b>: يقرر لكل صنف: يعود للمخزن، أو تالف، أو منتهي الصلاحية.</li>\n</ul>\n<h3>طلبات الأقسام من المخازن</h3>\n<p>يطلب القسم مواده من المخزن. أمين المخزن يصرف ما يستطيع، وإن سمح الرصيد بالباقي يظهر لك زر <span class=\"btnname\">طلب الباقي</span> في أرشيف «جزئي». <span class=\"btnname\">إلغاء الطلب</span> لمن طلب فقط.</p>",
"en": "<h2>Department head and production manager</h2>\n<div class=\"screens\"><span>Production</span><span>Prepare orders</span><span>Department requests</span><span>Returns (production manager)</span><span>Approve special orders (production manager)</span></div>\n<h3>Production</h3>\n<ol>\n  <li>The <b>Product</b> list shows first the products the shop orders are waiting for, with the quantity missing. Picking one fills the quantity.</li>\n  <li>A product with a recipe shows what will be taken from the materials and whether there is enough. A product without one (or with a \"cost only\" recipe) only adds to its stock.</li>\n  <li><span class=\"btnname\">Confirm production</span>: the form empties and a message shows at the bottom.</li>\n</ol>\n<h3>Prepare orders</h3>\n<ul>\n  <li>You see your department's lines only. Write the quantity for each line, then <span class=\"btnname\">Hand to distribution</span>.</li>\n  <li>A department's product is handed only after it is made: the stock must be enough. A number on \"Production\" means orders wait for production; after it, the number moves to \"Prepare orders\".</li>\n  <li><span class=\"btnname\">Cannot supply</span>, with a reason, for what will not be made.</li>\n</ul>\n<h3>The production manager only</h3>\n<ul>\n  <li><b>Every department</b>: sees and records for any of them.</li>\n  <li><b>Special orders</b>: sends each product to its department or to purchasing.</li>\n  <li><b>Returns in quarantine</b>: decides each item: back to the store, damaged or expired. What is fit waits for the storekeeper to confirm it came in.</li>\n</ul>"
},
{
"key": "storekeeper",
"roles": [
"storekeeper"
],
"screens": [
"receive",
"issue",
"requests",
"shoporders",
"counts",
"coffee",
"dashboard",
"returns"
],
"ar": "<h2>أمين المخزن</h2>\n<div class=\"screens\"><span>لوحة التحكم</span><span>استلام البضاعة</span><span>صرف للأقسام</span><span>طلبات الأقسام</span><span>تجهيز الطلبيات</span><span>الجرد</span><span>أكياس القهوة</span></div>\n<p>ترى وتعمل في مخازنك فقط، وقد يحدد المدير لكل مخزن ما يُسمح لك فيه (استلام، صرف، جرد…).</p>\n<h3>الاستلام</h3>\n<ol>\n  <li>اختر المورد والمادة، واكتب الكمية بأي وحدة معرّفة، والسعر، والخصم إن وُجد، ورقم الفاتورة، والمكان، والصلاحية.</li>\n  <li><b>أمر الشراء (اختياري)</b>: تظهر أولًا أوامر المورد التي فيها المادة، مع المطلوب والمتبقي، ولا تظهر الأوامر المستلمة بالكامل. ربط الاستلام بأمره يجعل مطابقة الحسابات دقيقة.</li>\n  <li>المنتج النهائي يأخذ سعره الثابت تلقائيًا.</li>\n</ol>\n<h3>الصرف</h3>\n<ul>\n  <li>إذن صرف واحد قد يجمع مواد من عدة مخازن ويأخذ رقمًا واحدًا.</li>\n  <li>يُصرف للأقسام والمحلات وللجهات «الخاصة» (المالك ومصانعه).</li>\n  <li><b>مرتجع من قسم</b> يعيد الكمية إلى الرصيد، و<b>إتلاف</b> يحتاج سببًا.</li>\n</ul>\n<h3>الجرد</h3>\n<ol>\n  <li><span class=\"btnname\">فتح جرد</span> لمخزن وتاريخ وفترة، ثم اكتب الكمية المعدودة (بأي وحدة) وصلاحية الرف.</li>\n  <li>السطر الفارغ لا يُصحَّح. المدير يعتمد، فتنشأ حركات تسوية بتاريخ الجرد.</li>\n</ol>\n<h3>أكياس القهوة</h3>\n<p>كل كيس يخصم القهوة الخضراء وعلبة الأكياس ويضيف «COFFEE BAG 200G». الحاسبة لها قيم افتراضية يحفظها المدير.</p>\n<div class=\"tip\">تعديل الحركة وحذفها: إدخالاتك فقط، وإدخالات غيرك بصلاحية خاصة. الفترة المقفلة من المحاسب لا تُعدَّل.</div>",
"en": ""
},
{
"key": "purchasing",
"roles": [
"purchasing"
],
"screens": [
"lpo",
"receive",
"shoporders",
"masters"
],
"ar": "<h2>المشتريات</h2>\n<div class=\"screens\"><span>أوامر الشراء LPO</span><span>المشتريات النقدية</span><span>استلام البضاعة</span><span>تجهيز الطلبيات (النقص والطلبات الخاصة)</span><span>المواد والموردون</span></div>\n<h3>أوامر الشراء</h3>\n<ol>\n  <li>رقم الأمر يُقترح تلقائيًا (من 320) ويمكن تغييره. اكتب المورد والأسطر بالأسعار، ثم أرسله للاعتماد.</li>\n  <li>المدير يعتمد أو يرفض بسبب. الأمر المعتمد يُطبع بتصميم ورقة الشركة ويظهر في الاستلام.</li>\n</ol>\n<h3>المشتريات النقدية</h3>\n<p>ورقة بما دُفع نقدًا، تُرسل للاعتماد، وقد يرفض المدير أسطرًا منها. رصيد الصندوق = ما سلّمه المحاسب ناقص الأوراق المرسلة والمعتمدة.</p>\n<h3>النقص والطلبات الخاصة</h3>\n<ul>\n  <li>تبويب <b>النقص</b> يجمع ما ينقص كل المخازن لتشتريه.</li>\n  <li>المنتج الخاص الموجَّه إليك: من المخزن، أو شراء بسعر نهائي تكتبه ثم تسلّمه للتوزيع أو للمحل مباشرة، أو غير متوفر بسبب.</li>\n</ul>",
"en": "<h2>Purchasing</h2>\n<div class=\"screens\"><span>LPO purchase orders</span><span>Cash purchases</span><span>Receiving</span><span>Prepare orders (shortages, special purchases)</span><span>Materials and suppliers</span></div>\n<h3>Purchase orders</h3>\n<ol>\n  <li>The number is proposed (from 320) and can be changed. Write the supplier and the lines with prices, then send it for approval.</li>\n  <li>The admin approves or refuses with a reason. An approved LPO prints on the company form and is offered when receiving.</li>\n</ol>\n<h3>Cash purchases</h3>\n<p>A sheet of what was paid in cash, sent for approval; the admin may refuse lines. The cash balance = what the accountant handed over minus the sheets sent and approved.</p>\n<h3>Shortages and special products</h3>\n<ul>\n  <li>The <b>Shortage</b> tab lists what every store is missing, to buy.</li>\n  <li>A special product sent to you: from the store, or bought at a final price you write and then hand to distribution or straight to the shop, or not available with a reason.</li>\n</ul>"
},
{
"key": "accountant",
"roles": [
"accountant"
],
"screens": [
"accounts",
"reports"
],
"ar": "<h2>المحاسب</h2>\n<div class=\"screens\"><span>الحسابات</span><span>أوامر الشراء (عرض)</span><span>التقارير</span></div>\n<h3>تبويبات الحسابات</h3>\n<ul>\n  <li><b>الأرصدة</b>: ما علينا لكل مورد، وما عند كل محل.</li>\n  <li><b>كشف حساب</b>: حركات مورد أو محل في فترة. كشف المحل: الفواتير عليه، واليومية المعتمدة له.</li>\n  <li><b>دفعة جديدة</b> للموردين، وتُلغى عند الخطأ.</li>\n  <li><b>مطابقة أوامر الشراء</b> بالاستلامات المربوطة بها.</li>\n  <li><b>مقبوضات النوبات</b>: تكتب ما استلمته من كل نوبة. الفرق يحتاج «الإجراء المتخذ»، وكذلك النوبة التي أُغلقت دون مبلغ.</li>\n  <li><b>يومية المبيعات</b>: لكل محل ويوم، النقد من النوبات، وتكتب البطاقة والتطبيقات، ثم ترسلها للاعتماد. ملاحظة مدير الفرع تظهر عليها باللون البرتقالي.</li>\n  <li><b>الرصيد الافتتاحي</b>: تبدأ الحسابات من تاريخ البداية بأصفار حتى تكتب ما علينا لكل مورد وما عند كل محل.</li>\n</ul>\n<h3>إقفال الفترة</h3>\n<p>من شاشة المستخدمين ← إعدادات عامة: لا تُحفظ ولا تُعدَّل ولا تُحذف أي حركة بتاريخ يسبق تاريخ الإقفال.</p>\n<h3>تقارير المحاسب</h3>\n<p>قيمة المخزون في تاريخ، والتكلفة والهامش، والخسائر، ومقبوضات المحلات، والمبيعات حسب القناة.</p>",
"en": "<h2>Accountant</h2>\n<div class=\"screens\"><span>Accounts</span><span>Purchase orders (view)</span><span>Reports</span></div>\n<h3>The Accounts tabs</h3>\n<ul>\n  <li><b>Balances</b>: what we owe each supplier, and what each shop holds.</li>\n  <li><b>Statement</b>: a supplier's or a shop's movements in a period. A shop's: the invoices on it and its approved daily sales.</li>\n  <li><b>New payment</b> to suppliers; void it if it was a mistake.</li>\n  <li><b>LPO matching</b> with the receipts that name the LPO.</li>\n  <li><b>Shift takings</b>: write what you received from each shift. A difference needs \"the action taken\"; so does a shift closed without its amount.</li>\n  <li><b>Daily sales</b>: per shop and day, the cash from the shifts; you type card and apps, then send it for approval. A branch manager's note shows on it in orange.</li>\n  <li><b>Opening balance</b>: accounts start at zero on the start date until you write what we owed each supplier and what each shop held.</li>\n</ul>\n<h3>Closing a period</h3>\n<p>In Users → General settings: no movement dated on or before the closing date can be saved, changed or deleted.</p>\n<h3>Your reports</h3>\n<p>Stock value on a date, cost and margin, losses, shop takings, sales by channel.</p>"
},
{
"key": "driver",
"roles": [
"driver"
],
"screens": [
"trips"
],
"ar": "<h2>السائق</h2>\n<div class=\"screens\"><span>الرحلات</span></div>\n<ol>\n  <li>رحلتك تصلك بإشعار. <span class=\"btnname\">عرض الحمولة</span> لكل محل، و<b>حمولة الرحلة كاملة</b> لتطابقها مع السيارة. ما يُستلم من سلوى يظهر في قسم وحده.</li>\n  <li><span class=\"btnname\">تم التحميل</span> لكل محل. لا تسليم قبل تحميل كل طلبيات الرحلة.</li>\n  <li><span class=\"btnname\">تم التسليم</span> عند كل محل. التسليم قبل محل يسبقه في الترتيب يطلب تأكيدًا.</li>\n  <li>الطلبية الخاصة: العنوان (مع رابط الخريطة) والهاتف ظاهران، والتسليم للزبون يُعدّ استلامًا.</li>\n  <li>في سلوى، يُنشئ المدير أو الكاشير رحلتك محمَّلة، فلا يبقى عليك إلا التسليم.</li>\n</ol>",
"en": "<h2>Driver</h2>\n<div class=\"screens\"><span>Trips</span></div>\n<ol>\n  <li>Your trip comes with a notification. <span class=\"btnname\">Show the load</span> for each shop, and <b>the whole trip's load</b>, to check against the car. What is picked up at Salwa is listed apart.</li>\n  <li><span class=\"btnname\">Loaded</span> for each shop. No delivery before every order of the trip is loaded.</li>\n  <li><span class=\"btnname\">Delivered</span> at each shop. Delivering a shop before one earlier in the order asks you to confirm.</li>\n  <li>A special order: the address (with a map link) and the phone are shown; handing it to the customer counts as received.</li>\n  <li>At Salwa, the manager or the cashier makes your trip already loaded: you only deliver.</li>\n</ol>"
},
{
"key": "branch_manager",
"roles": [
"branch_manager"
],
"screens": [
"branches",
"shoporders",
"production",
"returns"
],
"ar": "<h2>مدير الفروع</h2>\n<div class=\"screens\"><span>فروعي</span><span>تجهيز الطلبيات والإنتاج (مدير سلوى)</span></div>\n<ul>\n  <li>تبدأ بشاشة <span class=\"k\">فروعي</span>: الفترة (اليوم، 7 أيام، هذا الشهر)، وفرع واحد أو كل الفروع.</li>\n  <li><b>نظرة عامة</b>: لكل فرع مبيعاته، وفرق المقبوضات، والطلبيات المتأخرة، والنواقص، والمرتجعات، والنوبات المفتوحة. اضغط الفرع لترى طلبياته.</li>\n  <li><b>الطلبيات</b>: بحالتها وتأخرها. زر <span class=\"btnname\">ملاحظة</span> تظهر عند م.التوزيع والكاشير، ولا توقف الطلبية.</li>\n  <li><b>النوبات</b> و<b>المبيعات</b> (مع ملاحظة تظهر عند المحاسب) و<b>المرتجعات والنواقص</b>.</li>\n  <li>تصلك تنبيهات فروعك: نقص الاستلام، والمرتجعات، ونوبة أُغلقت دون مبلغ، وفرق المقبوضات. ورقم القائمة = الطلبيات المتأخرة.</li>\n</ul>\n<h3>مدير فرع سلوى</h3>\n<p>يستلم طلبيات S- في «تجهيز الطلبيات»، ويسجّل إنتاجها في «الإنتاج»، ثم <span class=\"btnname\">تسليم للسائق</span> مع اختيار السائق. ما يُرسل أقل من المطلوب يُغلق باقيه.</p>",
"en": ""
},
{
"key": "pdg",
"roles": [
"pdg"
],
"screens": [
"exec"
],
"ar": "<h2>المدير العام</h2>\n<div class=\"screens\"><span>لوحة المدير العام</span></div>\n<p>شاشة قراءة فقط بسبعة تبويبات: نظرة عامة، المبيعات، الربحية، المخزون، الخسائر، الموردون، الخدمة. لكل فترة مقارنة بالفترة التي قبلها، مع رسوم وطباعة.</p>",
"en": ""
},
{
"key": "admin",
"roles": [
"admin"
],
"screens": [
"home",
"users",
"masters",
"dashboard",
"reports"
],
"ar": "<h2>المدير (الأدمن)</h2>\n<div class=\"screens\"><span>كل الشاشات</span><span>المستخدمون</span><span>المواد والموردون</span></div>\n<h3>الرئيسية: قراراتك وعمل الفريق</h3>\n<p><b>قراراتك</b>: ما لا يقرره غيرك (أوامر الشراء، الصندوق، الجرد، الطلبيات الخاصة، اليوميات، فروق المقبوضات، منتجات تكلفتها أعلى من سعرها). <b>عمل الفريق</b>: أرقام ما ينتظر غيرك. والمفضلة بالنجمة حتى 6 شاشات.</p>\n<h3>المستخدمون والصلاحيات</h3>\n<ul>\n  <li>فلترة حسب الدور مع عدد كل دور، وبحث بالاسم.</li>\n  <li>الدور قالب صلاحيات، وتستطيع تغيير أي خانة في الشجرة: شاشة ← تبويب ← زر.</li>\n  <li>المخازن وما يُسمح في كل مخزن، ومحل الكاشير (اختياري: يختاره عند فتح النوبة)، وأقسام رئيس القسم، وفروع مدير الفروع.</li>\n  <li>الإعدادات العامة: دقائق العودة إلى الرئيسية، وقنوات المبيعات، وإقفال الفترة.</li>\n</ul>\n<h3>المواد والموردون</h3>\n<ul>\n  <li><b>المواد</b>: فلتر بالقسم أو بالمخزن، وعمود السعر، و<span class=\"btnname\">طباعة قائمة الأسعار</span> مع اختيار الأعمدة.</li>\n  <li><span class=\"btnname\">استيراد المنتجات</span> من ملف CSV (القسم، الاسم، الاسم العربي، الوحدة، السعر، وold_name لإعادة التسمية): معاينة قبل الحفظ، ولا تكرار.</li>\n  <li><b>الموردون والأقسام</b>: الأنواع مورد، قسم (منتج أو لا، ومكانه المصنع أو محل)، محل، خاص. القسم يتحوّل إلى محل أو خاص ويبقى رقمه.</li>\n  <li><b>الوصفات</b>: وصفة خصم، أو «للتكلفة فقط». التكلفة حسب الوصفة تظهر في نافذة المنتج تحت السعر مع زر «اعتمادها سعرًا».</li>\n</ul>\n<div class=\"warn\">الربط بين الوصفة والمنتج بالاسم: اختر الاسم من الاقتراحات في خانة المنتج.</div>",
"en": ""
},
{
"key": "reports",
"roles": [
"all"
],
"screens": [],
"ar": "<h2>التقارير</h2>\n<p>كل تقرير يُعرض ويُطبع ويُصدَّر إلى Excel ويُرسل بواتساب، بلغة الشاشة. يظهر لكل مستخدم ما فُتح له منها.</p>\n<div class=\"tbl\"><table>\n  <tr><th>المجموعة</th><th>التقارير</th></tr>\n  <tr><td>المخزون</td><td>سريعة الحركة، عند الحد الأدنى، الحساسة، المخزون مع الصلاحية، قرب الانتهاء، تغيرات المخزون، الراكدة، أيام التغطية واقتراح الطلب، قيمة المخزون في تاريخ</td></tr>\n  <tr><td>الاستهلاك</td><td>حسب القسم، حسب المادة، صرف مادة، استلام مادة، الاستهلاك الشهري، تتبّع المواد ودفعاتها، ملخص الإنتاج</td></tr>\n  <tr><td>الأسعار والمال</td><td>تقرير الأسعار، التكلفة والهامش، الإتلاف وفروق الجرد، مقبوضات المحلات، المبيعات حسب القناة</td></tr>\n  <tr><td>الطلبيات</td><td>توقيتات الطلبيات، فروق الاستلام، ما لم يمكن توفيره، مبيعات المحلات</td></tr>\n</table></div>",
"en": ""
},
{
"key": "terms",
"roles": [
"all"
],
"screens": [],
"ar": "<h2>مصطلحات</h2>\n<div class=\"tbl\"><table>\n  <tr><th>الكلمة</th><th>معناها في MORO</th></tr>\n  <tr><td>النوبة</td><td>فترة عمل الكاشير في محل، من البدء حتى الإنهاء بالمبلغ</td></tr>\n  <tr><td>الحجر</td><td>مكان المرتجع قبل قرار مدير الإنتاج، لا يُحسب في الرصيد</td></tr>\n  <tr><td>S-</td><td>طلبية أصناف سلوى المنفصلة، تُرسل من سلوى مباشرة</td></tr>\n  <tr><td>قسم منتج</td><td>قسم يصنع منتجات نهائية وتصله سطور الطلبيات</td></tr>\n  <tr><td>خاص</td><td>جهة تابعة للمالك يُصرف لها كالأقسام، خارج الطلبيات والحسابات</td></tr>\n  <tr><td>LPO</td><td>أمر شراء معتمد للمورد</td></tr>\n  <tr><td>يومية المبيعات</td><td>مبيعات المحل في يوم بكل قنواتها، يكتبها المحاسب ويعتمدها المدير</td></tr>\n</table></div>",
"en": ""
}
];
