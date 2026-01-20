import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/apiConfig";
import { getBestAuthToken } from "@/lib/authStorage";
import { setPostLoginRedirect } from "@/lib/authRedirect";
import stravaLogo from "@/assets/strava-logo.png";

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
  const tr = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const kmLabel = lang === "ar" ? "كم" : "km";

  const { data, isFetching, refetch } = useQuery<StravaSummary>({
    queryKey: ["/api/strava/activities"],
    queryFn: () => apiRequest("/api/strava/activities", "GET"),
    retry: false,
  });

  const connectLabel = tr("اربط حسابك مع Strava", "Connect your Strava account");
  const connectTitle = tr("اربط دراجتك مع Strava", "Connect your bike with Strava");
  const connectSubtitle = tr("لمتابعة المسافات وحالة الصيانة تلقائيًا", "Track distances and maintenance automatically");

  const statusMeta = useMemo(() => {
    return {
      OK: {
        label: tr("جيد", "OK"),
        className: "bg-emerald-500 text-white",
      },
      NEAR: {
        label: tr("قريب من الصيانة", "Near service"),
        className: "bg-amber-500 text-white",
      },
      OVERDUE: {
        label: tr("تجاوز الصيانة", "Overdue"),
        className: "bg-red-600 text-white",
      },
    } as const;
  }, [lang, tr]);

  const handleConnect = async () => {
    setPostLoginRedirect("/bike-log");
    const token = await getBestAuthToken();
    const actionUrl = buildApiUrl("/api/strava/connect");
    if (!token || typeof document === "undefined") {
      window.location.href = actionUrl;
      return;
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = actionUrl;
    form.style.display = "none";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "token";
    input.value = token;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  };

  const isConnected = data?.connected === true;
  const showConnect = !isConnected;

  if (showConnect) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-[420px] text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">{connectTitle}</h2>
            <p className="text-sm text-muted-foreground">{connectSubtitle}</p>
          </div>
          <Button
            onClick={handleConnect}
            className="w-full min-h-[60px] rounded-xl text-lg font-semibold bg-[#FC4C02] hover:bg-[#e64502] text-white flex items-center justify-center gap-3"
          >
            <span className="inline-flex items-center justify-center w-6 h-6">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="w-6 h-6 fill-white">
                <path d="M14.9 3.5L9.6 9h3.3L18 3.5h-3.1zm-5.1 0L4.5 9H7l5.3-5.5H9.8zm5.4 7.8H9.6l-5.1 5.5h3.1l5.4-5.5zm3.2 0l-5.2 5.5h2.5l5.3-5.5h-2.6z" />
              </svg>
            </span>
            {connectLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pb-10 max-w-4xl">
      <Card className="bg-black/50 backdrop-blur-md border border-white/10 text-white">
        <CardHeader className="space-y-3 text-center">
          <div className="space-y-1">
            <CardTitle className="text-2xl">{tr("سجل الدراجة", "Bike Log")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {tr(
                "متابعة الرحلات وحالة الصيانة من Strava.",
                "Track rides and maintenance status from Strava.",
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#FC4C02]/25 blur-2xl" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-[#FC4C02]/40 shadow-xl">
                <img src={stravaLogo} alt="Strava" className="h-14 w-14 object-contain" />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="min-w-[180px] rounded-xl bg-[#FC4C02] text-white hover:bg-[#e64502] disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {tr("تحديث البيانات", "Refresh data")}
            </Button>
          </div>
              {data && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-black/50 backdrop-blur-md border border-white/10 text-white">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      {tr("إجمالي المسافة", "Total distance")}
                    </p>
                    <p className="text-2xl font-semibold">{data.totalDistanceKm} {kmLabel}</p>
                  </CardContent>
                </Card>
                <Card className="bg-black/50 backdrop-blur-md border border-white/10 text-white">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      {tr("عدد الرحلات", "Ride count")}
                    </p>
                    <p className="text-2xl font-semibold">{data.rideCount}</p>
                  </CardContent>
                </Card>
                <Card className="bg-black/50 backdrop-blur-md border border-white/10 text-white">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      {tr("المسافة منذ آخر صيانة", "Since last service")}
                    </p>
                    <p className="text-2xl font-semibold">{data.distanceSinceLastServiceKm} {kmLabel}</p>
                  </CardContent>
                </Card>
                <Card className="bg-black/50 backdrop-blur-md border border-white/10 text-white">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {tr("حالة الصيانة", "Maintenance status")}
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
                    {tr(
                      "تجاوزت حد الصيانة. يرجى حجز صيانة الآن.",
                      "You are overdue for maintenance. Please schedule a service.",
                    )}
                  </span>
                </div>
              )}

              <Card className="bg-black/50 backdrop-blur-md border border-white/10 text-white">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{tr("آخر رحلة", "Last ride")}</span>
                    <span>{formatDateTime(data.lastRide?.startDate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {data.lastRide?.name || tr("غير متوفر", "Unavailable")}
                    </span>
                    <span className="font-semibold">
                      {data.lastRide?.distanceKm ?? "-"} {kmLabel}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tr(
                      `الحد الدوري للصيانة: ${data.serviceIntervalKm} ${kmLabel}`,
                      `Service interval: ${data.serviceIntervalKm} ${kmLabel}`,
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tr(
                      `المتبقي حتى الصيانة: ${data.remainingKm} ${kmLabel}`,
                      `Remaining until service: ${data.remainingKm} ${kmLabel}`,
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
