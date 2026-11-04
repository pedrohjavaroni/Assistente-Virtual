package com.raccoonia.app;

import android.annotation.SuppressLint;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.Random;

/**
 * A "bolha" do Raccoon: uma janela transparente por cima dos outros apps,
 * que dá para arrastar e que passeia sozinha pela parte de baixo da tela.
 */
public class OverlayService extends Service {
    static OverlayService instance;

    private WindowManager wm;
    private WebView web;
    private WindowManager.LayoutParams lp;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();
    private float density;
    private boolean walking, touching, expanded;
    private int dir = -1;
    private long phaseUntil;

    @Override public IBinder onBind(Intent i) { return null; }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, Notifier.bubble(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, Notifier.bubble(this));
        if (web != null) return START_STICKY;
        instance = this;

        String server = intent != null ? intent.getStringExtra("server") : null;
        if (server == null || server.isEmpty()) server = getSharedPreferences("raccoon", MODE_PRIVATE).getString("server", "");

        density = getResources().getDisplayMetrics().density;
        wm = getSystemService(WindowManager.class);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "RaccoonOverlay");
        web.setWebViewClient(new WebViewClient());
        web.loadUrl(server + "/companion.html");

        lp = new WindowManager.LayoutParams(
                dp(180), dp(175),
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.START;
        lp.x = getResources().getDisplayMetrics().widthPixels - dp(200);
        lp.y = dp(40);
        web.setOnTouchListener(new DragListener());
        wm.addView(web, lp);
        main.post(walker);
        return START_STICKY;
    }

    private int dp(float v) { return Math.round(v * density); }

    /** arrasta a janela; um toque sem arrastar segue para a página (clique) */
    private class DragListener implements android.view.View.OnTouchListener {
        float sx, sy; int ox, oy; boolean dragging;
        @Override public boolean onTouch(android.view.View v, MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    sx = e.getRawX(); sy = e.getRawY(); ox = lp.x; oy = lp.y; dragging = false; touching = true;
                    setWalking(false);
                    return false;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getRawX() - sx, dy = e.getRawY() - sy;
                    if (!dragging && Math.hypot(dx, dy) > dp(8)) dragging = true;
                    if (dragging) {
                        lp.x = Math.round(ox + dx);
                        lp.y = Math.max(0, Math.round(oy - dy));
                        wm.updateViewLayout(web, lp);
                        return true;
                    }
                    return false;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    touching = false;
                    phaseUntil = System.currentTimeMillis() + 5000;
                    if (dragging) {
                        // devolve um "cancelar" para a página não entender como clique
                        MotionEvent c = MotionEvent.obtain(e); c.setAction(MotionEvent.ACTION_CANCEL);
                        web.onTouchEvent(c); c.recycle();
                        return true;
                    }
                    return false;
            }
            return false;
        }
    }

    private void setWalking(boolean on) {
        if (walking == on) return;
        walking = on;
        js("window.__raccoonWalk && window.__raccoonWalk(" + on + "," + dir + ")");
    }

    /** passeio: alterna entre parado e andando de um lado para o outro */
    private final Runnable walker = new Runnable() {
        @Override public void run() {
            if (web == null) return;
            long now = System.currentTimeMillis();
            boolean paused = touching || expanded;
            if (now > phaseUntil) {
                boolean walk = !walking && !paused && rnd.nextFloat() < 0.6f;
                if (walk && rnd.nextBoolean()) dir = -dir;
                phaseUntil = now + (walk ? 2500 + rnd.nextInt(4000) : 5000 + rnd.nextInt(10000));
                setWalking(walk);
            }
            if (paused && walking) setWalking(false);
            if (walking) {
                int width = getResources().getDisplayMetrics().widthPixels;
                int nx = lp.x + dir * dp(1.2f);
                if (nx < -dp(20) || nx + lp.width > width + dp(20)) {
                    dir = -dir;
                    js("window.__raccoonWalk && window.__raccoonWalk(true," + dir + ")");
                } else {
                    lp.x = nx;
                    wm.updateViewLayout(web, lp);
                }
            }
            main.postDelayed(this, 33);
        }
    };

    private void js(String code) { main.post(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    static void sendEvent(String json) {
        OverlayService s = instance;
        if (s != null) s.js("window.__raccoonEvent && window.__raccoonEvent(" + JSONObject.quote(json) + ")");
    }

    /** window.RaccoonOverlay — usado pela página do companheiro */
    class Bridge {
        @JavascriptInterface public void openApp() {
            startActivity(new Intent(OverlayService.this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        }
        @JavascriptInterface public void toApp(String json) { MainActivity.fromOverlay(json); }
        @JavascriptInterface public void notify(String text) { Notifier.reminder(OverlayService.this, text); }
        @JavascriptInterface public void setExpanded(boolean on) {
            main.post(() -> {
                expanded = on;
                if (web == null) return;
                lp.height = dp(on ? 320 : 175);
                lp.width = dp(on ? 240 : 180);
                wm.updateViewLayout(web, lp);
            });
        }
        @JavascriptInterface public void setFocusable(boolean on) {
            main.post(() -> {
                if (web == null) return;
                if (on) lp.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                else lp.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                wm.updateViewLayout(web, lp);
                if (on) web.requestFocus();
            });
        }
    }

    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (web != null) { wm.removeView(web); web.destroy(); web = null; }
        instance = null;
        super.onDestroy();
    }
}
