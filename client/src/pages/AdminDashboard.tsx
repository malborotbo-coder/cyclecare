import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { Users, Bike, Wrench, ClipboardList, Shield, UserCog, X, FileText, Eye, Download, Image, FileCheck, Upload, Loader2, Package, Trash2, Pencil, Check, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, Bike as BikeType, Technician, ServiceRequest, Role, UserRole, Invoice } from "@shared/schema";
import type { Language } from "@/lib/i18n";

interface TechnicianDocument {
  id: string;
  technicianId: string;
  documentType: string;
  documentUrl: string;
  fileName: string;
  uploadedAt: Date;
}

interface TechnicianWithUser extends Technician {
  userName?: string | null;
  userEmail?: string | null;
}

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

  const fetchTechnicianDocuments = async (technicianId: string) => {
    setLoadingDocsMap(prev => ({ ...prev, [technicianId]: true }));
    try {
      const response = await fetch(`/api/admin/technicians/${technicianId}/documents`, {
        credentials: 'include'
      });
      if (response.ok) {
        const docs = await response.json();
        setTechnicianDocsMap(prev => ({ ...prev, [technicianId]: docs }));
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
      pendingTechnicians: "طلبات الفنيين",
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
      pendingTechnicians: "Pending Technicians",
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
    pendingTechnicians: "طلبات الفنيين",
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
  } : translations['en'];

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

  const { data: serviceRequests, isLoading: requestsLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/admin/service-requests"],
  });

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
  });

  const { data: userRolesData, isLoading: userRolesLoading } = useQuery<UserRole[]>({
    queryKey: ["/api/admin/user-roles"],
  });

  const { data: pendingTechnicians, isLoading: pendingLoading } = useQuery<TechnicianWithUser[]>({
    queryKey: ["/api/admin/technicians/pending"],
  });

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

  const getErrorMessage = (error: unknown, fallbackAr: string, fallbackEn: string): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as any).message);
    }
    return lang === 'ar' ? fallbackAr : fallbackEn;
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

      // Get auth token
      const phoneSession = localStorage.getItem("phone_session");
      const headers: HeadersInit = {};
      if (phoneSession) {
        headers["Authorization"] = `Bearer ${phoneSession}`;
      }

      const response = await fetch(`/api/admin/parts/${partId}/image`, {
        method: "POST",
        credentials: "include",
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
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
      const formData = new FormData();
      formData.append("name", name);
      formData.append("nameEn", name);
      formData.append("category", category);
      formData.append("price", price);
      formData.append("inStock", inStock.toString());
      
      if (newPartImage) {
        formData.append("image", newPartImage);
      }

      // Get auth token
      const phoneSession = localStorage.getItem("phone_session");
      const headers: HeadersInit = {};
      if (phoneSession) {
        headers["Authorization"] = `Bearer ${phoneSession}`;
      }

      const response = await fetch("/api/admin/parts", {
        method: "POST",
        credentials: "include",
        headers,
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
                {usersLoading ? txt.loading : users?.length || 0}
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
                {bikesLoading ? txt.loading : bikes?.length || 0}
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
                {techniciansLoading ? txt.loading : technicians?.length || 0}
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
                {requestsLoading ? txt.loading : serviceRequests?.length || 0}
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
                {txt.technicians}
              </TabsTrigger>
              <TabsTrigger value="pending" className="w-full justify-start" data-testid="tab-pending">
                <ClipboardList className="w-4 h-4 mr-2" />
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
                      {users.map((user) => (
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
                      {bikes.map((bike) => (
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
                <CardTitle>{txt.technicians}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {techniciansLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : !technicians || technicians.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div className="space-y-3">
                      {technicians.map((tech) => (
                        <Card
                          key={tech.id}
                          className="p-4 hover-elevate"
                          data-testid={`tech-item-${tech.id}`}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground text-lg">
                                  {tech.userName || (lang === 'ar' ? 'اسم غير محدد' : 'Name not set')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {tech.userEmail || (lang === 'ar' ? 'بريد غير محدد' : 'Email not set')}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                {tech.isApproved ? (
                                  <Badge variant="default">{txt.approved}</Badge>
                                ) : (
                                  <Badge variant="secondary">{txt.pending}</Badge>
                                )}
                                {tech.isAvailable && (
                                  <Badge variant="outline">{txt.available}</Badge>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">{lang === 'ar' ? 'الهاتف:' : 'Phone:'}</span>
                                <span className="font-medium mr-1">{tech.phoneNumber || '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{lang === 'ar' ? 'الخبرة:' : 'Experience:'}</span>
                                <span className="font-medium mr-1">{tech.yearsOfExperience || 0} {lang === 'ar' ? 'سنوات' : 'years'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{txt.rating}:</span>
                                <span className="font-medium mr-1">{tech.rating || '0.00'} ({tech.reviewCount || 0})</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{lang === 'ar' ? 'الموقع:' : 'Location:'}</span>
                                <span className="font-medium mr-1">{tech.location || '-'}</span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
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
                  ) : !serviceRequests || serviceRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div className="space-y-3">
                      {serviceRequests.map((request) => (
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

          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{txt.pendingTechnicians}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {pendingLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : !pendingTechnicians || pendingTechnicians.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div className="space-y-4">
                      {pendingTechnicians.map((tech) => {
                        return (
                          <Card key={tech.id} className="p-4" data-testid={`pending-tech-${tech.id}`}>
                            <div className="space-y-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-semibold text-lg">
                                    {tech.userName || (lang === 'ar' ? 'اسم غير محدد' : 'Name not set')}
                                  </h4>
                                  <p className="text-sm text-muted-foreground">{tech.userEmail || (lang === 'ar' ? 'بريد غير محدد' : 'Email not set')}</p>
                                </div>
                                <Badge variant="outline">{txt.pending}</Badge>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="font-medium">{txt.phoneNumber}: </span>
                                  <span className="text-muted-foreground">{tech.phoneNumber || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="font-medium">{txt.experience}: </span>
                                  <span className="text-muted-foreground">{tech.yearsOfExperience || 0} {lang === 'ar' ? 'سنوات' : 'years'}</span>
                                </div>
                                <div>
                                  <span className="font-medium">{txt.nationalId}: </span>
                                  <span className="text-muted-foreground">{tech.nationalId || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="font-medium">{txt.iban}: </span>
                                  <span className="text-muted-foreground">{tech.iban || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="font-medium">{txt.commercialRegister}: </span>
                                  <span className="text-muted-foreground">{tech.commercialRegister || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="font-medium">{lang === 'ar' ? 'الموقع:' : 'Location:'} </span>
                                  <span className="text-muted-foreground">{tech.location || 'N/A'}</span>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-3">
                                <Button
                                  onClick={() => approveTechnicianMutation.mutate(tech.id)}
                                  disabled={approveTechnicianMutation.isPending}
                                  size="sm"
                                  variant="default"
                                  data-testid={`button-approve-${tech.id}`}
                                >
                                  {txt.approve}
                                </Button>
                                <Button
                                  onClick={() => rejectTechnicianMutation.mutate(tech.id)}
                                  disabled={rejectTechnicianMutation.isPending}
                                  size="sm"
                                  variant="destructive"
                                  data-testid={`button-reject-${tech.id}`}
                                >
                                  {txt.reject}
                                </Button>
                                <Button
                                  onClick={() => handleViewDocuments(tech.id)}
                                  size="sm"
                                  variant="outline"
                                  data-testid={`button-view-docs-${tech.id}`}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  {expandedTechnicianIds.has(tech.id) ? (lang === 'ar' ? 'إخفاء المستندات' : 'Hide Documents') : txt.documents}
                                </Button>
                              </div>

                              {expandedTechnicianIds.has(tech.id) && (
                                <div className="mt-4 p-4 bg-muted rounded-lg">
                                  <h5 className="font-medium mb-3 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4" />
                                    {txt.documents}
                                  </h5>
                                  {loadingDocsMap[tech.id] ? (
                                    <div className="text-center py-4 text-muted-foreground">{txt.loading}</div>
                                  ) : !technicianDocsMap[tech.id] || technicianDocsMap[tech.id].length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground">{txt.noDocuments}</div>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {technicianDocsMap[tech.id].map((doc) => (
                                        <div 
                                          key={doc.id} 
                                          className="flex items-center justify-between p-3 bg-background border rounded-lg"
                                          data-testid={`doc-item-${doc.id}`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <Image className="w-4 h-4 text-muted-foreground" />
                                            <div>
                                              <p className="text-sm font-medium">{getDocumentTypeLabel(doc.documentType)}</p>
                                              <p className="text-xs text-muted-foreground">{doc.fileName}</p>
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              onClick={() => window.open(doc.documentUrl, '_blank')}
                                              data-testid={`button-view-doc-${doc.id}`}
                                            >
                                              <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              onClick={() => {
                                                const link = document.createElement('a');
                                                link.href = doc.documentUrl;
                                                link.download = doc.fileName;
                                                link.click();
                                              }}
                                              data-testid={`button-download-doc-${doc.id}`}
                                            >
                                              <Download className="w-4 h-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </Card>
                        );
                      })}
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
                    ) : !userRolesData || userRolesData.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                    ) : (
                      <div className="space-y-3">
                        {userRolesData.map((userRole) => {
                          const user = users?.find((u) => u.id === userRole.userId);
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
                <CardTitle>{txt.invoices}</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {invoicesLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.loading}</div>
                  ) : !invoices || invoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                  ) : (
                    <div className="space-y-3">
                      {invoices.map((invoice) => {
                        const user = users?.find((u) => u.id === invoice.userId);
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
                  {(discountCodes as any[])?.map((dc: any) => (
                    <div key={dc.id} className="border p-3 rounded flex justify-between items-center">
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
                    ) : !parts || (parts as any[]).length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">{txt.noData}</div>
                    ) : (
                      (parts as any[])?.map((part: any) => (
                        <div 
                          key={part.id} 
                          className="border p-4 rounded-lg flex items-center gap-4 hover-elevate"
                          data-testid={`part-item-${part.id}`}
                        >
                          <div className="relative w-20 h-20 flex-shrink-0">
                            {part.imageUrl ? (
                              <img 
                                src={part.imageUrl} 
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
                      ))
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
