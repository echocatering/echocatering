import React from 'react';

const SalesManager = () => {
  return (
    <div className="sales-manager">
      <div className="flex justify-between items-center mb-6">
        <h1>Sales Management</h1>
        <button className="btn btn-primary">
          📊 View Reports
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Sales Dashboard</h3>
        </div>
        <div className="card-body">
          <p className="text-gray-500">
            Sales management functionality will be implemented here.
            This will include sales reports, analytics, and customer management.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SalesManager;
