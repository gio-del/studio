package app.studio.shell

import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Primo avvio (e «Cambia indirizzo»): chiede l'indirizzo, lo controlla con una richiesta, lo salva. */
class SetupActivity : AppCompatActivity() {
    private lateinit var input: EditText
    private lateinit var status: TextView
    private lateinit var button: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        root.addView(TextView(this).apply { setText(R.string.setup_title); textSize = 20f })
        input = EditText(this).apply {
            setHint(R.string.setup_hint)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            minHeight = (48 * resources.displayMetrics.density).toInt()
            setText(Settings(this@SetupActivity).serverUrl ?: "")
        }
        status = TextView(this)
        button = Button(this).apply {
            setText(R.string.setup_save)
            minHeight = (48 * resources.displayMetrics.density).toInt()
            setOnClickListener { submit() }
        }
        root.addView(input)
        root.addView(status)
        root.addView(button)
        setContentView(root)
        InsetPadding.install(this, root)
    }

    private fun submit() {
        when (val r = ServerAddress.validate(input.text.toString())) {
            is AddressResult.Invalid -> status.setText(
                when (r.reason) {
                    Reason.EMPTY -> R.string.err_empty
                    Reason.NOT_HTTPS -> R.string.err_scheme
                    Reason.INVALID -> R.string.err_invalid
                }
            )
            is AddressResult.Ok -> {
                status.setText(R.string.setup_checking)
                button.isEnabled = false
                thread {
                    val ok = reachable(r.url)
                    runOnUiThread {
                        button.isEnabled = true
                        if (ok) {
                            Settings(this).serverUrl = r.url
                            setResult(RESULT_OK)
                            finish()
                        } else status.setText(R.string.err_unreachable)
                    }
                }
            }
        }
    }

    private fun reachable(url: String): Boolean = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8000
        c.readTimeout = 8000
        c.requestMethod = "GET"
        // qualunque risposta HTTP prova che il server c'è (la pagina di accesso può rispondere con un reindirizzamento)
        c.responseCode
        c.disconnect()
        true
    } catch (e: Exception) {
        false
    }
}
