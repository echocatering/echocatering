import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

// Check if running locally (development mode)
// In development, React sets NODE_ENV to 'development' when running 'npm start'
const isLocalDev = process.env.NODE_ENV !== 'production';

// Authentication is enabled by default, but bypassed for local development
const DISABLE_AUTH = isLocalDev;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('admin_token'));
  const [loading, setLoading] = useState(true);

  const getDefaultApiBase = () => {
    if (typeof window !== 'undefined') {
      return '/api';
    }
    return '/api';
  };

  const API_BASE_URL = process.env.REACT_APP_API_URL || getDefaultApiBase();

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Bypass authentication for local development
      if (DISABLE_AUTH) {
        console.log('🔓 Authentication bypassed for local development');
        setUser({
          id: 'bypass-user',
          email: 'bypass@example.com',
          role: 'admin'
        });
        setToken('bypass-token');
        setLoading(false);
        return;
      }

      if (token) {
        try {
          const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
          } else {
            // Token is invalid, clear it
            localStorage.removeItem('admin_token');
            setToken(null);
            setUser(null);
          }
        } catch (error) {
          console.error('Auth check error:', error);
          localStorage.removeItem('admin_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [token, API_BASE_URL]);

  // Login function (accepts username or email)
  const login = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      // Clone response to read it as text if JSON parsing fails
      const responseClone = response.clone();
      let data;
      
      try {
        data = await response.json();
      } catch (parseError) {
        // If response is not JSON, get text from clone
        const text = await responseClone.text();
        return { 
          success: false, 
          message: response.status === 429 
            ? 'Too many login attempts. Please wait a moment and try again.' 
            : `Server error: ${text || response.statusText}` 
        };
      }

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('admin_token', data.token);
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.status === 429 
            ? 'Too many login attempts. Please wait a moment and try again.' 
            : (data.message || 'Login failed')
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        return { success: false, message: 'Cannot connect to server. Please check if the backend is running.' };
      }
      return { success: false, message: `Network error: ${error.message}` };
    }
  };

  // Logout function
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('admin_token');
  };

  // API call helper with authentication
  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Don't set Content-Type for FormData (let browser set it with boundary)
    const headers = {};
    
    // Prepare body - stringify JSON objects, keep FormData as-is
    let body = options.body;
    if (!(body instanceof FormData)) {
      // Stringify JSON objects/arrays
      if (typeof body === 'object' && body !== null) {
        body = JSON.stringify(body);
      }
      headers['Content-Type'] = 'application/json';
    }
    
    // Merge with any custom headers
    Object.assign(headers, options.headers);

    // TEMPORARY: Always include token when auth is disabled
    if (DISABLE_AUTH) {
      headers['Authorization'] = `Bearer bypass-token`;
      console.log('⚠️  AUTH BYPASS: Using bypass token for API call');
    } else if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log('🔐 Adding Authorization header with token:', token.substring(0, 20) + '...');
    } else {
      console.log('❌ No token available for API call');
    }
    
    console.log('🌐 Making API call to:', url);
    console.log('📋 Headers being sent:', headers);
    console.log('📦 Request body:', body);

    try {
      console.log('🚀 Sending fetch request...');
      const response = await fetch(url, {
        ...options,
        body,
        headers
      });

      console.log('📡 Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (response.status === 401) {
        // Token expired, logout user
        console.log('❌ 401 Unauthorized - token expired');
        // Only logout and throw error if auth is not disabled
        if (!DISABLE_AUTH) {
          logout();
          throw new Error('Authentication expired');
        } else {
          // When auth is bypassed, log but don't throw - let the response continue
          console.log('⚠️  401 received but auth is bypassed - continuing anyway');
        }
      }

      // Clone response to read it as text if JSON parsing fails
      const responseClone = response.clone();
      let data;
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          // Not JSON, try to get text
          const text = await responseClone.text();
          console.log('⚠️  Response is not JSON:', text);
          if (!response.ok) {
            throw new Error(text || `HTTP ${response.status}: ${response.statusText}`);
          }
          return text;
        }
      } catch (parseError) {
        // If JSON parsing fails, try to get text
        try {
          const text = await responseClone.text();
          console.error('❌ Failed to parse JSON response:', text);
          if (!response.ok) {
            throw new Error(text || `HTTP ${response.status}: ${response.statusText}`);
          }
          return text;
        } catch (textError) {
          console.error('❌ Failed to read response:', textError);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      console.log('📄 Response data:', data);

      if (!response.ok) {
        // If auth is bypassed and we got 401, don't treat it as an error
        if (DISABLE_AUTH && response.status === 401) {
          console.log('⚠️  401 received but auth is bypassed - treating as success');
          return data || { success: true };
        }
        
        console.log('❌ Response not OK, throwing error');
        console.log('❌ Full error response:', data);
        
        // If there are validation errors, show them
        if (data && data.errors && Array.isArray(data.errors)) {
          console.log('❌ Validation errors:');
          data.errors.forEach((error, index) => {
            const field = error.field || error.path;
            const msg = error.message || error.msg;
            console.log(`  ${index + 1}. Field: ${field}, Message: ${msg}`);
          });
          // Create an error that preserves validation details
          const validationError = new Error(data?.message || 'Validation failed');
          validationError.validationErrors = data.errors;
          throw validationError;
        }
        
        throw new Error(data?.message || data?.error || 'API call failed');
      }

      console.log('✅ API call successful');
      return data;
    } catch (error) {
      console.error('💥 API call error:', error);
      throw error;
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: DISABLE_AUTH ? true : (!!token && !!user),
    loading,
    login,
    logout,
    apiCall
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
