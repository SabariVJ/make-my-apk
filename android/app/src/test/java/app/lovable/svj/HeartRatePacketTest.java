package app.lovable.svj;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Bluetooth SIG Heart Rate Measurement (0x2A37) parsing tests, mirroring the
 * TypeScript parser in src/app/lib/bleHeartRate.ts so both layers agree.
 */
public class HeartRatePacketTest {

    private static byte[] bytes(int... values) {
        byte[] data = new byte[values.length];
        for (int i = 0; i < values.length; i += 1) data[i] = (byte) values[i];
        return data;
    }

    @Test
    public void parses8BitHeartRate() {
        VjWearablePlugin.HeartRatePacket packet =
            VjWearablePlugin.parseHeartRatePacket(bytes(0x00, 143));
        assertNotNull(packet);
        assertEquals(143, packet.bpm);
        assertEquals("unsupported", packet.sensorContact);
        assertNull(packet.energyExpendedJoules);
        assertNull(packet.rrIntervalsMs);
    }

    @Test
    public void parses16BitHeartRate() {
        // flags: 16-bit format | energy present (0x11)
        VjWearablePlugin.HeartRatePacket packet =
            VjWearablePlugin.parseHeartRatePacket(bytes(0x11, 0x8F, 0x00, 0x38, 0x02));
        assertNotNull(packet);
        assertEquals(143, packet.bpm);
        assertEquals(568, packet.energyExpendedJoules.intValue());
    }

    @Test
    public void parsesRRIntervals() {
        // flags: 16-bit | RR present (0x21); RR raw 1024 → 1000 ms
        VjWearablePlugin.HeartRatePacket packet =
            VjWearablePlugin.parseHeartRatePacket(bytes(0x21, 0x8F, 0x00, 0x00, 0x04));
        assertNotNull(packet);
        assertEquals(143, packet.bpm);
        assertNotNull(packet.rrIntervalsMs);
        assertEquals(1, packet.rrIntervalsMs.length);
        assertEquals(1000, packet.rrIntervalsMs[0]);
    }

    @Test
    public void rejectsMalformedPackets() {
        assertNull(VjWearablePlugin.parseHeartRatePacket(null));
        assertNull(VjWearablePlugin.parseHeartRatePacket(new byte[0]));
        assertNull(VjWearablePlugin.parseHeartRatePacket(bytes(0x00)));
        // 16-bit flag set but only one value byte
        assertNull(VjWearablePlugin.parseHeartRatePacket(bytes(0x01, 0x8F)));
        // impossible bpm
        assertNull(VjWearablePlugin.parseHeartRatePacket(bytes(0x00, 0x00)));
        assertNull(VjWearablePlugin.parseHeartRatePacket(bytes(0x00, (byte) 0xFF, 0x7F)));
        // energy flag set but packet truncated (flags + hr + 1 energy byte)
        assertNull(VjWearablePlugin.parseHeartRatePacket(bytes(0x10, 0x8F, 0x38)));
    }

    @Test
    public void parsesSensorContactStates() {
        assertEquals("supported_contact",
            VjWearablePlugin.parseHeartRatePacket(bytes(0x0A, 120)).sensorContact);
        assertEquals("supported_no_contact",
            VjWearablePlugin.parseHeartRatePacket(bytes(0x08, 120)).sensorContact);
        assertEquals("not_supported_or_no_contact",
            VjWearablePlugin.parseHeartRatePacket(bytes(0x04, 120)).sensorContact);
    }

    @Test
    public void filtersImplausibleRRIntervals() {
        // RR raw 0 dropped; raw 20480 (20 s) dropped as implausible;
        // raw 1024 → 1000 ms kept.
        VjWearablePlugin.HeartRatePacket packet =
            VjWearablePlugin.parseHeartRatePacket(bytes(0x20, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04));
        assertNotNull(packet);
        assertNotNull(packet.rrIntervalsMs);
        assertEquals(1, packet.rrIntervalsMs.length);
        assertEquals(1000, packet.rrIntervalsMs[0]);
    }
}
