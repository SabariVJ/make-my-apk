package app.lovable.svj;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import androidx.annotation.Nullable;

/**
 * Durable inbox for Wear OS Data Layer messages.
 *
 * The watch can complete a workout while the SVJ phone app is not running, so
 * messages are persisted here by {@link VjWearListenerService} and drained by
 * {@link VjWearPlugin} when the app next starts. Every event carries a stable
 * id so the JavaScript side can acknowledge exactly what it has handled — a
 * repeated delivery therefore becomes a no-op instead of a duplicate workout.
 *
 * Nothing sensitive is stored: measurements, session state and a session id.
 */
final class WearInboxStore {

    /** Prefs file holding the not-yet-acknowledged events. */
    private static final String INBOX_PREFS = "svj_wear_inbox";
    /** Prefs file holding the last handshake/state summary. */
    private static final String STATUS_PREFS = "svj_wear_status";

    private static final String EVENT_PREFIX = "event.";
    private static final int MAX_EVENTS = 200;

    private static final String KEY_PROTOCOL = "protocol";
    private static final String KEY_CAPABILITIES = "capabilities";
    private static final String KEY_LAST_SEEN = "lastSeenMs";
    private static final String KEY_ACTIVE_SESSION = "activeSessionId";

    /** In-process delivery path so a running app never waits for a drain. */
    interface Sink {
        void onWearEvent(JSONObject event);
    }

    private static volatile Sink sink;

    private WearInboxStore() {
    }

    static void setSink(@Nullable Sink next) {
        sink = next;
    }

    /**
     * Persist one message and hand it to the running app, if any.
     *
     * @param type one of handshake, sample, state, summary
     * @param payloadJson the JSON string the watch sent
     * @return the stored event, or null when the payload was not valid JSON
     */
    @Nullable
    static synchronized JSONObject append(
            Context context, String type, @Nullable String payloadJson, long receivedAtMs) {
        if (payloadJson == null) return null;
        JSONObject payload;
        try {
            payload = new JSONObject(payloadJson);
        } catch (Exception malformed) {
            // A payload that is not a JSON object is dropped rather than guessed at.
            return null;
        }

        String id = UUID.randomUUID().toString();
        JSONObject event = new JSONObject();
        try {
            event.put("id", id);
            event.put("type", type);
            String sessionId = payload.optString("sessionId", "");
            if (!sessionId.isEmpty()) event.put("sessionId", sessionId);
            event.put("payload", payload);
            event.put("receivedAtMs", receivedAtMs);
        } catch (Exception impossible) {
            return null;
        }

        SharedPreferences inbox = context.getSharedPreferences(INBOX_PREFS, Context.MODE_PRIVATE);
        inbox.edit().putString(EVENT_PREFIX + id, event.toString()).apply();
        trim(inbox);

        if ("handshake".equals(type) || "state".equals(type)) {
            updateStatus(context, payload);
        }

        Sink current = sink;
        if (current != null) {
            try {
                current.onWearEvent(event);
            } catch (Exception ignored) {
                // The inbox is the source of truth; a listener failure is harmless.
            }
        }
        return event;
    }

    /** Every unacknowledged event, oldest first. */
    static JSONArray events(Context context) {
        SharedPreferences inbox = context.getSharedPreferences(INBOX_PREFS, Context.MODE_PRIVATE);
        JSONArray events = new JSONArray();
        List<String> keys = new ArrayList<>(inbox.getAll().keySet());
        Collections.sort(keys);
        for (String key : keys) {
            String raw = inbox.getString(key, null);
            if (raw == null) continue;
            try {
                events.put(new JSONObject(raw));
            } catch (Exception malformed) {
                inbox.edit().remove(key).apply();
            }
        }
        return events;
    }

    static void acknowledge(Context context, List<String> ids) {
        if (ids.isEmpty()) return;
        SharedPreferences inbox = context.getSharedPreferences(INBOX_PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = inbox.edit();
        for (String id : ids) {
            editor.remove(EVENT_PREFIX + id);
        }
        editor.apply();
    }

    private static void trim(SharedPreferences inbox) {
        List<String> keys = new ArrayList<>(inbox.getAll().keySet());
        if (keys.size() <= MAX_EVENTS) return;
        Collections.sort(keys);
        SharedPreferences.Editor editor = inbox.edit();
        for (int index = 0; index < keys.size() - MAX_EVENTS; index++) {
            editor.remove(keys.get(index));
        }
        editor.apply();
    }

    /** Fold the watch's own declaration into the status snapshot. */
    private static void updateStatus(Context context, JSONObject payload) {
        SharedPreferences prefs = context.getSharedPreferences(STATUS_PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit().putLong(KEY_LAST_SEEN, System.currentTimeMillis());

        if (payload.has("protocol")) {
            editor.putInt(KEY_PROTOCOL, payload.optInt("protocol", 0));
        }
        JSONObject capabilities = payload.optJSONObject("capabilities");
        if (capabilities != null) {
            JSONArray names = new JSONArray();
            java.util.Iterator<String> keys = capabilities.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (capabilities.optBoolean(key, false)) names.put(key);
            }
            editor.putString(KEY_CAPABILITIES, names.toString());
        }
        String sessionId = payload.optString("sessionId", "");
        String state = payload.optString("state", "");
        if (state.isEmpty() || "finished".equals(state)) {
            editor.remove(KEY_ACTIVE_SESSION);
        } else if (!sessionId.isEmpty()) {
            editor.putString(KEY_ACTIVE_SESSION, sessionId);
        }
        editor.apply();
    }

    static long lastSeenMs(Context context) {
        return context.getSharedPreferences(STATUS_PREFS, Context.MODE_PRIVATE)
                .getLong(KEY_LAST_SEEN, 0L);
    }

    static int protocol(Context context) {
        return context.getSharedPreferences(STATUS_PREFS, Context.MODE_PRIVATE)
                .getInt(KEY_PROTOCOL, 0);
    }

    static JSONArray capabilities(Context context) {
        String raw = context.getSharedPreferences(STATUS_PREFS, Context.MODE_PRIVATE)
                .getString(KEY_CAPABILITIES, "[]");
        try {
            return new JSONArray(raw);
        } catch (Exception malformed) {
            return new JSONArray();
        }
    }

    @Nullable
    static String activeSessionId(Context context) {
        String value = context.getSharedPreferences(STATUS_PREFS, Context.MODE_PRIVATE)
                .getString(KEY_ACTIVE_SESSION, null);
        return value == null || value.isEmpty() ? null : value;
    }
}
