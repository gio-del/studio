package app.studio.shell

import android.app.Activity
import android.content.res.Configuration
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/** Spazi (sinistra, alto, destra, basso) da dare a un contenitore perché non finisca sotto le barre di sistema. */
object InsetPadding {
    fun compute(
        left: Int, top: Int, right: Int, bottom: Int,
        viewX: Int, viewY: Int, viewW: Int, viewH: Int,
        rootW: Int, rootH: Int,
    ): IntArray = intArrayOf(
        maxOf(0, left - viewX),
        maxOf(0, top - viewY),
        maxOf(0, right - (rootW - viewX - viewW)),
        maxOf(0, bottom - (rootH - viewY - viewH)),
    )

    /**
     * Android 15 disegna l'app sotto le barre di sistema e la tastiera: la pagina resta nello
     * spazio libero (si toglie solo la parte delle barre che la vista copre davvero).
     */
    fun install(activity: Activity, view: View) {
        val night = (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(activity.window, view).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }
        val mask = WindowInsetsCompat.Type.systemBars() or
            WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
        val base = intArrayOf(view.paddingLeft, view.paddingTop, view.paddingRight, view.paddingBottom)
        ViewCompat.setOnApplyWindowInsetsListener(view) { v, insets ->
            val bars = insets.getInsets(mask)
            val loc = IntArray(2)
            v.getLocationInWindow(loc)
            val root = v.rootView
            val p = compute(
                bars.left, bars.top, bars.right, bars.bottom,
                loc[0], loc[1], v.width, v.height, root.width, root.height,
            )
            v.setPadding(base[0] + p[0], base[1] + p[1], base[2] + p[2], base[3] + p[3])
            insets
        }
        var lastTop = Int.MIN_VALUE
        view.addOnLayoutChangeListener { v, _, _, _, _, _, _, _, _ ->
            val loc = IntArray(2)
            v.getLocationInWindow(loc)
            if (loc[1] != lastTop) {
                lastTop = loc[1]
                ViewCompat.requestApplyInsets(v)
            }
        }
    }
}
