package app.studio.shell

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.webkit.CookieManager
import android.widget.RemoteViews
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Widget della serie di giorni di studio: piccolo (fiamma e numero) o medio (anche la settimana), a seconda delle dimensioni. */
class StreakWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
        refresh(context, goAsync())
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle?) {
        render(context, manager, intArrayOf(id))
    }

    companion object {
        private const val MEDIUM_MIN_WIDTH_DP = 180
        private const val MEDIUM_MIN_HEIGHT_DP = 100
        private const val MAX_BODY = 512 * 1024

        /** Aggiorna tutti i widget (all'apertura dell'app e dopo «Fatto»): scarica il dato in un thread e ridisegna. */
        fun requestUpdate(context: Context) {
            val app = context.applicationContext
            val ids = AppWidgetManager.getInstance(app).getAppWidgetIds(ComponentName(app, StreakWidgetProvider::class.java))
            if (ids.isEmpty()) return
            refresh(app, null)
        }

        private fun refresh(context: Context, pending: android.content.BroadcastReceiver.PendingResult?) {
            val app = context.applicationContext
            Thread {
                try {
                    fetchAndStore(app)
                    val manager = AppWidgetManager.getInstance(app)
                    render(app, manager, manager.getAppWidgetIds(ComponentName(app, StreakWidgetProvider::class.java)))
                } catch (e: Exception) {
                    // il widget non deve mai far cadere l'app: resta l'ultimo valore
                } finally {
                    pending?.finish()
                }
            }.start()
        }

        /** GET /api/overview con il cookie di sessione della WebView. Qualunque errore: si segna il fallimento e resta l'ultimo dato. */
        private fun fetchAndStore(context: Context) {
            val store = WidgetStore(context)
            val base = Settings(context).serverUrl
            if (base == null) { store.markFailed(); return }
            var conn: HttpURLConnection? = null
            try {
                val cookie = CookieManager.getInstance().getCookie(base)
                if (cookie.isNullOrEmpty()) { store.markFailed(); return }
                conn = URL(base + "api/overview").openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = false
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                conn.setRequestProperty("Cookie", cookie)
                conn.setRequestProperty("Accept", "application/json")
                if (conn.responseCode != 200) { store.markFailed(); return }
                val body = conn.inputStream.use { readLimited(it) }.toString(Charsets.UTF_8)
                if (StreakParser.parse(body) == null) store.markFailed() else store.save(body, System.currentTimeMillis())
            } catch (e: Exception) {
                store.markFailed()
            } finally {
                conn?.disconnect()
            }
        }

        private fun readLimited(input: java.io.InputStream): ByteArray {
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(8192)
            while (out.size() < MAX_BODY) {
                val n = input.read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
            }
            return out.toByteArray()
        }

        fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val store = WidgetStore(context)
            val view = WidgetState.compute(StreakParser.parse(store.json), store.fetchedAt, store.lastOk, System.currentTimeMillis())
            for (id in ids) {
                val o = manager.getAppWidgetOptions(id)
                val medium = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) >= MEDIUM_MIN_WIDTH_DP &&
                    o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) >= MEDIUM_MIN_HEIGHT_DP
                manager.updateAppWidget(id, build(context, view, medium))
            }
        }

        fun build(context: Context, view: WidgetView, medium: Boolean): RemoteViews {
            val rv = RemoteViews(context.packageName, if (medium) R.layout.widget_medium else R.layout.widget_small)
            val open = Intent(context, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_TODAY, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            rv.setOnClickPendingIntent(R.id.widget_root,
                PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            val muted = context.getColor(R.color.widget_muted)
            val text = context.getColor(R.color.widget_text)
            when (view) {
                is WidgetView.NoData -> {
                    rv.setImageViewResource(R.id.flame, R.drawable.ic_flame_off)
                    rv.setTextViewText(R.id.count, "")
                    rv.setTextViewText(R.id.unit, context.getString(R.string.widget_login))
                    rv.setTextColor(R.id.unit, muted)
                    rv.setContentDescription(R.id.widget_root, context.getString(R.string.widget_login))
                    if (medium) for (i in 0 until 7) rv.setTextViewText(DAY_IDS[i], "")
                    if (medium) for (i in 0 until 7) rv.setInt(DAY_IDS[i], "setBackgroundResource", 0)
                }
                is WidgetView.Fresh -> fill(context, rv, view.data, view.flameOn, null, medium, text, muted)
                is WidgetView.Stale -> fill(context, rv, view.data, false, view.fetchedAt, medium, muted, muted)
            }
            return rv
        }

        private fun fill(context: Context, rv: RemoteViews, d: StreakData, flameOn: Boolean, staleAt: Long?, medium: Boolean, numColor: Int, unitColor: Int) {
            rv.setImageViewResource(R.id.flame, if (flameOn) R.drawable.ic_flame_on else R.drawable.ic_flame_off)
            rv.setTextViewText(R.id.count, d.streak.toString())
            rv.setTextColor(R.id.count, numColor)
            val unit = context.getString(if (d.streak == 1) R.string.widget_unit_one else R.string.widget_unit)
            val hour = staleAt?.let { SimpleDateFormat("HH:mm", Locale.ITALY).format(Date(it)) }
            rv.setTextViewText(R.id.unit, if (hour != null) unit + "\n" + context.getString(R.string.widget_stale, hour) else unit)
            rv.setTextColor(R.id.unit, unitColor)
            val flameCd = context.getString(if (flameOn) R.string.widget_cd_flame_on else R.string.widget_cd_flame_off)
            val summary = "${d.streak} $unit" + (if (hour != null) ", " + context.getString(R.string.widget_stale, hour) else "")
            rv.setContentDescription(R.id.widget_root, context.getString(R.string.widget_cd, summary, flameCd))
            if (!medium) return
            for (i in 0 until 7) {
                val cell = d.days.getOrNull(i)
                val id = DAY_IDS[i]
                if (cell == null) {
                    rv.setTextViewText(id, SIGLE[i])
                    rv.setInt(id, "setBackgroundResource", R.drawable.widget_cell_vuoto)
                    rv.setTextColor(id, unitColor)
                    continue
                }
                val mark = when (cell.state) { DayState.STUDIO -> "✓"; DayState.RIPOSO -> "–"; DayState.VUOTO -> "" }
                rv.setTextViewText(id, SIGLE[i] + "\n" + mark)
                val bg = when (cell.state) {
                    DayState.STUDIO -> if (cell.today) R.drawable.widget_cell_studio_today else R.drawable.widget_cell_studio
                    DayState.RIPOSO -> if (cell.today) R.drawable.widget_cell_riposo_today else R.drawable.widget_cell_riposo
                    DayState.VUOTO -> if (cell.today) R.drawable.widget_cell_vuoto_today else R.drawable.widget_cell_vuoto
                }
                rv.setInt(id, "setBackgroundResource", bg)
                rv.setTextColor(id, if (cell.state == DayState.STUDIO && staleAt == null) context.getColor(R.color.widget_cell_study_text) else numColor)
                val name = context.getString(when (cell.state) { DayState.STUDIO -> R.string.state_studio; DayState.RIPOSO -> R.string.state_riposo; DayState.VUOTO -> R.string.state_vuoto })
                val label = if (cell.today) name + " " + context.getString(R.string.today_suffix) else name
                rv.setContentDescription(id, context.getString(R.string.widget_cd_day, GIORNI[i], if (cell.dayOfMonth > 0) cell.dayOfMonth.toString() else "", label).replace("  ", " "))
            }
        }

        private val DAY_IDS = intArrayOf(R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5, R.id.d6)
        private val SIGLE = arrayOf("L", "M", "M", "G", "V", "S", "D")
        private val GIORNI = arrayOf("lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica")
    }
}
