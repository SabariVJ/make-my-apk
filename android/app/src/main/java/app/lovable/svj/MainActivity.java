package app.lovable.svj;

import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins: they live in this module, so `cap sync` never adds
        // them to android/app/src/main/assets/capacitor.plugins.json. Registering
        // them here is what makes Capacitor load them and expose them to
        // JavaScript. Must run BEFORE super.onCreate(), which builds the bridge.

        // Step source (hardware step counter / detector / accelerometer).
        registerPlugin(VjPedometerPlugin.class);

        // Native GPS activity recorder: a real Android foreground service with a
        // persistent "SVJ is recording your activity" notification. Location is
        // collected ONLY between an explicit start and stop.
        registerPlugin(VjWorkoutPlugin.class);

        // Health Connect is an Android 8.0+ (API 26) platform component. It is
        // only loaded where it can exist, so older devices never touch its
        // classes. SVJ only reads what the user explicitly granted.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            registerPlugin(VjHealthConnectPlugin.class);
        }

        super.onCreate(savedInstanceState);
    }
}
