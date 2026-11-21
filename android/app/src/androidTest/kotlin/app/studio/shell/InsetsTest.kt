package app.studio.shell

import android.app.Activity
import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.EditText
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.FileOutputStream

/** Controlla su emulatore (API 35, gesti e tre tasti) che la pagina stia fuori dalle barre di sistema. */
class InsetsTest {
    private val inst = InstrumentationRegistry.getInstrumentation()

    @Before fun setUp() {
        // Un indirizzo valido ma irraggiungibile: basta il contenitore della WebView.
        Settings(ApplicationProvider.getApplicationContext()).serverUrl = "https://studio.invalid/"
    }

    @After fun tearDown() {
        Settings(ApplicationProvider.getApplicationContext()).serverUrl = null
    }

    private fun insets(a: Activity): WindowInsetsCompat {
        var r: WindowInsetsCompat? = null
        inst.runOnMainSync { r = ViewCompat.getRootWindowInsets(a.window.decorView) }
        return r!!
    }

    private fun bounds(v: View): Rect {
        val r = Rect()
        inst.runOnMainSync {
            val loc = IntArray(2)
            v.getLocationOnScreen(loc)
            r.set(loc[0], loc[1], loc[0] + v.width, loc[1] + v.height)
        }
        return r
    }

    private fun findWebView(v: View): WebView? {
        if (v is WebView) return v
        if (v is ViewGroup) for (i in 0 until v.childCount) findWebView(v.getChildAt(i))?.let { return it }
        return null
    }

    private fun shot(name: String) {
        val bmp = inst.uiAutomation.takeScreenshot() ?: return
        val dir = File(inst.targetContext.getExternalFilesDir(null), "shots").apply { mkdirs() }
        FileOutputStream(File(dir, "$name.png")).use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun webViewIsInsideSystemBars() {
        ActivityScenario.launch(MainActivity::class.java).use { sc ->
            inst.waitForIdleSync()
            Thread.sleep(1500)
            var act: Activity? = null
            sc.onActivity { act = it }
            val a = act!!
            val bars = insets(a).getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val web = findWebView(a.window.decorView)!!
            val b = bounds(web)
            val screen = bounds(a.window.decorView)
            assertTrue("alto ${b.top} < barra di stato ${bars.top}", b.top >= bars.top)
            assertTrue("basso ${b.bottom} > ${screen.bottom - bars.bottom}", b.bottom <= screen.bottom - bars.bottom)
            assertTrue("sinistra", b.left >= bars.left)
            assertTrue("destra", b.right <= screen.right - bars.right)
            shot("webview")
        }
    }

    @Test fun focusedFieldStaysAboveKeyboard() {
        ActivityScenario.launch(SetupActivity::class.java).use { sc ->
            var act: Activity? = null
            sc.onActivity { a ->
                act = a
                findEdit(a.window.decorView)?.requestFocus()
                androidx.core.view.WindowCompat.getInsetsController(a.window, a.window.decorView)
                    .show(WindowInsetsCompat.Type.ime())
            }
            Thread.sleep(2000)
            val a = act!!
            val ime = insets(a).getInsets(WindowInsetsCompat.Type.ime())
            val field = bounds(findEdit(a.window.decorView)!!)
            val screen = bounds(a.window.decorView)
            assertTrue("tastiera non aperta", ime.bottom > 0)
            assertTrue("campo ${field.bottom} sotto la tastiera ${screen.bottom - ime.bottom}", field.bottom <= screen.bottom - ime.bottom)
            shot("tastiera")
        }
    }

    private fun findEdit(v: View): EditText? {
        if (v is EditText) return v
        if (v is ViewGroup) for (i in 0 until v.childCount) findEdit(v.getChildAt(i))?.let { return it }
        return null
    }
}
