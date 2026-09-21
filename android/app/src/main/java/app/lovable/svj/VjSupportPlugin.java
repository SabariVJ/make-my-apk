package app.lovable.svj;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * VjSupport — opens the device's email client with a prefilled support draft
 * (recipient + subject) via ACTION_SENDTO with a mailto: URI.
 *
 * The app NEVER sends email, never touches the user's inbox, and never
 * hardcodes a specific mail app: the Android chooser lets the user pick
 * Gmail / Outlook / Samsung Email / etc., and the user must press SEND
 * inside that client themselves.
 */
@CapacitorPlugin(name = "VjSupport")
public class VjSupportPlugin extends Plugin {

    @PluginMethod
    public void openEmail(PluginCall call) {
        String to = call.getString("to");
        String subject = call.getString("subject", "");
        String body = call.getString("body", "");

        if (to == null || to.isEmpty()) {
            call.reject("Missing recipient");
            return;
        }

        // Build a properly encoded mailto: URI (handles +, spaces, %xx safely).
        Uri.Builder builder = new Uri.Builder();
        builder.scheme("mailto");
        builder.opaquePart(to);
        builder.appendQueryParameter("subject", subject);
        if (body != null && !body.isEmpty()) {
            builder.appendQueryParameter("body", body);
        }
        Intent intent = new Intent(Intent.ACTION_SENDTO);
        intent.setData(builder.build());
        // Grant no extra access; this only opens a compose draft.

        try {
            Intent chooser = Intent.createChooser(intent, "Email SVJ Support");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("NO_EMAIL_APP");
        }
    }
}
