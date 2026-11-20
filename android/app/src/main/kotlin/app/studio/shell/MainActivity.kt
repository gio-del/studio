package app.studio.shell

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private var webView: WebView? = null
    private lateinit var errorView: View
    private lateinit var container: FrameLayout
    private var state: LoadState? = null
    private var base: String? = null
    private var pendingToday = false

    companion object {
        const val EXTRA_TODAY = "open_today"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        container = FrameLayout(this)
        errorView = buildErrorView()
        errorView.visibility = View.GONE
        setContentView(container)
        pendingToday = intent?.getBooleanExtra(EXTRA_TODAY, false) == true
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val w = webView
                if (w != null && w.canGoBack()) {
                    errorView.visibility = View.GONE
                    state?.onSuccess()
                    w.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(EXTRA_TODAY, false)) {
            val b = base
            if (b != null) {
                errorView.visibility = View.GONE
                webView?.loadUrl(b + "#/oggi")
            } else {
                pendingToday = true
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val saved = Settings(this).serverUrl
        val today = pendingToday
        pendingToday = false
        if (saved == null) {
            startActivityForResult(Intent(this, SetupActivity::class.java), 1)
        } else if (saved != base) {
            open(saved, today)
        } else if (today) {
            webView?.loadUrl(saved + "#/oggi")
        }
    }

    override fun onResume() {
        super.onResume()
        StreakWidgetProvider.requestUpdate(this)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK && Settings(this).serverUrl == null) finish()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun open(url: String, today: Boolean = false) {
        webView?.let { container.removeView(it); it.destroy() }
        base = url
        val st = LoadState(url)
        state = st
        val w = WebView(this)
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, false)
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url.toString()
                if (LinkPolicy.decide(url, target) == LinkTarget.WEBVIEW) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)).addCategory(Intent.CATEGORY_BROWSABLE))
                } catch (e: ActivityNotFoundException) {
                    // nessuna app per questo link: non si fa niente
                }
                return true
            }

            // «Fatto» nell'app: poco dopo la richiesta il widget si aggiorna (la pagina non cambia).
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (request.method == "POST" && request.url.path == "/api/fatto") {
                    view.postDelayed({ StreakWidgetProvider.requestUpdate(applicationContext) }, 3000)
                }
                return null
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    st.onError(request.url.toString())
                    errorView.visibility = View.VISIBLE
                }
            }

            override fun onPageFinished(view: WebView, pageUrl: String?) {
                if (!st.hasError) errorView.visibility = View.GONE
            }
        }
        container.removeAllViews()
        container.addView(w, FrameLayout.LayoutParams(-1, -1))
        container.addView(errorView, FrameLayout.LayoutParams(-1, -1))
        webView = w
        w.loadUrl(if (today) url + "#/oggi" else url)
    }

    private fun buildErrorView(): View {
        val pad = (24 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            isClickable = true
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
        }
        val bg = android.util.TypedValue()
        theme.resolveAttribute(android.R.attr.colorBackground, bg, true)
        col.setBackgroundColor(bg.data)
        col.addView(TextView(this).apply { setText(R.string.error_title); textSize = 20f; gravity = Gravity.CENTER })
        col.addView(TextView(this).apply { setText(R.string.error_text); gravity = Gravity.CENTER })
        col.addView(Button(this).apply {
            setText(R.string.retry)
            minHeight = (48 * resources.displayMetrics.density).toInt()
            setOnClickListener {
                val target = state?.retry() ?: base
                errorView.visibility = View.GONE
                if (target != null) webView?.loadUrl(target)
            }
        })
        return col
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        StreakWidgetProvider.requestUpdate(this)
        super.onPause()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, R.string.menu_change)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == 1) {
            startActivityForResult(Intent(this, SetupActivity::class.java), 1)
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
