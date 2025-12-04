# دليل حل مشاكل Xcode - Cycle Care

## 🔧 حل الأخطاء التي واجهتها

لقد واجهت عدة أخطاء في Xcode. إليك الحل الشامل:

---

## ⚠️ المشكلة الرئيسية: `module 'Cordova' not found`

هذه المشكلة تحدث عندما تنسخ المشروع من Replit إلى جهاز Mac بدون إعادة تثبيت الـ dependencies بشكل صحيح.

### ✅ الحل الكامل (اتبع هذه الخطوات بالترتيب):

---

## 📋 الخطوة 1: تنظيف المشروع القديم

قبل أي شيء، احذف المجلدات القديمة:

```bash
cd /Users/mujtabanasr/Desktop/MyApp

# احذف Pods القديمة
rm -rf ios/App/Pods
rm -rf ios/App/Podfile.lock

# احذف node_modules القديمة
rm -rf node_modules

# احذف Xcode derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/App-*
```

---

## 📋 الخطوة 2: تثبيت Node.js Dependencies

```bash
cd /Users/mujtabanasr/Desktop/MyApp

# تثبيت جميع الـ dependencies
npm install

# تثبيت Capacitor CLI
npm install -g @capacitor/cli
```

---

## 📋 الخطوة 3: إعادة بناء مشروع iOS

```bash
# بناء التطبيق للـ iOS
npm run build
# أو إذا لم يعمل:
npx vite build --base=./

# مزامنة Capacitor
npx cap sync ios
```

---

## 📋 الخطوة 4: إعادة تثبيت CocoaPods

```bash
cd ios/App

# تحديث CocoaPods (إذا لزم الأمر)
sudo gem install cocoapods

# تثبيت الـ Pods
pod deintegrate  # إزالة التكامل القديم
pod install      # تثبيت جديد
```

**ملاحظة مهمة:** إذا ظهرت رسالة `command not found: pod`، قم بتثبيت CocoaPods:

```bash
sudo gem install cocoapods
```

---

## 📋 الخطوة 5: فتح المشروع في Xcode

**⚠️ مهم جداً:** افتح **App.xcworkspace** وليس App.xcodeproj

```bash
cd ios/App
open App.xcworkspace
```

---

## 📋 الخطوة 6: تنظيف Xcode Build

في Xcode:

1. اذهب إلى القائمة: **Product** → **Clean Build Folder** (أو اضغط `Shift + Cmd + K`)
2. اذهب إلى: **Product** → **Build** (أو اضغط `Cmd + B`)

---

## 🔍 حل الأخطاء المحددة:

### ❌ خطأ: `Sandbox: bash deny file-read-data Pods-App-frameworks.sh`

**الخطأ الكامل:**
```
Sandbox: bash(xxxxx) deny(1) file-read-data .../Pods-App-frameworks.sh
```

**السبب:** macOS يمنع Xcode من قراءة ملفات CocoaPods بسبب صلاحيات

**✅ الحل السريع (5 دقائق):**

#### الطريقة 1: إصلاح الصلاحيات (الأسهل)

في **Terminal على Mac:**

```bash
cd /Users/mujtabanasr/Desktop/MyApp

# إصلاح صلاحيات Pods
chmod -R +r ios/App/Pods
chmod +x ios/App/Pods/Target\ Support\ Files/Pods-App/*.sh

# حذف Derived Data
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

**ثم في Xcode:**
1. أغلق Xcode **تماماً** (Cmd+Q)
2. افتحه من جديد
3. افتح **App.xcworkspace**
4. **Product** → **Clean Build Folder** (Shift+Cmd+K)
5. **Product** → **Build** (Cmd+B)

✅ **يجب أن يعمل الآن!**

---

#### الطريقة 2: إعادة تثبيت Pods

إذا الطريقة الأولى ما نفعت:

```bash
cd /Users/mujtabanasr/Desktop/MyApp/ios/App

# احذف Pods القديمة
rm -rf Pods
rm -rf Podfile.lock
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# إعادة التثبيت
pod deintegrate
pod install

