import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { apiCall } = useAuth();
  const [stats, setStats] = useState({
    cocktails: { total: 0, active: 0 },
    gallery: { total: 0, active: 0 },
    content: { total: 0, active: 0 }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [cocktails, gallery, content] = await Promise.all([
          apiCall('/menu-items/categories'),
          apiCall('/gallery/categories'),
          apiCall('/content/pages')
        ]);

        setStats({
          cocktails: {
            total: cocktails.reduce((sum, cat) => sum + cat.count, 0),
            active: cocktails.reduce((sum, cat) => sum + cat.activeCount, 0)
          },
          gallery: {
            total: gallery.reduce((sum, cat) => sum + cat.count, 0),
            active: gallery.reduce((sum, cat) => sum + cat.activeCount, 0)
          },
          content: {
            total: content.reduce((sum, page) => sum + page.count, 0),
            active: content.reduce((sum, page) => sum + page.activeCount, 0)
          }
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [apiCall]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome to the Echo Catering Admin Panel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-700">Cocktails</h3>
                <p className="text-3xl font-bold text-blue-600">{stats.cocktails.total}</p>
                <p className="text-sm text-gray-500">
                  {stats.cocktails.active} active
                </p>
              </div>
              <div className="text-4xl">🍸</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-700">Gallery Images</h3>
                <p className="text-3xl font-bold text-green-600">{stats.gallery.total}</p>
                <p className="text-sm text-gray-500">
                  {stats.gallery.active} active
                </p>
              </div>
              <div className="text-4xl">🖼️</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-700">Content Items</h3>
                <p className="text-3xl font-bold text-purple-600">{stats.content.total}</p>
                <p className="text-sm text-gray-500">
                  {stats.content.active} active
                </p>
              </div>
              <div className="text-4xl">📝</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Quick Actions</h3>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              <button className="btn btn-primary w-full">
                🍸 Add New Cocktail
              </button>
              <button className="btn btn-outline w-full">
                🖼️ Upload Gallery Images
              </button>
              <button className="btn btn-outline w-full">
                📝 Edit Content
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Activity</h3>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-2xl">🍸</span>
                <div>
                  <p className="font-medium">New cocktail added</p>
                  <p className="text-sm text-gray-500">Amber Theory</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-2xl">🖼️</span>
                <div>
                  <p className="font-medium">Gallery updated</p>
                  <p className="text-sm text-gray-500">5 new images uploaded</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;


