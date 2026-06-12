import React, { useState, useEffect, useRef } from 'react';
import { useConversationControls, useConversationStatus } from '@elevenlabs/react';
import { Phone, PhoneOff, MessageSquare, ArrowUp, Volume2, MessageCircle, AlertCircle, Calendar, ChevronDown, HeartPulse } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

export default function CallAgentWidget({ isOpen, setIsOpen, mode, setMode }) {
  const { startSession, endSession, sendUserMessage } = useConversationControls();
  const { status } = useConversationStatus();
  const [agentId, setAgentId] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  
  const chatEndRef = useRef(null);
  const prevIsOpen = useRef(isOpen);

  // Fetch Agent ID dynamically from backend config on mount
  useEffect(() => {
    async function loadAgentId() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/agent-id`);
        const data = await res.json();
        if (data.status === 'success' && data.agentId) {
          setAgentId(data.agentId);
        } else {
          console.warn('No active Agent ID returned by backend.');
        }
      } catch (err) {
        console.error('Failed to retrieve Agent ID from backend:', err);
      }
    }
    loadAgentId();
  }, []);

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start ElevenLabs Session
  const handleStart = async (selectedMode) => {
    const targetMode = selectedMode || mode;
    if (!agentId) {
      alert('AI Receptionist is currently offline. Please configure your ElevenLabs Agent ID in the Admin Dashboard (http://localhost:5175) to enable the voice and chat assistant.');
      return;
    }

    const clientTools = {
      get_available_slots: async ({ date }) => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/webhook/available-slots?date=${date}`);
          const data = await res.json();
          return data;
        } catch (err) {
          console.error('get_available_slots client tool failed:', err);
          return { status: 'error', message: 'Failed to retrieve slots.' };
        }
      },
      schedule_appointment: async ({ patientName, phoneNumber, reasonForVisit, dateTime }) => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/webhook/book-appointment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientName, phoneNumber, reasonForVisit, dateTime })
          });
          const data = await res.json();
          return data;
        } catch (err) {
          console.error('schedule_appointment client tool failed:', err);
          return { status: 'error', message: 'Failed to book appointment.' };
        }
      }
    };

    setMessages([]);

    // Fetch dynamic system prompt from backend with correct dates
    let promptOverride = null;
    try {
      const promptRes = await fetch(`${BACKEND_URL}/api/agent-prompt`);
      const promptData = await promptRes.json();
      if (promptData.status === 'success') {
        promptOverride = promptData.prompt;
      }
    } catch (err) {
      console.warn('Failed to fetch dynamic agent prompt:', err);
    }

    try {
      if (targetMode === 'voice') {
        // Explicitly request microphone access for voice call
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Fetch session token/URL from backend proxy using secure backend credentials
      let signedUrl = null;
      let conversationToken = null;
      try {
        const tokenRes = await fetch(`${BACKEND_URL}/api/signed-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: targetMode })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.status === 'success') {
          if (targetMode === 'chat') {
            signedUrl = tokenData.signed_url;
          } else {
            conversationToken = tokenData.conversation_token;
          }
        } else {
          console.warn('Could not get session authorization from backend, falling back to agentId directly:', tokenData.message);
        }
      } catch (tokenErr) {
        console.warn('Failed to fetch session authorization, falling back to agentId directly:', tokenErr);
      }

      const todayDate = new Date();
      const tomorrowDate = new Date();
      tomorrowDate.setDate(todayDate.getDate() + 1);

      const localeOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const todayFormatted = todayDate.toLocaleDateString('en-US', localeOptions);
      const tomorrowFormatted = tomorrowDate.toLocaleDateString('en-US', localeOptions);

      const todayISO = todayDate.toISOString().split('T')[0];
      const tomorrowISO = tomorrowDate.toISOString().split('T')[0];

      const agentOverrides = {
        agent: {
          prompt: {
            dynamic_variables: {
              current_date: todayFormatted,
              tomorrow_date: tomorrowFormatted,
              current_date_iso: todayISO,
              tomorrow_date_iso: tomorrowISO
            }
          }
        }
      };

      if (promptOverride) {
        agentOverrides.agent.prompt.prompt = promptOverride;
      }

      const sessionParams = {
        clientTools,
        onMessage: (msg) => {
          const role = msg.role === 'user' ? 'user' : 'assistant';
          const text = msg.message || msg.text || '';
          if (text) {
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.text === text && lastMsg.role === role) {
                return prev;
              }
              return [...prev, { role, text }];
            });
          }
        },
        onError: (err) => {
          console.error('ElevenLabs SDK connection error:', err);
        }
      };

      if (targetMode === 'chat') {
        if (signedUrl) {
          sessionParams.signedUrl = signedUrl;
        } else {
          sessionParams.agentId = agentId;
        }
        sessionParams.connectionType = 'websocket';
        sessionParams.overrides = {
          conversation: {
            textOnly: true
          },
          ...agentOverrides
        };
      } else {
        if (conversationToken) {
          sessionParams.conversationToken = conversationToken;
        } else {
          sessionParams.agentId = agentId;
        }
        sessionParams.connectionType = 'webrtc';
        sessionParams.overrides = {
          ...agentOverrides
        };
      }

      await startSession(sessionParams);
    } catch (err) {
      console.error('Failed to start conversation:', err);
      alert('Connection failed. Please ensure microphone access is granted if in Voice mode.');
    }
  };

  const handleEnd = async () => {
    try {
      await endSession();
    } catch (err) {
      console.error('Failed to end conversation:', err);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      sendUserMessage(inputText);
      setMessages(prev => [...prev, { role: 'user', text: inputText }]);
      setInputText('');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Watch for external open/trigger events (e.g. clicking CTA buttons on main landing page)
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      // Small delay to let the expanded drawer render/animate in first
      const t = setTimeout(() => {
        handleStart(mode);
      }, 150);
      return () => clearTimeout(t);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  // Toggle mode inside the drawer
  const handleToggleMode = async (newMode) => {
    if (newMode === mode) return;
    
    // If running, stop current session first
    if (status === 'connected' || status === 'connecting') {
      await handleEnd();
    }
    
    setMode(newMode);
    
    // Automatically start session in the new mode
    setTimeout(() => {
      handleStart(newMode);
    }, 100);
  };

  // Collapse drawer back to initial pill
  const handleCollapse = async () => {
    if (status === 'connected' || status === 'connecting') {
      await handleEnd();
    }
    setIsOpen(false);
  };

  // Expand drawer locally
  const handleExpand = (initialMode) => {
    setMode(initialMode);
    setIsOpen(true);
  };

  return (
    <div className="ai-widget-container">
      {!isOpen ? (
        /* ==========================================
           1. INITIAL PILL STATE (2nd Image)
           ========================================== */
        <div className="initial-pill">
          <div className="initial-pill-header">
            {/* Glowing circle representation */}
            <div 
              style={{
                width: '24px', 
                height: '24px', 
                borderRadius: '50%',
                background: 'radial-gradient(circle, #22d3ee 0%, #3b82f6 60%, rgba(79,70,229,0.2) 100%)',
                animation: 'orbBreathing 3s ease-in-out infinite',
                boxShadow: '0 0 10px rgba(34, 211, 238, 0.4)'
              }}
            />
            <span className="initial-pill-text">Use this to book an appointment</span>
          </div>

          <div className="initial-pill-controls">
            {/* Wide Capsule Black Call Button */}
            <button 
              onClick={() => handleExpand('voice')}
              className="capsule-call-btn"
            >
              <Phone size={13} style={{ fill: 'currentColor' }} />
              <span>Start a call</span>
            </button>

            {/* Circular Chat Toggle Button */}
            <button 
              onClick={() => handleExpand('chat')}
              className="round-chat-btn"
              title="Start a chat"
            >
              <MessageSquare size={16} style={{ fill: 'currentColor' }} />
            </button>
          </div>
        </div>
      ) : (
        /* ==========================================
           2. EXPANDED DRAWER STATE (3rd Image)
           ========================================== */
        <div className="expanded-drawer">
          
          {/* Header */}
          <div className="drawer-header">
            <div className="drawer-title-group">
              <HeartPulse size={16} style={{ color: 'var(--accent-violet)' }} />
              <h2>Clara Assistant</h2>
            </div>

            {/* Toggle tabs */}
            <div className="chat-mode-toggle">
              <button 
                onClick={() => handleToggleMode('voice')}
                className={`toggle-btn ${mode === 'voice' ? 'active' : ''}`}
              >
                <Volume2 size={11} />
                <span>Voice</span>
              </button>
              <button 
                onClick={() => handleToggleMode('chat')}
                className={`toggle-btn ${mode === 'chat' ? 'active' : ''}`}
              >
                <MessageCircle size={11} />
                <span>Chat</span>
              </button>
            </div>
          </div>

          {/* Body */}
          {mode === 'voice' ? (
            /* Voice Mode Body (Siri visualizer & call toggle button) */
            <div className="siri-orb-container">
              
              <div className="siri-orb-wrapper">
                {/* Concentric rings waves if active */}
                {status === 'connected' && (
                  <>
                    <div className="ripple-outer" />
                    <div className="ripple-inner" />
                  </>
                )}

                {/* Main Glowing Orb */}
                <div 
                  className={`siri-orb ${
                    status === 'connected' 
                      ? 'active' 
                      : status === 'connecting' 
                        ? 'connecting' 
                        : 'idle'
                  }`}
                >
                  {/* EQ bars inside active voice orb */}
                  {status === 'connected' && (
                    <div className="visualizer-bars-overlay">
                      <span className="visualizer-bar b1" />
                      <span className="visualizer-bar b2" />
                      <span className="visualizer-bar b3" />
                    </div>
                  )}
                </div>

                {/* Circular Black Call Toggle Button overlapping bottom of the orb */}
                <button 
                  onClick={status === 'connected' || status === 'connecting' ? handleEnd : () => handleStart('voice')}
                  className="siri-end-call-btn"
                  title={status === 'connected' || status === 'connecting' ? "End Call" : "Start Call"}
                >
                  {status === 'connected' || status === 'connecting' ? (
                    <PhoneOff size={18} />
                  ) : (
                    <Phone size={18} />
                  )}
                </button>
              </div>

              {/* Status details */}
              <div className="drawer-status-wrapper">
                <div className="drawer-status-pill">
                  {status === 'connected' ? (
                    <>
                      <span className="drawer-status-dot active" />
                      <span>Line Active</span>
                    </>
                  ) : status === 'connecting' ? (
                    <>
                      <span className="drawer-status-dot connecting" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <span className="drawer-status-dot idle" />
                      <span>Ready to Call</span>
                    </>
                  )}
                </div>
                
                <p className="drawer-call-subtext">
                  {status === 'connected'
                    ? 'Speak naturally to book dental slots or ask queries. Click the button to hang up.'
                    : 'Click the phone button above to begin your appointment booking session with Clara.'}
                </p>
              </div>

              {/* Suggested Prompts Guide */}
              <div className="prompts-card">
                <h3 className="prompts-title">
                  <MessageSquare size={11} />
                  Suggested Prompts
                </h3>
                <div className="prompts-list">
                  <div className="prompt-item">
                    <Calendar size={11} className="text-secondary" style={{ flexShrink: 0 }} />
                    <span>"I want to book an appointment for tomorrow morning."</span>
                  </div>
                  <div className="prompt-item">
                    <AlertCircle size={11} className="text-secondary" style={{ flexShrink: 0 }} />
                    <span>"What are the clinic hours and doctor timings?"</span>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            /* Chat Mode Body (Chat message history & black-bordered input) */
            <div className="drawer-chat-container">
              <div className="drawer-chat-history">
                {messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '0 1rem' }}>
                    <MessageSquare size={32} style={{ color: 'var(--accent-violet)', opacity: 0.3, marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.8rem' }}>Welcome! Type a message below to start chatting with Clara to book your dental checkup.</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className={`chat-message-row ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                      <div className={`chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Black Bordered rounded-rect input container (3rd Image) */}
              <form onSubmit={handleSendMessage} className="drawer-chat-input-bar">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Send a message..."
                  className="drawer-chat-input-field"
                />
                
                {/* Circular Send Button inside input bar */}
                <button 
                  type="submit" 
                  className={`drawer-chat-send-btn ${inputText.trim() ? 'active' : ''}`}
                  disabled={!inputText.trim()}
                  title="Send Message"
                >
                  <ArrowUp size={16} />
                </button>
              </form>
            </div>
          )}

          {/* Drawer footer containing the circular collapse button */}
          <div className="drawer-footer">
            <button 
              onClick={handleCollapse}
              className="round-collapse-btn"
              title="Collapse Panel"
            >
              <ChevronDown size={18} />
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
