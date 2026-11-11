package ke.co.khefkis.yeetu

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

/** The full Yeetu app in a normal window. */
class AppActivity : Activity() {
    private lateinit var web: WebView
    private var chooser: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        Web.setup(web)
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }

            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                chooser?.onReceiveValue(null)
                chooser = callback
                return try {
                    startActivityForResult(params.createIntent(), 77)
                    true
                } catch (e: Exception) {
                    chooser = null
                    false
                }
            }
        }
        load(intent)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == 77) {
            chooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            chooser = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    /** Opens the app; "go" jumps to a page (sale, expense, calculator, products), "scan" opens the scanner. */
    private fun load(i: Intent?) {
        val go = i?.getStringExtra("go")
        val scan = i?.getBooleanExtra("scan", false) == true
        val loaded = web.url != null
        when {
            scan -> web.loadUrl(Config.url("scan" to "1"))
            go != null && loaded -> web.evaluateJavascript("window.dukaGo&&window.dukaGo('$go')", null)
            go != null -> web.loadUrl(Config.url("go" to go))
            !loaded -> web.loadUrl(Config.url())
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        load(intent)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        OverlayService.setAppVisible(true)
    }

    override fun onPause() {
        OverlayService.setAppVisible(false)
        web.onPause()
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.dukaBack?window.dukaBack():false)") { r ->
            if (r != "true") { if (web.canGoBack()) web.goBack() else finish() }
        }
    }

    override fun onDestroy() {
        OverlayService.setAppVisible(false)
        web.destroy()
        super.onDestroy()
    }
}
