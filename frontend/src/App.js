import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, signOut, fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import awsConfig from './aws-config';
import AuthContainer from './components/auth/AuthContainer';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import DocumentDetail from './pages/DocumentDetail';
import LandingPage from './pages/LandingPage';

Amplify.configure(awsConfig);

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const fetchUsage = async () => {
    try {
      setUsageLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) return;
      const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;
      const response = await fetch(`${apiEndpoint}/users/me/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      try {
        const attributes = await fetchUserAttributes();
        setUser({ ...currentUser, attributes });
      } catch {
        setUser(currentUser);
      }
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkUser().then(() => fetchUsage());

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        checkUser().then(() => fetchUsage());
      } else if (payload.event === 'signedOut') {
        setUser(null);
        setUsage(null);
      }
    });

    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    await signOut();
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-blade-bg flex items-center justify-center">
        <div className="blade-loader" />
      </div>
    );
  }

  if (!user) {
    return (
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage isDark={isDark} onThemeToggle={toggleTheme} />} />
          <Route path="/login" element={<AuthContainer onAuthenticated={checkUser} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <div className="app">
        <Header user={user} signOut={handleSignOut} isDark={isDark} onThemeToggle={toggleTheme} usage={usage} usageLoading={usageLoading} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/documents" element={<Documents user={user} />} />
            <Route path="/documents/:id" element={<DocumentDetail user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
