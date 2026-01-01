import { Capacitor } from '@capacitor/core';
export interface BiometricStatus {
  isAvailable: boolean;
  biometryType: 'face' | 'fingerprint' | 'none';
  hasCredentials: boolean;
}

export async function checkBiometricAvailability(): Promise<BiometricStatus> {
  // Native biometrics disabled; always report unavailable
  return { isAvailable: false, biometryType: 'none', hasCredentials: false };
}

export async function saveCredentialsWithBiometric(token: string, email: string): Promise<boolean> {
  // No-op when biometrics are disabled
  return false;
}

export async function authenticateWithBiometric(): Promise<string | null> {
  // Biometric auth disabled
  return null;
}

export async function hasStoredCredentials(): Promise<boolean> {
  return false;
}

export async function clearBiometricCredentials(): Promise<void> {
  // No-op
}
