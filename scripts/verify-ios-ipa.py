"""Validate the unsigned device artifact before offering it for local signing."""
import json
import plistlib
import struct
import sys
import zipfile


def verify(path):
    with zipfile.ZipFile(path) as archive:
        corrupt = archive.testzip()
        assert corrupt is None, f"Corrupt IPA entry: {corrupt}"
        root = "Payload/App.app/"
        info = plistlib.loads(archive.read(root + "Info.plist"))
        assert info["CFBundleIdentifier"] == "app.lovable.svj"
        assert info["CFBundlePackageType"] == "APPL"
        assert "iPhoneOS" in info["CFBundleSupportedPlatforms"]
        assert float(info["MinimumOSVersion"]) >= 15
        assert info.get("NSMotionUsageDescription")
        assert any("app.lovable.svj" in entry.get("CFBundleURLSchemes", [])
                   for entry in info.get("CFBundleURLTypes", []))
        executable = archive.read(root + info["CFBundleExecutable"])
        # Xcode's generic iphoneos destination must produce arm64, not a simulator binary.
        assert struct.unpack_from("<II", executable) == (0xFEEDFACF, 0x0100000C)
        config = json.loads(archive.read(root + "capacitor.config.json"))
        assert config["server"]["url"] == "https://savaje-com.lovable.app"
        assert {"AppPlugin", "CAPBrowserPlugin", "CapacitorPedometerPlugin"}.issubset(
            set(config["packageClassList"]))
        assert "AdMobPlugin" not in config["packageClassList"]
        assert root + "public/index.html" in archive.namelist()
        print("Verified SVJ IPA: arm64 iPhone app, Motion permission, login scheme and native plugins.")


if __name__ == "__main__":
    verify(sys.argv[1])
