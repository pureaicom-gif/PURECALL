package app.pure.chat;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

/** Periodic (~6h) background check so users are notified even when the app is closed. Also refreshes server discovery. */
public class UpdateWorker extends Worker {
    public UpdateWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull @Override public Result doWork() {
        Context c = getApplicationContext();
        ServerDiscovery.refresh(c);
        Updater.Manifest m = Updater.fetch(c);
        if (m == null) return Result.retry();
        if (!"none".equals(VersionUtil.evaluate(m.versionCode, m.minSupported, Updater.currentCode(c)))) Updater.notifyUpdate(c, m);
        return Result.success();
    }

    public static void schedule(Context c) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(UpdateWorker.class, 6, TimeUnit.HOURS)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("pure-update-check", ExistingPeriodicWorkPolicy.KEEP, req);
    }
}
