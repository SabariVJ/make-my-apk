package app.lovable.svj;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugin: it lives in this module, so `cap sync` never adds it
        // to android/app/src/main/assets/capacitor.plugins.json. Registering it
        // here is what makes Capacitor load it and expose it to JavaScript.
        // Must run BEFORE super.onCreate(), which builds the bridge.
        registerPlugin(VjPedometerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
