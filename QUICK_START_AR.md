# 🚀 البداية السريعة - حل الشاشة البيضاء في iOS

## الخطوات (5 دقائق فقط!):

### 1️⃣ حمّل المشروع
في Replit:
- **⋯** → **Download as ZIP**
- فك الضغط على Desktop

### 2️⃣ فعّل التخطي
```bash
cd /Users/mujtabanasr/Desktop/MyApp
echo "VITE_NATIVE_AUTH_BYPASS=true" > .env.local
```

### 3️⃣ شغّل السكريبت
```bash
chmod +x rebuild-ios.sh
./rebuild-ios.sh
```

### 4️⃣ افتح Xcode
```bash
cd ios/App && open App.xcworkspace
```

### 5️⃣ شغّل التطبيق
- **Product** → **Clean Build Folder** (Shift+Cmd+K)
- **Product** → **Build** (Cmd+B)
- اختر Simulator
- **Run** ▶️

---

## ✅ النتيجة:
التطبيق يعمل مباشرة بدون صفحة تسجيل دخول!

---

## 🔍 إذا استمرت المشكلة:

### تأكد من:
1. ملف `.env.local` موجود ويحتوي على `VITE_NATIVE_AUTH_BYPASS=true`
2. شغّلت السكريبت بنجاح (بدون أخطاء)
3. عملت Clean Build في Xcode

### للتشخيص:
افتح **Safari** → **Develop** → **Simulator** → **Cycle Care**

في **Console**، يجب أن ترى:
```
[NativeAuthProvider] Platform: ios Bypass: true
[NativeAuthProvider] ⚠️ DEVELOPMENT MODE: Using mock user
[AuthWrapper] Native user detected - bypassing web auth
```

إذا شفت هذه الرسائل → ✅ يعمل!

---

## ⚠️ مهم جداً:

**هذا الحل للتجربة فقط!**
- ✅ استخدمه للتطوير والتجربة المحلية
- ❌ لا ترفع التطبيق على App Store بهذا الإعداد
- 📖 اقرأ `IMPORTANT_SECURITY_NOTE_AR.md` للتفاصيل

---

**الملفات المهمة:**
- `FINAL_SOLUTION_AR.md` - شرح كامل
- `IMPORTANT_SECURITY_NOTE_AR.md` - ملاحظات الأمان
- `rebuild-ios.sh` - السكريبت التلقائي
- `.env.local.example` - مثال التكوين
