#!/bin/bash
# الحل النهائي لمشكلة الشاشة البيضاء - سكريبت تلقائي

echo "🚀 الحل النهائي لمشكلة iOS - Cycle Care"
echo "============================================"
echo ""

# تحقق من المسار
if [ ! -f "package.json" ]; then
  echo "❌ خطأ: يرجى تشغيل هذا السكريبت من مجلد المشروع الرئيسي"
  echo "cd /Users/mujtabanasr/Desktop/MyApp"
  exit 1
fi

echo "✅ المسار صحيح"
echo ""

# الخطوة 1: تنظيف
echo "🧹 الخطوة 1/5: تنظيف الملفات القديمة..."
rm -rf dist
rm -rf ios/App/App/public
rm -rf node_modules/.vite
echo "✅ تم التنظيف"
echo ""

# الخطوة 2: تثبيت dependencies (إذا لزم)
echo "📦 الخطوة 2/5: التحقق من dependencies..."
if [ ! -d "node_modules/@capacitor/core" ]; then
  echo "⚠️  يبدو أن Capacitor غير مثبت، جاري التثبيت..."
  npm install
else
  echo "✅ Dependencies موجودة"
fi
echo ""

# الخطوة 3: بناء التطبيق
echo "🔨 الخطوة 3/5: بناء التطبيق للـ iOS (Production Mode)..."
NODE_ENV=production npx vite build --base=./

# تحقق من نجاح البناء
if [ ! -d "dist" ]; then
  echo "❌ خطأ: فشل بناء التطبيق! dist غير موجود"
  exit 1
fi

# Check for either dist/index.html or dist/public/index.html
if [ -f "dist/public/index.html" ]; then
  echo "✅ تم البناء بنجاح (dist/public/index.html)"
elif [ -f "dist/index.html" ]; then
  echo "✅ تم البناء بنجاح (dist/index.html)"
else
  echo "❌ خطأ: index.html غير موجود في dist أو dist/public"
  echo "محتويات dist:"
  ls -la dist
  exit 1
fi
echo ""

# الخطوة 4: مزامنة مع iOS
echo "📱 الخطوة 4/5: مزامنة مع iOS..."
npx cap sync ios

# تحقق من المزامنة
if [ ! -d "ios/App/App/public" ]; then
  echo "❌ خطأ: فشلت المزامنة!"
  exit 1
fi
echo "✅ تمت المزامنة"
echo ""

# الخطوة 5: التحقق
echo "🔍 الخطوة 5/5: التحقق من الملفات..."
echo "   📄 index.html: $(wc -c < ios/App/App/public/index.html) bytes"
echo "   📁 Assets folder: $(ls -1 ios/App/App/public/assets | wc -l) files"
echo ""

echo "✅ ✅ ✅ اكتمل البناء بنجاح! ✅ ✅ ✅"
echo ""
echo "الخطوات التالية:"
echo "=================="
echo "1. افتح Xcode:"
echo "   cd ios/App && open App.xcworkspace"
echo ""
echo "2. في Xcode:"
echo "   - Product → Clean Build Folder (Shift+Cmd+K)"
echo "   - Product → Build (Cmd+B)"
echo "   - اختر أي iPhone Simulator"
echo "   - Run ▶️"
echo ""
echo "3. للتشخيص (إذا استمرت المشكلة):"
echo "   - افتح Safari"
echo "   - Develop → Simulator → Cycle Care"
echo "   - ابحث في Console عن: [AuthWrapper] Platform"
echo "   - يجب أن تشوف: Platform: ios"
echo ""
echo "🎉 بالتوفيق!"
