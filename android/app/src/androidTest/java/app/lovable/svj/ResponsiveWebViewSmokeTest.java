package app.lovable.svj;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class ResponsiveWebViewSmokeTest {

    @Test
    public void localBundleFitsTheAndroidWebViewViewport() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        var targetContext = instrumentation.getTargetContext();
        var application = (Application) targetContext.getApplicationContext();
        var activityResumed = new CountDownLatch(1);
        var launchedActivity = new AtomicReference<Activity>();
        Application.ActivityLifecycleCallbacks callbacks = new Application.ActivityLifecycleCallbacks() {
            @Override
            public void onActivityResumed(Activity activity) {
                if (activity instanceof MainActivity) {
                    launchedActivity.set(activity);
                    activityResumed.countDown();
                }
            }

            @Override public void onActivityCreated(Activity activity, Bundle state) {}
            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        };
        application.registerActivityLifecycleCallbacks(callbacks);
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            // startActivitySync waits for Espresso's main-thread-idle signal. The app
            // keeps rendering continuously, so launch asynchronously and wait for
            // the actual lifecycle callback instead of waiting for UI idleness.
            targetContext.startActivity(intent);
            assertTrue("MainActivity should resume", activityResumed.await(45, TimeUnit.SECONDS));
            Activity activity = launchedActivity.get();
            assertNotNull("MainActivity should launch", activity);

            WebView webView = findWebView(activity.getWindow().getDecorView());
            assertNotNull("Capacitor WebView should exist", webView);

            String script = "(() => {"
                    + "const marker=document.querySelector('meta[name=\"svj-build-revision\"]');"
                    + "const header=document.querySelector('[data-testid=\"app-header\"]');"
                    + "if(!marker || !header) return null;"
                    + "const vv=window.visualViewport;"
                    + "const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();"
                    + "return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>0&&r.height>0};"
                    + "const safeProbe=document.createElement('div');"
                    + "safeProbe.style.cssText='position:fixed;inset:0;visibility:hidden;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';"
                    + "document.body.append(safeProbe);"
                    + "const left=parseFloat(getComputedStyle(safeProbe).paddingLeft)||0;"
                    + "const right=parseFloat(getComputedStyle(safeProbe).paddingRight)||0;safeProbe.remove();"
                    + "const content=[...document.querySelectorAll('main *,[data-testid=\"app-header\"] *,[data-testid=\"primary-navigation\"] *')].filter(e=>visible(e)&&!e.closest('[aria-hidden=\"true\"]'));"
                    + "const outside=content.filter(e=>{const r=e.getBoundingClientRect();return r.left<left-1||r.right>innerWidth-right+1}).length;"
                    + "const scrollable=[...document.querySelectorAll('body *')].filter(visible).filter(e=>{const s=getComputedStyle(e);return (s.overflowX==='auto'||s.overflowX==='scroll')&&e.scrollWidth>e.clientWidth+2}).length;"
                    + "return {revision:marker.content,innerWidth,visualWidth:vv?vv.width:-1,scale:vv?vv.scale:-1,documentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),clientWidth:document.documentElement.clientWidth,outside,scrollable};"
                    + "})()";

            JSONObject metrics = null;
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            while (System.nanoTime() < deadline && metrics == null) {
                CountDownLatch latch = new CountDownLatch(1);
                AtomicReference<String> result = new AtomicReference<>();
                instrumentation.runOnMainSync(() -> webView.evaluateJavascript(script, value -> {
                    result.set(value);
                    latch.countDown();
                }));
                if (latch.await(500, TimeUnit.MILLISECONDS)) {
                    String value = result.get();
                    if (value != null && !"null".equals(value)) {
                        metrics = new JSONObject(value);
                    }
                }
                if (metrics == null) Thread.sleep(150);
            }

            assertNotNull("Responsive test bundle and app shell should render", metrics);
            assertTrue("Build marker missing: " + metrics, metrics.getString("revision").length() > 0);
            assertTrue("WebView should report a device viewport: " + metrics, metrics.getInt("innerWidth") > 0);
            assertTrue("Document should not exceed the device viewport: " + metrics,
                    Math.abs(metrics.getInt("innerWidth") - metrics.getInt("clientWidth")) <= 1);
            assertEquals("Visual viewport should match the layout viewport: " + metrics,
                    metrics.getDouble("innerWidth"), metrics.getDouble("visualWidth"), 1.0);
            assertEquals("Page zoom should stay at 1: " + metrics, 1.0, metrics.getDouble("scale"), 0.01);
            assertEquals("Visible content should fit the safe viewport: " + metrics, 0, metrics.getInt("outside"));
            assertEquals("Visible controls should not scroll sideways: " + metrics, 0, metrics.getInt("scrollable"));
        } finally {
            Activity activity = launchedActivity.get();
            if (activity != null) {
                instrumentation.runOnMainSync(activity::finish);
            }
            application.unregisterActivityLifecycleCallbacks(callbacks);
        }
    }

    private static WebView findWebView(View root) {
        if (root instanceof WebView) return (WebView) root;
        if (!(root instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) root;
        for (int index = 0; index < group.getChildCount(); index++) {
            WebView found = findWebView(group.getChildAt(index));
            if (found != null) return found;
        }
        return null;
    }
}
