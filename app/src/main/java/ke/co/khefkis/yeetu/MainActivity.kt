package ke.co.khefkis.yeetu

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * Front door. First time: one friendly screen that asks for everything Yeetu needs.
 * After that it goes straight into the shop and starts the floating menu.
 */
class MainActivity : Activity() {
    private var askedRuntime = false
    private var waitingOverlay = false
    private var status: TextView? = null
    private var goBtn: Button? = null
    private val handler = Handler(Looper.getMainLooper())

    /** While the Settings page is open, notice the moment the switch is turned on and bring Yeetu back by itself. */
    private val watcher = object : Runnable {
        override fun run() {
            if (overlayOk()) {
                try {
                    startActivity(Intent(this@MainActivity, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
                } catch (e: Exception) { }
            } else {
                handler.postDelayed(this, 500)
            }
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun overlayOk() = Settings.canDrawOverlays(this)
    private fun notifOk() = Build.VERSION.SDK_INT < 33 ||
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    private fun cameraOk() = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // "Display over other apps" is required: without it the floating menu cannot work, so we do not go on until it is on.
        if (overlayOk() && (Prefs.onboarded(this) || (notifOk() && cameraOk()))) {
            launch()
            return
        }
        buildUi()
    }

    private fun buildUi() {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(48), dp(24), dp(32))
        }
        col.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_yeetu_y)
            setPadding(dp(18), dp(18), dp(18), dp(18))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xFF0B1F3B.toInt())
                setStroke(dp(3), 0xFF00C6A7.toInt())
            }
        }, LinearLayout.LayoutParams(dp(112), dp(112)))
        col.addView(TextView(this).apply {
            text = "Welcome to Yeetu"
            textSize = 28f
            setTextColor(0xFFF8FAFC.toInt())
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, dp(22), 0, dp(4))
        })
        col.addView(TextView(this).apply {
            text = "Your Business. Our Companion."
            textSize = 15f
            setTextColor(0xFF00C6A7.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(26))
        })
        fun row(title: String, body: String) {
            col.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(12), dp(16), dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = dp(16).toFloat()
                    setColor(0xFF10294A.toInt())
                }
                addView(TextView(this@MainActivity).apply {
                    text = title; textSize = 16f
                    setTextColor(0xFFF8FAFC.toInt())
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                })
                addView(TextView(this@MainActivity).apply {
                    text = body; textSize = 14f
                    setTextColor(0xFF9FB3CF.toInt())
                    setPadding(0, dp(2), 0, 0)
                })
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            })
        }
        row("Show over other apps (required)", "Keeps the floating Y button on screen so you can make a sale in TikTok, YouTube or any app. We will open the right Settings page for you. Just switch it on.")
        row("Notifications", "Puts your quick menu in the notification bar: Home, Quick sale, Expense, Calculator.")
        row("Camera", "Scan barcodes and product labels when you sell or add stock.")

        status = TextView(this).apply {
            textSize = 14f
            setTextColor(0xFFFF8C00.toInt())
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, 0)
            visibility = android.view.View.GONE
        }
        col.addView(status!!)
        goBtn = Button(this).apply {
            text = "Allow & get started"
            isAllCaps = false
            textSize = 17f
            setTextColor(0xFF06182B.toInt())
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                cornerRadius = dp(28).toFloat()
                setColor(0xFF00C6A7.toInt())
            }
            setOnClickListener { step() }
        }
        col.addView(goBtn!!, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply { topMargin = dp(18) })
        setContentView(ScrollView(this).apply {
            setBackgroundColor(0xFF07101F.toInt())
            isFillViewport = true
            addView(col)
        })
    }

    /** Asks for the next missing permission; when nothing is left, starts Yeetu. */
    private fun step() {
        val need = mutableListOf<String>()
        if (!cameraOk()) need.add(Manifest.permission.CAMERA)
        if (!notifOk()) need.add(Manifest.permission.POST_NOTIFICATIONS)
        if (need.isNotEmpty() && !askedRuntime) {
            askedRuntime = true
            requestPermissions(need.toTypedArray(), 1)
            return
        }
        if (!overlayOk()) {
            openOverlaySettings()
            return
        }
        Prefs.setOnboarded(this)
        launch()
    }

    /** Opens the "Display over other apps" page for Yeetu itself (not the long list of apps). */
    private fun openOverlaySettings() {
        waitingOverlay = true
        Toast.makeText(this, "Switch ON \"Allow display over other apps\" for Yeetu", Toast.LENGTH_LONG).show()
        val pkg = Uri.parse("package:$packageName")
        try {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg))
        } catch (e: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
            } catch (e2: Exception) {
                try {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
                } catch (e3: Exception) { }
            }
        }
        handler.removeCallbacks(watcher)
        handler.postDelayed(watcher, 700)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        step()
    }

    override fun onResume() {
        super.onResume()
        handler.removeCallbacks(watcher)
        if (waitingOverlay) {
            waitingOverlay = false
            if (overlayOk()) {
                step()
            } else {
                status?.apply {
                    text = "Yeetu needs this one to show your floating button over other apps. If you see a list, tap Yeetu and switch it on."
                    visibility = android.view.View.VISIBLE
                }
                goBtn?.text = "Open the setting again"
            }
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(watcher)
        super.onDestroy()
    }

    private fun launch() {
        if (overlayOk()) {
            try {
                startForegroundService(Intent(this, OverlayService::class.java))
            } catch (e: Exception) { }
        } else {
            Toast.makeText(this, "Allow \"display over other apps\" in Settings to get the floating menu", Toast.LENGTH_LONG).show()
        }
        startActivity(Intent(this, AppActivity::class.java))
        finish()
    }
}
