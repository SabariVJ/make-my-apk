"""Static Android theme regressions; native lint/build and device tests remain required."""

from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android/app/src/main/res"
THEMES = ("AppTheme", "AppTheme.NoActionBar")
API_LEVELS = (24, 26, 27, 28, 29, 36)


def load_styles():
    versions = {}
    for path in RES.glob("values*/styles.xml"):
        qualifier = re.fullmatch(r"values(?:-v(\d+))?", path.parent.name)
        if not qualifier:
            continue
        level = int(qualifier.group(1) or 0)
        styles = {}
        for node in ET.parse(path).getroot().findall("style"):
            name = node.attrib["name"]
            if name in styles:
                raise ValueError(f"Duplicate style {name} in {path}")
            items = {}
            for item in node.findall("item"):
                key = item.attrib["name"]
                if key in items:
                    raise ValueError(f"Duplicate item {key} in {name}")
                items[key] = (item.text or "").strip()
            styles[name] = (node.attrib.get("parent"), items)
        versions[level] = styles
    return versions


class AndroidThemeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.versions = load_styles()

    def resolve(self, name, api, seen=()):
        """Select one version, then follow explicit parents, not same-name overlays."""
        self.assertNotIn(name, seen, "Theme inheritance cycle")
        candidates = [
            level
            for level, styles in self.versions.items()
            if level <= api and name in styles
        ]
        self.assertTrue(candidates, f"Missing local theme {name} for API {api}")
        parent, items = self.versions[max(candidates)][name]
        self.assertIsNotNone(parent, f"Use explicit inheritance for {name}")
        inherited = {}
        if not parent.startswith("Theme."):
            inherited = self.resolve(parent, api, (*seen, name))
        return {**inherited, **items}

    def test_minimum_sdk_unchanged(self):
        variables = (ROOT / "android/variables.gradle").read_text()
        minimum = re.search(r"minSdkVersion\s*=\s*(\d+)", variables)
        self.assertIsNotNone(minimum)
        self.assertEqual(int(minimum.group(1)), 24)

    def test_required_resource_versions_exist(self):
        self.assertTrue({0, 27, 29}.issubset(self.versions))

    def test_new_attributes_are_api_qualified(self):
        requirements = {
            "android:windowLightNavigationBar": 27,
            "android:forceDarkAllowed": 29,
        }
        for level, styles in self.versions.items():
            for name, (_, items) in styles.items():
                for attribute, minimum in requirements.items():
                    if attribute in items:
                        with self.subTest(level=level, theme=name, attr=attribute):
                            self.assertGreaterEqual(level or 24, minimum)

    def test_dark_colors_survive_version_selection(self):
        backgrounds = (
            "android:windowBackground",
            "android:colorBackground",
            "android:statusBarColor",
            "android:navigationBarColor",
        )
        for api in API_LEVELS:
            for name in THEMES:
                with self.subTest(api=api, theme=name):
                    items = self.resolve(name, api)
                    for attribute in backgrounds:
                        self.assertEqual(items.get(attribute), "#0B0B0C")
                    self.assertEqual(items.get("android:windowLightStatusBar"), "false")

    def test_brand_colors_survive_version_selection(self):
        for api in API_LEVELS:
            with self.subTest(api=api):
                items = self.resolve("AppTheme", api)
                for color in ("colorPrimary", "colorPrimaryDark", "colorAccent"):
                    self.assertEqual(items.get(color), f"@color/{color}")

    def test_no_action_bar_flags_survive_version_selection(self):
        for api in API_LEVELS:
            with self.subTest(api=api):
                items = self.resolve("AppTheme.NoActionBar", api)
                self.assertEqual(items.get("windowActionBar"), "false")
                self.assertEqual(items.get("windowNoTitle"), "true")

    def test_version_specific_settings(self):
        for api in API_LEVELS:
            for name in THEMES:
                with self.subTest(api=api, theme=name):
                    items = self.resolve(name, api)
                    for attribute, minimum in (
                        ("android:windowLightNavigationBar", 27),
                        ("android:forceDarkAllowed", 29),
                    ):
                        if api >= minimum:
                            self.assertEqual(items.get(attribute), "false")
                        else:
                            self.assertNotIn(attribute, items)

    def test_launch_theme_preserved(self):
        for api in API_LEVELS:
            with self.subTest(api=api):
                self.assertEqual(
                    self.resolve("AppTheme.NoActionBarLaunch", api),
                    {"android:background": "@drawable/splash"},
                )
        parent, _ = self.versions[0]["AppTheme.NoActionBarLaunch"]
        self.assertEqual(parent, "Theme.SplashScreen")


if __name__ == "__main__":
    unittest.main(verbosity=2)
