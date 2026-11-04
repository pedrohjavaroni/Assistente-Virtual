package com.raccoonia.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/** Notificações: lembretes e o aviso fixo da bolha flutuante. */
class Notifier {
    static final String REMINDERS = "reminders", BUBBLE = "bubble";

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(REMINDERS, "Lembretes", NotificationManager.IMPORTANCE_HIGH));
        NotificationChannel b = new NotificationChannel(BUBBLE, "Guaxinim na tela", NotificationManager.IMPORTANCE_MIN);
        b.setShowBadge(false);
        nm.createNotificationChannel(b);
    }

    static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void reminder(Context c, String text) {
        channels(c);
        Notification n = new Notification.Builder(c, REMINDERS)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Raccoon IA")
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(openApp(c))
                .build();
        try { c.getSystemService(NotificationManager.class).notify((int) (System.currentTimeMillis() % 100000), n); }
        catch (SecurityException ignored) { /* sem permissão de notificação */ }
    }

    static Notification bubble(Context c) {
        channels(c);
        return new Notification.Builder(c, BUBBLE)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Raccoon está na sua tela")
                .setContentText("Toque para abrir o app")
                .setOngoing(true)
                .setContentIntent(openApp(c))
                .build();
    }
}
