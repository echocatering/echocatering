package com.echocatering.pos.ui

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.echocatering.pos.EchoPosApplication
import com.echocatering.pos.R
import com.echocatering.pos.databinding.ActivityReaderSetupBinding
import com.echocatering.pos.terminal.ReaderState
import com.echocatering.pos.terminal.TerminalState
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class ReaderSetupActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityReaderSetupBinding
    private val terminalManager by lazy { EchoPosApplication.instance.terminalManager }
    
    private lateinit var readerAdapter: ReaderListAdapter
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityReaderSetupBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        setupUI()
        setupObservers()
    }
    
    private fun setupUI() {
        // Back button
        binding.backButton.setOnClickListener {
            finish()
        }
        
        // Reader list
        readerAdapter = ReaderListAdapter { reader ->
            terminalManager.connectToReader(reader)
        }
        binding.readerRecycler.apply {
            layoutManager = LinearLayoutManager(this@ReaderSetupActivity)
            adapter = readerAdapter
        }
        
        // Scan button
        binding.scanButton.setOnClickListener {
            startScanning()
        }
        
        // Disconnect button
        binding.disconnectButton.setOnClickListener {
            terminalManager.disconnectReader()
        }
        
        // Diagnostics button
        binding.diagnosticsButton.setOnClickListener {
            startActivity(Intent(this, DiagnosticsActivity::class.java))
        }
    }
    
    private fun setupObservers() {
        lifecycleScope.launch {
            terminalManager.terminalState.collectLatest { state ->
                when (state) {
                    is TerminalState.NotInitialized -> {
                        binding.statusText.text = "Terminal not initialized"
                        binding.scanButton.isEnabled = false
                    }
                    is TerminalState.Initialized -> {
                        binding.scanButton.isEnabled = true
                    }
                    is TerminalState.Error -> {
                        binding.statusText.text = "Error: ${state.message}"
                        binding.scanButton.isEnabled = false
                    }
                }
            }
        }
        
        lifecycleScope.launch {
            terminalManager.readerState.collectLatest { state ->
                updateReaderStateUI(state)
            }
        }
        
        lifecycleScope.launch {
            terminalManager.discoveredReaders.collectLatest { readers ->
                readerAdapter.submitList(readers)
                
                if (readers.isEmpty() && terminalManager.readerState.value is ReaderState.Discovering) {
                    binding.emptyState.visibility = View.GONE
                } else if (readers.isEmpty()) {
                    binding.emptyState.visibility = View.VISIBLE
                    binding.emptyState.text = "No readers found. Make sure your M2 reader is powered on and in pairing mode."
                } else {
                    binding.emptyState.visibility = View.GONE
                }
            }
        }
    }
    
    private fun updateReaderStateUI(state: ReaderState) {
        when (state) {
            is ReaderState.Disconnected -> {
                binding.statusText.text = "No reader connected"
                binding.statusIcon.setImageResource(R.drawable.ic_bluetooth_disconnected)
                binding.scanButton.visibility = View.VISIBLE
                binding.disconnectButton.visibility = View.GONE
                binding.scanningIndicator.visibility = View.GONE
                binding.readerRecycler.visibility = View.VISIBLE
                binding.connectedReaderLayout.visibility = View.GONE
            }
            is ReaderState.Discovering -> {
                binding.statusText.text = "Scanning for readers..."
                binding.scanButton.visibility = View.GONE
                binding.disconnectButton.visibility = View.GONE
                binding.scanningIndicator.visibility = View.VISIBLE
                binding.readerRecycler.visibility = View.VISIBLE
                binding.connectedReaderLayout.visibility = View.GONE
                binding.emptyState.visibility = View.GONE
            }
            is ReaderState.NoReadersFound -> {
                binding.statusText.text = "No readers found"
                binding.scanButton.visibility = View.VISIBLE
                binding.scanButton.text = "Scan Again"
                binding.disconnectButton.visibility = View.GONE
                binding.scanningIndicator.visibility = View.GONE
                binding.emptyState.visibility = View.VISIBLE
                binding.emptyState.text = "No readers found. Make sure your M2 reader is:\n\n• Powered on (hold power button)\n• In pairing mode (blue LED flashing)\n• Within Bluetooth range"
            }
            is ReaderState.Connecting -> {
                binding.statusText.text = "Connecting to ${state.serialNumber}..."
                binding.scanButton.visibility = View.GONE
                binding.disconnectButton.visibility = View.GONE
                binding.scanningIndicator.visibility = View.VISIBLE
                binding.readerRecycler.visibility = View.GONE
                binding.connectedReaderLayout.visibility = View.GONE
            }
            is ReaderState.Connected -> {
                binding.statusText.text = "Connected"
                binding.statusIcon.setImageResource(R.drawable.ic_bluetooth_connected)
                binding.scanButton.visibility = View.GONE
                binding.disconnectButton.visibility = View.VISIBLE
                binding.scanningIndicator.visibility = View.GONE
                binding.readerRecycler.visibility = View.GONE
                binding.connectedReaderLayout.visibility = View.VISIBLE
                
                binding.connectedReaderSerial.text = state.serialNumber
                binding.connectedReaderType.text = state.deviceType
                state.batteryLevel?.let { battery ->
                    binding.connectedReaderBattery.text = "${(battery * 100).toInt()}%"
                    binding.connectedReaderBattery.visibility = View.VISIBLE
                } ?: run {
                    binding.connectedReaderBattery.visibility = View.GONE
                }
            }
            is ReaderState.Error -> {
                binding.statusText.text = "Error: ${state.message}"
                binding.scanButton.visibility = View.VISIBLE
                binding.scanButton.text = "Try Again"
                binding.disconnectButton.visibility = View.GONE
                binding.scanningIndicator.visibility = View.GONE
                Toast.makeText(this, state.message, Toast.LENGTH_LONG).show()
            }
        }
    }
    
    private fun startScanning() {
        if (terminalManager.terminalState.value !is TerminalState.Initialized) {
            terminalManager.initialize()
        }
        terminalManager.discoverReaders()
    }
}
