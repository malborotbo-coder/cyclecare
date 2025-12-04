import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cyclecatrtec.app',
  appName: 'Cycle Care',
  webDir: 'dist/public',
  plugins: {
    Geolocation: {
      permissions: ['location'],
    },
    Camera: {
      permissions: ['photos', 'camera'],
      presentationStyle: 'fullScreen',
      saveToGallery: true,
    },
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    backgroundColor: '#000000',
    preferredContentMode: 'mobile',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#000000',
  },
  server: {
    allowNavigation: [
      'cyclecaretec.com',
      '*.cyclecaretec.com',
      'cyclecatrtec.com',
      '*.cyclecatrtec.com',
      'localhost',
      '127.0.0.1',
      'accounts.google.com',
      '*.google.com',
      'appleid.apple.com',
      '*.supabase.co',
      'voypbnslwxpjscxwsxzi.supabase.co'
    ],
  }
};

export default config;
