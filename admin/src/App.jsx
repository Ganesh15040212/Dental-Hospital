import React, { useState, useEffect, useCallback } from 'react';
import { 
  HeartPulse, 
  Calendar, 
  Settings, 
  RefreshCw, 
  Search, 
  Clock, 
  Phone, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  Mail,
  LogOut
} from 'lucide-react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';

export default function App() {
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' or 'settings'
  
  // Bookings list state
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Settings form state
  const [agentId, setAgentId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null); // { type: 'success'|'error', text: '' }

  // Authentication state
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('adminLoggedIn') === 'true');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginEmail.trim().toLowerCase() === 'admin@pearldental.com' && loginPassword === 'pearlAdmin2026!') {
      setIsLoggedIn(true);
      localStorage.setItem('adminLoggedIn', 'true');
      setLoginError('');
      setLoginPassword('');
    } else {
      setLoginError('Invalid email or password. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('adminLoggedIn');
  };

  // 1. Fetch Bookings from API
  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true);
    try {
      const res = await fetch('/api/bookings');
      const data = await res.json();
      if (data.status === 'success') {
        setBookings(data.bookings);
      }
    } catch (err) {
      console.error('Error fetching calendar bookings:', err);
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  // 2. Fetch Settings from API
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.status === 'success' && data.settings) {
        setAgentId(data.settings.agentId || '');
        setApiKey(data.settings.apiKey || '');
      }
    } catch (err) {
      console.error('Error fetching admin settings:', err);
    }
  };

  // Poll bookings every 5 seconds
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchBookings();
    const interval = setInterval(fetchBookings, 5000);
    return () => clearInterval(interval);
  }, [fetchBookings, isLoggedIn]);

  // Load settings once on mount
  useEffect(() => {
    if (isLoggedIn) {
      fetchSettings();
    }
  }, [isLoggedIn]);

  // Save Settings to Backend
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setAlertMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, apiKey })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAlertMsg({ type: 'success', text: 'ElevenLabs Configuration saved successfully!' });
      } else {
        setAlertMsg({ type: 'error', text: data.message || 'Failed to save settings.' });
      }
    } catch (err) {
      setAlertMsg({ type: 'error', text: 'Network connection failure, failed to save.' });
    } finally {
      setSavingSettings(false);
    }
  };

  // Description parser for metadata extraction
  const parseDescription = (desc) => {
    if (!desc) return { phone: 'N/A', reason: 'N/A' };
    let phone = '';
    let reason = '';
    
    if (desc.includes('|')) {
      const parts = desc.split('|');
      parts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed.toLowerCase().startsWith('phone:')) {
          phone = trimmed.substring(6).trim();
        } else if (trimmed.toLowerCase().startsWith('reason:')) {
          reason = trimmed.substring(7).trim();
        }
      });
    } else {
      const lines = desc.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex !== -1) {
          const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
          const val = trimmed.substring(colonIndex + 1).trim();
          if (key === 'phone') {
            phone = val;
          } else if (key === 'reason' || key === 'reason for visit') {
            reason = val;
          }
        }
      });
    }
    
    return {
      phone: phone || 'N/A',
      reason: reason || 'N/A'
    };
  };

  const getDayBadge = (dateObj) => {
    if (isToday(dateObj)) {
      return <span className="badge-pill" style={{ backgroundColor: 'rgba(79, 70, 229, 0.12)', color: 'var(--accent-violet)', border: '1px solid rgba(79, 70, 229, 0.2)' }}>Today</span>;
    }
    if (isTomorrow(dateObj)) {
      return <span className="badge-pill" style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.2)' }}>Tomorrow</span>;
    }
    return null;
  };

  // Filter Bookings list
  const filteredBookings = bookings.filter(booking => {
    const summaryText = booking.summary || '';
    const name = summaryText.replace('Appointment:', '').replace('Dental appointment:', '').trim().toLowerCase();
    const { phone, reason } = parseDescription(booking.description);
    return (
      name.includes(searchTerm.toLowerCase()) ||
      phone.includes(searchTerm) ||
      reason.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (!isLoggedIn) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <HeartPulse size={28} />
            </div>
            <h1 className="login-title">Pearl Dental Admin</h1>
            <p className="login-subtitle">Sign in to manage appointments & AI settings</p>
          </div>

          {loginError && (
            <div className="system-alert error animate-fade-in">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label>Email Address</label>
              <div className="login-input-wrapper">
                <span className="login-input-icon">
                  <Mail size={16} />
                </span>
                <input 
                  type="email" 
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@pearldental.com"
                  className="login-input"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="login-input-wrapper">
                <span className="login-input-icon">
                  <Lock size={16} />
                </span>
                <input 
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="login-input"
                  style={{ paddingRight: '2.75rem' }}
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn" style={{ width: '100%', padding: '0.85rem 0', borderRadius: '12px', marginTop: '0.5rem' }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* Navbar Header */}
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-logo">
            <HeartPulse size={20} />
          </div>
          <span className="admin-title">Pearl Dental Hospital</span>
          <span className="admin-tag">Admin portal</span>
        </div>

        <nav className="admin-nav">
          <button 
            onClick={() => setActiveTab('appointments')}
            className={`admin-nav-btn ${activeTab === 'appointments' ? 'active' : ''}`}
          >
            <Calendar size={15} />
            <span>Appointments</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('settings')}
            className={`admin-nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
          >
            <Settings size={15} />
            <span>AI Configuration</span>
          </button>

          <button 
            onClick={handleLogout}
            className="admin-nav-btn"
            style={{ color: 'var(--accent-red)', marginLeft: '0.5rem' }}
            title="Logout from admin session"
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </nav>
      </header>

      {/* Main Content Dashboard */}
      <main className="admin-main">
        {activeTab === 'appointments' ? (
          /* APPOINTMENTS TAB SCREEN */
          <div className="panel animate-fade-in">
            <div className="panel-header">
              <div>
                <h2>Upcoming Patient Schedule</h2>
                <p>Real-time view of dental appointments synced from Google Calendar / Database.</p>
              </div>
              <button 
                onClick={fetchBookings} 
                className={`icon-btn ${loadingBookings ? 'active' : ''}`}
                disabled={loadingBookings}
                title="Refresh Schedule"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {/* Filter Input */}
            <div className="search-container">
              <span className="search-icon-wrapper">
                <Search size={15} />
              </span>
              <input 
                type="text" 
                placeholder="Search by patient name, phone number, or visit reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            {/* Bookings cards renderer */}
            <div className="bookings-list">
              {loadingBookings && bookings.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="active" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
                  <p>Loading schedule feed...</p>
                </div>
              ) : filteredBookings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 0', border: '2px dashed var(--panel-border)', borderRadius: '18px', background: 'var(--bg-primary)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>No upcoming dental appointments found.</p>
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')} 
                      className="btn"
                      style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)', fontSize: '0.8rem', padding: '0.4rem 1rem', marginTop: '0.75rem' }}
                    >
                      Clear search filter
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {filteredBookings.map((booking) => {
                    const startDateObj = parseISO(booking.start);
                    const { phone, reason } = parseDescription(booking.description);
                    const summaryText = booking.summary || '';
                    const name = summaryText
                      .replace(/^Appointment:\s*/i, '')
                      .replace(/^Dental appointment:\s*/i, '')
                      .trim();
                    const isSimulated = booking.id.startsWith('sim_');

                    return (
                      <div key={booking.id} className="booking-card">
                        {isSimulated && (
                          <span style={{ position: 'absolute', top: 0, right: 0, padding: '0.2rem 0.65rem', backgroundColor: 'rgba(217, 119, 6, 0.08)', color: '#d97706', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', borderBottomLeftRadius: '10px', borderLeft: '1px solid rgba(217, 119, 6, 0.15)', borderBottom: '1px solid rgba(217, 119, 6, 0.15)', letterSpacing: '0.04em' }}>
                            Simulated
                          </span>
                        )}
                        <div className="booking-card-inner">
                          <div>
                            <span className="booking-name">{name}</span>
                            <div className="booking-card-date-row">
                              {getDayBadge(startDateObj)}
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Calendar size={12} />
                                {format(startDateObj, 'EEEE, MMM d, yyyy')}
                              </span>
                            </div>
                          </div>

                          <span className="booking-time">
                            <Clock size={12} />
                            {format(startDateObj, 'h:mm a')}
                          </span>
                        </div>

                        <div className="booking-card-footer">
                          <div className="booking-card-footer-item">
                            <Phone size={12} style={{ color: 'var(--accent-violet)' }} />
                            <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{phone}</span>
                          </div>
                          <div className="booking-card-footer-item" style={{ alignItems: 'flex-start' }}>
                            <FileText size={12} style={{ color: 'var(--accent-violet)', marginTop: '2px' }} />
                            <span style={{ fontStyle: 'italic', wordBreak: 'break-word' }}>{reason}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* CONFIGURATION SETTINGS TAB SCREEN */
          <div className="panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="panel-header" style={{ marginBottom: '1.25rem' }}>
              <div>
                <h2>ElevenLabs AI Configuration</h2>
                <p>Set up the active Agent ID and API credentials for Clara, the virtual receptionist.</p>
              </div>
            </div>

            {alertMsg && (
              <div className={`system-alert ${alertMsg.type}`}>
                {alertMsg.type === 'success' ? <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />}
                <span>{alertMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="form-group">
                <label>ElevenLabs Agent ID</label>
                <input 
                  type="text" 
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="e.g. 2e5d7f3k..."
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>The unique ID of the voice agent created in your ElevenLabs dashboard.</span>
              </div>

              <div className="form-group">
                <label>ElevenLabs API Key</label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input 
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter ElevenLabs API Key"
                    style={{ paddingRight: '2.75rem' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowApiKey(!showApiKey)}
                    style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Required for generating signed URLs for secure client widget authentications.</span>
              </div>

              <button 
                type="submit" 
                className="btn" 
                disabled={savingSettings}
                style={{ width: '100%', padding: '0.85rem 0', borderRadius: '12px', marginTop: '0.5rem' }}
              >
                {savingSettings ? (
                  <>
                    <RefreshCw size={15} className="active" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Saving configurations...</span>
                  </>
                ) : (
                  <>
                    <Lock size={15} />
                    <span>Save Configuration</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
