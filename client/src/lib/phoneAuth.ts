// Phone Auth helpers (additive only; existing auth logic intact)
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { auth } from "./firebase";

let recaptchaVerifier: RecaptchaVerifier | null = null;

function getRecaptcha(): RecaptchaVerifier {
  if (typeof window === "undefined") {
    throw new Error("reCAPTCHA is only available in the browser");
  }

  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
      callback: () => {
        // Token generated; no-op because we trigger verification immediately
      },
      "expired-callback": () => {
        recaptchaVerifier = null;
      },
    });
  }

  return recaptchaVerifier;
}

// Send OTP SMS to the given phone number (E.164)
export async function sendPhoneOtp(phoneNumber: string): Promise<ConfirmationResult> {
  const verifier = getRecaptcha();
  try {
    return await signInWithPhoneNumber(auth, phoneNumber, verifier);
  } catch (err) {
    // Reset verifier on failure so we can retry cleanly
    recaptchaVerifier = null;
    throw err;
  }
}

// Confirm the OTP code with the confirmation result returned by sendPhoneOtp
export function confirmPhoneOtp(confirmation: ConfirmationResult, code: string) {
  return confirmation.confirm(code);
}
