package app.studio.shell

import org.junit.Assert.*
import org.junit.Test

class ShellTest {
    @Test fun addressRejectsEmpty() {
        assertEquals(AddressResult.Invalid(Reason.EMPTY), ServerAddress.validate("  "))
        assertEquals(AddressResult.Invalid(Reason.EMPTY), ServerAddress.validate(null))
    }

    @Test fun addressOnlyHttps() {
        assertEquals(AddressResult.Invalid(Reason.NOT_HTTPS), ServerAddress.validate("http://example.org"))
        assertEquals(AddressResult.Invalid(Reason.NOT_HTTPS), ServerAddress.validate("example.org"))
        assertEquals(AddressResult.Invalid(Reason.INVALID), ServerAddress.validate("https://"))
        assertEquals(AddressResult.Invalid(Reason.INVALID), ServerAddress.validate("https://u:p@example.org"))
        assertEquals(AddressResult.Ok("https://example.org/"), ServerAddress.validate(" https://example.org "))
        assertEquals(AddressResult.Ok("https://example.org:8443/"), ServerAddress.validate("https://example.org:8443/"))
    }

    private val base = "https://example.org/"

    @Test fun sameAddressStaysInWebView() {
        assertEquals(LinkTarget.WEBVIEW, LinkPolicy.decide(base, "https://example.org/#/oggi"))
        assertEquals(LinkTarget.WEBVIEW, LinkPolicy.decide(base, "https://EXAMPLE.org:443/api/x"))
    }

    @Test fun otherLinksGoExternal() {
        assertEquals(LinkTarget.EXTERNAL, LinkPolicy.decide(base, "https://other.org/"))
        assertEquals(LinkTarget.EXTERNAL, LinkPolicy.decide(base, "https://example.org:8443/"))
        assertEquals(LinkTarget.EXTERNAL, LinkPolicy.decide(base, "http://example.org/"))
        assertEquals(LinkTarget.EXTERNAL, LinkPolicy.decide(base, "obsidian://open?vault=x"))
        assertEquals(LinkTarget.EXTERNAL, LinkPolicy.decide(base, "mailto:a@b.c"))
    }

    @Test fun retryAfterNetworkError() {
        val s = LoadState(base)
        assertNull(s.retry())
        s.onError("https://example.org/#/oggi")
        assertTrue(s.hasError)
        assertEquals("https://example.org/#/oggi", s.retry())
        assertFalse(s.hasError)
        s.onError("https://other.org/")
        assertEquals(base, s.retry())
        s.onError(null)
        s.onSuccess()
        assertFalse(s.hasError)
    }
}
