package com.example.data

import android.content.Context
import com.example.BuildConfig

object ConverterServerPrefs {
    private const val PREFS = "ogm_prefs"
    private const val KEY_CONVERTER_SERVER_URL = "converter_server_url"

    fun getSavedUrl(context: Context): String {
        return context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_CONVERTER_SERVER_URL, "")
            ?.trim()
            .orEmpty()
    }

    fun setSavedUrl(context: Context, url: String) {
        val trimmed = url.trim()
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .apply {
                if (trimmed.isEmpty()) remove(KEY_CONVERTER_SERVER_URL)
                else putString(KEY_CONVERTER_SERVER_URL, trimmed)
            }
            .apply()
    }

    /**
     * Saved Settings URL → [BuildConfig.CONVERTER_BASE_URL] (defaults to AppDeploy).
     * Clear Settings to use the baked-in AppDeploy converter host.
     */
    fun resolveBaseUrl(context: Context): String {
        getSavedUrl(context).takeIf { it.isNotBlank() }?.let { return it.trimEnd('/') }
        BuildConfig.CONVERTER_BASE_URL.trim().takeIf { it.isNotBlank() }?.let { return it.trimEnd('/') }
        return ""
    }
}
