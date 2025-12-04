import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Logo from "@/components/Logo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  const { lang } = useLanguage();

  const content = {
    ar: {
      title: "سياسة الخصوصية",
      backHome: "العودة للرئيسية",
      lastUpdated: "آخر تحديث: نوفمبر 2025",
      sections: [
        {
          title: "١. مقدمة",
          content: `مرحباً بك في Cycle Care (يشار إليه فيما يلي باسم "نحن" أو "التطبيق"). نحن ملتزمون بحماية خصوصيتك وبياناتك الشخصية. توضح سياسة الخصوصية هذه كيفية جمع معلوماتك الشخصية واستخدامها وحمايتها ومشاركتها عند استخدامك لخدمات صيانة وإصلاح الدراجات.`
        },
        {
          title: "٢. المعلومات التي نجمعها",
          content: `نقوم بجمع الأنواع التالية من المعلومات:

• معلومات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف
• معلومات الدراجة: الماركة، الموديل، السنة، المسافة المقطوعة
• معلومات الموقع: إحداثيات GPS لموقع الخدمة (عند طلب خدمة الصيانة)
• معلومات الحجز: تفاصيل طلبات الخدمة، الفني المختار، تاريخ ووقت الخدمة
• معلومات الدفع: طريقة الدفع المختارة (لا نخزن معلومات البطاقة الائتمانية)
• معلومات الجهاز: نوع الجهاز، نظام التشغيل، معرّف الجهاز الفريد`
        },
        {
          title: "٣. كيفية استخدام المعلومات",
          content: `نستخدم المعلومات التي نجمعها للأغراض التالية:

• تقديم خدمات صيانة وإصلاح الدراجات
• التواصل معك بشأن حجوزاتك وطلباتك
• ربطك مع الفنيين المعتمدين في منطقتك
• معالجة المدفوعات وإصدار الفواتير
• إرسال إشعارات بشأن الصيانة الدورية
• تحسين خدماتنا وتجربة المستخدم
• ضمان سلامة وأمن المنصة
• الامتثال للالتزامات القانونية`
        },
        {
          title: "٤. مشاركة المعلومات",
          content: `نحن لا نبيع بياناتك الشخصية. قد نشارك معلوماتك في الحالات التالية:

• مع الفنيين المعتمدين: عند حجز خدمة، نشارك اسمك ومعلومات الاتصال وموقع الخدمة مع الفني المختار
• مع مزودي الخدمات: معالجات الدفع، خدمات الاستضافة، مزودي خدمات البنية التحتية التقنية
• للامتثال القانوني: عند الضرورة للامتثال للقوانين أو الأوامر القضائية أو الإجراءات القانونية
• حماية الحقوق: لحماية حقوقنا أو ممتلكاتنا أو سلامة مستخدمينا`
        },
        {
          title: "٥. أمن البيانات",
          content: `نتخذ تدابير أمنية تقنية وتنظيمية مناسبة لحماية بياناتك الشخصية من الوصول غير المصرح به أو الإفصاح أو التغيير أو التدمير، بما في ذلك:

• تشفير البيانات أثناء النقل والتخزين (SSL/TLS)
• ضوابط الوصول وآليات المصادقة
• مراقبة أمنية منتظمة ومراجعات أمنية
• تدريب الموظفين على ممارسات حماية البيانات`
        },
        {
          title: "٦. الاحتفاظ بالبيانات",
          content: `نحتفظ بمعلوماتك الشخصية طالما كان حسابك نشطاً أو حسب الحاجة لتقديم الخدمات. قد نحتفظ ببعض المعلومات لفترة أطول للامتثال لالتزاماتنا القانونية، أو حل النزاعات، أو إنفاذ اتفاقياتنا.`
        },
        {
          title: "٧. حقوقك",
          content: `وفقاً للقوانين المعمول بها (بما في ذلك قانون حماية البيانات الشخصية السعودي)، لديك الحقوق التالية:

• الوصول إلى بياناتك الشخصية
• تصحيح البيانات غير الدقيقة أو غير الكاملة
• حذف بياناتك الشخصية (الحق في النسيان)
• تقييد معالجة بياناتك
• نقل البيانات إلى مزود خدمة آخر
• الاعتراض على معالجة بياناتك
• سحب الموافقة في أي وقت

للممارسة أي من هذه الحقوق، يرجى الاتصال بنا على: support@cyclecatrtec.com`
        },
        {
          title: "٨. بيانات الموقع",
          content: `نستخدم بيانات موقع GPS لتوصيلك بالفنيين القريبين وتمكين خدمات الصيانة في الموقع. يمكنك التحكم في أذونات الموقع من خلال إعدادات جهازك. لاحظ أن رفض الوصول للموقع قد يحد من قدرتك على استخدام بعض الميزات.`
        },
        {
          title: "٩. خصوصية الأطفال",
          content: `خدماتنا غير موجهة للأطفال دون سن 18 عاماً. نحن لا نجمع عن قصد معلومات شخصية من الأطفال. إذا علمت أننا جمعنا معلومات من طفل، يرجى الاتصال بنا وسنتخذ خطوات لحذف هذه المعلومات.`
        },
        {
          title: "١٠. التغييرات على سياسة الخصوصية",
          content: `قد نقوم بتحديث سياسة الخصوصية هذه من وقت لآخر. سنقوم بإخطارك بأي تغييرات من خلال نشر السياسة الجديدة على هذه الصفحة وتحديث تاريخ "آخر تحديث". يُنصح بمراجعة سياسة الخصوصية هذه بشكل دوري للتعرف على أي تغييرات.`
        },
        {
          title: "١١. معلومات الاتصال",
          content: `إذا كان لديك أي أسئلة أو مخاوف بشأن سياسة الخصوصية هذه أو ممارسات البيانات لدينا، يرجى الاتصال بنا:

البريد الإلكتروني: support@cyclecatrtec.com
الموقع الإلكتروني: cyclecatrtec.com
العنوان: الرياض، المملكة العربية السعودية`
        }
      ]
    },
    en: {
      title: "Privacy Policy",
      backHome: "Back to Home",
      lastUpdated: "Last Updated: November 2025",
      sections: [
        {
          title: "1. Introduction",
          content: `Welcome to Cycle Care (referred to as "we," "us," or "the App"). We are committed to protecting your privacy and personal data. This Privacy Policy explains how we collect, use, protect, and share your personal information when you use our bike maintenance and repair services.`
        },
        {
          title: "2. Information We Collect",
          content: `We collect the following types of information:

• Account Information: Name, email address, phone number
• Bike Information: Brand, model, year, mileage
• Location Information: GPS coordinates for service location (when requesting maintenance service)
• Booking Information: Service request details, selected technician, date and time of service
• Payment Information: Selected payment method (we do not store credit card information)
• Device Information: Device type, operating system, unique device identifier`
        },
        {
          title: "3. How We Use Information",
          content: `We use the information we collect for the following purposes:

• Provide bike maintenance and repair services
• Communicate with you about your bookings and requests
• Connect you with certified technicians in your area
• Process payments and issue invoices
• Send notifications about periodic maintenance
• Improve our services and user experience
• Ensure platform safety and security
• Comply with legal obligations`
        },
        {
          title: "4. Information Sharing",
          content: `We do not sell your personal data. We may share your information in the following cases:

• With Certified Technicians: When you book a service, we share your name, contact information, and service location with the selected technician
• With Service Providers: Payment processors, hosting services, technical infrastructure providers
• For Legal Compliance: When necessary to comply with laws, court orders, or legal processes
• Rights Protection: To protect our rights, property, or the safety of our users`
        },
        {
          title: "5. Data Security",
          content: `We take appropriate technical and organizational security measures to protect your personal data from unauthorized access, disclosure, alteration, or destruction, including:

• Data encryption in transit and at rest (SSL/TLS)
• Access controls and authentication mechanisms
• Regular security monitoring and audits
• Employee training on data protection practices`
        },
        {
          title: "6. Data Retention",
          content: `We retain your personal information for as long as your account is active or as needed to provide services. We may retain some information for longer periods to comply with our legal obligations, resolve disputes, or enforce our agreements.`
        },
        {
          title: "7. Your Rights",
          content: `Under applicable laws (including Saudi Personal Data Protection Law), you have the following rights:

• Access your personal data
• Correct inaccurate or incomplete data
• Delete your personal data (right to be forgotten)
• Restrict processing of your data
• Data portability to another service provider
• Object to processing of your data
• Withdraw consent at any time

To exercise any of these rights, please contact us at: support@cyclecatrtec.com`
        },
        {
          title: "8. Location Data",
          content: `We use GPS location data to connect you with nearby technicians and enable on-site maintenance services. You can control location permissions through your device settings. Note that denying location access may limit your ability to use certain features.`
        },
        {
          title: "9. Children's Privacy",
          content: `Our services are not directed to children under 18 years of age. We do not knowingly collect personal information from children. If you become aware that we have collected information from a child, please contact us and we will take steps to delete such information.`
        },
        {
          title: "10. Changes to Privacy Policy",
          content: `We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.`
        },
        {
          title: "11. Contact Information",
          content: `If you have any questions or concerns about this Privacy Policy or our data practices, please contact us:

Email: support@cyclecatrtec.com
Website: cyclecatrtec.com
Address: Riyadh, Saudi Arabia`
        }
      ]
    }
  };

  const t = content[lang];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-gradient-to-r from-sidebar via-sidebar to-accent/30 text-sidebar-foreground border-b border-sidebar-border shadow-lg">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-home-privacy">
              <ArrowLeft className="w-4 h-4" />
              {t.backHome}
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">{t.title}</CardTitle>
            <p className="text-center text-muted-foreground mt-2">{t.lastUpdated}</p>
          </CardHeader>
          <CardContent className="space-y-8">
            {t.sections.map((section, index) => (
              <div key={index} className="space-y-3">
                <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
                <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                  {section.content}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
