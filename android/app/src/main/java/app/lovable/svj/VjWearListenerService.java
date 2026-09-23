package app.lovable.svj;

import com.google.android.gms.wearable.CapabilityInfo;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import org.json.JSONObject;

/**
 * Receives SVJ Wear OS Data Layer messages even when the phone app is not
 * running, and buffers them in {@link WearInboxStore}.
 *
 * This is what makes an offline watch workout safe: the watch records and
 * finishes with no phone nearby, and the summary is delivered here as soon as
 * the Data Layer reconnects — whether or not SVJ is open on the phone.
 */
public class VjWearListenerService extends WearableListenerService {

    private static final String PATH_PREFIX = "/svj/wear/";

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        String path = messageEvent.getPath();
        if (path == null || !path.startsWith(PATH_PREFIX)) return;
        String type = typeForPath(path);
        if (type == null) return;

        String payload = decodePayload(messageEvent.getData());
        if (payload == null) return;

        JSONObject stored = WearInboxStore.append(
                getApplicationContext(), type, payload, System.currentTimeMillis());
        if (stored != null) {
            // A background delivery is the moment to make sure the durable
            // outbox of unsent phone→watch commands is not stuck either.
            VjWearPlugin.flushPendingCommand(getApplicationContext());
        }
    }

    @Override
    public void onCapabilityChanged(CapabilityInfo capabilityInfo) {
        // Capability changes are surfaced by VjWearPlugin while the app runs;
        // there is nothing to buffer when it is closed.
    }

    /**
     * SVJ sends the payload as raw UTF-8 JSON bytes (simplest, least lossy),
     * with a DataMap fallback for compatibility with older senders.
     */
    private static String decodePayload(byte[] raw) {
        if (raw == null || raw.length == 0) return null;
        String text = new String(raw, java.nio.charset.StandardCharsets.UTF_8).trim();
        if (text.startsWith("{") && text.endsWith("}")) return text;
        try {
            DataMap data = DataMap.fromByteArray(raw);
            return data == null ? null : data.getString("payload");
        } catch (Exception notADataMap) {
            return null;
        }
    }

    private static String typeForPath(String path) {
        switch (path) {
            case "/svj/wear/handshake":
                return "handshake";
            case "/svj/wear/sample":
                return "sample";
            case "/svj/wear/state":
                return "state";
            case "/svj/wear/summary":
                return "summary";
            default:
                return null;
        }
    }
}
