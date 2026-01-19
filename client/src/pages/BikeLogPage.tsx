import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bike, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/apiConfig";
import { getBestAuthToken } from "@/lib/authStorage";
import { setPostLoginRedirect } from "@/lib/authRedirect";

type StravaSummary = {
  connected: boolean;
  rideCount: number;
  totalDistanceKm: number;
  lastRide: { name?: string | null; distanceKm?: number | null; startDate?: string | null } | null;
  lastServiceAt?: string | null;
  distanceSinceLastServiceKm: number;
  remainingKm: number;
  maintenanceStatus: "OK" | "NEAR" | "OVERDUE";
  serviceIntervalKm: number;
};

export default function BikeLogPage() {
  const { lang } = useLanguage();

  const { data, isLoading, error } = useQuery<StravaSummary>({
    queryKey: ["/api/strava/activities"],
    queryFn: () => apiRequest("/api/strava/activities", "GET"),
    retry: false,
  });

  const errorCode = (error as any)?.code || (error as any)?.raw?.code;
  const isNotConnected = errorCode === "STRAVA_NOT_CONNECTED";
  const isTokenExpired = errorCode === "STRAVA_TOKEN_EXPIRED";

  const connectLabel = lang === "ar" ? "اربط حسابك مع Strava" : "Connect your Strava account";
  const connectDescription =
    lang === "ar"
      ? "اربط حسابك للحصول على سجل الرحلات وحالة الصيانة."
      : "Connect to see ride history and maintenance status.";

  const statusMeta = useMemo(() => {
    return {
      OK: {
        label: lang === "ar" ? "جيد" : "OK",
        className: "bg-emerald-500 text-white",
      },
      NEAR: {
        label: lang === "ar" ? "قريب من الصيانة" : "Near service",
        className: "bg-amber-500 text-white",
      },
      OVERDUE: {
        label: lang === "ar" ? "تجاوز الصيانة" : "Overdue",
        className: "bg-red-600 text-white",
      },
    } as const;
  }, [lang]);

  const handleConnect = async () => {
    setPostLoginRedirect("/bike-log");
    const token = await getBestAuthToken();
    if (token && typeof document !== "undefined") {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `cc_strava_token=${encodeURIComponent(token)}; Max-Age=120; Path=/; SameSite=Lax${secure}`;
    }
    window.location.href = buildApiUrl("/api/strava/connect");
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  };

  return (
    <div className="container mx-auto px-4 pb-10 max-w-4xl">
      <Card className="bg-background/90 dark:bg-slate-900/85 backdrop-blur-md border border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">
              {lang === "ar" ? "سجل الدراجة" : "Bike Log"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "متابعة الرحلات وحالة الصيانة من Strava."
                : "Track rides and maintenance status from Strava."}
            </p>
          </div>
          <Bike className="w-8 h-8 text-primary" />
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{lang === "ar" ? "جاري التحميل..." : "Loading..."}</span>
            </div>
          )}

          {!isLoading && (isNotConnected || isTokenExpired) && (
            <div className="rounded-xl border border-border/60 bg-muted/50 p-6 space-y-4">
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  {isTokenExpired
                    ? lang === "ar"
                      ? "انتهت صلاحية ربط Strava"
                      : "Strava connection expired"
                    : lang === "ar"
                    ? "اربط حسابك مع Strava"
                    : "Connect your Strava account"}
                </p>
                <p className="text-sm text-muted-foreground">{connectDescription}</p>
              </div>
              <Button onClick={handleConnect}>{connectLabel}</Button>
            </div>
          )}

          {!isLoading && !error && data && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" ? "إجمالي المسافة" : "Total distance"}
                    </p>
                    <p className="text-2xl font-semibold">{data.totalDistanceKm} كم</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" ? "عدد الرحلات" : "Ride count"}
                    </p>
                    <p className="text-2xl font-semibold">{data.rideCount}</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" ? "المسافة منذ آخر صيانة" : "Since last service"}
                    </p>
                    <p className="text-2xl font-semibold">{data.distanceSinceLastServiceKm} كم</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/60">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" ? "حالة الصيانة" : "Maintenance status"}
                    </p>
                    <Badge className={statusMeta[data.maintenanceStatus].className}>
                      {statusMeta[data.maintenanceStatus].label}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {data.maintenanceStatus === "OVERDUE" && (
                <div className="rounded-lg border border-destructive bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    {lang === "ar"
                      ? "تجاوزت حد الصيانة. يرجى حجز صيانة الآن."
                      : "You are overdue for maintenance. Please schedule a service."}
                  </span>
                </div>
              )}

              <Card className="border border-border/60">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{lang === "ar" ? "آخر رحلة" : "Last ride"}</span>
                    <span>{formatDateTime(data.lastRide?.startDate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {data.lastRide?.name || (lang === "ar" ? "غير متوفر" : "Unavailable")}
                    </span>
                    <span className="font-semibold">
                      {data.lastRide?.distanceKm ?? "-"} كم
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? `الحد الدوري للصيانة: ${data.serviceIntervalKm} كم`
                      : `Service interval: ${data.serviceIntervalKm} km`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? `المتبقي حتى الصيانة: ${data.remainingKm} كم`
                      : `Remaining until service: ${data.remainingKm} km`}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!isLoading && error && !isNotConnected && !isTokenExpired && (
            <div className="rounded-xl border border-destructive bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground">
              {lang === "ar"
                ? "تعذر تحميل بيانات Strava الآن. حاول مرة أخرى."
                : "Unable to load Strava data right now. Please try again."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
