package com.raccoonia.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/** Tela principal: o app web do Raccoon dentro de um WebView, com voz e bolha nativas. */
public class MainActivity extends Activity {
    static MainActivity current;
    WebView web;
    Speech speech;
    SharedPreferences prefs;
    private boolean pendingListen; private String pendingLocale; private boolean pendingContinuous;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        current = this;
        prefs = getSharedPreferences("raccoon", MODE_PRIVATE);
        speech = new Speech(this, (js) -> runJs(js));

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFF0D0E17);
        web.addJavascriptInterface(new Bridge(), "RaccoonAndroid");
        web.addJavascriptInterface(new Setup(), "RaccoonSetup");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame() && !req.getUrl().toString().startsWith("file:")) showSetup(true);
            }
        });

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2);
        }
        String server = prefs.getString("server", "");
        if (server.isEmpty()) showSetup(false); else web.loadUrl(server + "/");
    }

    void showSetup(boolean error) {
        String server = prefs.getString("server", "");
        web.loadUrl("file:///android_asset/setup.html?url=" + Uri.encode(server) + (error ? "&error=1" : ""));
    }

    void runJs(String js) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); }); }

    /** Mensagem vinda da bolha flutuante */
    static void fromOverlay(String json) {
        MainActivity a = current;
        if (a != null) a.runJs("window.__raccoonFromOverlay && window.__raccoonFromOverlay(" + JSONObject.quote(json) + ")");
    }

    boolean toggleOverlay() {
        if (OverlayService.instance != null) { stopService(new Intent(this, OverlayService.class)); return false; }
        if (!Settings.canDrawOverlays(this)) {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
            return false;
        }
        Intent i = new Intent(this, OverlayService.class).putExtra("server", prefs.getString("server", ""));
        startForegroundService(i);
        return true;
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == 1) {
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (ok && pendingListen) speech.listen(pendingLocale, pendingContinuous);
            else if (!ok) runJs("window.__raccoonSpeech && window.__raccoonSpeech({type:'error',text:'denied'})");
            pendingListen = false;
        }
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);
    }

    @Override protected void onDestroy() {
        if (current == this) current = null;
        speech.destroy();
        web.destroy();
        super.onDestroy();
    }

    /** window.RaccoonAndroid — usado pelo app web */
    class Bridge {
        @JavascriptInterface public void startListening(String locale, boolean continuous) {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingListen = true; pendingLocale = locale; pendingContinuous = continuous;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 1);
                    return;
                }
                speech.listen(locale, continuous);
            });
        }
        @JavascriptInterface public void stopListening() { runOnUiThread(() -> speech.stop()); }
        @JavascriptInterface public void speak(String text, String locale) { runOnUiThread(() -> speech.speak(text, locale)); }
        @JavascriptInterface public void stopSpeaking() { runOnUiThread(() -> speech.stopSpeaking()); }
        @JavascriptInterface public boolean toggleOverlay() {
            final boolean[] result = {false};
            java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
            runOnUiThread(() -> { result[0] = MainActivity.this.toggleOverlay(); latch.countDown(); });
            try { latch.await(); } catch (InterruptedException ignored) {}
            return result[0];
        }
        @JavascriptInterface public void overlayEvent(String json) { OverlayService.sendEvent(json); }
        @JavascriptInterface public void notify(String text) { Notifier.reminder(MainActivity.this, text); }
        @JavascriptInterface public void changeServer() { runOnUiThread(() -> showSetup(false)); }
    }

    /** window.RaccoonSetup — tela de configuração do servidor */
    class Setup {
        @JavascriptInterface public void save(String url) {
            prefs.edit().putString("server", url).apply();
            runOnUiThread(() -> web.loadUrl(url + "/"));
        }
    }
}
