package app.studio.shell

import org.json.JSONArray
import org.json.JSONObject

/** Stato di un giorno della settimana, come nel widget dentro l'app web. */
enum class DayState { STUDIO, RIPOSO, VUOTO }

data class DayCell(val state: DayState, val today: Boolean, val dayOfMonth: Int)

data class StreakData(val streak: Int, val todayDone: Boolean, val days: List<DayCell>)

/** Legge la risposta di /api/overview senza mai lanciare: campi mancanti o di tipo sbagliato prendono un valore neutro. */
object StreakParser {
    private const val MAX_STREAK = 100_000

    /** null se il testo non è un oggetto JSON o non contiene né `streak` né `streakWeek` (per esempio una pagina d'errore). */
    fun parse(text: String?): StreakData? {
        if (text.isNullOrBlank()) return null
        val root = try { JSONObject(text) } catch (e: Exception) { return null }
        val streakRaw = root.opt("streak")
        val week = root.opt("streakWeek") as? JSONObject
        if (streakRaw !is Number && week == null) return null
        val streak = (streakRaw as? Number)?.toDouble()?.let { if (it.isNaN() || it < 0) 0 else minOf(it, MAX_STREAK.toDouble()).toInt() } ?: 0
        val todayDone = week?.opt("todayDone") == true
        val days = ArrayList<DayCell>()
        val arr = week?.opt("days") as? JSONArray
        if (arr != null) {
            for (i in 0 until minOf(arr.length(), 7)) {
                val d = arr.opt(i) as? JSONObject
                val state = when (d?.opt("state")) {
                    "studio" -> DayState.STUDIO
                    "riposo" -> DayState.RIPOSO
                    else -> DayState.VUOTO
                }
                days.add(DayCell(state, d?.opt("today") == true, dayOfMonth(d?.opt("date"))))
            }
        }
        return StreakData(streak, todayDone, days)
    }

    private fun dayOfMonth(date: Any?): Int {
        val s = date as? String ?: return 0
        return if (s.length >= 10) s.substring(8, 10).toIntOrNull() ?: 0 else 0
    }
}

/** Cosa mostra il widget. */
sealed class WidgetView {
    object NoData : WidgetView()
    /** Dato recente: fiamma accesa se oggi c'è già una sessione. */
    data class Fresh(val data: StreakData, val flameOn: Boolean) : WidgetView()
    /** Dato vecchio o ultimo aggiornamento fallito: grigio, con l'ora dell'ultimo dato. */
    data class Stale(val data: StreakData, val fetchedAt: Long) : WidgetView()
}

object WidgetState {
    const val MAX_AGE_MS = 2L * 60 * 60 * 1000

    fun compute(data: StreakData?, fetchedAt: Long, lastFetchOk: Boolean, now: Long): WidgetView {
        if (data == null) return WidgetView.NoData
        if (!lastFetchOk || now - fetchedAt > MAX_AGE_MS || fetchedAt > now + MAX_AGE_MS) return WidgetView.Stale(data, fetchedAt)
        return WidgetView.Fresh(data, data.todayDone && data.streak > 0)
    }
}
