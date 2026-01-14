import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useLocation } from "wouter";
import { CheckCircle2, Headset, Paperclip, ArrowLeft, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/apiConfig";
import { auth } from "@/lib/firebase";
import { getBestAuthToken } from "@/lib/authStorage";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";
import type { StoredOrder } from "@/lib/mockOrders";

type SupportOption = {
  id: string;
  label: { ar: string; en: string };
};

type SupportCategory = SupportOption & {
  subcategories: SupportOption[];
};

type SupportReply = {
  id?: string;
  message: string;
  senderRole?: string;
  createdAt?: string;
};

const supportCategories: SupportCategory[] = [
  {
    id: "complaints",
    label: { ar: "شكاوى", en: "Complaints" },
    subcategories: [
      { id: "complaint_technician", label: { ar: "شكوى على الفني", en: "Technician Complaint" } },
      { id: "complaint_app", label: { ar: "شكوى على التطبيق", en: "App Complaint" } },
      { id: "complaint_store", label: { ar: "شكوى على المتجر", en: "Store Complaint" } },
    ],
  },
  {
    id: "suggestions",
    label: { ar: "اقتراحات", en: "Suggestions" },
    subcategories: [
      { id: "suggest_app", label: { ar: "تحسين التطبيق", en: "App Improvement" } },
      { id: "suggest_service", label: { ar: "إضافة خدمة", en: "Add a Service" } },
      { id: "suggest_ux", label: { ar: "تجربة المستخدم", en: "User Experience" } },
    ],
  },
  {
    id: "technical_issue",
    label: { ar: "مشكلة تقنية", en: "Technical Issue" },
    subcategories: [
      { id: "issue_login", label: { ar: "تسجيل الدخول", en: "Login" } },
      { id: "issue_payment", label: { ar: "الدفع / الفاتورة", en: "Payment / Invoice" } },
      { id: "issue_booking", label: { ar: "حجز الخدمة", en: "Service Booking" } },
      { id: "issue_other", label: { ar: "مشكلة أخرى", en: "Other Issue" } },
    ],
  },
  {
    id: "other",
    label: { ar: "أخرى", en: "Other" },
    subcategories: [],
  },
];

const generalSubcategoryLabels = { ar: "عام", en: "General" };
const SUPPORT_TICKET_STORAGE_KEY = "support_ticket_latest";

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const formatTicketTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export default function SupportPage() {
  const { lang } = useLanguage();
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const labels = {
    ar: {
      title: "الدعم الفني",
      subtitle: "نستقبل طلباتك بسرعة ونعود لك بأقرب وقت ممكن.",
      step1: "اختر التصنيف الرئيسي",
      step2: "اختر التصنيف الفرعي",
      step3: "تفاصيل الطلب",
      next: "التالي",
      back: "السابق",
      submit: "إرسال الطلب",
      submitting: "جارٍ الإرسال...",
      subject: "الموضوع",
      description: "وصف المشكلة أو الطلب",
      descriptionPlaceholder: "اشرح لنا التفاصيل بشكل واضح حتى نتمكن من مساعدتك بسرعة.",
      attachment: "إرفاق صورة (اختياري)",
      contact: "بيانات التواصل",
      name: "الاسم",
      email: "البريد الإلكتروني",
      phone: "رقم الهاتف",
      required: "هذا الحقل مطلوب",
      submitErrorTitle: "تعذر إرسال الطلب",
      submitErrorBody: "يرجى المحاولة مرة أخرى بعد قليل.",
      successTitle: "تم استلام طلب الدعم بنجاح",
      successBody: "شكراً لك.",
      newTicket: "طلب جديد",
      goHome: "العودة للرئيسية",
      noSubcategory: "لا يوجد تصنيف فرعي لهذه الفئة.",
      generalSubcategory: "عام",
      selectCategory: "اختر التصنيف",
      selectSubcategory: "اختر التصنيف الفرعي",
      fileReady: "تم اختيار الملف",
      lastTicketTitle: "آخر طلب دعم",
      lastTicketEmpty: "لا يوجد طلبات دعم سابقة على هذا الجهاز.",
      ticketTime: "الوقت",
      ticketNumber: "رقم الطلب",
      ticketStatus: "الحالة",
      ticketCategory: "التصنيف",
      ticketSubcategory: "التصنيف الفرعي",
      ticketSubject: "الموضوع",
      ticketMessage: "الرسالة",
      ticketReply: "رد الإدارة",
      ticketReplyEmpty: "لا يوجد رد حتى الآن.",
      ticketStatusOpen: "مفتوحة",
      ticketStatusClosed: "مغلقة",
      ticketStatusReplied: "تم الرد",
      orderLabel: "رقم الطلب (اختياري)",
      orderPlaceholder: "اختر طلب مرتبط",
      orderEmpty: "لا توجد طلبات مرتبطة حالياً.",
      replyLabel: "إضافة رد",
      replyPlaceholder: "اكتب ردك هنا...",
      replySend: "إرسال الرد",
      replyFromAdmin: "الإدارة",
      replyFromUser: "أنت",
    },
    en: {
      title: "Support",
      subtitle: "We will review your request and get back to you shortly.",
      step1: "Choose main category",
      step2: "Choose sub-category",
      step3: "Ticket details",
      next: "Next",
      back: "Back",
      submit: "Submit Ticket",
      submitting: "Submitting...",
      subject: "Subject",
      description: "Description",
      descriptionPlaceholder: "Share the details so we can help you faster.",
      attachment: "Attach an image (optional)",
      contact: "Contact info",
      name: "Name",
      email: "Email",
      phone: "Phone",
      required: "This field is required",
      submitErrorTitle: "Unable to send request",
      submitErrorBody: "Please try again in a moment.",
      successTitle: "Support request sent",
      successBody: "Thank you. Your request has been received.",
      newTicket: "New Ticket",
      goHome: "Back to Home",
      noSubcategory: "No sub-category needed for this option.",
      generalSubcategory: "General",
      selectCategory: "Select category",
      selectSubcategory: "Select sub-category",
      fileReady: "File selected",
      lastTicketTitle: "Latest Support Ticket",
      lastTicketEmpty: "No previous support tickets on this device.",
      ticketTime: "Time",
      ticketNumber: "Ticket Number",
      ticketStatus: "Status",
      ticketCategory: "Category",
      ticketSubcategory: "Sub-category",
      ticketSubject: "Subject",
      ticketMessage: "Message",
      ticketReply: "Admin Reply",
      ticketReplyEmpty: "No reply yet.",
      ticketStatusOpen: "Open",
      ticketStatusClosed: "Closed",
      ticketStatusReplied: "Replied",
      orderLabel: "Order (optional)",
      orderPlaceholder: "Select related order",
      orderEmpty: "No orders available.",
      replyLabel: "Add Reply",
      replyPlaceholder: "Write your reply...",
      replySend: "Send Reply",
      replyFromAdmin: "Admin",
      replyFromUser: "You",
    },
  }[lang === "en" ? "en" : "ar"];

  const [step, setStep] = useState(1);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [lastTicket, setLastTicket] = useState<{
    id?: string;
    timestamp: string;
    category: string;
    subCategory?: string;
    subject: string;
    message: string;
    status?: string;
    replyMessage?: string;
    replyAt?: string;
    ticketNumber?: string;
    replies?: SupportReply[];
  } | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  const orders = useMemo<StoredOrder[]>(() => {
    try {
      const raw = localStorage.getItem("mock_orders");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId),
    [orders, selectedOrderId],
  );

  const selectedCategory = useMemo(
    () => supportCategories.find((category) => category.id === selectedCategoryId),
    [selectedCategoryId],
  );

  const selectedSubcategory = useMemo(() => {
    if (!selectedCategory) return undefined;
    return selectedCategory.subcategories.find((sub) => sub.id === selectedSubcategoryId);
  }, [selectedCategory, selectedSubcategoryId]);

  useEffect(() => {
    if (!user) return;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    if (fullName) setContactName(fullName);
    if (user.email) setContactEmail(user.email);
    if (user.phone) setContactPhone(user.phone);
  }, [user]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(SUPPORT_TICKET_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.timestamp && parsed?.subject && parsed?.message) {
          setLastTicket(parsed);
        }
      }
    } catch {
      setLastTicket(null);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    const loadTickets = async () => {
      try {
        const response = await fetchWithFirebaseAuth(buildApiUrl("/api/support/tickets"), {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept-Language": lang,
            "X-Lang": lang,
          },
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => []);
        if (!isActive || !Array.isArray(data) || data.length === 0) return;
        const ticket = data[0] || {};
        const repliesRaw = Array.isArray(ticket.replies) ? ticket.replies : [];
        const replies = repliesRaw
          .map((reply: any) => ({
            id: reply.id,
            message: reply.message ?? "",
            senderRole: reply.senderRole ?? reply.sender_role ?? "user",
            createdAt: reply.createdAt ?? reply.created_at ?? reply.createdAt,
          }))
          .filter((reply: SupportReply) => reply.message);
        const ticketSnapshot = {
          id: ticket.id,
          timestamp: ticket.created_at || ticket.createdAt || new Date().toISOString(),
          category: ticket.category || ticket.type || "",
          subCategory: ticket.sub_category || ticket.subCategory || "",
          subject: ticket.subject || ticket.category || ticket.type || "",
          message: ticket.message || "",
          status: ticket.status || "open",
          replyMessage: ticket.reply_message || ticket.replyMessage || "",
          replyAt: ticket.replied_at || ticket.repliedAt || "",
          ticketNumber: ticket.ticket_number || ticket.ticketNumber || "",
          replies,
        };
        setLastTicket(ticketSnapshot);
        localStorage.setItem(SUPPORT_TICKET_STORAGE_KEY, JSON.stringify(ticketSnapshot));
      } catch (error) {
        console.warn("[Support] Failed to fetch tickets", error);
      }
    };
    loadTickets();
    const interval = setInterval(loadTickets, 15000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [lang]);

  useEffect(() => {
    if (!selectedCategory) {
      setSelectedSubcategoryId("");
      return;
    }

    if (selectedCategory.subcategories.length === 0) {
      setSelectedSubcategoryId("general");
      return;
    }

    if (!selectedCategory.subcategories.some((sub) => sub.id === selectedSubcategoryId)) {
      setSelectedSubcategoryId("");
    }
  }, [selectedCategoryId, selectedCategory, selectedSubcategoryId]);

  const subject = useMemo(() => {
    if (!selectedCategory) return "";
    const categoryLabel = selectedCategory.label[lang === "en" ? "en" : "ar"];
    const subLabel = selectedSubcategory
      ? selectedSubcategory.label[lang === "en" ? "en" : "ar"]
      : selectedCategory.subcategories.length === 0
      ? labels.generalSubcategory
      : "";
    return subLabel ? `${categoryLabel} - ${subLabel}` : categoryLabel;
  }, [labels.generalSubcategory, lang, selectedCategory, selectedSubcategory]);

  const canMoveToStep2 = selectedCategoryId.length > 0;
  const canMoveToStep3 =
    selectedCategoryId.length > 0 &&
    (selectedCategory?.subcategories.length === 0 || selectedSubcategoryId.length > 0);

  const canSubmit =
    canMoveToStep3 && description.trim().length > 0 && !isSubmitting;

  const progressValue = step === 1 ? 33 : step === 2 ? 66 : 100;

  const resetForm = () => {
    setStep(1);
    setSelectedCategoryId("");
    setSelectedSubcategoryId("");
    setDescription("");
    setAttachment(null);
    setIsSubmitting(false);
    setSubmitted(false);
  };

  const clearFormFields = () => {
    setStep(1);
    setSelectedCategoryId("");
    setSelectedSubcategoryId("");
    setSelectedOrderId("");
    setDescription("");
    setAttachment(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const platform = Capacitor.getPlatform();
      const categoryLabelAr = selectedCategory?.label.ar || "";
      const categoryLabelEn = selectedCategory?.label.en || "";
      const subLabelAr =
        selectedSubcategory?.label.ar ||
        (selectedCategory?.subcategories.length === 0 ? generalSubcategoryLabels.ar : "");
      const subLabelEn =
        selectedSubcategory?.label.en ||
        (selectedCategory?.subcategories.length === 0 ? generalSubcategoryLabels.en : "");

      const formData = new FormData();
      formData.append("type", selectedCategoryId);
      formData.append("category", categoryLabelAr || selectedCategoryId);
      formData.append("message", description.trim());
      formData.append("categoryLabel", categoryLabelAr);
      formData.append("categoryLabelEn", categoryLabelEn);
      if (selectedSubcategoryId) formData.append("subCategory", selectedSubcategoryId);
      if (subLabelAr) formData.append("subCategoryLabel", subLabelAr);
      if (subLabelEn) formData.append("subCategoryLabelEn", subLabelEn);
      formData.append("subject", subject);
      formData.append("description", description.trim());
      formData.append("platform", platform);
      if (contactName.trim()) formData.append("userName", contactName.trim());
      if (contactEmail.trim()) formData.append("email", contactEmail.trim());
      if (contactPhone.trim()) formData.append("phone", contactPhone.trim());
      if (selectedOrder) {
        formData.append("orderId", selectedOrder.id);
        formData.append("orderNumber", selectedOrder.orderNumber);
      }
      if (attachment) formData.append("attachment", attachment, attachment.name);

      let token: string | null = null;
      try {
        token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      } catch (error) {
        console.warn("[Support] Failed to get Firebase ID token", error);
      }
      if (!token) {
        token = await getBestAuthToken();
      }

      const headers = new Headers();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      headers.set("Accept-Language", lang);
      headers.set("X-Lang", lang);

      const responsePayload = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", buildApiUrl("/api/support/tickets"), true);
        xhr.withCredentials = !Capacitor.isNativePlatform();
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
        xhr.setRequestHeader("Accept-Language", lang);
        xhr.setRequestHeader("X-Lang", lang);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const payload = JSON.parse(xhr.responseText || "{}");
              resolve(payload);
            } catch {
              resolve({});
            }
            return;
          }
          let message = labels.submitErrorBody;
          try {
            const payload = JSON.parse(xhr.responseText || "{}");
            message = payload?.message || message;
          } catch {
            // ignore parse errors
          }
          reject(new Error(message));
        };
        xhr.onerror = () => reject(new Error(labels.submitErrorBody));
        xhr.send(formData);
      });

      const ticketSnapshot = {
        timestamp: new Date().toISOString(),
        category: categoryLabelAr || categoryLabelEn || selectedCategoryId,
        subCategory: subLabelAr || subLabelEn || "",
        subject,
        message: description.trim(),
        status: "open",
        replyMessage: "",
        replyAt: "",
        ticketNumber: responsePayload?.ticketNumber || responsePayload?.ticket_number || "",
        replies: [],
      };
      localStorage.setItem(SUPPORT_TICKET_STORAGE_KEY, JSON.stringify(ticketSnapshot));
      setLastTicket(ticketSnapshot);
      clearFormFields();
      setSubmitted(true);
      toast({ title: labels.successTitle, description: labels.successBody });
    } catch (error: any) {
      toast({
        title: labels.submitErrorTitle,
        description: error?.message || labels.submitErrorBody,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="relative z-10">
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white/90 dark:bg-black/80 backdrop-blur border border-white/30 p-8 text-center shadow-xl">
            <div className="flex justify-center text-primary mb-4">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h2 className="text-2xl font-bold mb-2">{labels.successTitle}</h2>
            <p className="text-muted-foreground mb-6">{labels.successBody}</p>
            <div className="flex flex-col gap-3">
              <Button onClick={resetForm}>{labels.newTicket}</Button>
              <Button variant="outline" onClick={() => setLocation("/")}>
                {labels.goHome}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const handleReplySubmit = async () => {
    if (!lastTicket?.id || replyDraft.trim().length === 0 || isReplying) return;
    setIsReplying(true);
    try {
      const response = await fetchWithFirebaseAuth(
        buildApiUrl(`/api/support/tickets/${lastTicket.id}/replies`),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept-Language": lang,
            "X-Lang": lang,
          },
          body: JSON.stringify({ message: replyDraft.trim() }),
        },
      );
      if (!response.ok) {
        throw new Error(labels.submitErrorBody);
      }
      const reply = await response.json().catch(() => null);
      const normalizedReply: SupportReply = {
        id: reply?.id,
        message: reply?.message ?? replyDraft.trim(),
        senderRole: reply?.senderRole ?? reply?.sender_role ?? "user",
        createdAt: reply?.createdAt ?? reply?.created_at ?? new Date().toISOString(),
      };
      const nextReplies = [...(lastTicket.replies ?? []), normalizedReply];
      const updatedTicket = {
        ...lastTicket,
        status: "open",
        replies: nextReplies,
      };
      setLastTicket(updatedTicket);
      localStorage.setItem(SUPPORT_TICKET_STORAGE_KEY, JSON.stringify(updatedTicket));
      setReplyDraft("");
    } catch (error: any) {
      toast({
        title: labels.submitErrorTitle,
        description: error?.message || labels.submitErrorBody,
        variant: "destructive",
      });
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="relative z-10">
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="bg-white/85 dark:bg-black/80 border border-white/30 backdrop-blur shadow-xl">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Headset className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">{labels.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{labels.step1}</span>
                  <span>{labels.step2}</span>
                  <span>{labels.step3}</span>
                </div>
                <Progress value={progressValue} className="h-2" />
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">{labels.step1}</label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={(value) => setSelectedCategoryId(value)}
                    >
                      <SelectTrigger className="bg-white/80 dark:bg-black/60">
                        <SelectValue placeholder={labels.selectCategory} />
                      </SelectTrigger>
                      <SelectContent>
                        {supportCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.label[lang === "en" ? "en" : "ar"]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setStep(2)}
                      disabled={!canMoveToStep2}
                    >
                      {labels.next}
                      <ArrowLeft className="ms-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  {selectedCategory?.subcategories.length ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">{labels.step2}</label>
                      <Select
                        value={selectedSubcategoryId}
                        onValueChange={(value) => setSelectedSubcategoryId(value)}
                      >
                        <SelectTrigger className="bg-white/80 dark:bg-black/60">
                          <SelectValue placeholder={labels.selectSubcategory} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedCategory.subcategories.map((sub) => (
                            <SelectItem key={sub.id} value={sub.id}>
                              {sub.label[lang === "en" ? "en" : "ar"]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <Card className="bg-white/70 dark:bg-black/60 border border-dashed border-muted-foreground/30">
                      <CardContent className="p-4 text-sm text-muted-foreground">
                        {labels.noSubcategory}
                      </CardContent>
                    </Card>
                  )}
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      <ArrowRight className="me-2 h-4 w-4" />
                      {labels.back}
                    </Button>
                    <Button onClick={() => setStep(3)} disabled={!canMoveToStep3}>
                      {labels.next}
                      <ArrowLeft className="ms-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">{labels.subject}</label>
                    <Input value={subject} readOnly className="bg-white/80 dark:bg-black/60" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">{labels.orderLabel}</label>
                    {orders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{labels.orderEmpty}</p>
                    ) : (
                      <Select
                        value={selectedOrderId}
                        onValueChange={(value) => setSelectedOrderId(value)}
                      >
                        <SelectTrigger className="bg-white/80 dark:bg-black/60">
                          <SelectValue placeholder={labels.orderPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {orders.map((order) => (
                            <SelectItem key={order.id} value={order.id}>
                              {order.orderNumber} • {order.serviceType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">
                      {labels.description}
                      <span className="text-destructive ms-1">*</span>
                    </label>
                    <Textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={labels.descriptionPlaceholder}
                      className="min-h-[140px] bg-white/80 dark:bg-black/60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">{labels.attachment}</label>
                    <div className="flex flex-col gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(event) => setAttachment(event.target.files?.[0] || null)}
                        className="bg-white/80 dark:bg-black/60"
                      />
                      {attachment && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Paperclip className="h-4 w-4" />
                          <span>
                            {labels.fileReady}: {attachment.name} ({formatFileSize(attachment.size)})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold">{labels.contact}</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        value={contactName}
                        onChange={(event) => setContactName(event.target.value)}
                        placeholder={labels.name}
                        className="bg-white/80 dark:bg-black/60"
                      />
                      <Input
                        value={contactEmail}
                        onChange={(event) => setContactEmail(event.target.value)}
                        placeholder={labels.email}
                        className="bg-white/80 dark:bg-black/60"
                        type="email"
                      />
                      <Input
                        value={contactPhone}
                        onChange={(event) => setContactPhone(event.target.value)}
                        placeholder={labels.phone}
                        className="bg-white/80 dark:bg-black/60"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      <ArrowRight className="me-2 h-4 w-4" />
                      {labels.back}
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                      {isSubmitting ? labels.submitting : labels.submit}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-black/75 border border-white/20 backdrop-blur shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">{labels.lastTicketTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!lastTicket ? (
                <p className="text-muted-foreground">{labels.lastTicketEmpty}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{labels.ticketTime}</span>
                    <span>{formatTicketTime(lastTicket.timestamp)}</span>
                  </div>
                  {lastTicket.ticketNumber ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{labels.ticketNumber}</span>
                      <span>{lastTicket.ticketNumber}</span>
                    </div>
                  ) : null}
                  {lastTicket.status ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{labels.ticketStatus}</span>
                      <span>
                        {lastTicket.status === "closed"
                          ? labels.ticketStatusClosed
                          : lastTicket.status === "open"
                          ? labels.ticketStatusOpen
                          : lastTicket.status === "replied"
                          ? labels.ticketStatusReplied
                          : lastTicket.status}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{labels.ticketCategory}</span>
                    <span>{lastTicket.category}</span>
                  </div>
                  {lastTicket.subCategory ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{labels.ticketSubcategory}</span>
                      <span>{lastTicket.subCategory}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{labels.ticketSubject}</span>
                    <span>{lastTicket.subject}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">{labels.ticketMessage}</span>
                    <p className="whitespace-pre-wrap">{lastTicket.message}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">{labels.ticketReply}</span>
                    {(() => {
                      const replies = lastTicket.replies ?? [];
                      if (replies.length > 0) {
                        return (
                          <div className="space-y-3">
                            {replies.map((reply, index) => (
                              <div key={reply.id ?? index} className="rounded-md border border-border/60 bg-background/70 p-3">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>
                                    {reply.senderRole === "admin"
                                      ? labels.replyFromAdmin
                                      : labels.replyFromUser}
                                  </span>
                                  <span>{formatTicketTime(reply.createdAt)}</span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm">{reply.message}</p>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      if (lastTicket.replyMessage) {
                        return (
                          <>
                            <p className="whitespace-pre-wrap">{lastTicket.replyMessage}</p>
                            {lastTicket.replyAt ? (
                              <p className="text-xs text-muted-foreground">
                                {formatTicketTime(lastTicket.replyAt)}
                              </p>
                            ) : null}
                          </>
                        );
                      }

                      return <p className="text-muted-foreground">{labels.ticketReplyEmpty}</p>;
                    })()}
                  </div>
                  {lastTicket.id ? (
                    <div className="space-y-2">
                      <span className="text-muted-foreground">{labels.replyLabel}</span>
                      <Textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder={labels.replyPlaceholder}
                        className="bg-white/80 dark:bg-black/60"
                      />
                      <Button
                        onClick={handleReplySubmit}
                        disabled={isReplying || replyDraft.trim().length === 0}
                      >
                        {labels.replySend}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
