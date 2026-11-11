package ke.co.khefkis.yeetu

import android.content.Context

object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("yeetu", Context.MODE_PRIVATE)
    fun onboarded(c: Context): Boolean = sp(c).getBoolean("onboarded", false)
    fun setOnboarded(c: Context) { sp(c).edit().putBoolean("onboarded", true).apply() }
}
