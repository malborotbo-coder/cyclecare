#!/bin/bash
# Script to build the app for iOS with correct base path

echo "🔨 Building app for iOS with Capacitor..."
npx vite build --base=./

echo "📱 Syncing with iOS project..."
npx cap sync ios

echo "✅ Done! You can now open the project in Xcode:"
echo "   cd ios/App && open App.xcworkspace"
