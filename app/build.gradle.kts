plugins {
    id("com.android.application")
}

// GitHub Actions sets GITHUB_RUN_NUMBER, so every build gets a higher version and installs as an update.
val runNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "cz.aoe2wiki.reader"
    compileSdk = 35

    defaultConfig {
        applicationId = "cz.aoe2wiki.reader"
        minSdk = 24
        targetSdk = 35
        versionCode = runNumber
        versionName = "1.0.$runNumber"
    }

    // A fixed key so that every new build can be installed over the previous one
    // without losing downloaded offline data. Personal sideloaded app only.
    signingConfigs {
        create("app") {
            storeFile = file("app-signing.jks")
            storeType = "pkcs12"
            storePassword = "aoe2wiki"
            keyAlias = "aoe2wiki"
            keyPassword = "aoe2wiki"
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("app")
        }
        getByName("debug") {
            signingConfig = signingConfigs.getByName("app")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    // Aligns kotlin-stdlib-jdk7/jdk8 (pulled in transitively by AndroidX) with kotlin-stdlib
    // to avoid duplicate classes.
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
    implementation("androidx.activity:activity:1.9.3")
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
}
