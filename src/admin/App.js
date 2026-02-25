import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import MenuManager from './components/MenuManager';
import LogoManager from './components/LogoManager';
import GalleryManager from './components/GalleryManager';
import ContentManager from './components/ContentManager';
import InventoryManager from './components/InventoryManager';
import FullMenu from './components/FullMenu';

import SalesManager from './components/SalesManager';
import EventsManager from './components/EventsManager';
import EventSales from './components/EventSales';
import OrdersStackedBarChart from '../components/OrdersStackedBarChart';
import CalendarManager from './components/CalendarManager';
import POSManager from './components/POSManager';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ItemUIPreview from './components/ItemUIPreview';
import POSUIPreview from './components/POSUIPreview';
import POSSalesUI from './components/POSSalesUI';
import PosPage from './components/pos/PosPage';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/admin/login" />;
};

// Main Admin App Component
const AdminApp = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="admin-app">
      <Sidebar />
      <div className="admin-main">
        {/* <Header /> */}
        <main className="admin-content">
          <Routes>
            <Route path="/" element={<Navigate to="/admin/menu" replace />} />
            <Route path="/logo" element={<LogoManager />} />
            <Route path="/menu" element={<MenuManager />} />
            <Route path="/gallery" element={<GalleryManager />} />
            <Route path="/content" element={<ContentManager />} />
            <Route path="/pos/ui" element={<POSUIPreview />} />
            <Route path="/pos/ui-preview" element={<POSUIPreview />} />
            <Route path="/inventory/recipes/:recipeType?" element={<FullMenu />} />
            <Route path="/inventory/:sheetKey?" element={<InventoryManager />} />
            <Route path="/sales" element={<SalesManager />} />
            <Route path="/orders-chart" element={<OrdersStackedBarChart />} />
            <Route path="/calendar" element={<CalendarManager />} />
            <Route path="/menu-ui/item" element={<ItemUIPreview />} />
            <Route path="/sales/pos-ui" element={<POSSalesUI layoutMode="vertical" />} />
            <Route path="/sales/events" element={<EventSales />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

// Root App Component with Auth Provider
const App = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* 
          Standalone POS page - renders outside AdminApp (no sidebar/header)
          Full viewport, vertical-only layout, touch-friendly
          Route: /admin/pos
        */}
        <Route path="/pos" element={
          <ProtectedRoute>
            <PosPage />
          </ProtectedRoute>
        } />
        <Route path="/*" element={
          <ProtectedRoute>
            <AdminApp />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  );
};

export default App;
