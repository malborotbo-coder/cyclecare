import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { Users, Bike, Wrench, ClipboardList, Shield, UserCog, X, FileText, Eye, Download, Image, FileCheck, Upload, Loader2, Package, Trash2, Pencil, Check, Save, Headset, DollarSign, TrendingUp, BarChart3, MessageSquare, FileSpreadsheet, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef, Fragment, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/apiConfig";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import type { User, Bike as BikeType, Technician, ServiceRequest, Role, UserRole, Invoice, Order } from "@shared/schema";
import type { Language } from "@/lib/i18n";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart as RePieChart, XAxis, YAxis } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OrderTrackingTimeline from "@/components/OrderTrackingTimeline";
import logoImage from "@assets/cycle-care-new-logo.png";

interface TechnicianDocument {
  id: string;
  technicianId: string;
  documentType?: string;
  documentUrl?: string;
  fileName?: string;
  uploadedAt?: Date;
}

interface TechnicianWithUser extends Technician {
  userName?: string | null;
  userEmail?: string | null;
}

interface SupportTicket {
  id: string;
  ticket_number?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  type?: string | null;
  category?: string | null;
  message?: string | null;
  screenshot_url?: string | null;
  status?: string | null;
  reply_message?: string | null;
  replied_at?: string | null;
  replied_by?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

type InvoiceWithConvoy = Invoice & {
  convoyId?: string;
  convoyName?: string;
};

type LiveTechnicianLocation = {
  id: string;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  rating?: number | string | null;
  reviewCount?: number | string | null;
  latitude: number;
  longitude: number;
  lastUpdated?: string | null;
};

export default function AdminDashboard() {
  const { lang, t } = useLanguage();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [expandedTechnicianIds, setExpandedTechnicianIds] = useState<Set<string>>(new Set());
  const [technicianDocsMap, setTechnicianDocsMap] = useState<Record<string, TechnicianDocument[]>>({});
  const [loadingDocsMap, setLoadingDocsMap] = useState<Record<string, boolean>>({});
  const [uploadingPartImage, setUploadingPartImage] = useState<string | null>(null);
  const [newPartImage, setNewPartImage] = useState<File | null>(null);
  const partImageInputRef = useRef<HTMLInputElement>(null);
  const newPartImageInputRef = useRef<HTMLInputElement>(null);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string>("");
  const [editingCategory, setEditingCategory] = useState<string>("");
  const [expandedSupportTicketId, setExpandedSupportTicketId] = useState<string | null>(null);
  const [supportStatusDrafts, setSupportStatusDrafts] = useState<Record<string, string>>({});
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [orderRange, setOrderRange] = useState<"day" | "week" | "month">("week");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [selectedServiceRequest, setSelectedServiceRequest] = useState<ServiceRequest | null>(null);
  const [selectedShopOrder, setSelectedShopOrder] = useState<Order | null>(null);
  const [selectedLiveTechnicianId, setSelectedLiveTechnicianId] = useState<string | null>(null);
  const [reportStartDate, setReportStartDate] = useState<string>(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return start.toISOString().slice(0, 10);
  });
  const [reportEndDate, setReportEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [reportType, setReportType] = useState<"summary" | "services" | "parts">("summary");
  const [appliedReportStartDate, setAppliedReportStartDate] = useState<string>(() => reportStartDate);
  const [appliedReportEndDate, setAppliedReportEndDate] = useState<string>(() => reportEndDate);
  const [appliedReportType, setAppliedReportType] = useState<"summary" | "services" | "parts">("summary");

  const normalizeTechnician = (tech: any) => {
    const user = tech?.user;
    const phone = tech.phoneNumber ?? tech.phone_number ?? "";
    const years = tech.yearsOfExperience ?? tech.years_of_experience ?? 0;
    const location = tech.national_address ?? tech.nationalAddress ?? "";
    const rating = tech.rating ?? tech.rating ?? "0.00";
    const reviewCount = tech.reviewCount ?? tech.review_count ?? 0;
    const nameFromUser = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : null;
    const userName = tech.userName ?? nameFromUser;
    const userEmail = tech.userEmail ?? user?.email;
    const isAvailable = tech.isAvailable ?? tech.is_available;
    const isApproved = tech.isApproved ?? tech.is_approved;
    return { ...tech, user, phone, years, location, rating, reviewCount, userName, userEmail, isAvailable, isApproved };
  };

  const normalizeDoc = (doc: any) => ({
    ...doc,
    documentType: doc.documentType ?? doc.document_type,
    documentUrl: doc.documentUrl ?? doc.file_url,
    fileName: doc.fileName ?? doc.file_name,
  });

  const formatDeliveryOption = (order: any) => {
    const option = order?.deliveryOption ?? order?.delivery_option;
    if (option === "delivery_installation") {
      return lang === "ar" ? "توصيل + تركيب" : "Delivery + Installation";
    }
    return lang === "ar" ? "استلام من المتجر" : "Store pickup";
  };

  const fetchTechnicianDocuments = async (technicianId: string) => {
    setLoadingDocsMap(prev => ({ ...prev, [technicianId]: true }));
    try {
      const response = await fetch(`/api/admin/technicians/${technicianId}/documents`, {
        credentials: 'include'
      });
      if (response.ok) {
        const docs = await response.json();
        const normalized = Array.isArray(docs) ? docs.map(normalizeDoc) : [];
        setTechnicianDocsMap(prev => ({ ...prev, [technicianId]: normalized }));
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast({
          title: lang === 'ar' ? 'خطأ في تحميل المستندات' : 'Failed to load documents',
          description: errorData.message || (lang === 'ar' ? 'حاول مرة أخرى' : 'Please try again'),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast({
        title: lang === 'ar' ? 'خطأ في الاتصال' : 'Connection error',
        description: lang === 'ar' ? 'فشل في تحميل المستندات' : 'Failed to fetch documents',
        variant: "destructive",
      });
    } finally {
      setLoadingDocsMap(prev => ({ ...prev, [technicianId]: false }));
    }
  };

  const handleViewDocuments = (technicianId: string) => {
    const newExpanded = new Set(expandedTechnicianIds);
    if (newExpanded.has(technicianId)) {
      newExpanded.delete(technicianId);
    } else {
      newExpanded.add(technicianId);
      if (!technicianDocsMap[technicianId]) {
        fetchTechnicianDocuments(technicianId);
      }
    }
    setExpandedTechnicianIds(newExpanded);
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, { ar: string; en: string }> = {
      'profile_image': { ar: 'صورة الملف الشخصي', en: 'Profile Image' },
      'national_id': { ar: 'صورة الهوية الوطنية', en: 'National ID' },
      'commercial_register': { ar: 'السجل التجاري', en: 'Commercial Register' },
      'certification': { ar: 'الشهادات', en: 'Certifications' },
    };
    return labels[type]?.[lang] || type;
  };

  const translations = {
    ar: {
      title: "لوحة تحكم المالك",
      overview: "نظرة عامة",
      overviewSubtitle: "ملخص سريع للأداء والتشغيل اليومي.",
      reports: "التقارير",
      analytics: "التحليلات",
      users: "المستخدمين",
      bikes: "الدراجات",
      technicians: "الفنيين",
      serviceRequests: "طلبات الخدمة",
      serviceOrders: "طلبات الخدمة",
      userRoles: "صلاحيات المستخدمين",
      totalUsers: "إجمالي المستخدمين",
      totalServiceOrders: "إجمالي طلبات الخدمة",
      totalShopOrders: "إجمالي طلبات المتجر",
      totalRevenue: "إجمالي الإيرادات",
      openTickets: "تذاكر مفتوحة",
      totalBikes: "إجمالي الدراجات",
      totalTechnicians: "إجمالي الفنيين",
      totalRequests: "إجمالي الطلبات",
      loading: "جارٍ التحميل...",
      error: "حدث خطأ",
      noData: "لا توجد بيانات",
      email: "البريد الإلكتروني",
      name: "الاسم",
      admin: "مسؤول",
      technician: "فني",
      joined: "انضم في",
      brand: "الماركة",
      model: "الموديل",
      year: "السنة",
      bikeType: "نوع الدراجة",
      owner: "المالك",
      rating: "التقييم",
      available: "متاح",
      approved: "معتمد",
      pending: "قيد الانتظار",
      status: "الحالة",
      service: "الخدمة",
      client: "العميل",
      forbidden: "ممنوع: يتطلب صلاحيات المسؤول",
      selectUser: "اختر مستخدم",
      selectRole: "اختر صلاحية",
      assignRole: "إضافة صلاحية",
      removeRole: "إزالة",
      roleAssigned: "تم إضافة الصلاحية بنجاح",
      roleRemoved: "تم إزالة الصلاحية بنجاح",
      assignedRoles: "الصلاحيات المعينة",
      pendingTechnicians: "إدارة الفنيين",
      liveTechnicians: "الفنيون المتصلون",
      liveTechniciansMap: "خريطة الفنيين المتصلين",
      lastUpdated: "آخر تحديث",
      approve: "موافقة",
      reject: "رفض",
      approveSuccess: "تم الموافقة على الفني بنجاح",
      rejectSuccess: "تم رفض الطلب بنجاح",
      phoneNumber: "رقم الجوال",
      experience: "سنوات الخبرة",
      documents: "المستندات",
      nationalId: "رقم الهوية",
      iban: "رقم الآيبان",
      commercialRegister: "السجل التجاري",
      location: "الموقع",
      noDocuments: "لا توجد مستندات",
      invoices: "الفواتير",
      invoiceNumber: "رقم الفاتورة",
      orderNumber: "رقم الطلب",
      orderType: "نوع الطلب",
      createdAt: "تاريخ الإنشاء",
      invoiceDetails: "تفاصيل الفاتورة",
      subtotal: "المبلغ قبل الضريبة",
      taxRate: "نسبة الضريبة",
      taxAmount: "مبلغ الضريبة",
      total: "الإجمالي",
      issuedDate: "تاريخ الإصدار",
      downloadPDF: "تحميل PDF",
      convoy: "الموكب",
      allConvoys: "كل المواكب",
      supportTickets: "طلبات الدعم الفني",
      supportType: "النوع",
      supportCategory: "التصنيف",
      supportMessage: "الرسالة",
      ticketNumber: "رقم الطلب",
      supportCreatedAt: "تاريخ الإنشاء",
      supportActions: "إجراء",
      supportView: "عرض",
      supportNoData: "لا توجد طلبات دعم",
      supportScreenshot: "لقطة الشاشة",
      supportReply: "رد الإدارة",
      supportReplyPlaceholder: "اكتب الرد للعميل...",
      supportReplyAction: "إرسال الرد",
      supportStatus: "حالة التذكرة",
      supportStatusOpen: "مفتوحة",
      supportStatusReplied: "تم الرد",
      supportStatusClosed: "مغلقة",
      shopOrders: "طلبات المتجر",
      deliveryOption: "خيار التوصيل",
      discounts: "أكواد الخصم",
      registerTech: "تسجيل فني",
      ordersOverTime: "الطلبات عبر الزمن",
      mostSoldParts: "الأكثر مبيعاً",
      serviceVsShop: "الخدمات مقابل المتجر",
      orderRangeDay: "يومي",
      orderRangeWeek: "أسبوعي",
      orderRangeMonth: "شهري",
      reportRange: "نطاق التاريخ",
      reportType: "نوع التقرير",
      reportTypeSummary: "ملخص",
      reportTypeServices: "الخدمات",
      reportTypeParts: "القطع",
      reportSearch: "بحث",
      reportExportPdf: "تصدير PDF",
      reportExportExcel: "تصدير Excel",
      reportTitle: "تقرير Cycle Care",
      reportGeneratedAt: "تاريخ الإنشاء",
      reportMetric: "المؤشر",
      reportValue: "القيمة",
      reportCount: "العدد",
      reportQuantity: "الكمية",
      reportSummary: "ملخص التقرير",
      reportTotalUsers: "إجمالي المستخدمين",
      reportServiceOrders: "طلبات الخدمة",
      reportShopOrders: "طلبات المتجر",
      reportTotalRevenue: "إجمالي الإيرادات",
      reportServiceRevenue: "إيرادات الخدمة",
      reportShopRevenue: "إيرادات المتجر",
      reportOpenTickets: "تذاكر مفتوحة",
      reportTopServices: "أكثر الخدمات طلباً",
      reportTopParts: "أكثر القطع مبيعاً",
      invoiceType: "نوع الفاتورة",
      invoiceTypeService: "خدمة",
      invoiceTypeShop: "متجر",
    },
    en: {
      title: "Owner Dashboard",
      overview: "Overview",
      overviewSubtitle: "Quick operational snapshot for today.",
      reports: "Reports",
      analytics: "Analytics",
      users: "Users",
      bikes: "Bikes",
      technicians: "Technicians",
      serviceRequests: "Service Requests",
      serviceOrders: "Service Orders",
      userRoles: "User Roles",
      totalUsers: "Total Users",
      totalServiceOrders: "Total Service Orders",
      totalShopOrders: "Total Shop Orders",
      totalRevenue: "Total Revenue",
      openTickets: "Open Tickets",
      totalBikes: "Total Bikes",
      totalTechnicians: "Total Technicians",
      totalRequests: "Total Requests",
      loading: "Loading...",
      error: "An error occurred",
      noData: "No data available",
      email: "Email",
      name: "Name",
      admin: "Admin",
      technician: "Technician",
      joined: "Joined",
      brand: "Brand",
      model: "Model",
      year: "Year",
      bikeType: "Bike Type",
      owner: "Owner",
      rating: "Rating",
      available: "Available",
      approved: "Approved",
      pending: "Pending",
      status: "Status",
      service: "Service",
      client: "Client",
      forbidden: "Forbidden: Admin access required",
      selectUser: "Select User",
      selectRole: "Select Role",
      assignRole: "Assign Role",
      removeRole: "Remove",
      roleAssigned: "Role assigned successfully",
      roleRemoved: "Role removed successfully",
      assignedRoles: "Assigned Roles",
      pendingTechnicians: "Technicians Management",
      liveTechnicians: "Online Technicians",
      liveTechniciansMap: "Live Technician Map",
      lastUpdated: "Last Update",
      approve: "Approve",
      reject: "Reject",
      approveSuccess: "Technician approved successfully",
      rejectSuccess: "Application rejected successfully",
      phoneNumber: "Phone Number",
      experience: "Years of Experience",
      documents: "Documents",
      nationalId: "National ID",
      iban: "IBAN",
      commercialRegister: "Commercial Register",
      location: "Location",
      noDocuments: "No documents",
      invoices: "Invoices",
      invoiceNumber: "Invoice Number",
      orderNumber: "Order Number",
      orderType: "Order Type",
      createdAt: "Created At",
      invoiceDetails: "Invoice Details",
      subtotal: "Subtotal",
      taxRate: "Tax Rate",
      taxAmount: "Tax Amount",
      total: "Total",
      issuedDate: "Issued Date",
      downloadPDF: "Download PDF",
      convoy: "Convoy",
      allConvoys: "All Convoys",
      discountCode: "Discount Code",
      discountValue: "Discount Value",
      discountType: "Type",
      percentage: "Percentage",
      fixed: "Fixed Amount",
      maxUses: "Max Uses",
      expiresAt: "Expires At",
      isActive: "Active",
      parts: "Parts",
      category: "Category",
      price: "Price",
      inStock: "In Stock",
      addPart: "Add Part",
      addCode: "Add Code",
      supportTickets: "Support Tickets",
      supportType: "Type",
      supportCategory: "Category",
      supportMessage: "Message",
      ticketNumber: "Ticket Number",
      supportCreatedAt: "Created",
      supportActions: "Actions",
      supportView: "View",
      supportNoData: "No support tickets yet",
      supportScreenshot: "Screenshot",
      supportReply: "Admin Reply",
      supportReplyPlaceholder: "Write a reply to the customer...",
      supportReplyAction: "Send Reply",
      supportStatus: "Ticket Status",
      supportStatusOpen: "Open",
      supportStatusReplied: "Replied",
      supportStatusClosed: "Closed",
      shopOrders: "Shop Orders",
      deliveryOption: "Delivery Option",
      discounts: "Discount Codes",
      registerTech: "Register Technician",
      ordersOverTime: "Orders Over Time",
      mostSoldParts: "Top Spare Parts",
      serviceVsShop: "Service vs Shop",
      orderRangeDay: "Daily",
      orderRangeWeek: "Weekly",
      orderRangeMonth: "Monthly",
      reportRange: "Date Range",
      reportType: "Report Type",
      reportTypeSummary: "Summary",
      reportTypeServices: "Services",
      reportTypeParts: "Parts",
      reportSearch: "Search",
      reportExportPdf: "Export PDF",
      reportExportExcel: "Export Excel",
      reportTitle: "Cycle Care Report",
      reportGeneratedAt: "Generated At",
      reportMetric: "Metric",
      reportValue: "Value",
      reportCount: "Count",
      reportQuantity: "Quantity",
      reportSummary: "Report Summary",
      reportTotalUsers: "Total Users",
      reportServiceOrders: "Service Orders",
      reportShopOrders: "Shop Orders",
      reportTotalRevenue: "Total Revenue",
      reportServiceRevenue: "Service Revenue",
      reportShopRevenue: "Shop Revenue",
      reportOpenTickets: "Open Tickets",
      reportTopServices: "Most Requested Services",
      reportTopParts: "Top Parts",
      invoiceType: "Invoice Type",
      invoiceTypeService: "Service",
      invoiceTypeShop: "Shop",
    },
  };
  
  const txt = lang === 'ar' ? {
    title: "لوحة تحكم المالك",
    overview: "نظرة عامة",
    overviewSubtitle: "ملخص سريع للأداء والتشغيل اليومي.",
    reports: "التقارير",
    analytics: "التحليلات",
    users: "المستخدمين",
    bikes: "الدراجات",
    technicians: "الفنيين",
    serviceRequests: "طلبات الخدمة",
    serviceOrders: "طلبات الخدمة",
    userRoles: "صلاحيات المستخدمين",
    totalUsers: "إجمالي المستخدمين",
    totalServiceOrders: "إجمالي طلبات الخدمة",
    totalShopOrders: "إجمالي طلبات المتجر",
    totalRevenue: "إجمالي الإيرادات",
    openTickets: "تذاكر مفتوحة",
    totalBikes: "إجمالي الدراجات",
    totalTechnicians: "إجمالي الفنيين",
    totalRequests: "إجمالي الطلبات",
    loading: "جارٍ التحميل...",
    error: "حدث خطأ",
    noData: "لا توجد بيانات",
    email: "البريد الإلكتروني",
    name: "الاسم",
    admin: "مسؤول",
    technician: "فني",
    joined: "انضم في",
    brand: "الماركة",
    model: "الموديل",
    year: "السنة",
    bikeType: "نوع الدراجة",
    owner: "المالك",
    rating: "التقييم",
    available: "متاح",
    approved: "معتمد",
    pending: "قيد الانتظار",
    status: "الحالة",
    service: "الخدمة",
    client: "العميل",
    forbidden: "ممنوع: يتطلب صلاحيات المسؤول",
    selectUser: "اختر مستخدم",
    selectRole: "اختر صلاحية",
    assignRole: "إضافة صلاحية",
    removeRole: "إزالة",
    roleAssigned: "تم إضافة الصلاحية بنجاح",
    roleRemoved: "تم إزالة الصلاحية بنجاح",
    assignedRoles: "الصلاحيات المعينة",
    pendingTechnicians: "إدارة الفنيين",
    liveTechnicians: "الفنيون المتصلون",
    liveTechniciansMap: "خريطة الفنيين المتصلين",
    lastUpdated: "آخر تحديث",
    approve: "موافقة",
    reject: "رفض",
    approveSuccess: "تم الموافقة على الفني بنجاح",
    rejectSuccess: "تم رفض الطلب بنجاح",
    phoneNumber: "رقم الجوال",
    experience: "سنوات الخبرة",
    documents: "المستندات",
    nationalId: "رقم الهوية",
    iban: "رقم الآيبان",
    commercialRegister: "السجل التجاري",
    location: "الموقع",
    noDocuments: "لا توجد مستندات",
    invoices: "الفواتير",
    invoiceNumber: "رقم الفاتورة",
    orderNumber: "رقم الطلب",
    orderType: "نوع الطلب",
    createdAt: "تاريخ الإنشاء",
    invoiceDetails: "تفاصيل الفاتورة",
    subtotal: "المبلغ قبل الضريبة",
    taxRate: "نسبة الضريبة",
    taxAmount: "مبلغ الضريبة",
    total: "الإجمالي",
    issuedDate: "تاريخ الإصدار",
    downloadPDF: "تحميل PDF",
    convoy: "الموكب",
    allConvoys: "كل المواكب",
    discountCode: "كود الخصم",
    discountValue: "قيمة الخصم",
    discountType: "نوع الخصم",
    percentage: "نسبة مئوية",
    fixed: "مبلغ ثابت",
    maxUses: "عدد الاستخدامات",
    expiresAt: "ينتهي في",
    isActive: "مفعل",
    parts: "قطع الغيار",
    category: "التصنيف",
    price: "السعر",
    inStock: "متوفر",
    addPart: "إضافة قطعة",
    addCode: "إضافة كود",
    supportTickets: "طلبات الدعم الفني",
    supportType: "النوع",
    supportCategory: "التصنيف",
    supportMessage: "الرسالة",
    ticketNumber: "رقم الطلب",
    supportCreatedAt: "تاريخ الإنشاء",
    supportActions: "إجراء",
    supportView: "عرض",
    supportNoData: "لا توجد طلبات دعم",
    supportScreenshot: "لقطة الشاشة",
    shopOrders: "طلبات المتجر",
    deliveryOption: "خيار التوصيل",
    discounts: "أكواد الخصم",
    registerTech: "تسجيل فني",
    ordersOverTime: "الطلبات عبر الزمن",
    mostSoldParts: "الأكثر مبيعاً",
    serviceVsShop: "الخدمات مقابل المتجر",
    orderRangeDay: "يومي",
    orderRangeWeek: "أسبوعي",
    orderRangeMonth: "شهري",
    reportRange: "نطاق التاريخ",
    reportType: "نوع التقرير",
    reportTypeSummary: "ملخص",
    reportTypeServices: "الخدمات",
    reportTypeParts: "القطع",
    reportSearch: "بحث",
    reportExportPdf: "تصدير PDF",
    reportExportExcel: "تصدير Excel",
    reportTitle: "تقرير Cycle Care",
    reportGeneratedAt: "تاريخ الإنشاء",
    reportMetric: "المؤشر",
    reportValue: "القيمة",
    reportCount: "العدد",
    reportQuantity: "الكمية",
    reportSummary: "ملخص التقرير",
    reportTotalUsers: "إجمالي المستخدمين",
    reportServiceOrders: "طلبات الخدمة",
    reportShopOrders: "طلبات المتجر",
    reportTotalRevenue: "إجمالي الإيرادات",
    reportServiceRevenue: "إيرادات الخدمة",
    reportShopRevenue: "إيرادات المتجر",
    reportOpenTickets: "تذاكر مفتوحة",
    reportTopServices: "أكثر الخدمات طلباً",
    reportTopParts: "أكثر القطع مبيعاً",
    supportReply: "رد الإدارة",
    supportReplyPlaceholder: "اكتب الرد للعميل...",
    supportReplyAction: "إرسال الرد",
    supportStatus: "حالة التذكرة",
    supportStatusOpen: "مفتوحة",
    supportStatusReplied: "تم الرد",
    supportStatusClosed: "مغلقة",
    invoiceType: "نوع الفاتورة",
    invoiceTypeService: "خدمة",
    invoiceTypeShop: "متجر",
  } : translations['en'];

  const convoys = [
    { id: "convoy-riyadh", name: lang === "ar" ? "موكب الرياض" : "Riyadh Convoy" },
    { id: "convoy-jeddah", name: lang === "ar" ? "موكب جدة" : "Jeddah Convoy" },
    { id: "convoy-dammam", name: lang === "ar" ? "موكب الدمام" : "Dammam Convoy" },
  ];

  const convoyOptions = [
    { id: "all", name: txt.allConvoys },
    ...convoys,
  ];

  const reportTypeOptions = [
    { id: "summary", label: txt.reportTypeSummary },
    { id: "services", label: txt.reportTypeServices },
    { id: "parts", label: txt.reportTypeParts },
  ];

  const [selectedConvoy, setSelectedConvoy] = useState<string>(() => convoyOptions[1]?.id ?? "all");

  const { data: roleInfo, isLoading: rolesInfoLoading } = useQuery<{ isAdmin: boolean; roles: string[] }>({
    queryKey: ["/api/roles/me"],
  });

  const rolesReady = !rolesInfoLoading && !!roleInfo;
  const isAdmin = roleInfo?.isAdmin === true;
  const roleSet = useMemo(() => new Set(roleInfo?.roles ?? []), [roleInfo]);

  const sectionAccess: Record<string, string[]> = {
    overview: ["project_manager", "sales", "marketing", "support"],
    users: ["project_manager"],
    bikes: ["project_manager"],
    technicians: ["project_manager"],
    requests: ["project_manager"],
    "shop-orders": ["sales"],
    "support-tickets": ["support"],
    invoices: ["sales", "project_manager"],
    discounts: ["marketing", "sales"],
    parts: ["sales"],
    roles: ["admin"],
    "register-tech": ["project_manager"],
    reports: ["project_manager", "sales", "marketing"],
  };

  const canViewSection = (key: string) => {
    if (!rolesReady) return true;
    if (isAdmin) return true;
    const allowed = sectionAccess[key] || [];
    return allowed.some((role) => roleSet.has(role));
  };

  const shouldFetchOverview = canViewSection("overview") || canViewSection("reports");
  const shouldFetchUsers = canViewSection("users") || shouldFetchOverview;
  const shouldFetchServiceRequests = canViewSection("requests") || shouldFetchOverview;
  const shouldFetchShopOrders = canViewSection("shop-orders") || shouldFetchOverview;
  const shouldFetchInvoices = canViewSection("invoices") || shouldFetchOverview;
  const shouldFetchSupportTickets = canViewSection("support-tickets") || shouldFetchOverview;

  const navTabs = useMemo(() => ([
    { id: "overview", label: txt.overview, icon: BarChart3 },
    { id: "reports", label: txt.reports, icon: TrendingUp },
    { id: "users", label: txt.users, icon: Users },
    { id: "technicians", label: txt.pendingTechnicians, icon: Wrench },
    { id: "bikes", label: txt.bikes, icon: Bike },
    { id: "requests", label: txt.serviceRequests, icon: ClipboardList },
    { id: "shop-orders", label: txt.shopOrders, icon: Package },
    { id: "support-tickets", label: txt.supportTickets, icon: Headset },
    { id: "invoices", label: txt.invoices, icon: FileText },
    { id: "discounts", label: txt.discounts, icon: Wrench },
    { id: "parts", label: txt.parts, icon: Package },
    { id: "roles", label: txt.userRoles, icon: UserCog },
    { id: "register-tech", label: txt.registerTech, icon: Wrench },
  ]), [txt]);

  const visibleTabs = useMemo(
    () => navTabs.filter((tab) => canViewSection(tab.id)),
    [navTabs, rolesReady, isAdmin, roleSet],
  );

  useEffect(() => {
    if (!visibleTabs.find((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || "overview");
    }
  }, [activeTab, visibleTabs]);

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    retry: false,
    enabled: shouldFetchUsers,
  });

  const { data: bikes, isLoading: bikesLoading } = useQuery<BikeType[]>({
    queryKey: ["/api/admin/bikes"],
    enabled: canViewSection("bikes"),
  });

  const { data: technicians, isLoading: techniciansLoading } = useQuery<TechnicianWithUser[]>({
    queryKey: ["/api/admin/technicians"],
    enabled: canViewSection("technicians"),
  });

  const { data: liveTechnicians, isLoading: liveTechniciansLoading } = useQuery<LiveTechnicianLocation[]>({
    queryKey: ["/api/admin/technicians/locations"],
    enabled: canViewSection("technicians") && activeTab === "technicians",
    refetchInterval: activeTab === "technicians" ? 15000 : false,
    queryFn: async () => {
      try {
        return await apiRequest("/api/admin/technicians/locations", "GET");
      } catch (error) {
        console.error("[ADMIN][TECH][LOC] Failed to fetch", error);
        return [];
      }
    },
  });

  const { data: shopOrders, isLoading: shopOrdersLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    enabled: shouldFetchShopOrders,
  });

  const { data: serviceRequests, isLoading: requestsLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/admin/service-requests"],
    enabled: shouldFetchServiceRequests,
  });

  const { data: supportTickets, isLoading: supportTicketsLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/admin/support-tickets"],
    enabled: shouldFetchSupportTickets,
  });

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: canViewSection("roles"),
  });

  const { data: userRolesData, isLoading: userRolesLoading } = useQuery<UserRole[]>({
    queryKey: ["/api/admin/user-roles"],
    enabled: canViewSection("roles"),
  });

  const pendingTechnicians: TechnicianWithUser[] | undefined = undefined;
  const pendingLoading = false;

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/admin/invoices"],
    refetchOnMount: 'always',
    staleTime: 0,
    enabled: shouldFetchInvoices,
  });

  const { data: parts, isLoading: partsLoading } = useQuery({
    queryKey: ["/api/parts"],
    enabled: canViewSection("parts"),
  });

  const { data: discountCodes, isLoading: discountCodesLoading } = useQuery({
    queryKey: ["/api/admin/discount-codes"],
    enabled: canViewSection("discounts"),
  });

  const safeUsers = Array.isArray(users) ? users : [];
  const safeBikes = Array.isArray(bikes) ? bikes : [];
  const safeTechnicians = Array.isArray(technicians) ? technicians : [];
  const safeLiveTechnicians = Array.isArray(liveTechnicians) ? liveTechnicians : [];
  const safeServiceRequests = Array.isArray(serviceRequests) ? serviceRequests : [];
  const safeSupportTickets = Array.isArray(supportTickets) ? supportTickets : [];
  const safeShopOrders = Array.isArray(shopOrders) ? shopOrders : [];
  const safeUserRoles = Array.isArray(userRolesData) ? userRolesData : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];

  useEffect(() => {
    if (activeTab !== "technicians") return;
    if (safeLiveTechnicians.length === 0) {
      if (selectedLiveTechnicianId) {
        setSelectedLiveTechnicianId(null);
      }
      return;
    }
    const exists = safeLiveTechnicians.some((tech) => tech.id === selectedLiveTechnicianId);
    if (!selectedLiveTechnicianId || !exists) {
      setSelectedLiveTechnicianId(safeLiveTechnicians[0].id);
    }
  }, [activeTab, safeLiveTechnicians, selectedLiveTechnicianId]);

  const selectedLiveTechnician = useMemo(() => {
    if (safeLiveTechnicians.length === 0) return null;
    return safeLiveTechnicians.find((tech) => tech.id === selectedLiveTechnicianId) ?? safeLiveTechnicians[0];
  }, [safeLiveTechnicians, selectedLiveTechnicianId]);

  const normalizedInvoices = safeInvoices.map((invoice: any) => ({
    ...invoice,
    invoiceNumber: invoice.invoiceNumber ?? invoice.invoice_number,
    userId: invoice.userId ?? invoice.user_id,
    serviceRequestId: invoice.serviceRequestId ?? invoice.service_request_id,
    orderId: invoice.orderId ?? invoice.order_id,
    total: Number(invoice.total ?? 0),
    subtotal: Number(invoice.subtotal ?? 0),
    taxRate: Number(invoice.taxRate ?? invoice.tax_rate ?? 0),
    taxAmount: Number(invoice.taxAmount ?? invoice.tax_amount ?? 0),
    issuedDate: invoice.issuedDate ?? invoice.issued_date,
    status: invoice.status,
  }));

  const resolveDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const parseItems = (raw: any) => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const parseTrackingSteps = (raw: any) => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const overviewStats = useMemo(() => {
    const totalUsers = safeUsers.length;
    const totalServiceOrders = safeServiceRequests.length;
    const totalShopOrders = safeShopOrders.length;
    const totalRevenue = normalizedInvoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);
    const openTickets = safeSupportTickets.filter((ticket) => (ticket.status || "open") !== "closed").length;
    return { totalUsers, totalServiceOrders, totalShopOrders, totalRevenue, openTickets };
  }, [safeUsers.length, safeServiceRequests.length, safeShopOrders.length, normalizedInvoices, safeSupportTickets]);

  const orderEvents = useMemo(() => {
    const serviceEvents = safeServiceRequests
      .map((req: any) => ({
        type: "service",
        date: resolveDate(req.createdAt ?? req.created_at),
      }))
      .filter((item) => item.date);
    const shopEvents = safeShopOrders
      .map((order: any) => ({
        type: "shop",
        date: resolveDate(order.createdAt ?? order.created_at),
      }))
      .filter((item) => item.date);
    return [...serviceEvents, ...shopEvents] as { type: "service" | "shop"; date: Date }[];
  }, [safeServiceRequests, safeShopOrders]);

  const ordersChartData = useMemo(() => {
    const formatKey = (date: Date) => {
      if (orderRange === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (orderRange === "week") {
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const diff = (day + 6) % 7;
        weekStart.setDate(weekStart.getDate() - diff);
        return weekStart.toISOString().slice(0, 10);
      }
      return date.toISOString().slice(0, 10);
    };

    const bucketMap = new Map<string, { label: string; service: number; shop: number }>();
    orderEvents.forEach((event) => {
      const key = formatKey(event.date);
      const entry = bucketMap.get(key) || { label: key, service: 0, shop: 0 };
      if (event.type === "service") entry.service += 1;
      else entry.shop += 1;
      bucketMap.set(key, entry);
    });

    return Array.from(bucketMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [orderEvents, orderRange]);

  const topParts = useMemo(() => {
    const counts = new Map<string, number>();
    safeShopOrders.forEach((order: any) => {
      const items = parseItems(order.items ?? order.items_json ?? []);
      items.forEach((item: any) => {
        const name = item.name || item.partName || item.part_id || "Unknown";
        const qty = Number(item.quantity || 0);
        if (!name || qty <= 0) return;
        counts.set(name, (counts.get(name) || 0) + qty);
      });
    });
    return Array.from(counts.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);
  }, [safeShopOrders]);

  const serviceShopSplit = useMemo(
    () => [
      { name: txt.serviceOrders, value: overviewStats.totalServiceOrders, key: "service" },
      { name: txt.shopOrders, value: overviewStats.totalShopOrders, key: "shop" },
    ],
    [overviewStats.totalServiceOrders, overviewStats.totalShopOrders, txt.serviceOrders, txt.shopOrders],
  );

  const formatServiceTypeLabel = (value?: string | null) => {
    const key = (value || "").toLowerCase();
    const labels = {
      maintenance: lang === "ar" ? "صيانة دورية" : "Maintenance",
      repair: lang === "ar" ? "إصلاح" : "Repair",
      parts: lang === "ar" ? "قطع غيار" : "Parts",
    };
    return labels[key as keyof typeof labels] || value || (lang === "ar" ? "غير محدد" : "Unknown");
  };

  const reportSummary = useMemo(() => {
    const start = appliedReportStartDate ? new Date(appliedReportStartDate) : null;
    const end = appliedReportEndDate ? new Date(appliedReportEndDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const withinRange = (value?: string | null) => {
      const date = resolveDate(value || undefined);
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    };

    const totalUsers = safeUsers.length;
    const serviceOrders = safeServiceRequests.filter((req: any) =>
      withinRange(req.createdAt ?? req.created_at),
    );
    const shopOrders = safeShopOrders.filter((order: any) =>
      withinRange(order.createdAt ?? order.created_at),
    );
    const invoicesInRange = normalizedInvoices.filter((invoice: any) =>
      withinRange(invoice.issuedDate ?? invoice.createdAt ?? invoice.created_at),
    );
    const serviceRevenue = invoicesInRange
      .filter((invoice: any) => !!invoice.serviceRequestId)
      .reduce((sum: number, invoice: any) => sum + (Number(invoice.total) || 0), 0);
    const shopRevenue = invoicesInRange
      .filter((invoice: any) => !!invoice.orderId && !invoice.serviceRequestId)
      .reduce((sum: number, invoice: any) => sum + (Number(invoice.total) || 0), 0);
    const totalRevenue = serviceRevenue + shopRevenue;
    const openTickets = safeSupportTickets.filter((ticket) =>
      (ticket.status || "open") !== "closed" && withinRange(ticket.created_at ?? ticket.createdAt),
    ).length;

    const serviceCounts = new Map<string, number>();
    serviceOrders.forEach((req: any) => {
      const key = req.serviceType || req.service_type || "Unknown";
      serviceCounts.set(key, (serviceCounts.get(key) || 0) + 1);
    });
    const topServices = Array.from(serviceCounts.entries())
      .map(([name, count]) => ({ name: formatServiceTypeLabel(name), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const partCounts = new Map<string, number>();
    shopOrders.forEach((order: any) => {
      const items = parseItems(order.items ?? order.items_json ?? []);
      items.forEach((item: any) => {
        const name = item.name || item.partName || item.part_id || "Unknown";
        const qty = Number(item.quantity || 0);
        if (!name || qty <= 0) return;
        partCounts.set(name, (partCounts.get(name) || 0) + qty);
      });
    });
    const topReportParts = Array.from(partCounts.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      totalUsers,
      serviceOrders: serviceOrders.length,
      shopOrders: shopOrders.length,
      serviceRevenue,
      shopRevenue,
      totalRevenue,
      openTickets,
      topServices,
      topReportParts,
    };
  }, [appliedReportStartDate, appliedReportEndDate, normalizedInvoices, safeServiceRequests, safeShopOrders, safeSupportTickets, safeUsers.length, lang]);

  const shouldShowServicesReport =
    appliedReportType === "summary" || appliedReportType === "services";
  const shouldShowPartsReport =
    appliedReportType === "summary" || appliedReportType === "parts";

  const formatReportDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildReportSummaryRows = () => ([
    { label: txt.reportTotalUsers, value: reportSummary.totalUsers },
    { label: txt.reportServiceOrders, value: reportSummary.serviceOrders },
    { label: txt.reportShopOrders, value: reportSummary.shopOrders },
    { label: txt.reportServiceRevenue, value: formatCurrency(reportSummary.serviceRevenue) },
    { label: txt.reportShopRevenue, value: formatCurrency(reportSummary.shopRevenue) },
    { label: txt.reportTotalRevenue, value: formatCurrency(reportSummary.totalRevenue) },
    { label: txt.reportOpenTickets, value: reportSummary.openTickets },
  ]);

  const buildReportTypeLabel = () =>
    reportTypeOptions.find((option) => option.id === appliedReportType)?.label ?? txt.reportTypeSummary;

  const buildReportRangeLabel = () =>
    `${formatReportDate(appliedReportStartDate)} - ${formatReportDate(appliedReportEndDate)}`;

  const buildReportMeta = () => ({
    range: buildReportRangeLabel(),
    type: buildReportTypeLabel(),
    generatedAt: new Date().toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  });

  const handleExportExcel = () => {
    const summaryRows = buildReportSummaryRows();
    const meta = buildReportMeta();
    const rows: Array<Array<string | number>> = [];
    const merges: XLSX.Range[] = [];
    const pushMergedRow = (value: string) => {
      const rowIndex = rows.length;
      rows.push([value, ""]);
      merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 1 } });
    };

    pushMergedRow(txt.reportTitle);
    rows.push([]);
    rows.push([txt.reportRange, meta.range]);
    rows.push([txt.reportType, meta.type]);
    rows.push([txt.reportGeneratedAt, meta.generatedAt]);
    rows.push([]);
    pushMergedRow(txt.reportSummary);
    rows.push([txt.reportMetric, txt.reportValue]);
    summaryRows.forEach((row) => rows.push([String(row.label), row.value]));

    if (shouldShowServicesReport) {
      rows.push([]);
      pushMergedRow(txt.reportTopServices);
      rows.push([txt.reportMetric, txt.reportCount]);
      if (reportSummary.topServices.length === 0) {
        rows.push([txt.noData, "-"]);
      } else {
        reportSummary.topServices.forEach((service) => {
          rows.push([String(service.name), service.count]);
        });
      }
    }

    if (shouldShowPartsReport) {
      rows.push([]);
      pushMergedRow(txt.reportTopParts);
      rows.push([txt.reportMetric, txt.reportQuantity]);
      if (reportSummary.topReportParts.length === 0) {
        rows.push([txt.noData, "-"]);
      } else {
        reportSummary.topReportParts.forEach((part) => {
          rows.push([String(part.name), part.quantity]);
        });
      }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!merges"] = merges;
    worksheet["!cols"] = [{ wch: 34 }, { wch: 26 }];

    if (worksheet.A1) {
      worksheet.A1.s = {
        font: { bold: true, sz: 14, color: { rgb: "E86A4B" } },
      };
    }

    const workbook = XLSX.utils.book_new();
    workbook.Workbook = { Views: [{ RTL: lang === "ar" }] };
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    const fileName = `CycleCare-Report-${appliedReportStartDate || "all"}-${appliedReportEndDate || "all"}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const renderReportHtmlToPdf = async () => {
    if (typeof document === "undefined") {
      throw new Error("PDF rendering requires document access.");
    }

    const loadImageAsDataUrl = async (src: string) => {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn("[REPORT][PDF] Failed to load logo", error);
        return null;
      }
    };

    const summaryRows = buildReportSummaryRows();
    const meta = buildReportMeta();
    const isArabic = lang === "ar";
    const alignStart = isArabic ? "right" : "left";
    const alignEnd = isArabic ? "left" : "right";
    const logoDataUrl = await loadImageAsDataUrl(logoImage);
    const logoBlock = logoDataUrl
      ? `<img src="${logoDataUrl}" alt="Cycle Care" style="width:50px; height:50px; object-fit:contain;" />`
      : "";

    const summaryRowsHtml = summaryRows
      .map((row, index) => `
        <tr style="background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
          <td style="padding:8px 12px; text-align:${alignStart}; color:#374151;">${escapeHtml(String(row.label))}</td>
          <td style="padding:8px 12px; text-align:${alignEnd}; font-weight:600; color:#111111;">${escapeHtml(String(row.value))}</td>
        </tr>
      `)
      .join("");

    const servicesRowsHtml = reportSummary.topServices.length === 0
      ? `<tr><td colspan="2" style="padding:10px 12px; text-align:center; color:#6b7280;">${escapeHtml(txt.noData)}</td></tr>`
      : reportSummary.topServices
          .map((service, index) => `
            <tr style="background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
              <td style="padding:8px 12px; text-align:${alignStart}; color:#374151;">${escapeHtml(String(service.name))}</td>
              <td style="padding:8px 12px; text-align:${alignEnd}; font-weight:600; color:#111111;">${escapeHtml(String(service.count))}</td>
            </tr>
          `)
          .join("");

    const partsRowsHtml = reportSummary.topReportParts.length === 0
      ? `<tr><td colspan="2" style="padding:10px 12px; text-align:center; color:#6b7280;">${escapeHtml(txt.noData)}</td></tr>`
      : reportSummary.topReportParts
          .map((part, index) => `
            <tr style="background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
              <td style="padding:8px 12px; text-align:${alignStart}; color:#374151;">${escapeHtml(String(part.name))}</td>
              <td style="padding:8px 12px; text-align:${alignEnd}; font-weight:600; color:#111111;">${escapeHtml(String(part.quantity))}</td>
            </tr>
          `)
          .join("");

    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-10000px";
    wrapper.style.top = "0";
    wrapper.style.width = "794px";
    wrapper.style.background = "#ffffff";
    wrapper.style.color = "#111111";
    wrapper.style.direction = isArabic ? "rtl" : "ltr";
    wrapper.style.fontFamily = "'Tajawal','Inter',sans-serif";

    wrapper.innerHTML = `
      <div style="padding:32px 36px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; border:1px solid #f3d6cc; background:#fdf1ec; border-radius:16px; padding:16px 18px;">
          <div style="display:flex; align-items:center; gap:12px;">
            ${logoBlock}
            <div>
              <div style="font-size:18px; font-weight:700; color:#E86A4B;">Cycle Care</div>
              <div style="font-size:12px; color:#6b7280;">${escapeHtml(txt.reports)}</div>
            </div>
          </div>
          <div style="text-align:${alignEnd}; font-size:12px; color:#374151; min-width:220px;">
            <div style="font-size:14px; font-weight:700; color:#111111;">${escapeHtml(txt.reportTitle)}</div>
            <div style="margin-top:4px;">${escapeHtml(txt.reportRange)}: <span style="font-weight:600;">${escapeHtml(meta.range)}</span></div>
            <div style="margin-top:4px;">${escapeHtml(txt.reportType)}: <span style="font-weight:600;">${escapeHtml(meta.type)}</span></div>
            <div style="margin-top:4px;">${escapeHtml(txt.reportGeneratedAt)}: <span style="font-weight:600;">${escapeHtml(meta.generatedAt)}</span></div>
          </div>
        </div>

        <div style="margin-top:22px;">
          <div style="font-size:14px; font-weight:700; color:#E86A4B; margin-bottom:8px;">${escapeHtml(txt.reportSummary)}</div>
          <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #e5e7eb;">
            <thead>
              <tr style="background:#E86A4B; color:#ffffff;">
                <th style="padding:9px 12px; text-align:${alignStart};">${escapeHtml(txt.reportMetric)}</th>
                <th style="padding:9px 12px; text-align:${alignEnd};">${escapeHtml(txt.reportValue)}</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRowsHtml}
            </tbody>
          </table>
        </div>

        ${shouldShowServicesReport ? `
          <div style="margin-top:20px;">
            <div style="font-size:14px; font-weight:700; color:#3B9B9B; margin-bottom:8px;">${escapeHtml(txt.reportTopServices)}</div>
            <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #e5e7eb;">
              <thead>
                <tr style="background:#3B9B9B; color:#ffffff;">
                  <th style="padding:9px 12px; text-align:${alignStart};">${escapeHtml(txt.reportMetric)}</th>
                  <th style="padding:9px 12px; text-align:${alignEnd};">${escapeHtml(txt.reportCount)}</th>
                </tr>
              </thead>
              <tbody>
                ${servicesRowsHtml}
              </tbody>
            </table>
          </div>
        ` : ""}

        ${shouldShowPartsReport ? `
          <div style="margin-top:20px;">
            <div style="font-size:14px; font-weight:700; color:#3B9B9B; margin-bottom:8px;">${escapeHtml(txt.reportTopParts)}</div>
            <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #e5e7eb;">
              <thead>
                <tr style="background:#3B9B9B; color:#ffffff;">
                  <th style="padding:9px 12px; text-align:${alignStart};">${escapeHtml(txt.reportMetric)}</th>
                  <th style="padding:9px 12px; text-align:${alignEnd};">${escapeHtml(txt.reportQuantity)}</th>
                </tr>
              </thead>
              <tbody>
                ${partsRowsHtml}
              </tbody>
            </table>
          </div>
        ` : ""}

        <div style="margin-top:24px; text-align:center; font-size:10px; color:#9ca3af;">
          Cycle Care • Riyadh, KSA
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = await html2canvas(wrapper, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });

    wrapper.remove();

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(`CycleCare-Report-${appliedReportStartDate || "all"}-${appliedReportEndDate || "all"}.pdf`);
  };

  const handleExportPdf = async () => {
    try {
      await renderReportHtmlToPdf();
    } catch (error) {
      console.error("Report PDF rendering failed:", error);
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      let y = 40;
      doc.setFontSize(16);
      doc.text(txt.reportTitle, 40, y);
      y += 18;
      doc.setFontSize(11);
      doc.text(`${txt.reportRange}: ${buildReportRangeLabel()}`, 40, y);
      y += 18;
      buildReportSummaryRows().forEach((row) => {
        doc.text(`${row.label}: ${row.value}`, 40, y);
        y += 16;
      });
      doc.save(`CycleCare-Report-${appliedReportStartDate || "all"}-${appliedReportEndDate || "all"}.pdf`);
    }
  };

  const mockConvoyInvoices: InvoiceWithConvoy[] = [
    {
      id: "mock-invoice-1",
      invoiceNumber: "INV-2024-1101",
      userId: "mock-user-1",
      serviceRequestId: null,
      subtotal: "280.00",
      taxRate: "15",
      taxAmount: "42.00",
      total: "322.00",
      description: "Periodic maintenance",
      items: [{ name: "Periodic maintenance", quantity: 1, unitPrice: 280, total: 280 }],
      status: "paid",
      issuedDate: new Date(),
      dueDate: null,
      paidDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      convoyId: convoys[0]?.id,
      convoyName: convoys[0]?.name,
    },
    {
      id: "mock-invoice-2",
      invoiceNumber: "INV-2024-1102",
      userId: "mock-user-2",
      serviceRequestId: null,
      subtotal: "190.00",
      taxRate: "15",
      taxAmount: "28.50",
      total: "218.50",
      description: "Emergency repair",
      items: [{ name: "Emergency repair", quantity: 1, unitPrice: 190, total: 190 }],
      status: "issued",
      issuedDate: new Date(),
      dueDate: null,
      paidDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      convoyId: convoys[1]?.id,
      convoyName: convoys[1]?.name,
    },
    {
      id: "mock-invoice-3",
      invoiceNumber: "INV-2024-1103",
      userId: "mock-user-3",
      serviceRequestId: null,
      subtotal: "350.00",
      taxRate: "15",
      taxAmount: "52.50",
      total: "402.50",
      description: "Delivery + service",
      items: [
        { name: "Service", quantity: 1, unitPrice: 300, total: 300 },
        { name: "Delivery", quantity: 1, unitPrice: 50, total: 50 },
      ],
      status: "paid",
      issuedDate: new Date(),
      dueDate: null,
      paidDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      convoyId: convoys[2]?.id,
      convoyName: convoys[2]?.name,
    },
  ];

  const convoyInvoices: InvoiceWithConvoy[] = normalizedInvoices.length
    ? normalizedInvoices.map((invoice: any, index) => {
        const convoy = convoys[index % convoys.length];
        return {
          ...invoice,
          convoyId: convoy?.id,
          convoyName: convoy?.name,
        };
      })
    : mockConvoyInvoices;

  const filteredInvoices =
    selectedConvoy === "all"
      ? convoyInvoices
      : convoyInvoices.filter((invoice) => invoice.convoyId === selectedConvoy);
  const safeParts = Array.isArray(parts as any) ? (parts as any) : [];
  const normalizedParts = safeParts.map((part: any) => ({
    ...part,
    nameEn: part.nameEn ?? part.name_en ?? part.name,
    inStock: part.inStock ?? part.in_stock ?? false,
    imageUrl: part.imageUrl ?? part.image_url ?? null,
  }));
  const safeDiscountCodes = Array.isArray(discountCodes as any) ? (discountCodes as any) : [];

  const normalizedTechnicians = safeTechnicians.map(normalizeTechnician);
  const pendingList = normalizedTechnicians.filter((t) => t.status === "pending");
  const activeList = normalizedTechnicians.filter((t) => t.status === "approved" && (t.is_active ?? true));
  const inactiveList = normalizedTechnicians.filter((t) => t.status === "rejected" || t.is_active === false);

  const getErrorMessage = (error: unknown, fallbackAr: string, fallbackEn: string): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as any).message);
    }
    return lang === 'ar' ? fallbackAr : fallbackEn;
  };

  const getSupportMessagePreview = (message?: string | null) => {
    const text = (message || "").trim();
    if (!text) return "-";
    if (text.length <= 80) return text;
    return `${text.slice(0, 80)}...`;
  };

  const formatSupportDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  };

  const formatOrderDate = (value?: string | Date | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US");
  };

  const formatCurrency = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    return `${safeValue.toFixed(2)} ${lang === "ar" ? "ر.س" : "SAR"}`;
  };

  const handleRunReport = () => {
    setAppliedReportStartDate(reportStartDate);
    setAppliedReportEndDate(reportEndDate);
    setAppliedReportType(reportType);
  };

  const renderOrderItems = (items: any[]) => {
    if (!Array.isArray(items) || items.length === 0) {
      return <p className="text-sm text-muted-foreground">{txt.noData}</p>;
    }
    return (
      <div className="space-y-2">
        {items.map((item: any, index: number) => (
          <div key={`${item.name || item.partId || index}`} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {item.feeType === "delivery"
                ? lang === "ar"
                  ? "رسوم التوصيل"
                  : "Delivery fee"
                : item.feeType === "installation"
                ? lang === "ar"
                  ? "رسوم التركيب"
                  : "Installation fee"
                : item.name || item.partName || item.part_id || "-"}
            </span>
            <span>{formatCurrency(Number(item.total || 0))}</span>
          </div>
        ))}
      </div>
    );
  };

  const approveTechnicianMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      return await apiRequest(`/api/admin/technicians/${technicianId}/approve`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians"] });
      toast({
        title: txt.approveSuccess,
      });
    },
    onError: (error: unknown) => {
      console.error("Approve error:", error);
      const errorMessage = getErrorMessage(error, 'فشل في الموافقة على الفني', 'Failed to approve technician');
      toast({
        title: lang === 'ar' ? 'خطأ في الموافقة' : 'Approval Error',
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const rejectTechnicianMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      return await apiRequest(`/api/admin/technicians/${technicianId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/locations"] });
      toast({
        title: txt.rejectSuccess,
      });
    },
    onError: (error: unknown) => {
      console.error("Reject error:", error);
      const errorMessage = getErrorMessage(error, 'فشل في رفض الطلب', 'Failed to reject application');
      toast({
        title: lang === 'ar' ? 'خطأ في الرفض' : 'Rejection Error',
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const suspendTechnicianMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      return await apiRequest(`/api/admin/technicians/${technicianId}/suspend`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/locations"] });
      toast({ title: lang === 'ar' ? 'تم إيقاف الفني' : 'Technician suspended' });
    },
  });

  const reactivateTechnicianMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      return await apiRequest(`/api/admin/technicians/${technicianId}/reactivate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/locations"] });
      toast({ title: lang === 'ar' ? 'تم تفعيل الفني' : 'Technician reactivated' });
    },
  });

  const deleteTechnicianMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      return await apiRequest(`/api/admin/technicians/${technicianId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/locations"] });
      toast({ title: lang === 'ar' ? 'تم حذف الفني' : 'Technician deleted' });
    },
    onError: () => {
      toast({ title: txt.error, variant: "destructive" });
    },
  });

  const handleTechnicianAction = (
    action: "approve" | "reject" | "suspend" | "reactivate" | "delete",
    technicianId?: string | null,
  ) => {
    if (!technicianId) return;
    const messages = {
      approve: lang === "ar" ? "هل تريد اعتماد الفني؟" : "Approve this technician?",
      reject: lang === "ar" ? "هل تريد رفض طلب الفني؟" : "Reject this application?",
      suspend: lang === "ar" ? "هل تريد إيقاف الفني مؤقتًا؟" : "Suspend this technician?",
      reactivate: lang === "ar" ? "هل تريد إعادة تفعيل الفني؟" : "Reactivate this technician?",
      delete: lang === "ar" ? "هل تريد حذف الفني نهائيًا؟" : "Delete this technician permanently?",
    };
    if (!confirm(messages[action])) return;
    if (action === "approve") return approveTechnicianMutation.mutate(technicianId);
    if (action === "reject") return rejectTechnicianMutation.mutate(technicianId);
    if (action === "suspend") return suspendTechnicianMutation.mutate(technicianId);
    if (action === "reactivate") return reactivateTechnicianMutation.mutate(technicianId);
    if (action === "delete") return deleteTechnicianMutation.mutate(technicianId);
  };

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      return await apiRequest("/api/admin/user-roles", "POST", { userId, roleId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-roles"] });
      toast({
        title: txt.roleAssigned,
      });
      setSelectedUser("");
      setSelectedRole("");
    },
    onError: (error: any) => {
      const isDuplicate = error.message?.includes("already has this role");
      toast({
        title: isDuplicate 
          ? (lang === 'ar' ? "المستخدم لديه هذه الصلاحية بالفعل" : "User already has this role") 
          : txt.error,
        variant: "destructive",
      });
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: async (userRoleId: string) => {
      return await apiRequest(`/api/admin/user-roles/${userRoleId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-roles"] });
      toast({
        title: txt.roleRemoved,
      });
    },
    onError: () => {
      toast({
        title: txt.error,
        variant: "destructive",
      });
    },
  });

  const createDiscountCodeMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/admin/discount-codes", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discount-codes"] });
      toast({ title: lang === 'ar' ? "تم إنشاء الكود بنجاح" : "Discount code created successfully" });
    },
    onError: () => {
      toast({ title: txt.error, variant: "destructive" });
    },
  });

  const createPartMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/parts", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      toast({ title: lang === 'ar' ? "تمت إضافة القطعة بنجاح" : "Part added successfully" });
    },
    onError: () => {
      toast({ title: txt.error, variant: "destructive" });
    },
  });

  const createTechnicianMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/technicians", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians/pending"] });
      toast({ title: lang === 'ar' ? "تم تسجيل الفني بنجاح" : "Technician registered successfully" });
    },
    onError: () => {
      toast({ title: txt.error, variant: "destructive" });
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: async (partId: string) => {
      return await apiRequest(`/api/admin/parts/${partId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      toast({ title: lang === 'ar' ? "تم حذف القطعة بنجاح" : "Part deleted successfully" });
    },
    onError: () => {
      toast({ title: txt.error, variant: "destructive" });
    },
  });

  const togglePartStockMutation = useMutation({
    mutationFn: async ({ partId, inStock }: { partId: string; inStock: boolean }) => {
      return await apiRequest(`/api/admin/parts/${partId}`, "PATCH", { inStock });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      toast({ title: lang === 'ar' ? "تم تحديث حالة التوفر" : "Stock status updated" });
    },
    onError: () => {
      toast({ title: txt.error, variant: "destructive" });
    },
  });

  const editPartMutation = useMutation({
    mutationFn: async ({ partId, price, category }: { partId: string; price?: number; category?: string }) => {
      const updateData: any = {};
      if (price !== undefined) updateData.price = price;
      if (category !== undefined) updateData.category = category;
      return await apiRequest(`/api/admin/parts/${partId}`, "PATCH", updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      setEditingPartId(null);
      setEditingPrice("");
      setEditingCategory("");
      toast({ title: lang === 'ar' ? "تم تحديث القطعة بنجاح" : "Part updated successfully" });
    },
    onError: () => {
      toast({ title: txt.error, variant: "destructive" });
    },
  });

  const handleStartEdit = (part: any) => {
    setEditingPartId(part.id);
    setEditingPrice(part.price?.toString() || "");
    setEditingCategory(part.category || "");
  };

  const handleSaveEdit = () => {
    if (!editingPartId) return;
    editPartMutation.mutate({
      partId: editingPartId,
      price: editingPrice ? parseFloat(editingPrice) : undefined,
      category: editingCategory || undefined,
    });
  };

  const handleCancelEdit = () => {
    setEditingPartId(null);
    setEditingPrice("");
    setEditingCategory("");
  };

  const updateSupportStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      return await apiRequest(`/api/admin/support-tickets/${ticketId}/status`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-tickets"] });
      toast({
        title: lang === "ar" ? "تم تحديث الحالة" : "Status updated",
      });
    },
    onError: () => {
      toast({
        title: txt.error,
        variant: "destructive",
      });
    },
  });

  const replySupportMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      return await apiRequest(`/api/admin/support-tickets/${ticketId}/reply`, "POST", { message });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-tickets"] });
      setSupportReplyDrafts((prev) => ({ ...prev, [variables.ticketId]: "" }));
      toast({
        title: lang === "ar" ? "تم إرسال الرد" : "Reply sent",
      });
    },
    onError: () => {
      toast({
        title: txt.error,
        variant: "destructive",
      });
    },
  });

  const handleUploadPartImage = async (partId: string, file: File) => {
    setUploadingPartImage(partId);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetchWithFirebaseAuth(buildApiUrl(`/api/admin/parts/${partId}/image`), {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || "Failed to upload image");
      }

      const data = await response.json();
      const imageUrl = data?.imageUrl || data?.image_url;
      const cacheBusted = imageUrl ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}t=${Date.now()}` : null;

      if (cacheBusted) {
        queryClient.setQueryData<any[]>(["/api/parts"], (old) => {
          if (!old) return old;
          return old.map((p) =>
            p.id === partId ? { ...p, image_url: cacheBusted, imageUrl: cacheBusted } : p
          );
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      toast({ 
        title: lang === 'ar' ? "تم رفع الصورة بنجاح" : "Image uploaded successfully" 
      });
      return data;
    } catch (error) {
      console.error("Image upload error:", error);
      toast({
        title: lang === 'ar' ? "فشل في رفع الصورة" : "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setUploadingPartImage(null);
    }
  };

  const handleCreatePartWithImage = async () => {
    const name = (document.getElementById('part-name') as HTMLInputElement)?.value;
    const category = (document.getElementById('part-category-hidden') as HTMLInputElement)?.value;
    const price = (document.getElementById('part-price') as HTMLInputElement)?.value;
    const inStock = (document.getElementById('part-instock') as HTMLInputElement)?.checked ?? true;
    
    if (!name || !category || !price) {
      toast({ 
        title: lang === 'ar' ? "يرجى ملء جميع الحقول" : "Please fill all fields",
        variant: "destructive"
      });
      return;
    }

    try {
      if (!newPartImage) {
        await apiRequest("/api/admin/parts", "POST", {
          name,
          nameEn: name,
          category,
          price,
          inStock,
        });

        queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
        toast({ title: lang === 'ar' ? "تمت إضافة القطعة بنجاح" : "Part added successfully" });
        
        (document.getElementById('part-name') as HTMLInputElement).value = '';
        (document.getElementById('part-category-hidden') as HTMLInputElement).value = '';
        (document.getElementById('part-price') as HTMLInputElement).value = '';
        setNewPartImage(null);
        return;
      }

      const formData = new FormData();
      formData.append("name", name);
      formData.append("nameEn", name);
      formData.append("category", category);
      formData.append("price", price);
      formData.append("inStock", inStock.toString());
      
      formData.append("image", newPartImage);

      const response = await fetchWithFirebaseAuth(buildApiUrl("/api/admin/parts"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Part creation failed:", response.status, errorData);
        throw new Error(errorData.message || `Failed: ${response.status}`);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      toast({ title: lang === 'ar' ? "تمت إضافة القطعة بنجاح" : "Part added successfully" });
      
      // Reset form
      (document.getElementById('part-name') as HTMLInputElement).value = '';
      (document.getElementById('part-category-hidden') as HTMLInputElement).value = '';
      (document.getElementById('part-price') as HTMLInputElement).value = '';
      setNewPartImage(null);
    } catch (error) {
      console.error("Create part error:", error);
      toast({ title: txt.error, variant: "destructive" });
    }
  };

  const handleAssignRole = () => {
    if (selectedUser && selectedRole) {
      assignRoleMutation.mutate({ userId: selectedUser, roleId: selectedRole });
    }
  };

  // Check if user has admin access (proper HTTP status check)
  if (usersError) {
    const isForbidden = (usersError as any).status === 403 || 
                        (usersError as any).message?.toLowerCase().includes("forbidden") ||
                        (usersError as any).message?.includes("403");
    
    if (isForbidden) {
      return (
        <div className="flex items-center justify-center min-h-screen p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Shield className="w-5 h-5" />
                {txt.forbidden}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground" data-testid="title-admin-dashboard">
                {txt.title}
              </h1>
              <p className="text-sm text-muted-foreground">{txt.overviewSubtitle}</p>
            </div>
          </div>
        </div>

        {/* Admin Sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col md:flex-row gap-4">
            <TabsList className="flex flex-col h-auto md:w-64 gap-1">
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="w-full justify-start" data-testid={`tab-${tab.id}`}>
                  <tab.icon className="w-4 h-4 mr-2" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex-1">

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border border-border/60 bg-gradient-to-br from-primary/10 via-background to-background">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{txt.totalUsers}</CardTitle>
                  <Users className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="stat-total-users">
                    {usersLoading ? txt.loading : overviewStats.totalUsers}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-border/60 bg-gradient-to-br from-emerald-500/10 via-background to-background">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{txt.totalServiceOrders}</CardTitle>
                  <ClipboardList className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {requestsLoading ? txt.loading : overviewStats.totalServiceOrders}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-border/60 bg-gradient-to-br from-blue-500/10 via-background to-background">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{txt.totalShopOrders}</CardTitle>
                  <Package className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {shopOrdersLoading ? txt.loading : overviewStats.totalShopOrders}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-border/60 bg-gradient-to-br from-amber-500/10 via-background to-background">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{txt.totalRevenue}</CardTitle>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(overviewStats.totalRevenue)}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-border/60 bg-gradient-to-br from-rose-500/10 via-background to-background">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{txt.openTickets}</CardTitle>
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {supportTicketsLoading ? txt.loading : overviewStats.openTickets}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-lg">{txt.ordersOverTime}</CardTitle>
                    <p className="text-sm text-muted-foreground">{txt.analytics}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(["day", "week", "month"] as const).map((range) => (
                      <Button
                        key={range}
                        size="sm"
                        variant={orderRange === range ? "default" : "outline"}
                        onClick={() => setOrderRange(range)}
                      >
                        {range === "day" ? txt.orderRangeDay : range === "week" ? txt.orderRangeWeek : txt.orderRangeMonth}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  {ordersChartData.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-10">{txt.noData}</div>
                  ) : (
                    <ChartContainer
                      config={{
                        service: { label: txt.serviceOrders, color: "hsl(var(--chart-1))" },
                        shop: { label: txt.shopOrders, color: "hsl(var(--chart-2))" },
                      }}
                    >
                      <LineChart data={ordersChartData} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                        <Line type="monotone" dataKey="service" stroke="var(--color-service)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="shop" stroke="var(--color-shop)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{txt.serviceVsShop}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        service: { label: txt.serviceOrders, color: "hsl(var(--chart-1))" },
                        shop: { label: txt.shopOrders, color: "hsl(var(--chart-2))" },
                      }}
                    >
                      <RePieChart>
                        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                        <Pie data={serviceShopSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>
                          {serviceShopSplit.map((entry) => (
                            <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
                          ))}
                        </Pie>
                      </RePieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{txt.mostSoldParts}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {topParts.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-6">{txt.noData}</div>
                    ) : (
                      <ChartContainer config={{ quantity: { label: txt.mostSoldParts, color: "hsl(var(--chart-3))" } }}>
                        <BarChart data={topParts} margin={{ left: 8, right: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="quantity" fill="var(--color-quantity)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.reportRange}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{lang === "ar" ? "من" : "From"}</span>
                    <Input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{lang === "ar" ? "إلى" : "To"}</span>
                    <Input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">{txt.reportType}</span>
                    <Select value={reportType} onValueChange={(value) => setReportType(value as any)}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {reportTypeOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleRunReport} className="gap-2">
                    <MessageSquare className="w-4 h-4" />
                    {txt.reportSearch}
                  </Button>
                  <Button variant="outline" onClick={handleExportPdf} className="gap-2">
                    <Download className="w-4 h-4" />
                    {txt.reportExportPdf}
                  </Button>
                  <Button variant="outline" onClick={handleExportExcel} className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    {txt.reportExportExcel}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{txt.reportSummary}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm text-muted-foreground">{txt.reportTotalUsers}</p>
                    <p className="text-xl font-semibold">{reportSummary.totalUsers}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm text-muted-foreground">{txt.reportServiceOrders}</p>
                    <p className="text-xl font-semibold">{reportSummary.serviceOrders}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm text-muted-foreground">{txt.reportShopOrders}</p>
                    <p className="text-xl font-semibold">{reportSummary.shopOrders}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm text-muted-foreground">{txt.reportTotalRevenue}</p>
                    <p className="text-xl font-semibold text-primary">{formatCurrency(reportSummary.totalRevenue)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm text-muted-foreground">{txt.reportServiceRevenue}</p>
                    <p className="text-xl font-semibold">{formatCurrency(reportSummary.serviceRevenue)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm text-muted-foreground">{txt.reportShopRevenue}</p>
                    <p className="text-xl font-semibold">{formatCurrency(reportSummary.shopRevenue)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm text-muted-foreground">{txt.reportOpenTickets}</p>
                    <p className="text-xl font-semibold">{reportSummary.openTickets}</p>
                  </div>
                </div>

                {shouldShowServicesReport ? (
                  <div className="rounded-lg border border-border/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{txt.reportTopServices}</h3>
                    </div>
                    {reportSummary.topServices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{txt.noData}</p>
                    ) : (
                      <div className="space-y-2">
                        {reportSummary.topServices.map((service) => (
                          <div key={service.name} className="flex items-center justify-between text-sm">
                            <span>{service.name}</span>
                            <span className="font-medium">{service.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {shouldShowPartsReport ? (
                  <div className="rounded-lg border border-border/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{txt.reportTopParts}</h3>
                    </div>
                    {reportSummary.topReportParts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{txt.noData}</p>
                    ) : (
                      <div className="space-y-2">
                        {reportSummary.topReportParts.map((part) => (
                          <div key={part.name} className="flex items-center justify-between text-sm">
                            <span>{part.name}</span>
                            <span className="font-medium">{part.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.users}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {usersLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : !users || users.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div className="space-y-3">
                      {safeUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`user-item-${user.id}`}
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-sm text-muted-foreground">{user.email || (lang === 'ar' ? 'غير محدد' : 'Not provided')}</p>
                            {(() => {
                              const removedAt =
                                (user as any).technicianRemovedAt ??
                                (user as any).technician_removed_at ??
                                null;
                              if (!removedAt) return null;
                              return (
                                <p className="text-xs font-semibold text-destructive">
                                  {lang === "ar"
                                    ? `فني سابق - تم الحذف في ${formatSupportDate(removedAt)}`
                                    : `Former technician - removed on ${formatSupportDate(removedAt)}`}
                                </p>
                              );
                            })()}
                          </div>
                          <div className="flex gap-2">
                            {user.isAdmin === true && (
                              <Badge variant="default" data-testid={`badge-admin-${user.id}`}>
                                {txt.admin}
                              </Badge>
                            )}
                            {user.isTechnician && (
                              <Badge variant="secondary" data-testid={`badge-tech-${user.id}`}>
                                {txt.technician}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bikes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.bikes}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {bikesLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : !bikes || bikes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div
                      className="w-full overflow-x-auto touch-pan-x overscroll-x-contain -mx-4 px-4 md:mx-0 md:px-0"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      <Table className="min-w-[640px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{txt.bikeType}</TableHead>
                            <TableHead>{txt.brand}</TableHead>
                            <TableHead>{txt.model}</TableHead>
                            <TableHead>{txt.owner}</TableHead>
                            <TableHead>{txt.createdAt}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safeBikes.map((bike: any) => {
                            const ownerName =
                              bike.ownerName ??
                              bike.ownerEmail ??
                              bike.userName ??
                              bike.userId ??
                              "-";
                            const createdAt = bike.createdAt ?? bike.created_at;
                            return (
                              <TableRow key={bike.id} data-testid={`bike-item-${bike.id}`}>
                                <TableCell>{bike.bikeType ?? bike.bike_type ?? "-"}</TableCell>
                                <TableCell>{bike.brand ?? "-"}</TableCell>
                                <TableCell>{bike.model ?? "-"}</TableCell>
                                <TableCell>{ownerName}</TableCell>
                                <TableCell>{formatOrderDate(createdAt)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="technicians" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.pendingTechnicians}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2">{lang === 'ar' ? 'بانتظار الموافقة' : 'Pending Approval'}</h4>
                    <ScrollArea className="h-[240px]">
                      {techniciansLoading ? (
                        <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                      ) : pendingList.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                      ) : (
                        <div className="space-y-3">
                          {pendingList.map((tech) => {
                            const normalized = tech || {};
                            return (
                              <Card key={tech.id || Math.random()} className="p-4 hover-elevate" data-testid={`pending-tech-${tech.id || 'unknown'}`}>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-semibold text-foreground text-lg">{normalized.userName || (lang === 'ar' ? 'اسم غير محدد' : 'Name not set')}</p>
                                    <p className="text-sm text-muted-foreground">{normalized.userEmail || (lang === 'ar' ? 'بريد غير محدد' : 'Email not set')}</p>
                                    <p className="text-sm text-muted-foreground">{normalized.location || '-'}</p>
                                  </div>
                                  <Badge variant="secondary">{txt.pending}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="sm" variant="outline">
                                        <MoreVertical className="w-4 h-4 mr-1" />
                                        {lang === "ar" ? "إجراءات" : "Actions"}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => handleTechnicianAction("approve", tech.id)}
                                        disabled={approveTechnicianMutation.isPending}
                                      >
                                        {txt.approve}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleTechnicianAction("reject", tech.id)}
                                        disabled={rejectTechnicianMutation.isPending}
                                      >
                                        {txt.reject}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => tech.id && handleViewDocuments(tech.id)}>
                                        {tech.id && expandedTechnicianIds.has(tech.id)
                                          ? lang === "ar"
                                            ? "إخفاء المستندات"
                                            : "Hide Documents"
                                          : txt.documents}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                {tech.id && expandedTechnicianIds.has(tech.id) && (
                                  <div className="mt-3">
                                    {loadingDocsMap[tech.id] ? (
                                      <div className="text-muted-foreground text-sm">{txt.loading}</div>
                                    ) : !technicianDocsMap[tech.id] || technicianDocsMap[tech.id].length === 0 ? (
                                      <div className="text-muted-foreground text-sm">{txt.noDocuments}</div>
                                    ) : (
                                      <div className="space-y-2 mt-2">
                                        {technicianDocsMap[tech.id].map((doc) => {
                                          const normalizedDoc = normalizeDoc(doc || {});
                                          const docUrl = normalizedDoc.documentUrl;
                                          const docName = normalizedDoc.fileName || '';
                                          return (
                                            <div key={doc.id || Math.random()} className="flex items-center justify-between p-2 border rounded">
                                              <div className="flex items-center gap-2">
                                                <Image className="w-4 h-4 text-muted-foreground" />
                                                <div>
                                                  <p className="text-sm font-medium">{getDocumentTypeLabel(normalizedDoc.documentType || '')}</p>
                                                  <p className="text-xs text-muted-foreground">{docName}</p>
                                                </div>
                                              </div>
                                              <div className="flex gap-2">
                                                <Button size="icon" variant="ghost" onClick={() => docUrl && window.open(docUrl, '_blank')}>
                                                  <Eye className="w-4 h-4" />
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">{lang === 'ar' ? 'فنيون نشطون' : 'Active Technicians'}</h4>
                    <ScrollArea className="h-[240px]">
                      {techniciansLoading ? (
                        <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                      ) : activeList.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                      ) : (
                        <div className="space-y-3">
                          {activeList.map((tech) => (
                            <Card key={tech.id || Math.random()} className="p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold">{tech.userName || '-'}</p>
                                  <p className="text-sm text-muted-foreground">{tech.userEmail || '-'}</p>
                                  <p className="text-sm text-muted-foreground">{tech.location || '-'}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Badge variant="default">{txt.approved}</Badge>
                                  {tech.isAvailable && <Badge variant="outline">{txt.available}</Badge>}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-3">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      <MoreVertical className="w-4 h-4 mr-1" />
                                      {lang === "ar" ? "إجراءات" : "Actions"}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => handleTechnicianAction("suspend", tech.id)}
                                      disabled={suspendTechnicianMutation.isPending}
                                    >
                                      {lang === "ar" ? "إيقاف مؤقت" : "Suspend"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleTechnicianAction("delete", tech.id)}
                                      disabled={deleteTechnicianMutation.isPending}
                                    >
                                      {lang === "ar" ? "حذف الفني" : "Delete technician"}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">{lang === 'ar' ? 'موقوفون / مرفوضون' : 'Inactive / Rejected'}</h4>
                    <ScrollArea className="h-[240px]">
                      {techniciansLoading ? (
                        <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                      ) : inactiveList.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                      ) : (
                        <div className="space-y-3">
                          {inactiveList.map((tech) => (
                            <Card key={tech.id || Math.random()} className="p-4 border-dashed">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold">{tech.userName || '-'}</p>
                                  <p className="text-sm text-muted-foreground">{tech.userEmail || '-'}</p>
                                  <p className="text-sm text-muted-foreground">{tech.location || '-'}</p>
                                </div>
                                <Badge variant="secondary">{tech.status === 'rejected' ? txt.reject : txt.pending}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-3">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      <MoreVertical className="w-4 h-4 mr-1" />
                                      {lang === "ar" ? "إجراءات" : "Actions"}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {tech.status === "approved" && (
                                      <DropdownMenuItem
                                        onClick={() => handleTechnicianAction("reactivate", tech.id)}
                                        disabled={reactivateTechnicianMutation.isPending}
                                      >
                                        {lang === "ar" ? "تفعيل" : "Reactivate"}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleTechnicianAction("delete", tech.id)}
                                      disabled={deleteTechnicianMutation.isPending}
                                    >
                                      {lang === "ar" ? "حذف الفني" : "Delete technician"}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{txt.liveTechniciansMap}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-[280px,1fr]">
                  <div className="space-y-2">
                    {liveTechniciansLoading ? (
                      <div className="text-sm text-muted-foreground">{txt.loading}</div>
                    ) : safeLiveTechnicians.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{txt.noData}</div>
                    ) : (
                      safeLiveTechnicians.map((tech) => {
                        const isActive = selectedLiveTechnician?.id === tech.id;
                        const rating = Number(tech.rating ?? 0);
                        const reviews = Number(tech.reviewCount ?? 0);
                        return (
                          <button
                            key={tech.id}
                            type="button"
                            onClick={() => setSelectedLiveTechnicianId(tech.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition ${isActive ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-foreground">{tech.name || "-"}</p>
                              <Badge variant="outline">{txt.available}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {tech.email || "-"}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                              <span>⭐ {Number.isFinite(rating) ? rating.toFixed(1) : "0.0"}</span>
                              <span>•</span>
                              <span>{reviews}</span>
                              <span>•</span>
                              <span>
                                {txt.lastUpdated}: {formatSupportDate(tech.lastUpdated || null)}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="min-h-[260px] rounded-xl border border-border/60 overflow-hidden bg-muted/40">
                    {selectedLiveTechnician ? (
                      <iframe
                        title="technician-live-map"
                        src={`https://maps.google.com/maps?q=${selectedLiveTechnician.latitude},${selectedLiveTechnician.longitude}&z=14&output=embed`}
                        className="h-[320px] w-full border-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        {txt.noData}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.serviceRequests}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {requestsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : safeServiceRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div
                      className="w-full overflow-x-auto touch-pan-x overscroll-x-contain -mx-4 px-4 md:mx-0 md:px-0"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      <Table className="min-w-[1100px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{txt.orderNumber}</TableHead>
                            <TableHead>{txt.orderType}</TableHead>
                            <TableHead>{txt.client}</TableHead>
                            <TableHead>{txt.total}</TableHead>
                            <TableHead>{txt.status}</TableHead>
                            <TableHead>{txt.technician}</TableHead>
                            <TableHead>{txt.createdAt}</TableHead>
                            <TableHead>{txt.invoiceDetails}</TableHead>
                            <TableHead>{txt.supportActions}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safeServiceRequests.map((request: any) => {
                            const orderNumber =
                              request.orderNumber ?? request.order_number ?? request.id ?? "-";
                            const customerName =
                              request.customerName ??
                              request.user_name ??
                              request.userName ??
                              request.userId ??
                              "-";
                            const technicianName = request.technicianName ?? "-";
                            const isMockTechnician = request.isMockTechnician === true;
                            const createdAt = request.createdAt ?? request.created_at;
                            const invoiceNumber =
                              request.invoiceNumber ?? request.invoice?.invoiceNumber ?? "-";
                            const invoiceStatus =
                              request.invoiceStatus ?? request.invoice?.status ?? "-";
                            const invoiceTotalRaw =
                              request.invoiceTotal ?? request.invoice?.total ?? null;
                            const total = Number(
                              request.total ?? request.estimatedCost ?? invoiceTotalRaw ?? 0,
                            );
                            return (
                              <TableRow key={request.id} data-testid={`request-item-${request.id}`}>
                                <TableCell className="font-medium">{orderNumber}</TableCell>
                                <TableCell>{txt.invoiceTypeService}</TableCell>
                                <TableCell>{customerName}</TableCell>
                                <TableCell>{formatCurrency(total)}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      request.status === "completed"
                                        ? "default"
                                        : request.status === "in_progress"
                                        ? "secondary"
                                        : "outline"
                                    }
                                  >
                                    {request.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span>{technicianName || "-"}</span>
                                    {isMockTechnician ? (
                                      <Badge variant="secondary" className="text-xs">
                                        {lang === "ar" ? "تجريبي" : "Mock"}
                                      </Badge>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>{formatOrderDate(createdAt)}</TableCell>
                                <TableCell>
                                  <div className="space-y-1 text-xs">
                                    <div>{invoiceNumber}</div>
                                    <div className="text-muted-foreground">{invoiceStatus}</div>
                                    <div>
                                      {invoiceTotalRaw != null
                                        ? formatCurrency(Number(invoiceTotalRaw))
                                        : "-"}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedServiceRequest(request)}
                                  >
                                    {lang === "ar" ? "عرض" : "View"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shop-orders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.shopOrders}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {shopOrdersLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : safeShopOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div
                      className="w-full overflow-x-auto touch-pan-x overscroll-x-contain -mx-4 px-4 md:mx-0 md:px-0"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      <Table className="min-w-[1100px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{txt.orderNumber}</TableHead>
                            <TableHead>{txt.orderType}</TableHead>
                            <TableHead>{txt.client}</TableHead>
                            <TableHead>{txt.total}</TableHead>
                            <TableHead>{txt.status}</TableHead>
                            <TableHead>{txt.technician}</TableHead>
                            <TableHead>{txt.createdAt}</TableHead>
                            <TableHead>{txt.invoiceDetails}</TableHead>
                            <TableHead>{txt.supportActions}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safeShopOrders.map((order: any) => {
                            const orderNumber =
                              order.orderNumber ?? order.order_number ?? order.id ?? "-";
                            const customerName =
                              order.customerName ??
                              order.user_name ??
                              order.userName ??
                              order.userId ??
                              "-";
                            const createdAt = order.createdAt ?? order.created_at;
                            const invoiceNumber =
                              order.invoiceNumber ?? order.invoice?.invoiceNumber ?? "-";
                            const invoiceStatus =
                              order.invoiceStatus ?? order.invoice?.status ?? "-";
                            const invoiceTotalRaw =
                              order.invoiceTotal ?? order.invoice?.total ?? null;
                            const total = Number(order.total ?? invoiceTotalRaw ?? 0);
                            return (
                              <TableRow key={order.id} data-testid={`shop-order-${order.id}`}>
                                <TableCell className="font-medium">{orderNumber}</TableCell>
                                <TableCell>{txt.invoiceTypeShop}</TableCell>
                                <TableCell>{customerName}</TableCell>
                                <TableCell>{formatCurrency(total)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{order.status}</Badge>
                                </TableCell>
                                <TableCell>-</TableCell>
                                <TableCell>{formatOrderDate(createdAt)}</TableCell>
                                <TableCell>
                                  <div className="space-y-1 text-xs">
                                    <div>{invoiceNumber}</div>
                                    <div className="text-muted-foreground">{invoiceStatus}</div>
                                    <div>
                                      {invoiceTotalRaw != null
                                        ? formatCurrency(Number(invoiceTotalRaw))
                                        : "-"}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedShopOrder(order)}
                                  >
                                    {lang === "ar" ? "عرض" : "View"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="support-tickets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.supportTickets}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {supportTicketsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : safeSupportTickets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.supportNoData}</div>
                  ) : (
                    <div
                      className="w-full overflow-x-auto touch-pan-x overscroll-x-contain -mx-4 px-4 md:mx-0 md:px-0"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      <Table className="min-w-[1100px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{txt.name}</TableHead>
                            <TableHead>{txt.email}</TableHead>
                            <TableHead>{txt.ticketNumber}</TableHead>
                            <TableHead>{txt.supportType}</TableHead>
                            <TableHead>{txt.supportCategory}</TableHead>
                            <TableHead>{txt.supportMessage}</TableHead>
                            <TableHead>{txt.status}</TableHead>
                            <TableHead>{txt.supportCreatedAt}</TableHead>
                            <TableHead>{txt.supportActions}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safeSupportTickets.map((ticket) => {
                            const isExpanded = expandedSupportTicketId === ticket.id;
                            const statusLabel = ticket.status || "open";
                            const draftStatus = supportStatusDrafts[ticket.id] || statusLabel;
                            const replyMessage = (ticket as any).reply_message ?? (ticket as any).replyMessage ?? ticket.reply_message;
                            const replyAt = (ticket as any).replied_at ?? (ticket as any).repliedAt ?? ticket.replied_at;
                            const replyDraft = supportReplyDrafts[ticket.id] ?? "";
                            const repliesRaw = Array.isArray((ticket as any).replies)
                              ? (ticket as any).replies
                              : [];
                            const replies = repliesRaw
                              .map((reply: any) => ({
                                id: reply.id,
                                message: reply.message ?? "",
                                senderRole: reply.senderRole ?? reply.sender_role ?? "user",
                                createdAt: reply.createdAt ?? reply.created_at ?? reply.createdAt,
                              }))
                              .filter((reply: any) => reply.message);
                            const repliesToShow =
                              replies.length > 0
                                ? replies
                                : replyMessage
                                ? [
                                    {
                                      id: "legacy-reply",
                                      message: replyMessage,
                                      senderRole: "admin",
                                      createdAt: replyAt,
                                    },
                                  ]
                                : [];
                            return (
                              <Fragment key={ticket.id}>
                                <TableRow>
                                  <TableCell className="font-medium">{ticket.user_name || "-"}</TableCell>
                                  <TableCell>{ticket.user_email || "-"}</TableCell>
                                  <TableCell>{ticket.ticket_number || (ticket as any).ticketNumber || "-"}</TableCell>
                                  <TableCell>{ticket.type || "-"}</TableCell>
                                  <TableCell>{ticket.category || "-"}</TableCell>
                                  <TableCell title={ticket.message || ""} className="max-w-[220px] truncate">
                                    {getSupportMessagePreview(ticket.message)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={statusLabel === "open" ? "secondary" : "default"}>
                                      {statusLabel}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{formatSupportDate(ticket.created_at)}</TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setExpandedSupportTicketId(isExpanded ? null : ticket.id)
                                      }
                                    >
                                      <Eye className="w-4 h-4 mr-1" />
                                      {txt.supportView}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                                {isExpanded && (
                                  <TableRow>
                                  <TableCell colSpan={9} className="bg-muted/30">
                                      <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                          <div className="text-sm text-muted-foreground">{txt.supportStatus}</div>
                                          <Select
                                            value={draftStatus}
                                            onValueChange={(value) =>
                                              setSupportStatusDrafts((prev) => ({
                                                ...prev,
                                                [ticket.id]: value,
                                              }))
                                            }
                                          >
                                            <SelectTrigger className="w-40">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="open">{txt.supportStatusOpen}</SelectItem>
                                              <SelectItem value="replied">{txt.supportStatusReplied}</SelectItem>
                                              <SelectItem value="closed">{txt.supportStatusClosed}</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              updateSupportStatusMutation.mutate({
                                                ticketId: ticket.id,
                                                status: draftStatus,
                                              })
                                            }
                                            disabled={updateSupportStatusMutation.isPending}
                                          >
                                            {lang === "ar" ? "تحديث" : "Update"}
                                          </Button>
                                        </div>
                                        <div>
                                          <div className="text-sm text-muted-foreground">{txt.supportMessage}</div>
                                          <p className="whitespace-pre-wrap text-sm">{ticket.message || "-"}</p>
                                        </div>
                                        <div className="space-y-2">
                                          <div className="text-sm text-muted-foreground">{txt.supportReply}</div>
                                          {repliesToShow.length > 0 ? (
                                            <div className="space-y-2">
                                              {repliesToShow.map((reply) => (
                                                <div
                                                  key={reply.id}
                                                  className="rounded-md border border-border/60 bg-background/70 p-3 text-sm"
                                                >
                                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                    <span>
                                                      {reply.senderRole === "admin" ? txt.admin : txt.client}
                                                    </span>
                                                    <span>{formatSupportDate(reply.createdAt)}</span>
                                                  </div>
                                                  <p className="mt-2 whitespace-pre-wrap">{reply.message}</p>
                                                </div>
                                              ))}
                                            </div>
                                          ) : null}
                                          <Textarea
                                            placeholder={txt.supportReplyPlaceholder}
                                            value={replyDraft}
                                            onChange={(event) =>
                                              setSupportReplyDrafts((prev) => ({
                                                ...prev,
                                                [ticket.id]: event.target.value,
                                              }))
                                            }
                                          />
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              replySupportMutation.mutate({
                                                ticketId: ticket.id,
                                                message: replyDraft,
                                              })
                                            }
                                            disabled={replySupportMutation.isPending || replyDraft.trim().length === 0}
                                          >
                                            {txt.supportReplyAction}
                                          </Button>
                                        </div>
                                        {ticket.screenshot_url ? (
                                          <div>
                                            <div className="text-sm text-muted-foreground">
                                              {txt.supportScreenshot}
                                            </div>
                                            <a
                                              href={ticket.screenshot_url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-primary underline text-sm"
                                            >
                                              {lang === "ar" ? "عرض الملف" : "View file"}
                                            </a>
                                          </div>
                                        ) : null}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.userRoles}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg">
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger data-testid="select-user">
                      <SelectValue placeholder={txt.selectUser} />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((user) => {
                        const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id;
                        return (
                          <SelectItem key={user.id} value={user.id}>
                            {displayName} {user.email && displayName !== user.email ? `(${user.email})` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder={txt.selectRole} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles?.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name} - {role.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handleAssignRole}
                    disabled={!selectedUser || !selectedRole || assignRoleMutation.isPending}
                    data-testid="button-assign-role"
                  >
                    {assignRoleMutation.isPending ? txt.loading : txt.assignRole}
                  </Button>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">{txt.assignedRoles}</h3>
                  <ScrollArea className="h-[400px]">
                    {userRolesLoading ? (
                      <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                    ) : safeUserRoles.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div className="space-y-3">
                        {safeUserRoles.map((userRole) => {
                          const user = safeUsers.find((u) => u.id === userRole.userId);
                          const role = roles?.find((r) => r.id === userRole.roleId);
                          const userName = user 
                            ? ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown')
                            : 'Unknown User';
                          
                          return (
                            <div
                              key={userRole.id}
                              className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                              data-testid={`user-role-item-${userRole.id}`}
                            >
                              <div className="space-y-1 flex-1">
                                <p className="font-medium text-foreground">
                                  {userName}
                                </p>
                                {user?.email && userName !== user.email && (
                                  <p className="text-sm text-muted-foreground">{user.email}</p>
                                )}
                                <div className="flex items-center gap-2">
                                  <Badge variant="default">
                                    {role?.name || 'Unknown Role'}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {role?.description}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => removeRoleMutation.mutate(userRole.id)}
                                disabled={removeRoleMutation.isPending}
                                data-testid={`button-remove-role-${userRole.id}`}
                              >
                                <X className="w-4 h-4" />
                                {txt.removeRole}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>{txt.invoices}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{txt.convoy}</span>
                    <Select value={selectedConvoy} onValueChange={setSelectedConvoy}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {convoyOptions.map((convoy) => (
                          <SelectItem key={convoy.id} value={convoy.id}>
                            {convoy.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {invoicesLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : filteredInvoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div className="space-y-3">
                      {filteredInvoices.map((invoice) => {
                        const user = safeUsers.find((u) => u.id === invoice.userId);
                        const invoiceType = (invoice as any).orderId || (invoice as any).order_id
                          ? txt.invoiceTypeShop
                          : txt.invoiceTypeService;
                        return (
                          <div
                            key={invoice.id}
                            className="p-4 border rounded-lg hover-elevate space-y-3"
                            data-testid={`invoice-item-${invoice.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground" data-testid={`invoice-number-${invoice.id}`}>
                                  {txt.invoiceNumber}: {invoice.invoiceNumber}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {txt.invoiceType}: {invoiceType}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {user ? `${user.firstName} ${user.lastName}` : 'Unknown User'}
                                </p>
                                {invoice.convoyName && (
                                  <p className="text-xs text-muted-foreground">
                                    {txt.convoy}: {invoice.convoyName}
                                  </p>
                                )}
                              </div>
                              <Badge
                                variant={
                                  invoice.status === 'paid'
                                    ? 'default'
                                    : invoice.status === 'issued'
                                    ? 'secondary'
                                    : 'outline'
                                }
                                data-testid={`invoice-status-${invoice.id}`}
                              >
                                {invoice.status}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="font-medium">{txt.subtotal}: </span>
                                <span className="text-muted-foreground">{invoice.subtotal} {lang === 'ar' ? 'ر.س' : 'SAR'}</span>
                              </div>
                              <div>
                                <span className="font-medium">{txt.taxRate}: </span>
                                <span className="text-muted-foreground">{invoice.taxRate}%</span>
                              </div>
                              <div>
                                <span className="font-medium">{txt.taxAmount}: </span>
                                <span className="text-muted-foreground">{invoice.taxAmount} {lang === 'ar' ? 'ر.س' : 'SAR'}</span>
                              </div>
                              <div>
                                <span className="font-medium">{txt.total}: </span>
                                <span className="text-foreground font-semibold">{invoice.total} {lang === 'ar' ? 'ر.س' : 'SAR'}</span>
                              </div>
                            </div>

                            {invoice.issuedDate && (
                              <div className="text-sm">
                                <span className="font-medium">{txt.issuedDate}: </span>
                                <span className="text-muted-foreground">
                                  {new Date(invoice.issuedDate).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                                </span>
                              </div>
                            )}

                            <div className="flex justify-end pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generateInvoicePDF(invoice, user, lang as 'ar' | 'en')}
                                data-testid={`button-download-pdf-${invoice.id}`}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                {txt.downloadPDF}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="discounts" className="space-y-4">
            <Card data-testid="card-discount-codes">
              <CardHeader>
                <CardTitle>{txt.discounts}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" placeholder="Code" className="border p-2 rounded" id="code-input" />
                  <select id="type-select" className="border p-2 rounded">
                    <option value="percentage">%</option>
                    <option value="fixed">Fixed</option>
                  </select>
                  <input type="number" placeholder="Value" className="border p-2 rounded" id="value-input" />
                  <input type="number" placeholder="Max Uses" className="border p-2 rounded" id="maxuses-input" />
                  <Button onClick={() => {
                    const code = (document.getElementById('code-input') as HTMLInputElement)?.value;
                    const type = (document.getElementById('type-select') as HTMLSelectElement)?.value;
                    const value = (document.getElementById('value-input') as HTMLInputElement)?.value;
                    const maxUses = (document.getElementById('maxuses-input') as HTMLInputElement)?.value;
                    if (code && type && value) {
                      createDiscountCodeMutation.mutate({ code, discountType: type, discountValue: value, maxUses: maxUses ? parseInt(maxUses) : null, isActive: true });
                    }
                  }} data-testid="button-add-discount">
                    {txt.addCode}
                  </Button>
                </div>
                <div className="space-y-2">
                  {safeDiscountCodes.map((dc: any) => (
                    <div key={dc.id || Math.random()} className="border p-3 rounded flex justify-between items-center">
                      <span className="font-semibold">{dc.code}</span>
                      <span>{dc.discountValue} {dc.discountType === 'percentage' ? '%' : 'SAR'}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parts" className="space-y-4">
            <Card data-testid="card-parts">
              <CardHeader>
                <CardTitle>{txt.parts}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 border rounded-lg space-y-4">
                  <h3 className="font-semibold">{lang === 'ar' ? 'إضافة قطعة جديدة' : 'Add New Part'}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input 
                      type="text" 
                      placeholder={txt.name} 
                      className="border p-2 rounded bg-background" 
                      id="part-name" 
                      data-testid="input-part-name"
                    />
                    <Select onValueChange={(value) => {
                      const el = document.getElementById('part-category-hidden') as HTMLInputElement;
                      if (el) el.value = value;
                    }}>
                      <SelectTrigger className="h-10" data-testid="select-part-category">
                        <SelectValue placeholder={txt.category} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spare_parts">
                          {lang === 'ar' ? 'قطع غيار' : 'Spare Parts'}
                        </SelectItem>
                        <SelectItem value="accessories">
                          {lang === 'ar' ? 'اكسسوارات' : 'Accessories'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <input type="hidden" id="part-category-hidden" />
                    <input 
                      type="number" 
                      placeholder={txt.price} 
                      className="border p-2 rounded bg-background" 
                      id="part-price"
                      data-testid="input-part-price" 
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={newPartImageInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setNewPartImage(file);
                        }}
                        data-testid="input-new-part-image"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => newPartImageInputRef.current?.click()}
                        className="flex-1 gap-2"
                        data-testid="button-select-part-image"
                      >
                        <Upload className="w-4 h-4" />
                        {newPartImage 
                          ? newPartImage.name.substring(0, 20) + '...' 
                          : (lang === 'ar' ? 'اختر صورة' : 'Select Image')}
                      </Button>
                      {newPartImage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setNewPartImage(null)}
                          data-testid="button-clear-part-image"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 col-span-full">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          id="part-instock"
                          defaultChecked={true}
                          className="w-4 h-4 rounded border-gray-300"
                          data-testid="input-part-instock"
                        />
                        <span className="text-sm font-medium">
                          {txt.inStock}
                        </span>
                      </label>
                    </div>
                  </div>
                  <Button 
                    onClick={handleCreatePartWithImage} 
                    className="w-full md:w-auto"
                    data-testid="button-add-part"
                  >
                    {txt.addPart}
                  </Button>
                </div>

                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {partsLoading ? (
                      <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                    ) : normalizedParts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                    ) : (
                      normalizedParts.map((part: any) => {
                        const img = part.imageUrl;
                        return (
                          <div 
                            key={part.id} 
                            className="border p-4 rounded-lg flex items-center gap-4 hover-elevate"
                            data-testid={`part-item-${part.id}`}
                          >
                            <div className="relative w-20 h-20 flex-shrink-0">
                              {img ? (
                                <img 
                                  src={img} 
                                  alt={part.name}
                                  className="w-full h-full object-cover rounded-md"
                                />
                              ) : (
                                <div className="w-full h-full bg-muted rounded-md flex items-center justify-center">
                                  <Package className="w-8 h-8 text-muted-foreground" />
                                </div>
                              )}
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                id={`part-image-${part.id}`}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadPartImage(part.id, file);
                                }}
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="absolute -bottom-2 -right-2 w-7 h-7"
                                onClick={() => document.getElementById(`part-image-${part.id}`)?.click()}
                                disabled={uploadingPartImage === part.id}
                                data-testid={`button-upload-image-${part.id}`}
                              >
                                {uploadingPartImage === part.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Upload className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{part.name}</p>
                              {editingPartId === part.id ? (
                                <Select 
                                  value={editingCategory} 
                                  onValueChange={setEditingCategory}
                                >
                                  <SelectTrigger className="mt-1 h-8 text-sm w-40" data-testid={`select-edit-category-${part.id}`}>
                                    <SelectValue placeholder={lang === 'ar' ? 'التصنيف' : 'Category'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="spare_parts">
                                      {lang === 'ar' ? 'قطع غيار' : 'Spare Parts'}
                                    </SelectItem>
                                    <SelectItem value="accessories">
                                      {lang === 'ar' ? 'اكسسوارات' : 'Accessories'}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  {part.category === 'spare_parts' 
                                    ? (lang === 'ar' ? 'قطع غيار' : 'Spare Parts')
                                    : part.category === 'accessories'
                                    ? (lang === 'ar' ? 'اكسسوارات' : 'Accessories')
                                    : part.category}
                                </p>
                              )}
                              <Button
                                variant={part.inStock ? "default" : "secondary"}
                                size="sm"
                                className="mt-1"
                                onClick={() => togglePartStockMutation.mutate({ partId: part.id, inStock: !part.inStock })}
                                disabled={togglePartStockMutation.isPending}
                                data-testid={`button-toggle-stock-${part.id}`}
                              >
                                {part.inStock 
                                  ? (lang === 'ar' ? 'متوفر ✓' : 'In Stock ✓') 
                                  : (lang === 'ar' ? 'غير متوفر ✗' : 'Out of Stock ✗')}
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {editingPartId === part.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    value={editingPrice}
                                    onChange={(e) => setEditingPrice(e.target.value)}
                                    placeholder={lang === 'ar' ? 'السعر' : 'Price'}
                                    className="w-24 h-8 text-sm"
                                    data-testid={`input-edit-price-${part.id}`}
                                  />
                                  <span className="text-sm text-muted-foreground">SAR</span>
                                  <Button
                                    variant="default"
                                    size="icon"
                                    onClick={handleSaveEdit}
                                    disabled={editPartMutation.isPending}
                                    data-testid={`button-save-edit-${part.id}`}
                                  >
                                    {editPartMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCancelEdit}
                                    data-testid={`button-cancel-edit-${part.id}`}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <span className="font-bold text-primary">{part.price} SAR</span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => handleStartEdit(part)}
                                    data-testid={`button-edit-part-${part.id}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="destructive"
                                size="icon"
                                onClick={() => {
                                  if (confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذه القطعة؟' : 'Are you sure you want to delete this part?')) {
                                    deletePartMutation.mutate(part.id);
                                  }
                                }}
                                disabled={deletePartMutation.isPending}
                                data-testid={`button-delete-part-${part.id}`}
                              >
                                {deletePartMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register-tech" className="space-y-4">
            <Card data-testid="card-register-tech">
              <CardHeader>
                <CardTitle>{txt.registerTech}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="email" placeholder="Email" className="border p-2 rounded" id="tech-email" />
                  <input type="text" placeholder={txt.name} className="border p-2 rounded" id="tech-name" />
                  <input type="tel" placeholder={txt.phoneNumber} className="border p-2 rounded" id="tech-phone" />
                  <input type="number" placeholder={txt.experience} className="border p-2 rounded" id="tech-exp" />
                  <input type="text" placeholder={txt.nationalId} className="border p-2 rounded" id="tech-id" />
                  <input type="text" placeholder={txt.iban} className="border p-2 rounded" id="tech-iban" />
                  <input type="text" placeholder={txt.commercialRegister} className="border p-2 rounded" id="tech-register" />
                  <Button onClick={() => {
                    const [email, name, phone, exp, id, iban, register] = [
                      (document.getElementById('tech-email') as HTMLInputElement)?.value,
                      (document.getElementById('tech-name') as HTMLInputElement)?.value,
                      (document.getElementById('tech-phone') as HTMLInputElement)?.value,
                      (document.getElementById('tech-exp') as HTMLInputElement)?.value,
                      (document.getElementById('tech-id') as HTMLInputElement)?.value,
                      (document.getElementById('tech-iban') as HTMLInputElement)?.value,
                      (document.getElementById('tech-register') as HTMLInputElement)?.value,
                    ];
                    if (email && name && phone) {
                      createTechnicianMutation.mutate({ email, firstName: name, phoneNumber: phone, yearsOfExperience: parseInt(exp || '0'), nationalId: id, iban, commercialRegister: register, latitude: '24.7136', longitude: '46.6753' });
                    }
                  }} data-testid="button-register-tech" className="md:col-span-2">
                    {txt.registerTech}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <Dialog open={!!selectedServiceRequest} onOpenChange={(open) => !open && setSelectedServiceRequest(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{lang === "ar" ? "تفاصيل طلب الخدمة" : "Service Request Details"}</DialogTitle>
              </DialogHeader>
              {selectedServiceRequest && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.service}</span>
                      <span>{selectedServiceRequest.serviceType || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.status}</span>
                      <span>{selectedServiceRequest.status || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.location}</span>
                      <span>{selectedServiceRequest.location || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.client}</span>
                      <span>{selectedServiceRequest.userId || "-"}</span>
                    </div>
                  </div>
                  {selectedServiceRequest.notes && (
                    <div className="rounded-lg border border-border/60 p-3 text-sm">
                      <p className="text-muted-foreground">{lang === "ar" ? "ملاحظات" : "Notes"}</p>
                      <p className="mt-2 whitespace-pre-wrap">{selectedServiceRequest.notes}</p>
                    </div>
                  )}
                  <div className="rounded-lg border border-border/60 p-3">
                    <h4 className="font-semibold mb-2">{lang === "ar" ? "تتبع الطلب" : "Tracking"}</h4>
                    <OrderTrackingTimeline
                      steps={parseTrackingSteps(
                        (selectedServiceRequest as any).trackingSteps ??
                          (selectedServiceRequest as any).tracking_steps ??
                          [],
                      )}
                    />
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={!!selectedShopOrder} onOpenChange={(open) => !open && setSelectedShopOrder(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{lang === "ar" ? "تفاصيل طلب المتجر" : "Shop Order Details"}</DialogTitle>
              </DialogHeader>
              {selectedShopOrder && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{lang === "ar" ? "رقم الطلب" : "Order Number"}</span>
                      <span>{selectedShopOrder.orderNumber || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.status}</span>
                      <span>{selectedShopOrder.status || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.deliveryOption}</span>
                      <span>{formatDeliveryOption(selectedShopOrder)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{lang === "ar" ? "العنوان" : "Address"}</span>
                      <span>{(selectedShopOrder as any).deliveryAddress ?? (selectedShopOrder as any).delivery_address ?? "-"}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <h4 className="font-semibold mb-2">{lang === "ar" ? "العناصر" : "Items"}</h4>
                    {renderOrderItems(
                      parseItems((selectedShopOrder as any).items ?? (selectedShopOrder as any).items_json ?? []),
                    )}
                  </div>
                  <div className="rounded-lg border border-border/60 p-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.subtotal}</span>
                      <span>{formatCurrency(Number((selectedShopOrder as any).subtotal || 0))}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{txt.taxAmount}</span>
                      <span>{formatCurrency(Number((selectedShopOrder as any).taxAmount ?? (selectedShopOrder as any).tax_amount ?? 0))}</span>
                    </div>
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-muted-foreground">{txt.total}</span>
                      <span>{formatCurrency(Number(selectedShopOrder.total || 0))}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <h4 className="font-semibold mb-2">{lang === "ar" ? "تتبع الطلب" : "Tracking"}</h4>
                    <OrderTrackingTimeline
                      steps={parseTrackingSteps(
                        (selectedShopOrder as any).trackingSteps ??
                          (selectedShopOrder as any).tracking_steps ??
                          [],
                      )}
                    />
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
