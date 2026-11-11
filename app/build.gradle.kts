plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "ke.co.khefkis.yeetu"
    compileSdk = 34
    defaultConfig {
        applicationId = "ke.co.khefkis.yeetu"
        minSdk = 26
        targetSdk = 34
        versionCode = 5
        versionName = "4.1"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
