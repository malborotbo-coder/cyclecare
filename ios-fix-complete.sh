#!/bin/bash

echo "========================================"
echo "Cycle Care iOS - Complete Fix Script"
echo "========================================"
echo ""

# Find project directory
PROJECT_DIR=""

if [ -d "$HOME/Desktop/MyApp" ]; then
  PROJECT_DIR="$HOME/Desktop/MyApp"
elif [ -d "$HOME/Downloads/MyApp" ]; then
  PROJECT_DIR="$HOME/Downloads/MyApp"
else
  # Search for any directory with ios/App
  for dir in "$HOME/Desktop"/* "$HOME/Downloads"/*; do
    if [ -d "$dir/ios/App" ]; then
      PROJECT_DIR="$dir"
      break
    fi
  done
fi

if [ -z "$PROJECT_DIR" ]; then
  echo "ERROR: Could not find iOS project!"
  echo "Please enter full path to project:"
  read -r PROJECT_DIR
fi

echo "Using project: $PROJECT_DIR"
cd "$PROJECT_DIR" || exit 1
echo ""

# Step 1: Create .env.local
echo "Step 1/8: Creating .env.local..."
echo "VITE_NATIVE_AUTH_BYPASS=true" > .env.local
echo "Done: .env.local created"
echo ""

# Step 2: Create NativeAuthContext.tsx
echo "Step 2/8: Creating NativeAuthContext.tsx..."
mkdir -p client/src/contexts
cat > client/src/contexts/NativeAuthContext.tsx << 'EOF'
import { createContext, useContext, useMemo, ReactNode } from "react";
import { Capacitor } from "@capacitor/core";

interface NativeUser {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
}

const NativeUserContext = createContext<NativeUser | null>(null);

export const useNativeUser = () => useContext(NativeUserContext);

interface NativeAuthProviderProps {
  children: ReactNode;
}

export function NativeAuthProvider({ children }: NativeAuthProviderProps) {
  const platform = useMemo(() => Capacitor.getPlatform(), []);
  const isNative = platform !== 'web';
  const bypassAuth = import.meta.env.VITE_NATIVE_AUTH_BYPASS === 'true';

  console.log('[NativeAuthProvider] Platform:', platform, 'Bypass:', bypassAuth);

  if (isNative && bypassAuth) {
    console.log('[NativeAuthProvider] DEVELOPMENT MODE: Using mock user');
    const mockUser: NativeUser = {
      id: 1,
      username: "iOS User",
      email: "user@cyclecatrtec.com",
      isAdmin: false,
    };
    return (
      <NativeUserContext.Provider value={mockUser}>
        {children}
      </NativeUserContext.Provider>
    );
  }

  return (
    <NativeUserContext.Provider value={null}>
      {children}
    </NativeUserContext.Provider>
  );
}
EOF
echo "Done: NativeAuthContext.tsx created"
echo ""

# Step 3: Create useCurrentUser.ts
echo "Step 3/8: Creating useCurrentUser.ts..."
cat > client/src/hooks/useCurrentUser.ts << 'EOF'
import { useNativeUser } from "@/contexts/NativeAuthContext";
import { useAuth } from "./useAuth";

export function useCurrentUser() {
  const nativeUser = useNativeUser();
  
  if (nativeUser) {
    return {
      user: nativeUser,
      isLoading: false,
      isAuthenticated: true,
    };
  }
  
  return useAuth();
}
EOF
echo "Done: useCurrentUser.ts created"
echo ""

# Step 4: Update App.tsx
echo "Step 4/8: Updating App.tsx..."
if [ -f "client/src/App.tsx" ]; then
  # Add NativeAuthProvider import if not exists
  if ! grep -q "NativeAuthProvider" client/src/App.tsx; then
    sed -i.bak '/import { ThemeProvider }/a\
import { NativeAuthProvider } from "@/contexts/NativeAuthContext";' client/src/App.tsx
  fi
  
  # Wrap with NativeAuthProvider
  if ! grep -q "<NativeAuthProvider>" client/src/App.tsx; then
    sed -i.bak 's/<QueryClientProvider client={queryClient}>/<QueryClientProvider client={queryClient}>\
      <NativeAuthProvider>/' client/src/App.tsx
    sed -i.bak 's/<\/QueryClientProvider>/<\/NativeAuthProvider>\
    <\/QueryClientProvider>/' client/src/App.tsx
  fi
  
  echo "Done: App.tsx updated"
else
  echo "WARNING: App.tsx not found"
fi
echo ""

# Step 5: Update HomePage.tsx
echo "Step 5/8: Updating HomePage.tsx..."
if [ -f "client/src/components/HomePage.tsx" ]; then
  sed -i.bak 's/import { useAuth }/import { useCurrentUser }/g' client/src/components/HomePage.tsx
  sed -i.bak 's/const { user } = useAuth()/const { user } = useCurrentUser()/g' client/src/components/HomePage.tsx
  echo "Done: HomePage.tsx updated"
else
  echo "WARNING: HomePage.tsx not found"
fi
echo ""

# Step 6: Update TechnicianRegistration.tsx
echo "Step 6/8: Updating TechnicianRegistration.tsx..."
if [ -f "client/src/components/TechnicianRegistration.tsx" ]; then
  sed -i.bak 's/import { useAuth }/import { useCurrentUser }/g' client/src/components/TechnicianRegistration.tsx
  sed -i.bak 's/const { user } = useAuth()/const { user } = useCurrentUser()/g' client/src/components/TechnicianRegistration.tsx
  echo "Done: TechnicianRegistration.tsx updated"
else
  echo "WARNING: TechnicianRegistration.tsx not found"
fi
echo ""

# Step 7: Build for iOS
echo "Step 7/8: Building for iOS (this may take a minute)..."
NODE_ENV=production npx vite build --base=./ 2>&1 | tail -5
if [ $? -eq 0 ]; then
  echo "Done: Build successful"
else
  echo "ERROR: Build failed"
  exit 1
fi
echo ""

# Step 8: Sync with iOS
echo "Step 8/8: Syncing with iOS..."
npx cap sync ios 2>&1 | tail -5
if [ $? -eq 0 ]; then
  echo "Done: Sync successful"
else
  echo "ERROR: Sync failed"
  exit 1
fi
echo ""

echo "========================================"
echo "SUCCESS! All updates completed!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Opening Xcode..."
cd ios/App && open App.xcworkspace
echo ""
echo "2. In Xcode:"
echo "   - Product > Clean Build Folder (Shift+Cmd+K)"
echo "   - Product > Build (Cmd+B)"
echo "   - Select your device"
echo "   - Press Run"
echo ""
echo "The app will open directly without login screen!"
echo "========================================"
