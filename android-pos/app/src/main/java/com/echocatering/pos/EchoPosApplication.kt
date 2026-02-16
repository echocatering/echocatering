package com.echocatering.pos

import android.app.Application
import com.echocatering.pos.terminal.TerminalManager

class EchoPosApplication : Application() {
    
    lateinit var terminalManager: TerminalManager
        private set
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        terminalManager = TerminalManager(this)
    }
    
    companion object {
        lateinit var instance: EchoPosApplication
            private set
    }
}
