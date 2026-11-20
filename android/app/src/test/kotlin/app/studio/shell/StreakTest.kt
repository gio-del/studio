package app.studio.shell

import org.junit.Assert.*
import org.junit.Test

class StreakTest {
    private val week = """{"date":"2026-11-20","streak":5,"streakWeek":{"todayDone":true,"days":[
        {"date":"2026-11-16","state":"studio","today":false},{"date":"2026-11-17","state":"riposo","today":false},
        {"date":"2026-11-18","state":"vuoto","today":false},{"date":"2026-11-19","state":"studio","today":false},
        {"date":"2026-11-20","state":"studio","today":true},{"date":"2026-11-21","state":"vuoto","today":false},
        {"date":"2026-11-22","state":"riposo","today":false}]},"areas":[],"session":{}}"""
    private val now = 1_000_000_000_000L

    @Test fun parsesFullResponse() {
        val d = StreakParser.parse(week)!!
        assertEquals(5, d.streak)
        assertTrue(d.todayDone)
        assertEquals(7, d.days.size)
        assertEquals(DayState.STUDIO, d.days[0].state)
        assertEquals(DayState.RIPOSO, d.days[1].state)
        assertEquals(DayState.VUOTO, d.days[2].state)
        assertTrue(d.days[4].today)
        assertEquals(20, d.days[4].dayOfMonth)
    }

    @Test fun missingOrWrongFieldsDoNotCrash() {
        assertNull(StreakParser.parse(null))
        assertNull(StreakParser.parse(""))
        assertNull(StreakParser.parse("<html>accesso</html>"))
        assertNull(StreakParser.parse("[1,2]"))
        assertNull(StreakParser.parse("{}"))
        assertNull(StreakParser.parse("""{"error":"Non autorizzato"}"""))
        assertEquals(StreakData(3, false, emptyList()), StreakParser.parse("""{"streak":3}"""))
        assertNull(StreakParser.parse("""{"streak":"tre","streakWeek":"x"}"""))
        assertEquals(StreakData(0, false, emptyList()), StreakParser.parse("""{"streak":"tre","streakWeek":{}}"""))
        assertEquals(StreakData(0, false, emptyList()), StreakParser.parse("""{"streak":-4}"""))
        val odd = StreakParser.parse("""{"streak":2,"streakWeek":{"todayDone":"si","days":[1,null,{"state":5,"date":7},{"state":"studio","date":"x"}]}}""")!!
        assertFalse(odd.todayDone)
        assertEquals(4, odd.days.size)
        assertTrue(odd.days.all { !it.today })
        assertEquals(DayState.STUDIO, odd.days[3].state)
        assertEquals(0, odd.days[3].dayOfMonth)
        assertEquals(7, StreakParser.parse("""{"streakWeek":{"days":[{},{},{},{},{},{},{},{},{}]}}""")!!.days.size)
    }

    @Test fun flameOnWhenTodayDone() {
        val v = WidgetState.compute(StreakParser.parse(week), now - 1000, true, now)
        assertTrue(v is WidgetView.Fresh && v.flameOn)
    }

    @Test fun flameOffWhenTodayMissing() {
        val d = StreakParser.parse("""{"streak":4,"streakWeek":{"todayDone":false,"days":[]}}""")
        val v = WidgetState.compute(d, now, true, now)
        assertTrue(v is WidgetView.Fresh && !v.flameOn && v.data.streak == 4)
    }

    @Test fun streakZeroIsFreshAndOff() {
        val d = StreakParser.parse("""{"streak":0,"streakWeek":{"todayDone":false,"days":[]}}""")
        val v = WidgetState.compute(d, now, true, now) as WidgetView.Fresh
        assertFalse(v.flameOn)
        assertEquals(0, v.data.streak)
    }

    @Test fun oldDataIsStale() {
        val d = StreakParser.parse(week)
        val v = WidgetState.compute(d, now - WidgetState.MAX_AGE_MS - 1, true, now)
        assertTrue(v is WidgetView.Stale && v.fetchedAt == now - WidgetState.MAX_AGE_MS - 1)
        assertTrue(WidgetState.compute(d, now, false, now) is WidgetView.Stale)
    }

    @Test fun noDataAtAll() {
        assertEquals(WidgetView.NoData, WidgetState.compute(null, 0, false, now))
    }
}
