package com.cyclecare.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // تسجيل الـ Plugin يدوياً لضمان تحميله بشكل صحيح
        registerPlugin(GoogleAuth.class);
    }
}
