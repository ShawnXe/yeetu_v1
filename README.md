# Yeetu (Android)

One app: the full Yeetu shop **plus** the floating Y menu. Install it once, allow the permissions, and the menu is there every time you open Yeetu.

## What it does
- **First open:** one screen asks for everything (display over other apps, notifications, camera). "Display over other apps" is required: Yeetu opens that Settings page for you and comes back by itself when you switch it on. After that it goes straight into the shop.
- **Floating Y bubble** over any app (TikTok, YouTube...). Drag it anywhere; it snaps to the edge. Tap it for: Home, Quick sale, Add expense, Calculator.
- **Notification-bar menu** with the same buttons: Home, Quick sale, Expense, Calculator (plus "Hide floating menu").
- Quick sale / expense / calculator open as a panel over the app you are in. Save, and you are back in the video.
- The whole site is bundled inside the APK, so it opens instantly and works offline. Plans and M-Pesa subscriptions need internet (they talk to rafiki.khefkis.co.ke).

## Get the APK (about 5 minutes)
1. Create a GitHub repository and upload everything in this folder (keep the `.github` folder).
2. Open the **Actions** tab and wait for **Build Yeetu APK** to finish (use "Run workflow" if it did not start).
3. Open the repository's **Releases** page, download **Yeetu.apk**, and install it (allow "install unknown apps").
   (It is also under the finished run as the **Yeetu-apk** artifact.)

## Updating the site later
The website files live in `app/src/main/assets/www/`. Replace them with the new site files, commit, and a new APK builds.
`app/src/main/java/ke/co/khefkis/yeetu/Config.kt` has the host name the bundled site pretends to be (the Firebase auth domain), so sign-in and Firestore behave exactly like the web version.
