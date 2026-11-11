package ke.co.khefkis.yeetu

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RemoteViews
import android.widget.TextView
import kotlin.math.abs

/**
 * The floating Yeetu menu: a movable Y bubble over any app, plus the same quick actions
 * in the notification bar. Sale, expense and calculator open in a panel over the current app.
 */
class OverlayService : Service() {
    companion object {
        const val ACTION_STOP = "ke.co.khefkis.yeetu.STOP"
        const val ACTION_MENU = "ke.co.khefkis.yeetu.MENU"
        const val ACTION_PANEL = "ke.co.khefkis.yeetu.PANEL"
        const val EXTRA_PAGE = "page"
        private const val CHANNEL = "yeetu_quick"
        private const val NAVY = 0xFF0B1F3B.toInt()
        private const val NAVY2 = 0xFF132B4D.toInt()
        private const val TEAL = 0xFF00C6A7.toInt()
        private const val ORANGE = 0xFFF57C00.toInt()
        private const val INK = 0xFFF8FAFC.toInt()

        @Volatile private var instance: OverlayService? = null

        /** The bubble hides while the Yeetu app itself is on screen. */
        fun setAppVisible(visible: Boolean) { instance?.onAppVisibility(visible) }
    }

    private lateinit var wm: WindowManager
    private val main = Handler(Looper.getMainLooper())
    private var bubble: ImageView? = null
    private var bubbleLp: WindowManager.LayoutParams? = null
    private var menu: View? = null
    private var panel: FrameLayout? = null
    private var web: WebView? = null
    private var panelShown = false
    private var appVisible = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        if (intent?.action == ACTION_STOP || !Settings.canDrawOverlays(this)) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        instance = this
        if (bubble == null) addBubble()
        when (intent?.action) {
            ACTION_MENU -> toggleMenu()
            ACTION_PANEL -> {
                val page = intent?.getStringExtra(EXTRA_PAGE) ?: "sale"
                closeMenu()
                showPanel(page)
            }
        }
        return START_NOT_STICKY
    }

    fun onAppVisibility(visible: Boolean) {
        main.post {
            appVisible = visible
            if (visible) { closeMenu(); hidePanel() }
            updateBubble()
        }
    }

    private fun updateBubble() {
        bubble?.visibility = if (!appVisible && !panelShown && menu == null) View.VISIBLE else View.INVISIBLE
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    // ---------------------------------------------------------------- notification

    private fun svc(code: Int, action: String, page: String? = null): PendingIntent {
        val i = Intent(this, OverlayService::class.java).setAction(action)
        if (page != null) i.putExtra(EXTRA_PAGE, page)
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        val ch = NotificationChannel(CHANNEL, "Yeetu quick menu", NotificationManager.IMPORTANCE_LOW)
        ch.setShowBadge(false)
        nm.createNotificationChannel(ch)

        val openApp = PendingIntent.getActivity(
            this, 10, Intent(this, AppActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val rv = RemoteViews(packageName, R.layout.notif_menu)
        rv.setOnClickPendingIntent(R.id.n_home, openApp)
        rv.setOnClickPendingIntent(R.id.n_sale, svc(1, ACTION_PANEL, "sale"))
        rv.setOnClickPendingIntent(R.id.n_exp, svc(2, ACTION_PANEL, "expense"))
        rv.setOnClickPendingIntent(R.id.n_calc, svc(3, ACTION_PANEL, "calculator"))

        val stop = Notification.Action.Builder(
            Icon.createWithResource(this, R.drawable.ic_n_close), "Hide floating menu", svc(4, ACTION_STOP)
        ).build()
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_y)
            .setColor(TEAL)
            .setContentTitle("Yeetu")
            .setContentText("Quick sale, expense and calculator")
            .setContentIntent(openApp)
            .setStyle(Notification.DecoratedCustomViewStyle())
            .setCustomContentView(rv)
            .setCustomBigContentView(rv)
            .addAction(stop)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(1, n)
        }
    }

    // ---------------------------------------------------------------- bubble

    private fun addBubble() {
        val size = dp(58)
        val iv = ImageView(this).apply {
            setImageResource(R.drawable.ic_yeetu_y)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(dp(9), dp(9), dp(9), dp(9))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(NAVY)
                setStroke(dp(2), TEAL)
            }
            elevation = dp(8).toFloat()
        }
        val lp = WindowManager.LayoutParams(
            size, size, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = dp(4); y = dp(240) }

        var sx = 0; var sy = 0; var tx = 0f; var ty = 0f; var moved = false
        iv.setOnTouchListener { v, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { sx = lp.x; sy = lp.y; tx = e.rawX; ty = e.rawY; moved = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - tx
                    val dy = e.rawY - ty
                    if (abs(dx) > dp(8) || abs(dy) > dp(8)) moved = true
                    if (moved) {
                        lp.x = (sx + dx).toInt()
                        lp.y = (sy + dy).toInt()
                        try { wm.updateViewLayout(v, lp) } catch (ex: Exception) { }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) toggleMenu() else snapToEdge(v, lp, size)
                    true
                }
                else -> false
            }
        }
        wm.addView(iv, lp)
        bubble = iv
        bubbleLp = lp
        updateBubble()
    }

    private fun snapToEdge(v: View, lp: WindowManager.LayoutParams, size: Int) {
        val w = resources.displayMetrics.widthPixels
        val target = if (lp.x + size / 2 < w / 2) dp(4) else w - size - dp(4)
        val a = ValueAnimator.ofInt(lp.x, target)
        a.duration = 180
        a.addUpdateListener {
            lp.x = it.animatedValue as Int
            try { wm.updateViewLayout(v, lp) } catch (ex: Exception) { }
        }
        a.start()
    }

    // ---------------------------------------------------------------- menu

    private class KeyFrame(ctx: Context, val onBack: () -> Unit) : FrameLayout(ctx) {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
            if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                if (event.action == KeyEvent.ACTION_UP) onBack()
                return true
            }
            return super.dispatchKeyEvent(event)
        }
    }

    private fun toggleMenu() {
        if (panelShown) hidePanel() else if (menu != null) closeMenu() else showMenu()
    }

    private fun closeMenu() {
        val m = menu ?: return
        try { wm.removeView(m) } catch (e: Exception) { }
        menu = null
        updateBubble()
    }

    private fun pill(label: String, iconRes: Int, alignEnd: Boolean, bg: Int, onClick: () -> Unit): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setOnClickListener { onClick() }
        }
        val lab = TextView(this).apply {
            text = label
            setTextColor(INK)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(18), dp(11), dp(18), dp(11))
            background = GradientDrawable().apply {
                cornerRadius = dp(26).toFloat()
                setColor(NAVY2)
                setStroke(dp(1), 0x6600C6A7)
            }
        }
        val ic = ImageView(this).apply {
            setImageResource(iconRes)
            setPadding(dp(13), dp(13), dp(13), dp(13))
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(bg) }
        }
        val gap = dp(10)
        if (alignEnd) {
            row.addView(lab)
            row.addView(ic, LinearLayout.LayoutParams(dp(50), dp(50)).apply { marginStart = gap })
        } else {
            row.addView(ic, LinearLayout.LayoutParams(dp(50), dp(50)).apply { marginEnd = gap })
            row.addView(lab)
        }
        return row
    }

    private fun showMenu() {
        if (menu != null || panelShown) return
        val w = resources.displayMetrics.widthPixels
        val onRight = (bubbleLp?.x ?: 0) + dp(29) > w / 2
        val root = KeyFrame(this) { closeMenu() }.apply {
            setBackgroundColor(0xB3000000.toInt())
            setOnClickListener { closeMenu() }
        }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val edge = if (onRight) Gravity.END else Gravity.START
        fun add(label: String, icon: Int, bg: Int, top: Int, action: () -> Unit) {
            col.addView(pill(label, icon, onRight, bg, action),
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    topMargin = dp(top)
                    gravity = edge
                })
        }
        add("Home", R.drawable.ic_n_home, TEAL, 0) { closeMenu(); openApp() }
        add("Quick sale", R.drawable.ic_n_cart, TEAL, 12) { closeMenu(); showPanel("sale") }
        add("Add expense", R.drawable.ic_n_wallet, ORANGE, 12) { closeMenu(); showPanel("expense") }
        add("Calculator", R.drawable.ic_n_calc, TEAL, 12) { closeMenu(); showPanel("calculator") }
        add("Close", R.drawable.ic_n_close, 0xFFDC2626.toInt(), 18) { closeMenu() }
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.BOTTOM or edge
            setMargins(dp(16), dp(16), dp(16), dp(70))
        })
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )
        wm.addView(root, lp)
        menu = root
        updateBubble()
    }

    // ---------------------------------------------------------------- panel

    inner class Bridge {
        @JavascriptInterface fun saleDone() { main.post { hidePanel() } }
        @JavascriptInterface fun close() { main.post { hidePanel() } }
        @JavascriptInterface fun openScanner() { main.post { openApp(scan = true) } }
        @JavascriptInterface fun openProducts() { main.post { openApp(go = "products") } }
    }

    private fun openApp(go: String? = null, scan: Boolean = false) {
        hidePanel()
        closeMenu()
        val i = Intent(this, AppActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (go != null) i.putExtra("go", go)
        if (scan) i.putExtra("scan", true)
        startActivity(i)
    }

    /** Notification and bubble send "sale"; the web app's floating Quick sale modal is called "quicksale". */
    private fun pageFor(page: String) = if (page == "sale") "quicksale" else page

    /**
     * The tool (quick sale, add expense, calculator) is drawn by the web app itself as a floating
     * modal on a fully transparent, full-screen window: no title bar, no frame, no app page behind it.
     * Tapping outside it, closing it or pressing Back dismisses the window.
     */
    private fun buildPanel(page: String) {
        val root = KeyFrame(this) { onPanelBack() }.apply { setBackgroundColor(Color.TRANSPARENT) }
        val w = WebView(this)
        Web.setup(w)
        w.setBackgroundColor(Color.TRANSPARENT)
        w.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                main.post { request.grant(request.resources) }
            }
        }
        w.addJavascriptInterface(Bridge(), "AndroidBridge")
        w.loadUrl(Config.url("quick" to "1", "go" to pageFor(page)))
        root.addView(w, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        panel = root
        web = w
    }

    /** Back closes the top-most modal inside the tool first; when nothing is left the window closes. */
    private fun onPanelBack() {
        val w = web ?: run { hidePanel(); return }
        w.evaluateJavascript("(window.dukaBack?window.dukaBack():false)") { r ->
            if (r != "true") hidePanel()
        }
    }

    private fun showPanel(page: String) {
        if (panel == null) {
            buildPanel(page)
        } else {
            web?.evaluateJavascript("window.dukaGo&&window.dukaGo('${pageFor(page)}')", null)
        }
        if (panelShown) return
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply { softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE }
        wm.addView(panel, lp)
        panelShown = true
        web?.onResume()
        panel?.requestFocus()
        updateBubble()
    }

    private fun hidePanel() {
        if (!panelShown) return
        try { wm.removeView(panel) } catch (e: Exception) { }
        web?.evaluateJavascript("window.dukaCloseAll&&window.dukaCloseAll()", null)
        web?.onPause()
        panelShown = false
        updateBubble()
    }

    override fun onDestroy() {
        instance = null
        hidePanel()
        closeMenu()
        try { bubble?.let { wm.removeView(it) } } catch (e: Exception) { }
        bubble = null
        web?.destroy()
        web = null
        panel = null
        super.onDestroy()
    }
}
