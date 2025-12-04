import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Logo from "@/components/Logo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
  const { lang } = useLanguage();

  const content = {
    ar: {
      title: "شروط الخدمة",
      backHome: "العودة للرئيسية",
      lastUpdated: "آخر تحديث: نوفمبر 2025",
      sections: [
        {
          title: "١. القبول بالشروط",
          content: `مرحباً بك في Cycle Care. باستخدامك لهذا التطبيق، فإنك توافق على الالتزام بشروط الخدمة هذه وجميع القوانين واللوائح المعمول بها. إذا كنت لا توافق على أي من هذه الشروط، فيُرجى عدم استخدام خدماتنا.`
        },
        {
          title: "٢. وصف الخدمة",
          content: `Cycle Care عبارة عن منصة تربط بين مالكي الدراجات والفنيين المعتمدين لخدمات الصيانة والإصلاح. نحن نقدم:

• منصة لحجز خدمات صيانة وإصلاح الدراجات
• ربط المستخدمين مع الفنيين المعتمدين
• تتبع تاريخ الصيانة والخدمة
• متجر لقطع الغيار والملحقات الأصلية
• نظام دفع آمن ومعالجة الفواتير

نحن لا نقدم خدمات الصيانة بشكل مباشر، بل نسهل الاتصال بين المستخدمين والفنيين المستقلين.`
        },
        {
          title: "٣. حسابات المستخدمين",
          content: `• يجب أن يكون عمرك 18 عاماً على الأقل لاستخدام خدماتنا
• يجب تقديم معلومات دقيقة وكاملة عند التسجيل
• أنت مسؤول عن الحفاظ على سرية بيانات اعتماد حسابك
• أنت مسؤول عن جميع الأنشطة التي تحدث تحت حسابك
• يجب عليك إخطارنا فوراً بأي استخدام غير مصرح به لحسابك
• نحتفظ بالحق في تعليق أو إنهاء الحسابات التي تنتهك هذه الشروط`
        },
        {
          title: "٤. حجز الخدمات",
          content: `عند حجز خدمة صيانة أو إصلاح:

• أنت توافق على تقديم معلومات دقيقة عن دراجتك وموقعك
• أنت توافق على التواجد في الموقع المحدد في الوقت المحدد
• قد تختلف الأسعار بناءً على نوع الخدمة والموقع
• سيتم تأكيد الحجز بمجرد قبول الفني للطلب
• يمكن للفنيين قبول أو رفض طلبات الخدمة بناءً على توفرهم
• قد يتم تحصيل رسوم إضافية للقطع أو الخدمات غير المتوقعة`
        },
        {
          title: "٥. الدفع والتسعير",
          content: `• جميع الأسعار معروضة بالريال السعودي (SAR)
• تشمل الأسعار ضريبة القيمة المضافة (15%) حسب القانون السعودي
• الدفع مستحق عند إتمام الخدمة
• نقبل طرق الدفع التالية: Apple Pay، بطاقة الائتمان، STC Pay، التحويل البنكي
• جميع المدفوعات نهائية وغير قابلة للاسترداد إلا في حالات استثنائية
• في حالة وجود نزاع على الدفع، يرجى الاتصال بالدعم خلال 48 ساعة`
        },
        {
          title: "٦. سياسة الإلغاء والاسترداد",
          content: `• يمكنك إلغاء حجزك قبل 24 ساعة على الأقل من موعد الخدمة دون رسوم
• الإلغاء خلال 24 ساعة من موعد الخدمة قد يتحمل رسوم إلغاء بنسبة 25%
• عدم الحضور في موعد الخدمة المحدد قد يتحمل رسوم كاملة
• استرداد الأموال (في حالة الموافقة) سيتم معالجته خلال 5-7 أيام عمل
• في حالة إلغاء الفني للحجز، سيتم استرداد المبلغ بالكامل`
        },
        {
          title: "٧. مسؤوليات الفنيين",
          content: `الفنيون المسجلون على المنصة يوافقون على:

• تقديم خدمات صيانة وإصلاح احترافية عالية الجودة
• الحفاظ على الشهادات والتراخيص اللازمة
• الالتزام بالمواعيد المحددة
• معاملة العملاء باحترام واحترافية
• استخدام قطع غيار أصلية أو عالية الجودة
• تقديم ضمان على العمل المنجز (حسب الاتفاق)
• الامتثال لجميع القوانين واللوائح المعمول بها`
        },
        {
          title: "٨. حدود المسؤولية",
          content: `• نحن منصة وساطة ولسنا مسؤولين مباشرة عن جودة خدمات الفنيين
• نحن لا نضمن توفر الفنيين في جميع الأوقات أو المواقع
• لسنا مسؤولين عن الأضرار الناتجة عن خدمات الفنيين
• لسنا مسؤولين عن فقدان أو تلف الدراجات أثناء الخدمة
• مسؤوليتنا القصوى محدودة بمبلغ الرسوم المدفوعة للخدمة المعنية
• نحن لسنا مسؤولين عن أي أضرار غير مباشرة أو تبعية أو خاصة`
        },
        {
          title: "٩. الملكية الفكرية",
          content: `• جميع المحتويات والميزات والوظائف في التطبيق مملوكة لـ Cycle Care
• لا يجوز لك نسخ أو تعديل أو توزيع أو إعادة إنتاج أي جزء من التطبيق
• شعار Cycle Care وعلامتنا التجارية محمية بموجب قوانين حقوق النشر والعلامات التجارية
• أي استخدام غير مصرح به لملكيتنا الفكرية يعتبر انتهاكاً لهذه الشروط`
        },
        {
          title: "١٠. سلوك المستخدم",
          content: `يُمنع عليك:

• استخدام الخدمة لأي غرض غير قانوني أو احتيالي
• التحرش أو إساءة معاملة الفنيين أو المستخدمين الآخرين
• تقديم معلومات كاذبة أو مضللة
• محاولة الوصول غير المصرح به إلى أنظمتنا
• التدخل في تشغيل التطبيق أو الخوادم
• استخدام برامج آلية (bots) أو أدوات تجميع البيانات
• إساءة استخدام نظام التقييمات أو المراجعات`
        },
        {
          title: "١١. إنهاء الخدمة",
          content: `نحتفظ بالحق في:

• تعليق أو إنهاء حسابك في أي وقت لانتهاك هذه الشروط
• رفض الخدمة لأي شخص لأي سبب
• تعديل أو إيقاف الخدمة (أو أي جزء منها) مؤقتاً أو دائماً
• إزالة أي محتوى ينتهك هذه الشروط أو القوانين المعمول بها`
        },
        {
          title: "١٢. القانون الحاكم",
          content: `تخضع هذه الشروط وتفسر وفقاً لقوانين المملكة العربية السعودية. أي نزاع ينشأ عن هذه الشروط يخضع للاختصاص الحصري للمحاكم في الرياض، المملكة العربية السعودية.`
        },
        {
          title: "١٣. التغييرات على الشروط",
          content: `نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سنقوم بإخطارك بأي تغييرات جوهرية من خلال إشعار في التطبيق أو عبر البريد الإلكتروني. استمرارك في استخدام الخدمة بعد هذه التغييرات يشكل قبولاً للشروط المعدلة.`
        },
        {
          title: "١٤. معلومات الاتصال",
          content: `إذا كان لديك أي أسئلة حول شروط الخدمة هذه، يرجى الاتصال بنا:

البريد الإلكتروني: support@cyclecatrtec.com
الموقع الإلكتروني: cyclecatrtec.com
العنوان: الرياض، المملكة العربية السعودية`
        }
      ]
    },
    en: {
      title: "Terms of Service",
      backHome: "Back to Home",
      lastUpdated: "Last Updated: November 2025",
      sections: [
        {
          title: "1. Acceptance of Terms",
          content: `Welcome to Cycle Care. By using this application, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree to any of these terms, please do not use our services.`
        },
        {
          title: "2. Service Description",
          content: `Cycle Care is a platform that connects bike owners with certified technicians for maintenance and repair services. We provide:

• Platform for booking bike maintenance and repair services
• Connection between users and certified technicians
• Maintenance and service history tracking
• Store for original spare parts and accessories
• Secure payment system and invoice processing

We do not provide maintenance services directly, but facilitate the connection between users and independent technicians.`
        },
        {
          title: "3. User Accounts",
          content: `• You must be at least 18 years old to use our services
• You must provide accurate and complete information when registering
• You are responsible for maintaining the confidentiality of your account credentials
• You are responsible for all activities that occur under your account
• You must notify us immediately of any unauthorized use of your account
• We reserve the right to suspend or terminate accounts that violate these terms`
        },
        {
          title: "4. Service Booking",
          content: `When booking a maintenance or repair service:

• You agree to provide accurate information about your bike and location
• You agree to be present at the specified location at the specified time
• Prices may vary based on service type and location
• Booking will be confirmed once the technician accepts the request
• Technicians can accept or decline service requests based on their availability
• Additional fees may apply for parts or unexpected services`
        },
        {
          title: "5. Payment and Pricing",
          content: `• All prices are displayed in Saudi Riyal (SAR)
• Prices include VAT (15%) as per Saudi law
• Payment is due upon service completion
• We accept the following payment methods: Apple Pay, Credit Card, STC Pay, Bank Transfer
• All payments are final and non-refundable except in exceptional cases
• In case of payment dispute, please contact support within 48 hours`
        },
        {
          title: "6. Cancellation and Refund Policy",
          content: `• You can cancel your booking at least 24 hours before the service appointment without fees
• Cancellation within 24 hours of service appointment may incur a 25% cancellation fee
• No-show at the scheduled service time may incur full fees
• Refunds (if approved) will be processed within 5-7 business days
• In case of technician cancellation, full refund will be provided`
        },
        {
          title: "7. Technician Responsibilities",
          content: `Technicians registered on the platform agree to:

• Provide professional, high-quality maintenance and repair services
• Maintain necessary certifications and licenses
• Adhere to scheduled appointments
• Treat customers with respect and professionalism
• Use original or high-quality spare parts
• Provide warranty on completed work (as agreed)
• Comply with all applicable laws and regulations`
        },
        {
          title: "8. Limitation of Liability",
          content: `• We are an intermediary platform and are not directly responsible for the quality of technician services
• We do not guarantee technician availability at all times or locations
• We are not responsible for damages resulting from technician services
• We are not responsible for loss or damage to bikes during service
• Our maximum liability is limited to the amount of fees paid for the relevant service
• We are not responsible for any indirect, consequential, or special damages`
        },
        {
          title: "9. Intellectual Property",
          content: `• All content, features, and functionality in the app are owned by Cycle Care
• You may not copy, modify, distribute, or reproduce any part of the app
• The Cycle Care logo and trademark are protected by copyright and trademark laws
• Any unauthorized use of our intellectual property constitutes a violation of these terms`
        },
        {
          title: "10. User Conduct",
          content: `You are prohibited from:

• Using the service for any illegal or fraudulent purpose
• Harassing or abusing technicians or other users
• Providing false or misleading information
• Attempting unauthorized access to our systems
• Interfering with the operation of the app or servers
• Using automated programs (bots) or data scraping tools
• Abusing the rating or review system`
        },
        {
          title: "11. Service Termination",
          content: `We reserve the right to:

• Suspend or terminate your account at any time for violating these terms
• Refuse service to anyone for any reason
• Modify or discontinue the service (or any part thereof) temporarily or permanently
• Remove any content that violates these terms or applicable laws`
        },
        {
          title: "12. Governing Law",
          content: `These terms are governed by and construed in accordance with the laws of the Kingdom of Saudi Arabia. Any dispute arising from these terms is subject to the exclusive jurisdiction of the courts in Riyadh, Saudi Arabia.`
        },
        {
          title: "13. Changes to Terms",
          content: `We reserve the right to modify these terms at any time. We will notify you of any material changes through an in-app notice or via email. Your continued use of the service after such changes constitutes acceptance of the modified terms.`
        },
        {
          title: "14. Contact Information",
          content: `If you have any questions about these Terms of Service, please contact us:

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
            <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-home-terms">
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
