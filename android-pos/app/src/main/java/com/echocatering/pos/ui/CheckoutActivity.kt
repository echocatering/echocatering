package com.echocatering.pos.ui

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.echocatering.pos.EchoPosApplication
import com.echocatering.pos.databinding.ActivityCheckoutBinding
import com.echocatering.pos.terminal.PaymentItem
import com.echocatering.pos.terminal.PaymentState
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class CheckoutActivity : AppCompatActivity() {
    
    companion object {
        const val EXTRA_SUBTOTAL_CENTS = "subtotal_cents"
        const val EXTRA_ITEMS_JSON = "items_json"
    }
    
    private lateinit var binding: ActivityCheckoutBinding
    private val terminalManager by lazy { EchoPosApplication.instance.terminalManager }
    
    private var subtotalCents: Int = 0
    private var tipCents: Int = 0
    private var cartItems: List<CartItem> = emptyList()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCheckoutBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Get data from intent
        subtotalCents = intent.getIntExtra(EXTRA_SUBTOTAL_CENTS, 0)
        val itemsJson = intent.getStringExtra(EXTRA_ITEMS_JSON) ?: "[]"
        cartItems = parseCartItems(itemsJson)
        
        setupUI()
        setupObservers()
    }
    
    private fun parseCartItems(json: String): List<CartItem> {
        return try {
            val type = object : TypeToken<List<CartItem>>() {}.type
            Gson().fromJson(json, type)
        } catch (e: Exception) {
            emptyList()
        }
    }
    
    private fun setupUI() {
        updateTotals()
        
        // Tip buttons
        binding.tipNone.setOnClickListener { selectTip(0) }
        binding.tip15.setOnClickListener { selectTip((subtotalCents * 0.15).toInt()) }
        binding.tip20.setOnClickListener { selectTip((subtotalCents * 0.20).toInt()) }
        binding.tip25.setOnClickListener { selectTip((subtotalCents * 0.25).toInt()) }
        
        binding.tipCustom.setOnClickListener {
            binding.customTipLayout.visibility = View.VISIBLE
        }
        
        binding.applyCustomTip.setOnClickListener {
            val customAmount = binding.customTipInput.text.toString().toDoubleOrNull() ?: 0.0
            selectTip((customAmount * 100).toInt())
            binding.customTipLayout.visibility = View.GONE
        }
        
        // Process payment button
        binding.processPaymentButton.setOnClickListener {
            processPayment()
        }
        
        // Cancel button
        binding.cancelButton.setOnClickListener {
            terminalManager.cancelPayment()
            finish()
        }
        
        // Done button (shown after success)
        binding.doneButton.setOnClickListener {
            terminalManager.resetPaymentState()
            setResult(RESULT_OK)
            finish()
        }
        
        // Retry button (shown after failure)
        binding.retryButton.setOnClickListener {
            terminalManager.resetPaymentState()
            showTipSelection()
        }
    }
    
    private fun setupObservers() {
        lifecycleScope.launch {
            terminalManager.paymentState.collectLatest { state ->
                updatePaymentUI(state)
            }
        }
    }
    
    private fun updatePaymentUI(state: PaymentState) {
        when (state) {
            is PaymentState.Idle -> {
                showTipSelection()
            }
            is PaymentState.CreatingIntent,
            is PaymentState.RetrievingIntent -> {
                showProcessing("Creating payment...")
            }
            is PaymentState.CollectingPayment -> {
                showProcessing("Tap, insert, or swipe card")
                binding.cancelButton.visibility = View.VISIBLE
            }
            is PaymentState.ConfirmingPayment -> {
                showProcessing("Processing payment...")
                binding.cancelButton.visibility = View.GONE
            }
            is PaymentState.Succeeded -> {
                showSuccess(state.receiptUrl)
            }
            is PaymentState.Failed -> {
                showError(state.message)
            }
            is PaymentState.Canceled -> {
                finish()
            }
        }
    }
    
    private fun showTipSelection() {
        binding.tipSelectionLayout.visibility = View.VISIBLE
        binding.processingLayout.visibility = View.GONE
        binding.successLayout.visibility = View.GONE
        binding.errorLayout.visibility = View.GONE
        binding.processPaymentButton.visibility = View.VISIBLE
        binding.cancelButton.visibility = View.VISIBLE
    }
    
    private fun showProcessing(message: String) {
        binding.tipSelectionLayout.visibility = View.GONE
        binding.processingLayout.visibility = View.VISIBLE
        binding.successLayout.visibility = View.GONE
        binding.errorLayout.visibility = View.GONE
        binding.processPaymentButton.visibility = View.GONE
        binding.processingMessage.text = message
    }
    
    private fun showSuccess(receiptUrl: String?) {
        binding.tipSelectionLayout.visibility = View.GONE
        binding.processingLayout.visibility = View.GONE
        binding.successLayout.visibility = View.VISIBLE
        binding.errorLayout.visibility = View.GONE
        binding.processPaymentButton.visibility = View.GONE
        binding.cancelButton.visibility = View.GONE
        
        val totalDollars = (subtotalCents + tipCents) / 100.0
        binding.successAmount.text = String.format("$%.2f", totalDollars)
    }
    
    private fun showError(message: String) {
        binding.tipSelectionLayout.visibility = View.GONE
        binding.processingLayout.visibility = View.GONE
        binding.successLayout.visibility = View.GONE
        binding.errorLayout.visibility = View.VISIBLE
        binding.processPaymentButton.visibility = View.GONE
        binding.cancelButton.visibility = View.VISIBLE
        binding.errorMessage.text = message
    }
    
    private fun selectTip(cents: Int) {
        tipCents = cents
        updateTotals()
        
        // Update button states
        binding.tipNone.isSelected = cents == 0
        binding.tip15.isSelected = cents == (subtotalCents * 0.15).toInt()
        binding.tip20.isSelected = cents == (subtotalCents * 0.20).toInt()
        binding.tip25.isSelected = cents == (subtotalCents * 0.25).toInt()
    }
    
    private fun updateTotals() {
        val subtotalDollars = subtotalCents / 100.0
        val tipDollars = tipCents / 100.0
        val totalDollars = subtotalDollars + tipDollars
        
        binding.subtotalAmount.text = String.format("$%.2f", subtotalDollars)
        binding.tipAmount.text = String.format("$%.2f", tipDollars)
        binding.totalAmount.text = String.format("$%.2f", totalDollars)
        
        binding.processPaymentButton.text = String.format("Pay $%.2f", totalDollars)
    }
    
    private fun processPayment() {
        val totalCents = subtotalCents + tipCents
        
        val paymentItems = cartItems.map { item ->
            PaymentItem(
                name = item.name,
                category = item.category,
                quantity = 1,
                price = item.price,
                modifier = item.modifier
            )
        }
        
        terminalManager.processPayment(
            amountCents = totalCents,
            tabId = null,
            tabName = null,
            eventId = null,
            eventName = null,
            items = paymentItems,
            tipCents = tipCents
        )
    }
    
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val state = terminalManager.paymentState.value
        if (state is PaymentState.CollectingPayment || 
            state is PaymentState.ConfirmingPayment) {
            Toast.makeText(this, "Payment in progress", Toast.LENGTH_SHORT).show()
        } else {
            terminalManager.resetPaymentState()
            super.onBackPressed()
        }
    }
}
