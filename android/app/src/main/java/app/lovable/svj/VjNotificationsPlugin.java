package app.lovable.svj;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Native notification bridge used by the web layer's NotificationCoordinator.
 *
 * Schedules are persisted by {@link VjNotificationReceiver}, restored after
 * device reboot/app update, and delivered through Android notification channels.
 * This plugin never invents schedules: it only applies the already-deduplicated,
 * preference-aware plan produced by src/app/lib/notifications.ts.
 */
@CapacitorPlugin(
    name = "VjNotifications",
    permissions = {
        @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
    }
)
public class VjNotificationsPlugin extends Plugin {

    @Override
    public void load() {
        VjNotificationReceiver.ensureChannels(getContext());
        VjNotificationReceiver.reschedulePersisted(getContext());
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", notificationsGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationsGranted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", notificationsGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void replaceSchedules(PluginCall call) {
        JSArray schedules = call.getArray("schedules");
        if (schedules == null) {
            call.reject("schedules is required");
            return;
        }
        try {
            int count = VjNotificationReceiver.replaceSchedules(getContext(), schedules);
            JSObject result = new JSObject();
            result.put("scheduled", count);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not schedule notifications: " + error.getMessage());
        }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        VjNotificationReceiver.cancelAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void notifyNow(PluginCall call) {
        Integer id = call.getInt("id");
        String title = call.getString("title");
        String body = call.getString("body");
        String channel = call.getString("channel", "progress");
        String target = call.getString("target", "profile");

        if (id == null || title == null || body == null) {
            call.reject("id, title and body are required");
            return;
        }
        if (!notificationsGranted()) {
            call.reject("Notification permission not granted");
            return;
        }

        VjNotificationReceiver.postNotification(
            getContext(),
            id,
            title,
            body,
            channel,
            target
        );
        call.resolve();
    }

    private boolean notificationsGranted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return getPermissionState("notifications") == PermissionState.GRANTED;
    }
}
