package app.studio.shell

import java.net.URI

/** Validazione dell'indirizzo del server: solo https, mai vuoto. Logica pura (test JVM). */
sealed class AddressResult {
    data class Ok(val url: String) : AddressResult()
    data class Invalid(val reason: Reason) : AddressResult()
}

enum class Reason { EMPTY, NOT_HTTPS, INVALID }

object ServerAddress {
    fun validate(input: String?): AddressResult {
        val text = input?.trim().orEmpty()
        if (text.isEmpty()) return AddressResult.Invalid(Reason.EMPTY)
        if (!text.startsWith("https://", ignoreCase = true)) return AddressResult.Invalid(Reason.NOT_HTTPS)
        val uri = try {
            URI(text)
        } catch (e: Exception) {
            return AddressResult.Invalid(Reason.INVALID)
        }
        if (uri.host.isNullOrEmpty() || uri.userInfo != null) return AddressResult.Invalid(Reason.INVALID)
        return AddressResult.Ok(text.trimEnd('/') + "/")
    }
}
