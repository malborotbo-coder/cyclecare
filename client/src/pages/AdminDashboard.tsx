import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { Users, Bike, Wrench, ClipboardList, Shield, UserCog, X, FileText, Eye, Download, Image, FileCheck, Upload, Loader2, Package, Trash2, Pencil, Check, Save, Headset } from "lucide-react";
import { Input } from "@/components/ui/input";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef, Fragment } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/apiConfig";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import type { User, Bike as BikeType, Technician, ServiceRequest, Role, UserRole, Invoice, Order } from "@shared/schema";
import type { Language } from "@/lib/i18n";

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
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  type?: string | null;
  category?: string | null;
  message?: string | null;
  screenshot_url?: string | null;
  status?: string | null;
  created_at?: string | null;
}

type InvoiceWithConvoy = Invoice & {
  convoyId?: string;
  convoyName?: string;
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
      users: "المستخدمين",
      bikes: "الدراجات",
      technicians: "الفنيين",
      serviceRequests: "طلبات الخدمة",
      userRoles: "صلاحيات المستخدمين",
      totalUsers: "إجمالي المستخدمين",
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
      supportCreatedAt: "تاريخ الإنشاء",
      supportActions: "إجراء",
      supportView: "عرض",
      supportNoData: "لا توجد طلبات دعم",
      supportScreenshot: "لقطة الشاشة",
      shopOrders: "طلبات المتجر",
      deliveryOption: "خيار التوصيل",
    },
    en: {
      title: "Owner Dashboard",
      overview: "Overview",
      users: "Users",
      bikes: "Bikes",
      technicians: "Technicians",
      serviceRequests: "Service Requests",
      userRoles: "User Roles",
      totalUsers: "Total Users",
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
      supportCreatedAt: "Created",
      supportActions: "Actions",
      supportView: "View",
      supportNoData: "No support tickets yet",
      supportScreenshot: "Screenshot",
      shopOrders: "Shop Orders",
      deliveryOption: "Delivery Option",
    },
  };
  
  const txt = lang === 'ar' ? {
    title: "لوحة تحكم المالك",
    overview: "نظرة عامة",
    users: "المستخدمين",
    bikes: "الدراجات",
    technicians: "الفنيين",
    serviceRequests: "طلبات الخدمة",
    userRoles: "صلاحيات المستخدمين",
    totalUsers: "إجمالي المستخدمين",
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
    supportCreatedAt: "تاريخ الإنشاء",
    supportActions: "إجراء",
    supportView: "عرض",
    supportNoData: "لا توجد طلبات دعم",
    supportScreenshot: "لقطة الشاشة",
    shopOrders: "طلبات المتجر",
    deliveryOption: "خيار التوصيل",
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

  const [selectedConvoy, setSelectedConvoy] = useState<string>(() => convoyOptions[1]?.id ?? "all");

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

  const { data: bikes, isLoading: bikesLoading } = useQuery<BikeType[]>({
    queryKey: ["/api/admin/bikes"],
  });

  const { data: technicians, isLoading: techniciansLoading } = useQuery<TechnicianWithUser[]>({
    queryKey: ["/api/admin/technicians"],
  });

  const { data: shopOrders, isLoading: shopOrdersLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
  });

  const { data: serviceRequests, isLoading: requestsLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/admin/service-requests"],
  });

  const { data: supportTickets, isLoading: supportTicketsLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/admin/support-tickets"],
  });

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
  });

  const { data: userRolesData, isLoading: userRolesLoading } = useQuery<UserRole[]>({
    queryKey: ["/api/admin/user-roles"],
  });

  const pendingTechnicians: TechnicianWithUser[] | undefined = undefined;
  const pendingLoading = false;

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/admin/invoices"],
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const { data: parts, isLoading: partsLoading } = useQuery({
    queryKey: ["/api/parts"],
  });

  const { data: discountCodes, isLoading: discountCodesLoading } = useQuery({
    queryKey: ["/api/admin/discount-codes"],
  });

  const safeUsers = Array.isArray(users) ? users : [];
  const safeBikes = Array.isArray(bikes) ? bikes : [];
  const safeTechnicians = Array.isArray(technicians) ? technicians : [];
  const safeServiceRequests = Array.isArray(serviceRequests) ? serviceRequests : [];
  const safeSupportTickets = Array.isArray(supportTickets) ? supportTickets : [];
  const safeShopOrders = Array.isArray(shopOrders) ? shopOrders : [];
  const safeUserRoles = Array.isArray(userRolesData) ? userRolesData : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];

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

  const convoyInvoices: InvoiceWithConvoy[] = safeInvoices.length
    ? safeInvoices.map((invoice, index) => {
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
      toast({ title: lang === 'ar' ? 'تم إيقاف الفني' : 'Technician suspended' });
    },
  });

  const reactivateTechnicianMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      return await apiRequest(`/api/admin/technicians/${technicianId}/reactivate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians"] });
      toast({ title: lang === 'ar' ? 'تم تفعيل الفني' : 'Technician reactivated' });
    },
  });

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
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground" data-testid="title-admin-dashboard">
            {txt.title}
          </h1>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{txt.totalUsers}</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-users">
                {usersLoading ? txt.loading : safeUsers.length}
                </div>
              </CardContent>
            </Card>

          <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{txt.totalBikes}</CardTitle>
                <Bike className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-bikes">
                {bikesLoading ? txt.loading : safeBikes.length}
                </div>
              </CardContent>
            </Card>

          <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{txt.totalTechnicians}</CardTitle>
                <Wrench className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-technicians">
                {techniciansLoading ? txt.loading : safeTechnicians.length}
                </div>
              </CardContent>
            </Card>

          <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{txt.totalRequests}</CardTitle>
                <ClipboardList className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-requests">
                {requestsLoading ? txt.loading : safeServiceRequests.length}
                </div>
              </CardContent>
            </Card>
        </div>

        {/* Data Tables */}
        <Tabs defaultValue="users" className="w-full">
          <div className="flex flex-col md:flex-row gap-4">
            <TabsList className="flex flex-col h-auto md:w-64 gap-1">
              <TabsTrigger value="users" className="w-full justify-start" data-testid="tab-users">
                <Users className="w-4 h-4 mr-2" />
                {txt.users}
              </TabsTrigger>
              <TabsTrigger value="technicians" className="w-full justify-start" data-testid="tab-technicians">
                <Wrench className="w-4 h-4 mr-2" />
                {txt.pendingTechnicians}
              </TabsTrigger>
              <TabsTrigger value="bikes" className="w-full justify-start" data-testid="tab-bikes">
                <Bike className="w-4 h-4 mr-2" />
                {txt.bikes}
              </TabsTrigger>
              <TabsTrigger value="requests" className="w-full justify-start" data-testid="tab-requests">
                <ClipboardList className="w-4 h-4 mr-2" />
                {txt.serviceRequests}
              </TabsTrigger>
              <TabsTrigger value="shop-orders" className="w-full justify-start" data-testid="tab-shop-orders">
                <Package className="w-4 h-4 mr-2" />
                {txt.shopOrders}
              </TabsTrigger>
              <TabsTrigger value="support-tickets" className="w-full justify-start" data-testid="tab-support-tickets">
                <Headset className="w-4 h-4 mr-2" />
                {txt.supportTickets}
              </TabsTrigger>
              <TabsTrigger value="roles" className="w-full justify-start" data-testid="tab-roles">
                <UserCog className="w-4 h-4 mr-2" />
                {txt.userRoles}
              </TabsTrigger>
              <TabsTrigger value="invoices" className="w-full justify-start" data-testid="tab-invoices">
                <FileText className="w-4 h-4 mr-2" />
                {txt.invoices}
              </TabsTrigger>
              <TabsTrigger value="discounts" className="w-full justify-start" data-testid="tab-discounts">
                <Wrench className="w-4 h-4 mr-2" />
                {lang === 'ar' ? 'أكواد الخصم' : 'Discount Codes'}
              </TabsTrigger>
              <TabsTrigger value="parts" className="w-full justify-start" data-testid="tab-parts">
                <Wrench className="w-4 h-4 mr-2" />
                {txt.parts}
              </TabsTrigger>
              <TabsTrigger value="register-tech" className="w-full justify-start" data-testid="tab-register-tech">
                <Wrench className="w-4 h-4 mr-2" />
                {lang === 'ar' ? 'تسجيل فني' : 'Register Technician'}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1">

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
                    <div className="space-y-3">
                      {safeBikes.map((bike) => (
                        <div
                          key={bike.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`bike-item-${bike.id}`}
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {bike.brand} {bike.model}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {txt.year}: {bike.year} | ID: {bike.bikeId}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {bike.totalDistance || 0} {lang === 'ar' ? 'كم' : 'km'}
                          </Badge>
                        </div>
                      ))}
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
                                  <Button size="sm" onClick={() => tech.id && approveTechnicianMutation.mutate(tech.id)} disabled={approveTechnicianMutation.isPending}>
                                    {txt.approve}
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => tech.id && rejectTechnicianMutation.mutate(tech.id)} disabled={rejectTechnicianMutation.isPending}>
                                    {txt.reject}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => tech.id && handleViewDocuments(tech.id)}>
                                    <Eye className="w-4 h-4 mr-1" />
                                    {tech.id && expandedTechnicianIds.has(tech.id) ? (lang === 'ar' ? 'إخفاء المستندات' : 'Hide Documents') : txt.documents}
                                  </Button>
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
                                <Button size="sm" variant="outline" onClick={() => tech.id && suspendTechnicianMutation.mutate(tech.id)} disabled={suspendTechnicianMutation.isPending}>
                                  {lang === 'ar' ? 'إيقاف مؤقت' : 'Suspend'}
                                </Button>
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
                                {tech.status === 'approved' && (
                                  <Button size="sm" onClick={() => tech.id && reactivateTechnicianMutation.mutate(tech.id)} disabled={reactivateTechnicianMutation.isPending}>
                                    {lang === 'ar' ? 'تفعيل' : 'Reactivate'}
                                  </Button>
                                )}
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
                    <div className="space-y-3">
                      {safeServiceRequests.map((request) => (
                        <div
                          key={request.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`request-item-${request.id}`}
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {request.serviceType?.replace('_', ' ').toUpperCase() || 'N/A'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {request.createdAt ? new Date(request.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : 'N/A'}
                            </p>
                          </div>
                          <Badge
                            variant={
                              request.status === 'completed'
                                ? 'default'
                                : request.status === 'in_progress'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {request.status}
                          </Badge>
                        </div>
                      ))}
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
                    <div className="space-y-3">
                      {safeShopOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`shop-order-${order.id}`}
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {order.orderNumber}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {txt.deliveryOption}: {formatDeliveryOption(order)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{order.status}</Badge>
                            <span className="font-semibold text-primary">
                              {Number(order.total || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
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
                    <div className="w-full overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{txt.name}</TableHead>
                            <TableHead>{txt.email}</TableHead>
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
                            return (
                              <Fragment key={ticket.id}>
                                <TableRow>
                                  <TableCell className="font-medium">{ticket.user_name || "-"}</TableCell>
                                  <TableCell>{ticket.user_email || "-"}</TableCell>
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
                                    <TableCell colSpan={8} className="bg-muted/30">
                                      <div className="space-y-3">
                                        <div>
                                          <div className="text-sm text-muted-foreground">{txt.supportMessage}</div>
                                          <p className="whitespace-pre-wrap text-sm">{ticket.message || "-"}</p>
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
                <CardTitle>{lang === 'ar' ? 'أكواد الخصم' : 'Discount Codes'}</CardTitle>
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
                <CardTitle>{lang === 'ar' ? 'تسجيل فني جديد' : 'Register New Technician'}</CardTitle>
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
                    {lang === 'ar' ? 'تسجيل الفني' : 'Register Technician'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
