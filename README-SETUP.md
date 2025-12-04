# Cycle Care - iOS & Android Setup Guide

## ✅ Prerequisites
- Android Studio (latest version)
- Xcode 15+
- Node.js 18+
- Java JDK 11+

## 📦 Android Setup (Android Studio)

### Step 1: Open Project
1. Open **Android Studio**
2. Click **File > Open**
3. Navigate to `android/` folder and open it
4. Wait for Gradle sync (~3-5 minutes)

### Step 2: Run App
1. Click **Run > Run 'app'** (or press Shift+F10)
2. Select your device/emulator
3. App will build and launch

### Important Android Notes
- Gradle version: **8.13.0** ✅
- API Level: 24+
- JDK: 11+ required

---

## 📱 iOS Setup (Xcode)

### Step 1: Open Project
1. Open **Xcode**
2. Click **File > Open**
3. Navigate to `ios/App/` folder
4. Open **App.xcworkspace** (NOT xcodeproj!)

### Step 2: Configure Signing
1. Select **App** in Project Navigator
2. Go to **Signing & Capabilities** tab
3. Set Team ID for both targets
4. Choose provisioning profile

### Step 3: Run App
1. Select simulator or device
2. Click **Product > Run** (or press Cmd+R)
3. App will build and launch

### Important iOS Notes
- **Use .xcworkspace, NOT .xcodeproj**
- CocoaPods automatically installed
- iOS 13+ supported

---

## 🔧 Troubleshooting

### Android
- **Gradle Error**: Delete `android/.gradle` and reopen
- **Build Error**: Run `./gradlew clean build`
- **SDK not found**: Update Android SDK in Android Studio

### iOS
- **Pod Error**: Run `cd ios && pod install`
- **Signing Error**: Update provisioning profile in Xcode
- **Build Error**: Select physical device (not simulator may need signing)

---

## 📝 Project Structure
```
cycle-care/
├── android/           # Android project (ready for Android Studio)
├── ios/               # iOS project (ready for Xcode)
├── src/               # Web source code
├── dist/public/       # Compiled web assets
└── capacitor.config.ts # Capacitor configuration
```

---

## ✨ Features Included
- ✅ Bike maintenance booking
- ✅ Professional technician management
- ✅ Admin dashboard
- ✅ Arabic/English bilingual support
- ✅ GPS location integration
- ✅ Invoice PDF generation
- ✅ Payment integration
- ✅ User authentication

---

Built with **Capacitor 7.4.4** ✨
