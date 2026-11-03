package app.pure.chat

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.math.BigInteger
import java.security.KeyFactory
import java.security.spec.ECPrivateKeySpec

/** Cross-compat with the web client: vector produced by WebCrypto (Node) using the exact v09.js scheme. Throwaway test keys. */
class NativeE2ETest {
    private val aPub = JSONObject().put("x", "Ge0M0xTT9MWa4_fy1bjy-c_S7fhmEFyMi5_4r6oZ5ds").put("y", "DmGCTliMasJdo4PNiO4tWsmS52_kDXAQlI71kEASTJU")
    private val bD = "STYfYxQx1ymx_ih07nwxIF-kDvUXH4J1D_3J7j3HOgw"
    private val payload = "e2e1:cenF2PJFjMCXFrr-:Yxn2YODkURG5QK5JV4gYR13IkAReiYbVDSeb9-6IfK9U36baVar15ZwwNEY"

    @Test fun decryptsWebCryptoPayload() {
        val ps = NativeE2E.params()
        val bPriv = KeyFactory.getInstance("EC").generatePrivate(ECPrivateKeySpec(BigInteger(1, NativeE2E.unb64u(bD)), ps))
        val key = NativeE2E.agree(bPriv, NativeE2E.pubFromJwk(aPub, ps))
        assertEquals("สวัสดี PURE 🔒", NativeE2E.decryptWith(key, NativeE2E.aad("bob-id", "alice-id"), payload))
    }
    @Test fun roundTripAndAadBinding() {
        val ps = NativeE2E.params()
        val bPriv = KeyFactory.getInstance("EC").generatePrivate(ECPrivateKeySpec(BigInteger(1, NativeE2E.unb64u(bD)), ps))
        val key = NativeE2E.agree(bPriv, NativeE2E.pubFromJwk(aPub, ps))
        val out = NativeE2E.encryptWith(key, NativeE2E.aad("a", "b"), "hello")
        assertTrue(out.matches(Regex("^e2e1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]+$")))
        assertEquals("hello", NativeE2E.decryptWith(key, NativeE2E.aad("b", "a"), out))
        assertThrows(Exception::class.java) { NativeE2E.decryptWith(key, NativeE2E.aad("a", "c"), out) }
    }
    @Test fun pureAiMessagesStayPlain() {
        assertTrue(NativeE2E.isPlainOnly("  @PURE what's up")); assertFalse(NativeE2E.isPlainOnly("@pureness")); assertFalse(NativeE2E.isPlainOnly("hi @pure"))
    }
    @Test fun jwkCoordinatesAre32Bytes() {
        assertEquals(32, NativeE2E.fixed32(BigInteger.ONE).size); assertEquals(32, NativeE2E.fixed32(BigInteger(1, ByteArray(33) { 1 })).size)
    }
}
