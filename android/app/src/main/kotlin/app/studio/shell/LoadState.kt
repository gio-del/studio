package app.studio.shell

/** Ripristino dopo un errore di rete: ricorda la pagina che non si è caricata e dice cosa ricaricare con «Riprova». */
class LoadState(private val base: String) {
    var failedUrl: String? = null
        private set

    val hasError: Boolean get() = failedUrl != null

    fun onError(url: String?) {
        failedUrl = url?.takeIf { LinkPolicy.decide(base, it) == LinkTarget.WEBVIEW } ?: base
    }

    fun onSuccess() {
        failedUrl = null
    }

    /** Indirizzo da ricaricare e azzera l'errore; null se non c'era errore. */
    fun retry(): String? {
        val target = failedUrl
        failedUrl = null
        return target
    }
}
