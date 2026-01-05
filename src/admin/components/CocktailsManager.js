import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const CocktailsManager = () => {
  const { apiCall } = useAuth();
  const [cocktails, setCocktails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const fetchCocktails = useCallback(async () => {
    try {
      const url = selectedCategory === 'all' 
        ? '/menu-items' 
        : `/menu-items?category=${selectedCategory}`;
      const data = await apiCall(url);
      setCocktails(data);
    } catch (error) {
      console.error('Error fetching cocktails:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, apiCall]);

  useEffect(() => {
    fetchCocktails();
  }, [selectedCategory, fetchCocktails]);

  const handleToggleActive = async (id) => {
    try {
      await apiCall(`/menu-items/${id}/toggle`, { method: 'PUT' });
      fetchCocktails();
    } catch (error) {
      console.error('Error toggling cocktail:', error);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="cocktails-manager">
      <div className="flex justify-between items-center mb-6">
        <h1>Menu Manager</h1>
        <button className="btn btn-primary">
          🍸 Add New Cocktail
        </button>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <div className="flex gap-4">
            <select 
              className="form-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="originals">Originals</option>
              <option value="classics">Classics</option>
              <option value="spirits">Spirits</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Cocktails ({cocktails.length})</h3>
        </div>
        <div className="card-body">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Video File</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cocktails.map((cocktail) => (
                  <tr key={cocktail._id}>
                    <td>
                      <div>
                        <div className="font-medium">{cocktail.name}</div>
                        <div className="text-sm text-gray-500">
                          {cocktail.concept.substring(0, 50)}...
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {cocktail.category}
                      </span>
                    </td>
                    <td className="text-sm">{cocktail.videoFile}</td>
                    <td>
                      <span className={`badge ${cocktail.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {cocktail.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{cocktail.order}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-outline">
                          ✏️ Edit
                        </button>
                        <button 
                          className={`btn btn-sm ${cocktail.isActive ? 'btn-warning' : 'btn-success'}`}
                          onClick={() => handleToggleActive(cocktail._id)}
                        >
                          {cocktail.isActive ? '🔄 Deactivate' : '✅ Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CocktailsManager;


