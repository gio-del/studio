package app.studio.shell

import android.content.Context

/** Ultimo dato di /api/overview, l'ora in cui è stato letto e l'esito dell'ultimo tentativo. */
class WidgetStore(context: Context) {
    private val prefs = context.getSharedPreferences("studio_widget", Context.MODE_PRIVATE)
    val json: String? get() = prefs.getString("json", null)
    val fetchedAt: Long get() = prefs.getLong("fetched_at", 0L)
    val lastOk: Boolean get() = prefs.getBoolean("last_ok", false)

    fun save(body: String, now: Long) {
        prefs.edit().putString("json", body).putLong("fetched_at", now).putBoolean("last_ok", true).apply()
    }

    fun markFailed() {
        prefs.edit().putBoolean("last_ok", false).apply()
    }
}
