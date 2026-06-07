import React, { useState } from 'react';
import { 
  HeartPulse, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  Sparkles, 
  ShieldCheck, 
  MessageSquare, 
  Calendar, 
  Activity, 
  Award,
  ChevronRight
} from 'lucide-react';
import CallAgentWidget from './components/CallAgentWidget';

export default function App() {
  const [widgetState, setWidgetState] = useState({ isOpen: false, mode: 'voice' });

  const openWidget = (modeType) => {
    setWidgetState({ isOpen: true, mode: modeType });
  };

  return (
    <div className="app-container">
      {/* 1. Full-size Navbar */}
      <nav className="navbar">
        <a href="#" className="navbar-brand">
          <div className="navbar-logo">
            <HeartPulse size={20} className="text-white" />
          </div>
          <span className="navbar-title">Pearl Dental Hospital</span>
        </a>
        <div className="navbar-links">
          <a href="#about" className="navbar-link">About Hospital</a>
          <a href="#services" className="navbar-link">Our Services</a>
          <a href="#contact" className="navbar-link">Contact Us</a>
          <button onClick={() => openWidget('chat')} className="btn" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
            <MessageSquare size={14} />
            <span>Talk to Clara</span>
          </button>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <header className="hero-section">
        <div className="hero-glow-1" />
        <div className="hero-glow-2" />
        <div className="hero-content">
          <div className="hero-tagline">
            <Sparkles size={12} />
            <span>AI-Powered Dental Assistance</span>
          </div>
          <h1 className="hero-title">
            Your Smile, Our Priority. <br />
            Meet <span style={{ color: 'var(--accent-violet)' }}>Clara</span>, Your AI Receptionist.
          </h1>
          <p className="hero-description">
            Experience next-generation dental care at Pearl Dental Hospital. Speak or chat with Clara, our intelligent virtual assistant, to schedule your appointment, check operational slots, or answer clinic queries in real-time.
          </p>
          <div className="hero-actions">
            <button onClick={() => openWidget('voice')} className="btn" style={{ padding: '0.9rem 2.25rem', fontSize: '1rem', borderRadius: '14px' }}>
              <MessageSquare size={18} />
              <span>Book Appointment with Clara</span>
            </button>
            <a href="#about" className="btn" style={{ padding: '0.9rem 2.25rem', fontSize: '1rem', borderRadius: '14px', background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--text-primary)' }}>
              <span>Learn More</span>
              <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </header>

      {/* 3. About & Specialties Section */}
      <section id="about" className="section" style={{ borderBottom: '1px solid var(--panel-border)' }}>
        <div className="section-header">
          <h2>About Our Hospital</h2>
          <p>We combine state-of-the-art dental technology with a warm, patient-first approach to give you the best care possible.</p>
        </div>

        <div className="about-grid">
          <div className="about-features">
            <div className="about-feature-card">
              <div className="feature-icon-wrapper">
                <Activity size={18} />
              </div>
              <h3>Advanced Technology</h3>
              <p>Equipped with modern dental tools, digital diagnostic imaging, and active AI scheduling helpers.</p>
            </div>
            
            <div className="about-feature-card">
              <div className="feature-icon-wrapper">
                <Award size={18} />
              </div>
              <h3>Certified Specialists</h3>
              <p>Our experienced dentists and clinical staff provide specialized treatments tailored to your comfort.</p>
            </div>

            <div className="about-feature-card">
              <div className="feature-icon-wrapper">
                <ShieldCheck size={18} />
              </div>
              <h3>Hygiene & Safety First</h3>
              <p>Adhering to hospital-grade sterilization protocols to guarantee a completely safe environment.</p>
            </div>

            <div className="about-feature-card">
              <div className="feature-icon-wrapper">
                <Clock size={18} />
              </div>
              <h3>24/7 Digital Booking</h3>
              <p>Book, modify, or check your schedule instantly anytime by speaking to Clara, our online assistant.</p>
            </div>
          </div>

          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', justifyContent: 'center' }}>
            <h3 style={{ fontSize: '1.35rem' }}>Specialists on Duty</h3>
            <p>Our lead dentist is on duty daily to look after your dental health and deliver personalized consulting.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--panel-border)', padding: '1rem', borderRadius: '12px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', fontSize: '0.95rem' }}>Dr. Ganesh Kumar, DMD</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lead Prosthodontist & Oral Surgeon</span>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--panel-border)', padding: '1rem', borderRadius: '12px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', fontSize: '0.95rem' }}>Dr. Clara Vance, DDS</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Orthodontist & Pediatric Specialist</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Our Services Module */}
      <section id="services" className="section" style={{ borderBottom: '1px solid var(--panel-border)' }}>
        <div className="section-header">
          <h2>Our Services</h2>
          <p>Comprehensive oral care for patients of all ages, tailored to restore and maintain your natural smile.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🦷</span>
            <h3>Preventive Dentistry</h3>
            <p>Regular checkups, professional cleanings, and fluoride treatments to prevent decay and maintain hygiene.</p>
          </div>
          
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>✨</span>
            <h3>Cosmetic Dentistry</h3>
            <p>Teeth whitening, porcelain veneers, and smile design procedures to boost your confidence and appearance.</p>
          </div>

          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🛠️</span>
            <h3>Root Canal & Implants</h3>
            <p>Precise root canal therapies and durable dental implants to reconstruct damaged teeth and replace missing ones.</p>
          </div>
        </div>
      </section>

      {/* 5. Contact Module */}
      <section id="contact" className="section">
        <div className="section-header">
          <h2>Contact Us</h2>
          <p>Get in touch or visit us. Our reception desk is open daily to assist you with physical bookings and checkups.</p>
        </div>

        <div className="contact-grid">
          <div className="contact-info">
            <div className="contact-card">
              <div className="contact-icon">
                <MapPin size={18} />
              </div>
              <div>
                <div className="contact-label">Location Address</div>
                <p>102 Healthcare Blvd, Suite A, Medical Center</p>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-icon">
                <Phone size={18} />
              </div>
              <div>
                <div className="contact-label">Phone Support</div>
                <p>+91 (936) 137-1846 / +91 (843) 319-8543</p>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-icon">
                <Mail size={18} />
              </div>
              <div>
                <div className="contact-label">Email Address</div>
                <p>reception@pearldental.com</p>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-icon">
                <Clock size={18} />
              </div>
              <div>
                <div className="contact-label">Working Hours</div>
                <p>Daily: 9:00 AM - 1:00 PM and 3:00 PM - 8:00 PM</p>
              </div>
            </div>
          </div>

          <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3>Quick Inquiry</h3>
            <p style={{ marginBottom: '1.25rem' }}>Have any emergency queries? Speak directly to Clara in the bottom right, or drop us an email.</p>
            
            <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={(e) => e.preventDefault()}>
              <div className="form-group">
                <label>Your Name</label>
                <input type="text" placeholder="Enter your full name" required />
              </div>
              <div className="form-group">
                <label>Your Email</label>
                <input type="email" placeholder="Enter your email address" required />
              </div>
              <button type="submit" className="btn">Send Message</button>
            </form>
          </div>
        </div>
      </section>

      {/* 6. Footer Section */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-logo">
              <div className="footer-logo-icon">
                <HeartPulse size={16} className="text-white" />
              </div>
              <span className="footer-logo-title">Pearl Dental</span>
            </div>
            <p className="footer-description">
              Dedicated to delivering the highest quality dental consulting, surgeries, and family checkups in a highly sterile environment.
            </p>
          </div>
          <div>
            <h4 className="footer-links-title">Quick Links</h4>
            <ul className="footer-links">
              <li><a href="#" className="footer-link">Home</a></li>
              <li><a href="#about" className="footer-link">About Clinic</a></li>
              <li><a href="#services" className="footer-link">Services</a></li>
              <li><a href="#contact" className="footer-link">Contact Us</a></li>
            </ul>
          </div>
          <div>
            <h4 className="footer-links-title">Legal</h4>
            <ul className="footer-links">
              <li><a href="#" className="footer-link">Privacy Policy</a></li>
              <li><a href="#" className="footer-link">Terms of Service</a></li>
              <li><a href="#" className="footer-link">Patient Rights</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; 2026 Pearl Dental Hospital. All rights reserved.</span>
          <span>Designed with Clara AI Receptionist Integration.</span>
        </div>
      </footer>

      {/* 7. Floating Expandable Siri-Style AI Widget */}
      <CallAgentWidget 
        isOpen={widgetState.isOpen} 
        setIsOpen={(open) => setWidgetState(prev => ({ ...prev, isOpen: open }))} 
        mode={widgetState.mode} 
        setMode={(m) => setWidgetState(prev => ({ ...prev, mode: m }))} 
      />
    </div>
  );
}
