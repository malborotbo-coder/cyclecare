import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Bike, Calendar, Wrench, AlertCircle, Plus, Pencil, Camera, Loader2, ImagePlus, X } from "lucide-react";
import bikeImage from "@assets/generated_images/Modern_bike_in_Riyadh_2027f785.png";
import type { Bike as BikeType, MaintenanceRecord, InsertBike } from "@shared/schema";
import { insertBikeSchema } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Capacitor } from "@capacitor/core";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";

interface MaintenanceRecordProps {
  date: string;
  service: string;
  technician: string;
  cost: string;
}

function MaintenanceRecordComponent({ date, service, technician, cost }: MaintenanceRecordProps) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-md border border-border hover-elevate">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Wrench className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold">{service}</h4>
        <div className="text-sm text-muted-foreground mt-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            <span>{date}</span>
          </div>
          <div className="mt-1">{technician}</div>
        </div>
      </div>
      <div className="font-semibold text-primary">{cost}</div>
    </div>
  );
}

export default function BikeProfile() {
  const { lang: language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBike, setEditingBike] = useState<BikeType | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [newBikeImage, setNewBikeImage] = useState<File | null>(null);
  const [newBikeImagePreview, setNewBikeImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newBikeImageInputRef = useRef<HTMLInputElement>(null);
  
  const isNative = Capacitor.isNativePlatform();

  const t = {
    ar: {
      loading: "جاري التحميل...",
      title: "ملف الدراجة",
      subtitle: "تفاصيل ومتابعة دراجتك",
      addFirstBike: "أضف دراجتك الأولى",
      noBikesRegistered: "لا توجد دراجات مسجلة",
      registerBikePrompt: "سجل دراجتك الآن لبدء تتبع الصيانة والحصول على التذكيرات",
      addBike: "إضافة دراجة",
      editBike: "تعديل الدراجة",
      bike: "دراجة",
      year: "الموديل",
      condition: "الحالة",
      conditionGood: "جيدة",
      totalDistance: "المسافة الكلية",
      km: "كم",
      dateAdded: "تاريخ الإضافة",
      notSpecified: "غير محدد",
      maintenanceAlert: "تنبيه صيانة",
      maintenancePrompt: "دراجتك تحتاج إلى صيانة دورية بعد 50 كم أو في غضون أسبوعين",
      scheduleMaintenance: "جدولة صيانة",
      maintenanceLog: "سجل الصيانة",
      certifiedTechnician: "فني معتمد",
      sar: "ر.س",
      noMaintenanceRecords: "لا يوجد سجل صيانة حتى الآن",
      addAnotherBike: "هل تريد إضافة دراجة أخرى؟",
      manageMultipleBikes: "يمكنك إدارة عدة دراجات من حسابك",
      add: "إضافة",
      brand: "الماركة",
      model: "الطراز",
      cancel: "إلغاء",
      submit: "حفظ",
      update: "تحديث",
      bikeAddedSuccess: "تمت إضافة الدراجة بنجاح",
      bikeAddedError: "فشل في إضافة الدراجة",
      bikeUpdatedSuccess: "تم تحديث الدراجة بنجاح",
      bikeUpdatedError: "فشل في تحديث الدراجة",
      uploadPhoto: "رفع صورة",
      photoUploaded: "تم رفع الصورة بنجاح",
      photoUploadError: "فشل في رفع الصورة",
      changePhoto: "تغيير الصورة",
      takePhoto: "التقاط صورة",
      chooseFromGallery: "اختيار من المعرض",
      uploading: "جاري الرفع...",
      photoOptions: "إضافة صورة الدراجة",
    },
    en: {
      loading: "Loading...",
      title: "Bike Profile",
      subtitle: "Details and tracking of your bike",
      addFirstBike: "Add your first bike",
      noBikesRegistered: "No bikes registered",
      registerBikePrompt: "Register your bike now to start tracking maintenance and get reminders",
      addBike: "Add Bike",
      editBike: "Edit Bike",
      bike: "Bike",
      year: "Year",
      condition: "Condition",
      conditionGood: "Good",
      totalDistance: "Total Distance",
      km: "km",
      dateAdded: "Date Added",
      notSpecified: "Not specified",
      maintenanceAlert: "Maintenance Alert",
      maintenancePrompt: "Your bike needs periodic maintenance after 50 km or within two weeks",
      scheduleMaintenance: "Schedule Maintenance",
      maintenanceLog: "Maintenance Log",
      certifiedTechnician: "Certified Technician",
      sar: "SAR",
      noMaintenanceRecords: "No maintenance records yet",
      addAnotherBike: "Want to add another bike?",
      manageMultipleBikes: "You can manage multiple bikes from your account",
      add: "Add",
      brand: "Brand",
      model: "Model",
      cancel: "Cancel",
      submit: "Submit",
      update: "Update",
      bikeAddedSuccess: "Bike added successfully",
      bikeAddedError: "Failed to add bike",
      bikeUpdatedSuccess: "Bike updated successfully",
      bikeUpdatedError: "Failed to update bike",
      uploadPhoto: "Upload Photo",
      photoUploaded: "Photo uploaded successfully",
      photoUploadError: "Failed to upload photo",
      changePhoto: "Change Photo",
      takePhoto: "Take Photo",
      chooseFromGallery: "Choose from Gallery",
      uploading: "Uploading...",
      photoOptions: "Add Bike Photo",
    },
  };

  const handleNativeCamera = async (bikeId: string, source: CameraSource) => {
    try {
      setShowPhotoOptions(false);
      setIsUploadingPhoto(true);
      setUploadProgress(10);

      const image = await CapacitorCamera.getPhoto({
        quality: 85,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: source,
        width: 1200,
        height: 1200,
        correctOrientation: true,
      });

      setUploadProgress(30);

      if (!image.base64String) {
        throw new Error("No image data received");
      }

      const byteCharacters = atob(image.base64String);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: `image/${image.format || 'jpeg'}` });
      const file = new File([blob], `bike-${Date.now()}.${image.format || 'jpg'}`, { 
        type: `image/${image.format || 'jpeg'}` 
      });

      setUploadProgress(50);
      await handlePhotoUpload(bikeId, file);
    } catch (error: any) {
      console.error("Camera error:", error);
      if (error.message !== "User cancelled photos app") {
        toast({
          title: t[language].photoUploadError,
          variant: "destructive",
        });
      }
    } finally {
      setIsUploadingPhoto(false);
      setUploadProgress(0);
    }
  };

  const handlePhotoUpload = async (bikeId: string, file: File) => {
    console.log("[BikePhoto] Starting upload for bike:", bikeId, "file:", file.name, file.size, "bytes");
    setIsUploadingPhoto(true);
    setUploadProgress(60);
    try {
      const formData = new FormData();
      formData.append("photo", file);

      const phoneSession = localStorage.getItem("phone_session");
      const headers: HeadersInit = {};
      if (phoneSession) {
        headers["Authorization"] = `Bearer ${phoneSession}`;
        console.log("[BikePhoto] Using phone session auth");
      } else {
        console.log("[BikePhoto] Using cookie session auth");
      }

      setUploadProgress(80);
      console.log("[BikePhoto] Sending request to /api/bikes/" + bikeId + "/photo");

      const response = await fetch(`/api/bikes/${bikeId}/photo`, {
        method: "POST",
        credentials: "include",
        headers,
        body: formData,
      });

      console.log("[BikePhoto] Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[BikePhoto] Upload failed:", response.status, errorData);
        throw new Error(errorData.message || "Failed to upload photo");
      }

      setUploadProgress(100);
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/bikes"] });
      toast({
        title: t[language].photoUploaded,
      });
      return data;
    } catch (error) {
      console.error("Photo upload error:", error);
      toast({
        title: t[language].photoUploadError,
        variant: "destructive",
      });
    } finally {
      setIsUploadingPhoto(false);
      setUploadProgress(0);
    }
  };

  const { data: bikes, isLoading: loadingBikes } = useQuery<BikeType[]>({
    queryKey: ["/api/bikes"],
  });

  const bikeFormSchema = insertBikeSchema.omit({ userId: true });
  
  const form = useForm<z.infer<typeof bikeFormSchema>>({
    resolver: zodResolver(bikeFormSchema),
    defaultValues: {
      brand: "",
      model: "",
      year: new Date().getFullYear(),
      bikeId: `BIKE-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      totalDistance: 0,
    },
  });

  const createBikeMutation = useMutation({
    mutationFn: async (data: z.infer<typeof bikeFormSchema>) => {
      return await apiRequest("/api/bikes", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bikes"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: t[language].bikeAddedSuccess,
      });
    },
    onError: () => {
      toast({
        title: t[language].bikeAddedError,
        variant: "destructive",
      });
    },
  });

  const updateBikeSchema = z.object({
    brand: z.string().min(1, "Brand is required"),
    model: z.string().min(1, "Model is required"),
    year: z.coerce.number().min(1900).max(new Date().getFullYear() + 1),
    totalDistance: z.coerce.number().min(0).optional(),
  });
  
  const editForm = useForm<z.infer<typeof updateBikeSchema>>({
    resolver: zodResolver(updateBikeSchema),
    defaultValues: {
      brand: "",
      model: "",
      year: new Date().getFullYear(),
      totalDistance: 0,
    },
  });

  useEffect(() => {
    if (editingBike) {
      editForm.reset({
        brand: editingBike.brand,
        model: editingBike.model,
        year: editingBike.year,
        totalDistance: editingBike.totalDistance || 0,
      });
    }
  }, [editingBike, editForm]);

  const updateBikeMutation = useMutation({
    mutationFn: async (data: z.infer<typeof updateBikeSchema>) => {
      if (!editingBike) throw new Error("No bike selected");
      return await apiRequest(`/api/bikes/${editingBike.id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bikes"] });
      setIsEditDialogOpen(false);
      setEditingBike(null);
      editForm.reset();
      toast({
        title: t[language].bikeUpdatedSuccess,
      });
    },
    onError: () => {
      toast({
        title: t[language].bikeUpdatedError,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof bikeFormSchema>) => {
    createBikeMutation.mutate(data);
  };

  const onEditSubmit = (data: z.infer<typeof updateBikeSchema>) => {
    updateBikeMutation.mutate(data);
  };

  const handleEditClick = (bike: BikeType) => {
    setEditingBike(bike);
    setIsEditDialogOpen(true);
  };

  const firstBike = bikes?.[0];

  const { data: maintenanceRecords, isLoading: loadingRecords } = useQuery<MaintenanceRecord[]>({
    queryKey: ["/api/bikes", firstBike?.id, "maintenance"],
    enabled: !!firstBike?.id,
  });

  if (loadingBikes) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">{t[language].loading}</div>
      </div>
    );
  }

  const BikeFormDialog = () => (
    <Dialog open={isDialogOpen} onOpenChange={(open) => {
      setIsDialogOpen(open);
      if (!open) {
        setNewBikeImage(null);
        setNewBikeImagePreview(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-bike" size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          {t[language].addBike}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t[language].addBike}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            
            <div className="relative w-full h-40 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 overflow-hidden group hover-elevate cursor-pointer transition-all"
              onClick={() => newBikeImageInputRef.current?.click()}
            >
              {newBikeImagePreview ? (
                <>
                  <img src={newBikeImagePreview} alt="preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button type="button" variant="ghost" size="sm" className="gap-2 text-white">
                      <Camera className="w-4 h-4" />
                      {t[language].changePhoto}
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewBikeImage(null);
                      setNewBikeImagePreview(null);
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600"
                    data-testid="button-remove-bike-image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <Camera className="w-12 h-12 text-primary/40" />
                  <p className="text-sm text-muted-foreground font-medium">{t[language].uploadPhoto}</p>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'اضغط لاختيار صورة' : 'Click to select image'}</p>
                </div>
              )}
              <input
                type="file"
                ref={newBikeImageInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setNewBikeImage(file);
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      setNewBikeImagePreview(event.target?.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                data-testid="input-add-bike-image"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">{t[language].brand}</FormLabel>
                    <FormControl>
                      <Input 
                        data-testid="input-brand" 
                        placeholder="Trek" 
                        {...field}
                        className="h-10"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">{t[language].model}</FormLabel>
                    <FormControl>
                      <Input 
                        data-testid="input-model" 
                        placeholder="FX 2" 
                        {...field}
                        className="h-10"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t[language].year}</FormLabel>
                  <FormControl>
                    <Input 
                      data-testid="input-year" 
                      type="number" 
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      className="h-10"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel"
              >
                {t[language].cancel}
              </Button>
              <Button 
                type="submit" 
                disabled={createBikeMutation.isPending}
                data-testid="button-submit-bike"
                className="gap-2"
              >
                {createBikeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t[language].loading}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {t[language].submit}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );

  if (!firstBike) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{t[language].title}</h1>
            <p className="text-muted-foreground mt-1">{t[language].addFirstBike}</p>
          </div>

          <Card>
            <CardContent className="p-8 text-center">
              <Bike className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">{t[language].noBikesRegistered}</h3>
              <p className="text-muted-foreground mb-4">
                {t[language].registerBikePrompt}
              </p>
              <BikeFormDialog />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: Date | null) => {
    if (!dateString) return t[language].notSpecified;
    const date = new Date(dateString);
    const locale = language === 'ar' ? 'ar-SA' : 'en-US';
    return date.toLocaleDateString(locale, { 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t[language].title}</h1>
          <p className="text-muted-foreground mt-1">{t[language].subtitle}</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="relative">
              <div 
                className="h-48 bg-cover bg-center rounded-t-md"
                style={{ backgroundImage: `url(${firstBike.imageUrl || bikeImage})` }}
              />
              
              {isUploadingPhoto && uploadProgress > 0 && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-t-md">
                  <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
                  <p className="text-white text-sm mb-2">{t[language].uploading}</p>
                  <div className="w-2/3">
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                </div>
              )}
              
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handlePhotoUpload(firstBike.id, file);
                  }
                }}
                data-testid="input-bike-photo"
              />
              
              {isNative ? (
                <Dialog open={showPhotoOptions} onOpenChange={setShowPhotoOptions}>
                  <DialogTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute bottom-3 right-3 gap-2"
                      disabled={isUploadingPhoto}
                      data-testid="button-upload-photo"
                    >
                      <Camera className="w-4 h-4" />
                      {firstBike.imageUrl ? t[language].changePhoto : t[language].uploadPhoto}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xs">
                    <DialogHeader>
                      <DialogTitle>{t[language].photoOptions}</DialogTitle>
                      <DialogDescription className="sr-only">
                        Choose how to add a photo of your bike
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3 h-14"
                        onClick={() => handleNativeCamera(firstBike.id, CameraSource.Camera)}
                        data-testid="button-take-photo"
                      >
                        <Camera className="w-5 h-5 text-primary" />
                        <span>{t[language].takePhoto}</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3 h-14"
                        onClick={() => handleNativeCamera(firstBike.id, CameraSource.Photos)}
                        data-testid="button-choose-gallery"
                      >
                        <ImagePlus className="w-5 h-5 text-primary" />
                        <span>{t[language].chooseFromGallery}</span>
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute bottom-3 right-3 gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  data-testid="button-upload-photo"
                >
                  {isUploadingPhoto ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                  {firstBike.imageUrl ? t[language].changePhoto : t[language].uploadPhoto}
                </Button>
              )}
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{firstBike.brand} {firstBike.model}</h2>
                  <p className="text-muted-foreground">{t[language].bike}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEditClick(firstBike)}
                    data-testid="button-edit-bike"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Badge variant="default" className="text-base px-4">
                    {firstBike.bikeId}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <div className="text-sm text-muted-foreground">{t[language].year}</div>
                  <div className="font-semibold mt-1">{firstBike.year}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{t[language].condition}</div>
                  <div className="font-semibold mt-1 text-green-600">{t[language].conditionGood}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{t[language].totalDistance}</div>
                  <div className="font-semibold mt-1">{firstBike.totalDistance || 0} {t[language].km}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{t[language].dateAdded}</div>
                  <div className="font-semibold mt-1">{formatDate(firstBike.createdAt)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">{t[language].maintenanceAlert}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {t[language].maintenancePrompt}
            </p>
            <Button data-testid="button-schedule-maintenance">
              {t[language].scheduleMaintenance}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t[language].maintenanceLog}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingRecords ? (
              <div className="text-center py-4 text-muted-foreground">{t[language].loading}</div>
            ) : maintenanceRecords && maintenanceRecords.length > 0 ? (
              maintenanceRecords.map((record) => (
                <MaintenanceRecordComponent
                  key={record.id}
                  date={formatDate(record.createdAt)}
                  service={record.serviceType}
                  technician={t[language].certifiedTechnician}
                  cost={`${record.cost} ${t[language].sar}`}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t[language].noMaintenanceRecords}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Bike className="w-12 h-12 text-primary" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{t[language].addAnotherBike}</h3>
                <p className="text-sm text-muted-foreground">{t[language].manageMultipleBikes}</p>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-another-bike">
                    <Plus className="w-4 h-4 ml-2" />
                    {t[language].add}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t[language].addBike}</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="brand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t[language].brand}</FormLabel>
                            <FormControl>
                              <Input data-testid="input-brand" placeholder="Trek" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="model"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t[language].model}</FormLabel>
                            <FormControl>
                              <Input data-testid="input-model" placeholder="FX 2" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="year"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t[language].year}</FormLabel>
                            <FormControl>
                              <Input 
                                data-testid="input-year" 
                                type="number" 
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setIsDialogOpen(false)}
                          data-testid="button-cancel"
                        >
                          {t[language].cancel}
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createBikeMutation.isPending}
                          data-testid="button-submit-bike"
                        >
                          {createBikeMutation.isPending ? t[language].loading : t[language].submit}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setEditingBike(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t[language].editBike}</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t[language].brand}</FormLabel>
                      <FormControl>
                        <Input data-testid="input-edit-brand" placeholder="Trek" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t[language].model}</FormLabel>
                      <FormControl>
                        <Input data-testid="input-edit-model" placeholder="FX 2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t[language].year}</FormLabel>
                      <FormControl>
                        <Input 
                          data-testid="input-edit-year" 
                          type="number" 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="totalDistance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t[language].totalDistance} ({t[language].km})</FormLabel>
                      <FormControl>
                        <Input 
                          data-testid="input-edit-distance" 
                          type="number"
                          min="0"
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2 justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingBike(null);
                    }}
                    data-testid="button-cancel-edit"
                  >
                    {t[language].cancel}
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateBikeMutation.isPending}
                    data-testid="button-submit-edit"
                  >
                    {updateBikeMutation.isPending ? t[language].loading : t[language].update}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
