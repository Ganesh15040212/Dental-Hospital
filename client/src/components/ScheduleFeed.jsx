import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { Calendar, Clock, Phone, FileText, RefreshCw, Search } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function ScheduleFeed({ refreshTrigger }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings`);
      const data = await res.json();
      if (data.status === 'success') {
        setBookings(data.bookings);
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    
    // Poll for new bookings every 5 seconds (especially useful when booking via voice call)
    const interval = setInterval(fetchBookings, 5000);
    return () => clearInterval(interval);
  }, [fetchBookings, refreshTrigger]);

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

  return (
    <div className="panel schedule-panel">
      <div className="schedule-header">
        <div>
          <h2>Upcoming Schedule</h2>
          <p>Real-time view of booked slots.</p>
        </div>
        <button
          onClick={fetchBookings}
          className={`settings-icon-btn ${loading ? 'active' : ''}`}
          style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          disabled={loading}
          title="Refresh Schedule"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search Filter */}
      <div className="search-container">
        <span className="search-icon-wrapper">
          <Search size={14} />
        </span>
        <input
          type="text"
          placeholder="Filter by name, phone, or reason..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Bookings List */}
      <div className="bookings-list">
        {loading && bookings.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '0.875rem' }}>Loading schedule data...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', border: '1px dashed rgba(255, 255, 255, 0.05)', borderRadius: '16px', backgroundColor: 'rgba(0, 0, 0, 0.15)' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No matching appointments found.</p>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="btn"
                style={{ background: 'transparent', color: 'var(--accent-violet)', fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.5rem', marginTop: '0.5rem', textDecoration: 'underline', width: 'auto' }}
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredBookings.map((booking) => {
              const startDateObj = parseISO(booking.start);
              const endDateObj = parseISO(booking.end);
              const { phone, reason } = parseDescription(booking.description);
              const summaryText = booking.summary || '';
              const name = summaryText
                .replace(/^Appointment:\s*/, '')
                .replace(/^Dental appointment:\s*/, '')
                .trim();

              const isSimulated = booking.id.startsWith('sim_');

              return (
                <div key={booking.id} className="booking-card animate-fade-in" style={{ position: 'relative', overflow: 'hidden' }}>
                  {isSimulated && (
                    <span style={{ position: 'absolute', top: 0, right: 0, padding: '0.15rem 0.5rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, borderBottomLeftRadius: '8px', borderLeft: '1px solid rgba(245, 158, 11, 0.15)', borderBottom: '1px solid rgba(245, 158, 11, 0.15)' }}>
                      Simulated
                    </span>
                  )}
                  <div className="booking-card-inner">
                    <div className="booking-card-details">
                      <span className="booking-name">{name}</span>
                      <div className="booking-card-date-row">
                        {getDayBadge(startDateObj)}
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Calendar size={11} />
                          {format(startDateObj, 'EEEE, MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    
                    <span className="booking-time" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={11} />
                      {format(startDateObj, 'h:mm a')}
                    </span>
                  </div>

                  <div className="booking-card-footer">
                    <div className="booking-card-footer-item">
                      <Phone size={11} style={{ color: 'var(--accent-violet)', opacity: 0.8 }} />
                      <span style={{ fontFamily: 'monospace' }}>{phone}</span>
                    </div>
                    <div className="booking-card-footer-item" style={{ alignItems: 'flex-start' }}>
                      <FileText size={11} style={{ color: 'var(--accent-violet)', opacity: 0.8, marginTop: '2px' }} />
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
  );
}
