package ke.co.khefkis.yeetu

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.IOException

/** Shared WebView setup. Serves the bundled website from assets/www. */
object Web {
    private const val SW_STUB =
        "self.addEventListener('install',function(){self.skipWaiting()});" +
        "self.addEventListener('activate',function(e){e.waitUntil(self.registration.unregister())});"

    @SuppressLint("SetJavaScriptEnabled")
    fun setup(w: WebView) {
        val s = w.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.cacheMode = WebSettings.LOAD_DEFAULT
        w.setBackgroundColor(0xFF07101F.toInt())
        w.webViewClient = Client(w.context.applicationContext)
    }

    private class Client(val ctx: Context) : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            serve(ctx, request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val h = request.url.host ?: return false
            if (h == Config.HOST || h.endsWith("firebaseapp.com") || h.endsWith("googleapis.com") ||
                h.endsWith("google.com") || h.endsWith("gstatic.com")) return false
            try {
                ctx.startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) { }
            return true
        }
    }

    private fun mime(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js" -> "application/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "svg" -> "image/svg+xml"
        "wav" -> "audio/wav"
        "wasm" -> "application/wasm"
        else -> "application/octet-stream"
    }

    private fun serve(ctx: Context, u: Uri): WebResourceResponse? {
        if (!Config.HOST.equals(u.host, ignoreCase = true)) return null
        var name = (u.path ?: "/").trimStart('/')
        if (name.isEmpty()) name = "index.html"
        if (name.contains("..") || name.startsWith("__/")) return null
        val headers = mapOf("Cache-Control" to "no-cache")
        if (name == "sw.js") {
            // The app already has everything offline, so the web service worker is not needed here.
            return WebResourceResponse("application/javascript", "utf-8", 200, "OK", headers,
                ByteArrayInputStream(SW_STUB.toByteArray()))
        }
        return try {
            val mt = mime(name)
            val enc = if (mt.startsWith("text/") || mt.contains("javascript") || mt.contains("json")) "utf-8" else null
            WebResourceResponse(mt, enc, 200, "OK", headers, ctx.assets.open("www/$name"))
        } catch (e: IOException) {
            null
        }
    }
}
