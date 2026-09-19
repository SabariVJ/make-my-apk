package app.lovable.svj;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelUuid;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Standard Bluetooth SIG wearable sensor plugin.
 *
 * Discovers and connects to any BLE device exposing the Heart Rate Service
 * (0x180D), subscribes to Heart Rate Measurement (0x2A37) notifications and
 * reports battery level (0x180F/0x2A19). No vendor SDKs, no pairing dialogs:
 * identity comes from the GATT connection itself.
 */
@CapacitorPlugin(name = "VjWearable", permissions = {
    @Permission(strings = { android.Manifest.permission.BLUETOOTH_SCAN }, alias = "bluetoothScan"),
    @Permission(strings = { android.Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetoothConnect"),
})
public class VjWearablePlugin extends Plugin {

    private static final String TAG = "VjWearable";
    static final UUID HEART_RATE_SERVICE = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
    static final UUID HEART_RATE_MEASUREMENT = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
    static final UUID BODY_SENSOR_LOCATION = UUID.fromString("00002a38-0000-1000-8000-00805f9b34fb");
    static final UUID BATTERY_SERVICE = UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb");
    static final UUID BATTERY_LEVEL = UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb");
    private static final UUID CLIENT_CHARACTERISTIC_CONFIG =
        UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final int REQUEST_PERMISSIONS = 11401;
    private static final long SCAN_WINDOW_MS = 20_000;

    private final Object lock = new Object();
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private final Map<String, DiscoveredDevice> discovered = new HashMap<>();
    private final Map<String, BleConnection> connections = new HashMap<>();
    private final ArrayDeque<Runnable> gattQueue = new ArrayDeque<>();
    private boolean gattBusy = false;

    /** One live GATT connection with its subscribed characteristics. */
    private static class BleConnection {
        final String deviceId;
        final String name;
        BluetoothGatt gatt;
        boolean heartRateSubscribed;
        Integer batteryPercent;
        String bodySensorLocation;

        BleConnection(String deviceId, String name) {
            this.deviceId = deviceId;
            this.name = name;
        }
    }

    private static class DiscoveredDevice {
        final String deviceId;
        String name;
        int rssi;
        boolean hasHeartRateService;

        DiscoveredDevice(String deviceId, String name, int rssi, boolean hasHeartRateService) {
            this.deviceId = deviceId;
            this.name = name;
            this.rssi = rssi;
            this.hasHeartRateService = hasHeartRateService;
        }
    }

    @Override
    public void load() {
        BluetoothManager manager = (BluetoothManager) bridge.getContext()
            .getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager != null ? manager.getAdapter() : null;
    }

    // ── Capability / permissions ─────────────────────────────────────────────

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        boolean supported = adapter != null;
        boolean enabled = supported && adapter.isEnabled();
        result.put("supported", supported);
        result.put("bluetoothEnabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasAllBluetoothPermissions());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (hasAllBluetoothPermissions()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestAllPermissions(call, "onBluetoothPermissions");
    }

    @PermissionCallback
    private void onBluetoothPermissions(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = hasAllBluetoothPermissions();
        result.put("granted", granted);
        if (!granted) notifyListeners("sensorError", errorPayload("permission_denied", "Bluetooth permission denied"));
        call.resolve(result);
    }

    private boolean hasAllBluetoothPermissions() {
        Context context = bridge.getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN)
                == PackageManager.PERMISSION_GRANTED
                && context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
                    == PackageManager.PERMISSION_GRANTED;
        }
        // Pre-Android-12: BLE scan/connect need only location, granted alongside
        // the app's existing ACCESS_FINE_LOCATION at first run.
        return true;
    }

    // ── Scanning ─────────────────────────────────────────────────────────────

    @PluginMethod
    public void startScan(final PluginCall call) {
        if (adapter == null || !adapter.isEnabled()) {
            notifyListeners("sensorError", errorPayload("bluetooth_unavailable", "Bluetooth is off"));
            call.reject("Bluetooth is off or unavailable");
            return;
        }
        if (!hasAllBluetoothPermissions()) {
            notifyListeners("sensorError", errorPayload("permission_denied", "Bluetooth permission denied"));
            call.reject("Bluetooth permission denied");
            return;
        }
        synchronized (lock) {
            if (scanner != null) return; // already scanning
            discovered.clear();
            scanner = adapter.getBluetoothLeScanner();
            final BluetoothLeScanner active = scanner;
            List<ScanFilter> filters = new ArrayList<>();
            filters.add(new ScanFilter.Builder()
                .setServiceUuid(new ParcelUuid(HEART_RATE_SERVICE)).build());
            ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_BALANCED).build();
            try {
                active.startScan(filters, settings, scanCallback = new ScanCallback() {
                    @Override
                    public void onScanResult(int callbackType, ScanResult result) {
                        handleScanResult(result);
                    }

                    @Override
                    public void onScanFailed(int errorCode) {
                        stopScanInternal();
                        notifyListeners("sensorError", errorPayload("scan_failed", "BLE scan failed: " + errorCode));
                    }
                });
            } catch (SecurityException e) {
                scanner = null;
                call.reject("Bluetooth permission denied");
                return;
            }
            notifyListeners("deviceDiscovered", new JSObject()); // scan-started marker with empty delta
        }
        // Bounded scan window so the UI can never spin forever.
        bridge.execute(() -> {
            try {
                Thread.sleep(SCAN_WINDOW_MS);
                stopScanInternal();
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        });
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void handleScanResult(ScanResult result) {
        BluetoothDevice device = result.getDevice();
        if (device == null || device.getAddress() == null) return;
        boolean hasHrs = false;
        String name = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (result.getScanRecord() != null) {
                name = result.getScanRecord().getDeviceName();
                hasHrs = result.getScanRecord().getServiceUuids() != null
                    && result.getScanRecord().getServiceUuids()
                        .contains(new ParcelUuid(HEART_RATE_SERVICE));
            }
        } else {
            if (result.getScanRecord() != null) {
                name = result.getScanRecord().getDeviceName();
                List<ParcelUuid> uuids = result.getScanRecord().getServiceUuids();
                hasHrs = uuids != null && uuids.contains(new ParcelUuid(HEART_RATE_SERVICE));
            }
        }
        if (name == null) name = device.getName();
        if (name == null || name.trim().isEmpty()) name = "BLE sensor";
        synchronized (lock) {
            DiscoveredDevice existing = discovered.get(device.getAddress());
            if (existing != null) {
                existing.rssi = result.getRssi();
            } else {
                discovered.put(device.getAddress(),
                    new DiscoveredDevice(device.getAddress(), name, result.getRssi(), hasHrs));
                JSObject payload = new JSObject();
                payload.put("device", devicePayload(discovered.get(device.getAddress())));
                notifyListeners("deviceDiscovered", payload);
            }
        }
    }

    private void stopScanInternal() {
        synchronized (lock) {
            if (scanner != null && scanCallback != null) {
                try {
                    scanner.stopScan(scanCallback);
                } catch (SecurityException ignored) {
                    // permissions revoked mid-scan; nothing to clean up
                }
            }
            scanner = null;
            scanCallback = null;
        }
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stopScanInternal();
        call.resolve();
    }

    @PluginMethod
    public void getDiscoveredDevices(PluginCall call) {
        JSArray devices = new JSArray();
        synchronized (lock) {
            for (DiscoveredDevice device : discovered.values()) devices.put(devicePayload(device));
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    // ── Connection lifecycle ─────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void connect(final PluginCall call) {
        final String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is off or unavailable");
            return;
        }
        if (!hasAllBluetoothPermissions()) {
            call.reject("Bluetooth permission denied");
            return;
        }
        BluetoothDevice device = adapter.getRemoteDevice(deviceId);
        if (device == null) {
            call.reject("Unknown device");
            return;
        }
        stopScanInternal();
        synchronized (lock) {
            if (connections.containsKey(deviceId)) {
                call.reject("Already connected");
                return;
            }
        }
        JSObject connecting = new JSObject();
        connecting.put("deviceId", deviceId);
        notifyListeners("connectionStateChanged", connecting);
        try {
            BluetoothGatt gatt = device.connectGatt(bridge.getContext(), false, gattCallback);
            if (gatt == null) {
                call.reject("Connection failed");
                return;
            }
            synchronized (lock) {
                connections.put(deviceId, new BleConnection(deviceId, device.getName() != null ? device.getName() : "BLE sensor"));
                connections.get(deviceId).gatt = gatt;
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth permission denied");
        }
        // Resolution arrives via onConnectionStateChange → onServicesDiscovered.
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        @SuppressWarnings("deprecation")
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            String deviceId = gatt.getDevice() != null ? gatt.getDevice().getAddress() : null;
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                runNextGatt(gatt, gatt::discoverServices);
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                BleConnection connection;
                synchronized (lock) {
                    connection = deviceId != null ? connections.remove(deviceId) : null;
                }
                if (connection != null) {
                    try {
                        gatt.close();
                    } catch (Exception ignored) {
                        // already closing
                    }
                    JSObject payload = new JSObject();
                    payload.put("deviceId", connection.deviceId);
                    payload.put("state", "disconnected");
                    notifyListeners("connectionStateChanged", payload);
                }
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            String deviceId = gatt.getDevice() != null ? gatt.getDevice().getAddress() : null;
            if (status != BluetoothGatt.GATT_SUCCESS || deviceId == null) {
                notifyListeners("sensorError", errorPayload("service_discovery_failed", "Service discovery failed"));
                disconnectGatt(gatt);
                return;
            }
            BluetoothGattService hrs = gatt.getService(HEART_RATE_SERVICE);
            BleConnection connection;
            synchronized (lock) {
                connection = connections.get(deviceId);
            }
            if (connection == null || hrs == null) {
                notifyListeners("sensorError", errorPayload("no_heart_rate_service", "Device does not expose the Heart Rate Service"));
                disconnectGatt(gatt);
                return;
            }
            connection.bodySensorLocation = null;
            runNextGatt(gatt, () -> readCharacteristic(gatt, hrs.getCharacteristic(BODY_SENSOR_LOCATION)));
            runNextGatt(gatt, () -> enableNotifications(gatt, hrs.getCharacteristic(HEART_RATE_MEASUREMENT)));
            BluetoothGattService battery = gatt.getService(BATTERY_SERVICE);
            if (battery != null) {
                runNextGatt(gatt, () -> readCharacteristic(gatt, battery.getCharacteristic(BATTERY_LEVEL)));
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic != null) {
                deliverRead(gatt, characteristic, characteristic.getValue());
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
            deliverNotification(gatt, characteristic, value);
        }

        @Override
        @Deprecated
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            deliverNotification(gatt, characteristic, characteristic.getValue());
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            String deviceId = gatt.getDevice() != null ? gatt.getDevice().getAddress() : null;
            BleConnection connection;
            synchronized (lock) {
                connection = deviceId != null ? connections.get(deviceId) : null;
            }
            if (connection != null && descriptor != null
                && HEART_RATE_MEASUREMENT.equals(descriptor.getCharacteristic().getUuid())) {
                connection.heartRateSubscribed = status == BluetoothGatt.GATT_SUCCESS;
                JSObject payload = new JSObject();
                payload.put("deviceId", deviceId);
                payload.put("name", connection.name);
                payload.put("state", connection.heartRateSubscribed ? "connected" : "connect_failed");
                notifyListeners("connectionStateChanged", payload);
            }
            finishGattStep();
        }
    };

    private void deliverRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
        String deviceId = gatt.getDevice() != null ? gatt.getDevice().getAddress() : null;
        BleConnection connection;
        synchronized (lock) {
            connection = deviceId != null ? connections.get(deviceId) : null;
        }
        if (connection == null || characteristic == null) {
            finishGattStep();
            return;
        }
        UUID uuid = characteristic.getUuid();
        if (BODY_SENSOR_LOCATION.equals(uuid) && value != null && value.length >= 1) {
            connection.bodySensorLocation = bodySensorLocationName(value[0] & 0xFF);
        } else if (BATTERY_LEVEL.equals(uuid) && value != null && value.length >= 1) {
            int level = value[0] & 0xFF;
            if (level >= 0 && level <= 100) {
                connection.batteryPercent = level;
                JSObject payload = new JSObject();
                payload.put("deviceId", deviceId);
                payload.put("level", level);
                notifyListeners("batteryLevelChanged", payload);
            }
        }
        finishGattStep();
    }

    private void deliverNotification(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
        String deviceId = gatt.getDevice() != null ? gatt.getDevice().getAddress() : null;
        if (deviceId == null || characteristic == null || value == null) return;
        if (!HEART_RATE_MEASUREMENT.equals(characteristic.getUuid())) return;
        BleConnection connection;
        synchronized (lock) {
            connection = connections.get(deviceId);
        }
        if (connection == null) return;
        int[] out = new int[4]; // bpm + flags-derived extras are parsed JS-side too; native parse below
        HeartRatePacket packet = parseHeartRatePacket(value);
        if (packet == null) return; // malformed packets are dropped, never guessed
        JSObject payload = new JSObject();
        payload.put("deviceId", deviceId);
        payload.put("deviceName", connection.name);
        payload.put("bpm", packet.bpm);
        payload.put("sensorContact", packet.sensorContact);
        if (packet.energyExpendedJoules != null) payload.put("energyExpendedJoules", packet.energyExpendedJoules);
        if (packet.rrIntervalsMs != null) {
            JSArray rr = new JSArray();
            for (int ms : packet.rrIntervalsMs) rr.put(ms);
            payload.put("rrIntervalsMs", rr);
        }
        payload.put("timestamp", System.currentTimeMillis());
        notifyListeners("heartRateMeasurement", payload);
    }

    // Serialized GATT operations: Android allows one outstanding GATT call.
    private void runNextGatt(BluetoothGatt gatt, Runnable operation) {
        synchronized (lock) {
            gattQueue.add(operation);
            if (gattBusy) return;
            gattBusy = true;
        }
        operation.run();
    }

    private void finishGattStep() {
        Runnable next;
        synchronized (lock) {
            next = gattQueue.poll();
            if (next == null) {
                gattBusy = false;
                return;
            }
        }
        next.run();
    }

    @SuppressWarnings("deprecation")
    private void readCharacteristic(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
        if (characteristic == null) {
            finishGattStep();
            return;
        }
        boolean ok;
        try {
            ok = gatt.readCharacteristic(characteristic);
        } catch (SecurityException e) {
            ok = false;
        }
        if (!ok) finishGattStep();
    }

    @SuppressWarnings("deprecation")
    private void enableNotifications(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
        if (characteristic == null) {
            finishGattStep();
            return;
        }
        try {
            gatt.setCharacteristicNotification(characteristic, true);
            BluetoothGattDescriptor descriptor =
                characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG);
            if (descriptor == null) {
                finishGattStep();
                return;
            }
            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            boolean ok = false;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    ok = gatt.writeDescriptor(descriptor,
                        BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                        == android.bluetooth.BluetoothStatusCodes.SUCCESS;
                } else {
                    ok = gatt.writeDescriptor(descriptor);
                }
            } catch (SecurityException e) {
                ok = false;
            }
            if (!ok) finishGattStep();
        } catch (SecurityException e) {
            finishGattStep();
        }
    }

    @PluginMethod
    public void disconnect(final PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }
        BluetoothGatt gatt;
        synchronized (lock) {
            BleConnection connection = connections.remove(deviceId);
            gatt = connection != null ? connection.gatt : null;
        }
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (SecurityException ignored) {
                // connection already torn down
            }
        }
        call.resolve();
    }

    private void disconnectGatt(BluetoothGatt gatt) {
        String deviceId = gatt.getDevice() != null ? gatt.getDevice().getAddress() : null;
        synchronized (lock) {
            if (deviceId != null) connections.remove(deviceId);
        }
        try {
            gatt.disconnect();
            gatt.close();
        } catch (SecurityException ignored) {
            // already torn down
        }
    }

    @PluginMethod
    public void forgetDevice(final PluginCall call) {
        disconnect(call); // no OS-level pairing is ever created, so forget == disconnect
    }

    @PluginMethod
    public void getConnectedDevices(final PluginCall call) {
        JSArray devices = new JSArray();
        synchronized (lock) {
            for (BleConnection connection : connections.values()) {
                JSObject device = new JSObject();
                device.put("deviceId", connection.deviceId);
                device.put("name", connection.name);
                if (connection.batteryPercent != null) device.put("batteryPercent", connection.batteryPercent);
                if (connection.bodySensorLocation != null) device.put("bodySensorLocation", connection.bodySensorLocation);
                devices.put(device);
            }
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    // ── Heart Rate Measurement parsing (Bluetooth SIG spec) ─────────────────

    static final int FLAG_16BIT = 0x01;
    static final int FLAG_CONTACT_UNSUPPORTED = 0x04;
    static final int FLAG_CONTACT_SUPPORTED = 0x08;
    static final int FLAG_CONTACT_DETECTED = 0x02;
    static final int FLAG_ENERGY = 0x10;
    static final int FLAG_RR = 0x20;

    static class HeartRatePacket {
        int bpm;
        String sensorContact;
        Integer energyExpendedJoules;
        int[] rrIntervalsMs;
    }

    /** Parse 0x2A37 exactly as its flags dictate; returns null for malformed packets. */
    static HeartRatePacket parseHeartRatePacket(byte[] data) {
        if (data == null || data.length < 2) return null;
        int flags = data[0] & 0xFF;
        boolean wide = (flags & FLAG_16BIT) != 0;
        int minLen = wide ? 3 : 2;
        if (data.length < minLen) return null;
        int bpm = wide ? (data[1] & 0xFF) | ((data[2] & 0xFF) << 8) : data[1] & 0xFF;
        if (bpm <= 0 || bpm > 250) return null;
        HeartRatePacket packet = new HeartRatePacket();
        packet.bpm = bpm;
        if ((flags & FLAG_CONTACT_SUPPORTED) != 0) {
            packet.sensorContact = (flags & FLAG_CONTACT_DETECTED) != 0
                ? "supported_contact" : "supported_no_contact";
        } else if ((flags & FLAG_CONTACT_UNSUPPORTED) != 0) {
            packet.sensorContact = "not_supported_or_no_contact";
        } else {
            packet.sensorContact = "unsupported";
        }
        int offset = wide ? 3 : 2;
        if ((flags & FLAG_ENERGY) != 0) {
            if (data.length < offset + 2) return null;
            int energy = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
            if (energy > 0) packet.energyExpendedJoules = energy;
            offset += 2;
        }
        if ((flags & FLAG_RR) != 0) {
            List<Integer> intervals = new ArrayList<>();
            for (; offset + 1 < data.length; offset += 2) {
                int raw = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
                if (raw == 0) continue;
                int ms = Math.round(raw * 1000f / 1024f);
                if (ms >= 250 && ms <= 2000) intervals.add(ms);
            }
            if (!intervals.isEmpty()) {
                int[] result = new int[intervals.size()];
                for (int i = 0; i < result.length; i += 1) result[i] = intervals.get(i);
                packet.rrIntervalsMs = result;
            }
        }
        return packet;
    }

    private static String bodySensorLocationName(int code) {
        switch (code) {
            case 0: return "Other";
            case 1: return "Chest";
            case 2: return "Wrist";
            case 3: return "Finger";
            case 4: return "Hand";
            case 5: return "Ear Lobe";
            case 6: return "Foot";
            default: return "Other";
        }
    }

    private static JSObject devicePayload(DiscoveredDevice device) {
        JSObject payload = new JSObject();
        payload.put("deviceId", device.deviceId);
        payload.put("name", device.name);
        payload.put("rssi", device.rssi);
        payload.put("hasHeartRateService", device.hasHeartRateService);
        return payload;
    }

    private static JSObject errorPayload(String code, String message) {
        JSObject payload = new JSObject();
        payload.put("code", code);
        payload.put("message", message);
        return payload;
    }

    @Override
    protected void handleOnDestroy() {
        stopScanInternal();
        synchronized (lock) {
            for (BleConnection connection : connections.values()) {
                try {
                    if (connection.gatt != null) {
                        connection.gatt.disconnect();
                        connection.gatt.close();
                    }
                } catch (SecurityException ignored) {
                    // tearing down during app shutdown
                }
            }
            connections.clear();
        }
        super.handleOnDestroy();
    }
}
