import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const SERVER_URL = 'cyclecaretec.com';

interface StoredCredentials {
  token: string;
  email: string;
  savedAt: number;
}

export interface BiometricStatus {
  isAvailable: boolean;
  biometryType: 'face' | 'fingerprint' | 'none';
  hasCredentials: boolean;
}

export async function checkBiometricAvailability(): Promise<BiometricStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { isAvailable: false, biometryType: 'none', hasCredentials: false };
  }

  try {
    const result = await NativeBiometric.isAvailable();
    const hasCredentials = await hasStoredCredentials();
    
    let biometryType: 'face' | 'fingerprint' | 'none' = 'none';
    const bioType = (result as any).biometryType;
    if (bioType === 1 || bioType === 'faceId' || bioType === 'FACE_ID') {
      biometryType = 'face';
    } else if (bioType === 2 || bioType === 'touchId' || bioType === 'TOUCH_ID' || bioType === 'FINGERPRINT') {
      biometryType = 'fingerprint';
    } else if (result.isAvailable) {
      biometryType = 'fingerprint';
    }

    return {
      isAvailable: result.isAvailable,
      biometryType,
      hasCredentials,
    };
  } catch (error) {
    console.error('[Biometric] Availability check failed:', error);
    return { isAvailable: false, biometryType: 'none', hasCredentials: false };
  }
}

export async function saveCredentialsWithBiometric(token: string, email: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const credentials: StoredCredentials = {
      token,
      email,
      savedAt: Date.now(),
    };

    await NativeBiometric.setCredentials({
      username: email,
      password: JSON.stringify(credentials),
      server: SERVER_URL,
    });

    console.log('[Biometric] Credentials saved successfully');
    return true;
  } catch (error) {
    console.error('[Biometric] Failed to save credentials:', error);
    return false;
  }
}

export async function authenticateWithBiometric(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    await NativeBiometric.verifyIdentity({
      reason: 'تسجيل الدخول إلى Cycle Care',
      title: 'تأكيد الهوية',
      subtitle: 'استخدم البصمة للدخول السريع',
      description: 'Use biometrics to quickly log in',
    });

    const credentials = await NativeBiometric.getCredentials({
      server: SERVER_URL,
    });

    if (credentials.password) {
      const parsed: StoredCredentials = JSON.parse(credentials.password);
      
      const tokenAge = Date.now() - parsed.savedAt;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      if (tokenAge > sevenDays) {
        console.log('[Biometric] Token expired, clearing credentials');
        await clearBiometricCredentials();
        return null;
      }
      
      console.log('[Biometric] Successfully retrieved token');
      return parsed.token;
    }

    return null;
  } catch (error) {
    console.error('[Biometric] Authentication failed or cancelled:', error);
    return null;
  }
}

export async function hasStoredCredentials(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const credentials = await NativeBiometric.getCredentials({
      server: SERVER_URL,
    });
    return !!credentials.password;
  } catch {
    return false;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await NativeBiometric.deleteCredentials({
      server: SERVER_URL,
    });
    console.log('[Biometric] Credentials cleared');
  } catch (error) {
    console.error('[Biometric] Failed to clear credentials:', error);
  }
}
