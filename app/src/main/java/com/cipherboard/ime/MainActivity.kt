package com.cipherboard.ime

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.TextView

class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.btnEnableKeyboard).setOnClickListener {
            // Opens the System Settings screen listing all on-screen keyboards
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }

        findViewById<Button>(R.id.btnShowPicker).setOnClickListener {
            // Shows the keyboard switcher dialog so the user can pick CipherBoard
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun refreshStatus() {
        val activeIme = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD) ?: ""
        val enabledList = Settings.Secure.getString(contentResolver, "enabled_input_methods") ?: ""

        val status = buildString {
            appendLine(if (enabledList.contains(packageName)) {
                "OK  CipherBoard is enabled as a keyboard"
            } else {
                "MISSING  CipherBoard is not enabled yet - tap button 1"
            })
            appendLine(if (activeIme.contains(packageName)) {
                "OK  CipherBoard is the active keyboard"
            } else {
                "INFO  Tap button 2 and select CipherBoard from the picker"
            })
        }

        findViewById<TextView>(R.id.statusText).text = status
    }
}