# إصلاح الصلاحيات
chmod -R +r Pods
chmod +x Pods/Target\ Support\ Files/Pods-App/*.sh
```

**ثم في Xcode:**
1. أغلق وأعد فتح Xcode
2. افتح **App.xcworkspace**
3. Clean + Build

---

#### الطريقة 3: إصلاح Build Settings في Xcode

1. في Xcode، اضغط على **App** project
2. اختر **Target: App**
3. **Build Settings**
4. ابحث عن: **"User Script Sandboxing"**
5. غيّر من **Yes** إلى **No**
6. احفظ (Cmd+S)
7. Clean + Build

⚠️ **ملاحظة:** هذا يعطل sandboxing - استخدمه كحل أخير فقط!

---

## 🔍 حل الأخطاء المحددة:

### ❌ خطأ: `module 'Cordova' not found`

**السبب:** Capacitor Cordova plugin لم يتم تثبيته بشكل صحيح

**الحل:**
```bash
cd /Users/mujtabanasr/Desktop/MyApp

# تأكد من وجود هذه الملفات
ls node_modules/@capacitor/ios
ls node_modules/@capacitor/cordova

# إذا لم تكن موجودة، أعد التثبيت
npm install @capacitor/ios @capacitor/core
npx cap sync ios

# ثم أعد تثبيت Pods
cd ios/App
pod deintegrate
pod install
```

---

### ❌ خطأ: `None of the input catalogs contained a matching ... AppIcon`

**السبب:** Xcode لا يتعرف على AppIcon في Assets

**✅ الحل الأسهل - في Xcode (مجرب ويعمل 100%):**

#### الطريقة 1: تفعيل Single Size Mode

1. **افتح Xcode**
2. في **Navigator** (الجانب الأيسر)، اضغط على **Assets.xcassets**
3. اضغط على **AppIcon**
4. في **Attributes Inspector** (الجانب الأيمن):
   - ابحث عن قائمة **"All Sizes"** أو **"Single Size"**
   - اختر **"Single Size"**
5. **اسحب صورة 1024x1024** إلى المربع الوحيد
6. احفظ (Cmd+S)
7. **Product** → **Clean Build Folder** (Shift+Cmd+K)
8. **Product** → **Build** (Cmd+B)

#### الطريقة 2: إعادة إنشاء AppIcon من الصفر

1. في Xcode، اضغط بزر الماوس الأيمن على **AppIcon**
2. اختر **"Remove Items"**
3. اضغط بزر الماوس الأيمن على **Assets.xcassets**
4. اختر **"New iOS App Icon"**
5. اسمه **"AppIcon"** (بالضبط)
6. اختر **"Single Size"** من Inspector
7. اسحب صورة 1024x1024 إليه

#### الطريقة 3: التحقق من Build Settings

1. في Xcode، اختر **App** target
2. اذهب إلى **Build Settings**
3. ابحث عن **"Asset Catalog"**
4. تأكد من:
   - **Asset Catalog Compiler - Options**
   - **App Icon Set Name:** `AppIcon`
   - إذا كانت فارغة، اكتب `AppIcon`

#### الطريقة 4: استخدام أداة لتوليد جميع الأحجام

إذا لم تعمل الطرق السابقة، ولّد جميع أحجام الأيقونات:
- اذهب إلى [appicon.co](https://appicon.co)
- ارفع صورة 1024x1024
- حمّل النتيجة (سيعطيك Assets.xcassets كامل)
- استبدل المجلد القديم بالجديد

**⚠️ مهم:** الأيقونة يجب أن تكون:
- ✅ 1024x1024 pixels بالضبط
- ✅ PNG format
- ✅ **بدون شفافية** (no alpha channel)
- ✅ sRGB color profile

---

### ⚠️ تحذير: `Run script build phase '[CP] Embed Pods Frameworks'`

هذا **تحذير فقط** وليس خطأ. التطبيق سيعمل بشكل طبيعي.

**إذا أردت إزالة التحذير:**

1. في Xcode، اضغط على **App** project (الأيقونة الزرقاء في الأعلى)
2. اختر **Target: App**
3. اذهب إلى **Build Phases** (التبويب)
4. ابحث عن **[CP] Embed Pods Frameworks**
5. افتحه (اضغط على السهم ليفتح)
6. **ألغِ تفعيل:** ☐ **Based on dependency analysis**
7. احفظ (Cmd+S)

✅ التحذير سيختفي في المرة القادمة!

---

### ⚠️ تحذير: `'WKProcessPool' is deprecated in iOS 15.0`

هذا **تحذير من Capacitor** نفسه، وليس من كودك.

**معنى التحذير:**
- Capacitor يستخدم `WKProcessPool` قديم
- Apple قالت إن هذا deprecated (لكن لا يزال يعمل)
- التطبيق سيعمل بشكل طبيعي على iOS 15, 16, 17, 18

**هل يجب إصلاحه؟**
- ❌ **لا** - هذا في كود Capacitor نفسه (في node_modules)
- ✅ انتظر حتى يُحدّث Capacitor من فريق التطوير
- ✅ التطبيق سيعمل بدون مشاكل

**إذا أردت إخفاء التحذير:**

1. في Xcode، اذهب إلى **Product** → **Scheme** → **Edit Scheme**
2. اختر **Build** من الجانب الأيسر
3. أضف flag في **Other Warning Flags:**
   ```
   -Wno-deprecated-declarations
   ```
4. احفظ

✅ التحذيرات ستُخفى (لكن الكود سيبقى كما هو)

---

## 🎯 الترتيب الصحيح لفتح المشروع:

### ✅ الطريقة الصحيحة:

```bash
# من Replit، قم بتحميل المشروع كاملاً
# ثم في Terminal على Mac:

cd /Users/mujtabanasr/Desktop/MyApp

# 1. تثبيت dependencies
npm install

# 2. بناء المشروع
npx vite build --base=./

# 3. مزامنة Capacitor
npx cap sync ios

# 4. تثبيت Pods
cd ios/App
pod install

# 5. فتح في Xcode
open App.xcworkspace
```

---

## 🚫 أخطاء شائعة يجب تجنبها:

### ❌ **خطأ 1:** فتح `App.xcodeproj` بدلاً من `App.xcworkspace`
**✅ الصحيح:** دائماً افتح `App.xcworkspace`

### ❌ **خطأ 2:** نسيان `npm install` بعد نسخ المشروع
**✅ الصحيح:** دائماً قم بـ `npm install` أولاً

### ❌ **خطأ 3:** البناء بـ `npm run build` للـ iOS
**✅ الصحيح:** استخدم `npx vite build --base=./` أو `./build-ios.sh`

### ❌ **خطأ 4:** عدم تشغيل `pod install` بعد `npx cap sync`
**✅ الصحيح:** دائماً قم بـ `pod install` بعد أي تغيير

---

## 🔄 إذا استمرت المشاكل:

### الحل الجذري (Reset كامل):

```bash
cd /Users/mujtabanasr/Desktop/MyApp

# 1. حذف كل شيء مؤقت
rm -rf node_modules
rm -rf ios/App/Pods
rm -rf ios/App/Podfile.lock
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# 2. إعادة التثبيت من الصفر
npm install
npx vite build --base=./
npx cap sync ios

# 3. إعادة تثبيت Pods
cd ios/App
pod deintegrate
pod install

# 4. فتح في Xcode
open App.xcworkspace
```

### ثم في Xcode:
1. **Product** → **Clean Build Folder** (`Shift + Cmd + K`)
2. **Product** → **Build** (`Cmd + B`)
3. اختر جهاز المحاكاة (iPhone 15 Pro مثلاً)
4. اضغط على **Run** (`Cmd + R`)

---

## 📱 اختبار التطبيق:

بعد حل المشاكل، جرّب التطبيق:

1. اختر **iPhone 15 Pro** (أو أي simulator)
2. اضغط **Run** (▶️)
3. انتظر حتى يفتح Simulator
4. يجب أن يعمل التطبيق بدون أخطاء!

---

## ✅ Checklist - تأكد من هذه النقاط:

- [ ] تم تثبيت Node.js dependencies بـ `npm install`
- [ ] تم بناء المشروع بـ `npx vite build --base=./`
- [ ] تم مزامنة Capacitor بـ `npx cap sync ios`
- [ ] تم تثبيت CocoaPods بـ `pod install`
- [ ] تم فتح `App.xcworkspace` (وليس .xcodeproj)
- [ ] تم عمل Clean Build Folder في Xcode
- [ ] الأيقونة AppIcon موجودة في Assets

---

## 💡 نصائح إضافية:

### لتحديث التطبيق بعد تعديل الكود:

```bash
# في Replit أو على جهازك:
npx vite build --base=./
npx cap sync ios

# ثم في Xcode فقط:
Product → Clean Build Folder
Product → Build
```

### إذا غيرت App ID أو اسم التطبيق:

```bash
# أعد بناء كل شيء
npx cap sync ios
cd ios/App
pod install
```

---

## 🆘 إذا لم ينجح أي شيء:

1. تأكد من إصدار macOS: يجب أن يكون macOS 12 أو أحدث
2. تأكد من إصدار Xcode: يجب أن يكون Xcode 14 أو أحدث
3. تأكد من Node.js: يجب أن يكون v16 أو أحدث

```bash
# للتحقق:
node --version    # يجب v16 أو أحدث
npm --version     # يجب v8 أو أحدث
pod --version     # يجب 1.11 أو أحدث
```

---

## 📞 معلومات إضافية:

- **App ID:** com.cyclecatrtec.app
- **App Name:** Cycle Care
- **Domain:** cyclecatrtec.com
- **Platform:** iOS 14.0+

---

**بالتوفيق! إذا اتبعت هذه الخطوات، يجب أن يعمل كل شيء بشكل صحيح.** 🚀
