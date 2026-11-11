package ke.co.khefkis.yeetu

import android.net.Uri

object Config {
    /**
     * The app's own website files are bundled inside the APK (assets/www) and are served to the
     * WebView as if they came from this host, so Yeetu opens instantly and works offline.
     * Anything that is not a bundled file (Firebase sign-in helpers, etc.) goes to the real network.
     */
    const val HOST = "yeetu-b8621.firebaseapp.com"

    fun url(vararg query: Pair<String, String>): String {
        val b = Uri.Builder().scheme("https").authority(HOST).path("/")
        for ((k, v) in query) b.appendQueryParameter(k, v)
        return b.build().toString()
    }
}
