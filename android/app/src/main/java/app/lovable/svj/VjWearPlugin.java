package app.lovable.svj;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.CapabilityInfo;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * SVJ Wear OS bridge.
 *
 * Exposes the Wear OS Data Layer to the web layer: companion discovery, the
 * durable inbox of watch messages (see {@link WearInboxStore}), and commands
 * sent back to the watch. All payloads are JSON strings so the Kotlin watch
 * app and the TypeScript phone app share one contract.
 *
 * The phone never awards anything from these messages: watch data is activity
 * evidence, and the server-authoritative pipeline decides rewards.
 */
@CapacitorPlugin(name = "VjWear")
public class VjWearPlugin extends Plugin {

    /** Capability the SVJ Wear OS app advertises. */
    private static final String WATCH_CAPABILITY = "svj_wear_companion";
    private static final String COMMAND_PATH = "/svj/wear/command";
    private static final String OUTBOX_PREFS = "svj_wear_outbox";
    private static final String OUTBOX_KEY = "pending";
    private static final long POLL_INTERVAL_MS = 10_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean polling;
    private boolean lastConnected;
    private boolean lastInstalled;

    private final Runnable poller = new Runnable() {
        @Override
        public void run() {
            if (!polling) return;
            queryStatus(null);
            handler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    @Override
    public void load() {
        WearInboxStore.setSink(event -> {
            // Delivered off the main thread, so hop back before notifying.
            handler.post(() -> {
                Object payload = jsonToJs(event);
                if (payload instanceof JSObject) {
                    notifyListeners("wearEvent", (JSObject) payload);
                }
            });
        });
        polling = true;
        handler.post(poller);
        flushPendingCommand(getContext());
    }

    @Override
    protected void handleOnResume() {
        // Returning to the app is the moment a watch may have come back in
        // range, and the moment any queued command should be retried.
        queryStatus(null);
        flushPendingCommand(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        polling = false;
        handler.removeCallbacks(poller);
        WearInboxStore.setSink(null);
        super.handleOnDestroy();
    }

    // ── API surface ────────────────────────────────────────────────────────

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("playServices", playServicesAvailable());
        call.resolve(result);
    }

    @PluginMethod
    public void getCompanionStatus(PluginCall call) {
        queryStatus(call);
    }

    @PluginMethod
    public void getPendingEvents(PluginCall call) {
        JSObject result = new JSObject();
        result.put("events", WearInboxStore.events(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void acknowledgeEvents(PluginCall call) {
        List<String> ids = new ArrayList<>();
        JSArray array = call.getArray("ids");
        if (array != null) {
            try {
                for (Object value : array.toList()) {
                    if (value instanceof String) ids.add((String) value);
                }
            } catch (Exception ignored) {
                // Nothing to acknowledge.
            }
        }
        WearInboxStore.acknowledge(getContext(), ids);
        JSObject result = new JSObject();
        result.put("acknowledged", ids.size());
        call.resolve(result);
    }

    @PluginMethod
    public void sendCommand(PluginCall call) {
        String type = call.getString("type");
        if (type == null) {
            call.reject("A command type is required");
            return;
        }
        JSONObject command = new JSONObject();
        try {
            command.put("type", type);
            String sessionId = call.getString("sessionId");
            if (sessionId != null) command.put("sessionId", sessionId);
            String activityType = call.getString("activityType");
            if (activityType != null) command.put("activityType", activityType);
        } catch (Exception impossible) {
            call.reject("Could not build the command");
            return;
        }
        dispatchCommand(getContext(), command.toString(), call);
    }

    // ── Data Layer plumbing ───────────────────────────────────────────────

    private boolean playServicesAvailable() {
        int status = GoogleApiAvailability.getInstance()
                .isGooglePlayServicesAvailable(getContext());
        return status == ConnectionResult.SUCCESS;
    }

    private void queryStatus(PluginCall call) {
        Wearable.getCapabilityClient(getContext())
                .getCapability(WATCH_CAPABILITY, CapabilityClient.FILTER_ALL)
                .addOnCompleteListener(task -> {
                    JSObject result = new JSObject();
                    result.put("available", true);
                    boolean installed = false;
                    boolean connected = false;
                    String nodeName = null;
                    if (task.isSuccessful() && task.getResult() != null) {
                        CapabilityInfo info = task.getResult();
                        Set<Node> nodes = info.getNodes();
                        installed = !nodes.isEmpty();
                        for (Node node : nodes) {
                            if (node.isNearby()) {
                                connected = true;
                                nodeName = node.getDisplayName();
                                break;
                            }
                        }
                        if (nodeName == null && !nodes.isEmpty()) {
                            nodeName = nodes.iterator().next().getDisplayName();
                        }
                    }
                    result.put("installed", installed);
                    result.put("connected", connected);
                    result.put("nodeName", nodeName);

                    Context context = getContext();
                    long lastSeen = WearInboxStore.lastSeenMs(context);
                    if (lastSeen > 0) result.put("lastSeenMs", lastSeen);
                    int protocol = WearInboxStore.protocol(context);
                    if (protocol > 0) result.put("protocol", protocol);
                    result.put("capabilities", capabilitiesObject(WearInboxStore.capabilities(context)));
                    String activeSession = WearInboxStore.activeSessionId(context);
                    if (activeSession != null) result.put("activeSessionId", activeSession);

                    if (call != null) {
                        call.resolve(result);
                    }
                    if (installed != lastInstalled || connected != lastConnected) {
                        lastInstalled = installed;
                        lastConnected = connected;
                        JSObject change = new JSObject();
                        change.put("installed", installed);
                        change.put("connected", connected);
                        change.put("nodeName", nodeName);
                        notifyListeners("wearConnection", change);
                    }
                    if (connected) flushPendingCommand(context);
                });
    }

    private static JSObject capabilitiesObject(JSONArray names) {
        JSObject capabilities = new JSObject();
        for (String key :
                new String[] {"heart_rate", "steps", "workout", "distance", "calories"}) {
            boolean granted = false;
            for (int index = 0; index < names.length(); index++) {
                if (key.equals(names.optString(index))) {
                    granted = true;
                    break;
                }
            }
            capabilities.put(key, granted);
        }
        return capabilities;
    }

    /** JSONObject → JSObject without re-serializing through strings. */
    static Object jsonToJs(Object value) {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            JSObject js = new JSObject();
            java.util.Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                js.put(key, jsonToJs(object.opt(key)));
            }
            return js;
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            JSArray js = new JSArray();
            for (int index = 0; index < array.length(); index++) {
                js.put(jsonToJs(array.opt(index)));
            }
            return js;
        }
        if (value == null || value == JSONObject.NULL) return null;
        return value;
    }

    private void dispatchCommand(Context context, String payload, PluginCall call) {
        Wearable.getCapabilityClient(context)
                .getCapability(WATCH_CAPABILITY, CapabilityClient.FILTER_REACHABLE)
                .addOnCompleteListener(task -> {
                    Node target = null;
                    if (task.isSuccessful() && task.getResult() != null) {
                        for (Node node : task.getResult().getNodes()) {
                            if (node.isNearby()) {
                                target = node;
                                break;
                            }
                        }
                    }
                    if (target == null) {
                        // The watch is away: keep the command for when it returns.
                        stashPendingCommand(context, payload);
                        if (call != null) {
                            JSObject result = new JSObject();
                            result.put("sent", 0);
                            result.put("queued", true);
                            call.resolve(result);
                        }
                        return;
                    }
                    final String nodeId = target.getId();
                    Wearable.getMessageClient(context)
                            .sendMessage(nodeId, COMMAND_PATH, payload.getBytes(StandardCharsets.UTF_8))
                            .addOnCompleteListener(sent -> {
                                boolean ok = sent.isSuccessful();
                                if (!ok) stashPendingCommand(context, payload);
                                if (call != null) {
                                    JSObject result = new JSObject();
                                    result.put("sent", ok ? 1 : 0);
                                    result.put("queued", !ok);
                                    call.resolve(result);
                                }
                            });
                });
    }

    private static void stashPendingCommand(Context context, String payload) {
        context.getSharedPreferences(OUTBOX_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(OUTBOX_KEY, payload)
                .apply();
    }

    /**
     * Retry a command the watch never received. Called on app resume and when
     * the WearableListenerService sees the Data Layer come back.
     */
    static void flushPendingCommand(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(OUTBOX_PREFS, Context.MODE_PRIVATE);
        String pending = prefs.getString(OUTBOX_KEY, null);
        if (pending == null) return;
        Wearable.getCapabilityClient(context)
                .getCapability(WATCH_CAPABILITY, CapabilityClient.FILTER_REACHABLE)
                .addOnCompleteListener(task -> {
                    Node target = null;
                    if (task.isSuccessful() && task.getResult() != null) {
                        for (Node node : task.getResult().getNodes()) {
                            if (node.isNearby()) {
                                target = node;
                                break;
                            }
                        }
                    }
                    if (target == null) return;
                    Wearable.getMessageClient(context)
                            .sendMessage(
                                    target.getId(), COMMAND_PATH, pending.getBytes(StandardCharsets.UTF_8))
                            .addOnCompleteListener(sent -> {
                                if (sent.isSuccessful()) {
                                    prefs.edit().remove(OUTBOX_KEY).apply();
                                }
                            });
                });
    }
}
