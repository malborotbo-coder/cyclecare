import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const redirectTo = params.get("redirectTo") || "/";

    if (token) {
      localStorage.setItem("auth_token", token);
      console.log("JWT saved:", token);
    } else {
      console.error("No token received!");
    }

    setLocation(redirectTo);
  }, []);

  return (
    <div style={{ padding: 40, textAlign: "center", fontSize: 20 }}>
      <p>Signing you in… 🚴‍♂️💨</p>
    </div>
  );
}
