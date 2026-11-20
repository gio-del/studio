package app.studio.shell

import java.net.URI

enum class LinkTarget { WEBVIEW, EXTERNAL }

/** Dentro la WebView solo le pagine dello stesso indirizzo (schema, host, porta); il resto va all'app di sistema. */
object LinkPolicy {
    fun decide(base: String, link: String): LinkTarget {
        val a = parse(base) ?: return LinkTarget.EXTERNAL
        val b = parse(link) ?: return LinkTarget.EXTERNAL
        return if (a == b) LinkTarget.WEBVIEW else LinkTarget.EXTERNAL
    }

    private fun parse(url: String): Triple<String, String, Int>? = try {
        val u = URI(url)
        val scheme = u.scheme?.lowercase()
        val host = u.host?.lowercase()
        if (scheme != "https" || host == null) null
        else Triple(scheme, host, if (u.port == -1) 443 else u.port)
    } catch (e: Exception) {
        null
    }
}
