/**
 * usePosLocalStorage.js
 * 
 * Custom hook for managing POS state in localStorage.
 * 
 * This hook provides:
 * - Automatic persistence of tabs, items, modifiers to localStorage
 * - Restoration of state on page reload
 * - Event state management (active event ID, event name)
 * - Offline capability during active events
 * 
 * localStorage keys:
 * - pos_event_id: Current active event ID (from DB)
 * - pos_event_name: Current event name
 * - pos_event_started: Event start timestamp
 * - pos_tabs: Array of tabs with items
 * - pos_next_tab_number: Counter for S# naming
 * - pos_active_tab_id: Currently selected tab ID
 */

import { useState, useEffect, useCallback } from 'react';

// localStorage keys
const STORAGE_KEYS = {
  EVENT_ID: 'pos_event_id',
  EVENT_NAME: 'pos_event_name',
  EVENT_STARTED: 'pos_event_started',
  TABS: 'pos_tabs',
  NEXT_TAB_NUMBER: 'pos_next_tab_number',
  ACTIVE_TAB_ID: 'pos_active_tab_id',
  EVENT_SETUP_DATA: 'pos_event_setup_data',
  UI_STATE: 'pos_ui_state',
};

// Default UI state
const DEFAULT_UI_STATE = {
  showEventSetup: false,
  showSummaryView: false,
  isPostEventEdit: false,
};

// Default event setup data structure
const DEFAULT_EVENT_SETUP_DATA = {
  eventName: '',
  eventDate: new Date().toISOString().split('T')[0],
  startTime: '',
  endTime: '',
  accommodationCost: '',
  transportationCosts: '',
  permitCost: '',
  liabilityInsuranceCost: '',
  labor: [],
  glasswareSent: { rox: '', tmbl: '' },
  glasswareReturned: { rox: '', tmbl: '' },
  iceSent: '',
  iceReturned: '',
  inventory: {
    cocktails: [],
    mocktails: [],
    beer: [],
    wine: [],
  },
};

/**
 * Safe JSON parse with fallback
 */
const safeJsonParse = (str, fallback) => {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Custom hook for POS localStorage management
 */
export function usePosLocalStorage() {
  // Event state
  const [eventId, setEventId] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.EVENT_ID) || null
  );
  const [eventName, setEventName] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.EVENT_NAME) || ''
  );
  const [eventStarted, setEventStarted] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.EVENT_STARTED) || null
  );

  // Tab state
  const [tabs, setTabs] = useState(() => 
    safeJsonParse(localStorage.getItem(STORAGE_KEYS.TABS), [])
  );
  const [nextTabNumber, setNextTabNumber] = useState(() => 
    parseInt(localStorage.getItem(STORAGE_KEYS.NEXT_TAB_NUMBER) || '1', 10)
  );
  const [activeTabId, setActiveTabId] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB_ID) || null
  );

  // Event setup data state
  const [eventSetupData, setEventSetupData] = useState(() => 
    safeJsonParse(localStorage.getItem(STORAGE_KEYS.EVENT_SETUP_DATA), DEFAULT_EVENT_SETUP_DATA)
  );

  // UI state (for preserving view state across refreshes)
  const [uiState, setUiState] = useState(() => 
    safeJsonParse(localStorage.getItem(STORAGE_KEYS.UI_STATE), DEFAULT_UI_STATE)
  );

  // Persist event state to localStorage
  useEffect(() => {
    if (eventId) {
      localStorage.setItem(STORAGE_KEYS.EVENT_ID, eventId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.EVENT_ID);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventName) {
      localStorage.setItem(STORAGE_KEYS.EVENT_NAME, eventName);
    } else {
      localStorage.removeItem(STORAGE_KEYS.EVENT_NAME);
    }
  }, [eventName]);

  useEffect(() => {
    if (eventStarted) {
      localStorage.setItem(STORAGE_KEYS.EVENT_STARTED, eventStarted);
    } else {
      localStorage.removeItem(STORAGE_KEYS.EVENT_STARTED);
    }
  }, [eventStarted]);

  // Persist tabs to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
  }, [tabs]);

  // Persist nextTabNumber to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NEXT_TAB_NUMBER, String(nextTabNumber));
  }, [nextTabNumber]);

  // Persist activeTabId to localStorage
  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB_ID, activeTabId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB_ID);
    }
  }, [activeTabId]);

  // Persist eventSetupData to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EVENT_SETUP_DATA, JSON.stringify(eventSetupData));
  }, [eventSetupData]);

  // Persist uiState to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify(uiState));
  }, [uiState]);

  /**
   * Start a new event
   */
  const startEvent = useCallback((id, name) => {
    const now = new Date().toISOString();
    setEventId(id);
    setEventName(name);
    setEventStarted(now);
    setTabs([]);
    setNextTabNumber(1);
    setActiveTabId(null);
    console.log(`[POS Storage] Started event: ${name} (${id})`);
  }, []);

  /**
   * Clear all event data (after sync to DB)
   */
  const clearEvent = useCallback(() => {
    setEventId(null);
    setEventName('');
    setEventStarted(null);
    setTabs([]);
    setNextTabNumber(1);
    setActiveTabId(null);
    setEventSetupData(DEFAULT_EVENT_SETUP_DATA);
    setUiState(DEFAULT_UI_STATE);
    
    // Clear all localStorage keys
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log('[POS Storage] Cleared event data');
  }, []);

  /**
   * Check if there's an active event
   */
  const hasActiveEvent = useCallback(() => {
    return !!eventId;
  }, [eventId]);

  /**
   * Get current event state for sync
   */
  const getEventState = useCallback(() => {
    return {
      eventId,
      eventName,
      eventStarted,
      tabs,
      nextTabNumber,
      activeTabId,
    };
  }, [eventId, eventName, eventStarted, tabs, nextTabNumber, activeTabId]);

  return {
    // Event state
    eventId,
    eventName,
    eventStarted,
    setEventId,
    setEventName,
    
    // Tab state
    tabs,
    setTabs,
    nextTabNumber,
    setNextTabNumber,
    activeTabId,
    setActiveTabId,
    
    // Event setup data
    eventSetupData,
    setEventSetupData,
    
    // UI state
    uiState,
    setUiState,
    
    // Actions
    startEvent,
    clearEvent,
    hasActiveEvent,
    getEventState,
  };
}

export default usePosLocalStorage;
