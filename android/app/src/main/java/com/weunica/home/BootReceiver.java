package com.weunica.home;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Launches the dashboard when the device boots (needs RECEIVE_BOOT_COMPLETED; SYSTEM_ALERT_WINDOW on Android 10+). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || "android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            Intent i = new Intent(context, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
        }
    }
}
