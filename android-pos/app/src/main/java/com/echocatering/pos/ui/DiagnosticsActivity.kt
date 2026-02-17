package com.echocatering.pos.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.echocatering.pos.BuildConfig
import com.echocatering.pos.EchoPosApplication
import com.echocatering.pos.databinding.ActivityDiagnosticsBinding
import com.stripe.stripeterminal.Terminal
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class DiagnosticsActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityDiagnosticsBinding
    private val terminalManager by lazy { EchoPosApplication.instance.terminalManager }
    private val diagnosticLogs = mutableListOf<String>()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDiagnosticsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        setupUI()
        collectDiagnostics()
    }
    
    private fun setupUI() {
        binding.backButton.setOnClickListener {
            finish()
        }
        
        binding.copyButton.setOnClickListener {
            copyToClipboard()
        }
        
        binding.refreshButton.setOnClickListener {
            collectDiagnostics()
        }
    }
    
    private fun collectDiagnostics() {
        diagnosticLogs.clear()
        
        addLog("=== STRIPE TERMINAL DIAGNOSTICS ===")
        addLog("Generated: ${getCurrentTimestamp()}")
        addLog("")
        
        // App Info
        addLog("--- APP INFORMATION ---")
        addLog("App Version: ${BuildConfig.VERSION_NAME}")
        addLog("Build Type: ${BuildConfig.BUILD_TYPE}")
        addLog("")
        
        // SDK Info
        addLog("--- STRIPE SDK INFORMATION ---")
        addLog("SDK Initialized: ${Terminal.isInitialized()}")
        addLog("SDK Version: 5.2.0")
        addLog("")
        
        // Permissions
        addLog("--- PERMISSIONS ---")
        addLog("Has Required Permissions: ${terminalManager.hasRequiredPermissions()}")
        addLog("")
        
        // Terminal State
        addLog("--- TERMINAL STATE ---")
        addLog("State: ${terminalManager.terminalState.value}")
        addLog("")
        
        // Reader State
        addLog("--- READER STATE ---")
        val readerState = terminalManager.readerState.value
        addLog("State: $readerState")
        addLog("")
        
        // Discovered Readers
        addLog("--- DISCOVERED READERS ---")
        val readers = terminalManager.discoveredReaders.value
        if (readers.isEmpty()) {
            addLog("No readers discovered")
        } else {
            readers.forEachIndexed { index, reader ->
                addLog("Reader ${index + 1}:")
                addLog("  Serial: ${reader.serialNumber ?: "Unknown"}")
                addLog("  Device Type: ${reader.deviceType?.name ?: "Unknown"}")
                addLog("  Battery: ${reader.batteryLevel?.let { "${(it * 100).toInt()}%" } ?: "Unknown"}")
                addLog("  Location: ${reader.location?.id ?: "None"}")
            }
        }
        addLog("")
        
        // Connection Parameters
        addLog("--- CONNECTION PARAMETERS ---")
        addLog("Discovery Method: Bluetooth")
        addLog("Simulated Mode: false")
        addLog("Log Level: VERBOSE")
        addLog("")
        
        // Instructions
        addLog("--- INSTRUCTIONS FOR STRIPE SUPPORT ---")
        addLog("1. Copy this entire diagnostic report")
        addLog("2. Send it to Stripe support via email or chat")
        addLog("3. Mention you're trying to connect an M2 reader")
        addLog("4. Include any error messages you see in the app")
        addLog("")
        
        // Display
        binding.diagnosticsText.text = diagnosticLogs.joinToString("\n")
    }
    
    private fun addLog(message: String) {
        diagnosticLogs.add(message)
    }
    
    private fun getCurrentTimestamp(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        return sdf.format(Date())
    }
    
    private fun copyToClipboard() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Stripe Terminal Diagnostics", diagnosticLogs.joinToString("\n"))
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, "Diagnostics copied to clipboard!", Toast.LENGTH_SHORT).show()
    }
}
