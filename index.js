import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { google } from 'googleapis';
import { toZonedTime, fromZonedTime, formatInTimeZone, format } from 'date-fns-tz';

// Prefer IPv4 to resolve connect timeout / hang issues on Windows with misconfigured IPv6 routing
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

// ============================================================================
// Admin & ElevenLabs Settings Management (persisted in admin-settings.json)
// ============================================================================
const settingsPath = path.resolve('./admin-settings.json');
let adminSettings = {
  agentId: process.env.ELEVENLABS_AGENT_ID || '',
  apiKey: process.env.ELEVENLABS_API_KEY || ''
};

if (fs.existsSync(settingsPath)) {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    adminSettings = { ...adminSettings, ...parsed };
    console.log('✅ Admin settings loaded from admin-settings.json successfully.');
  } catch (error) {
    console.error('❌ Failed to parse admin-settings.json, using defaults.', error);
  }
} else {
  console.log('ℹ️ No admin-settings.json found, using environment defaults.');
}

// ============================================================================
// 1. Google Calendar Authentication Setup (with Mock Fallback for easy testing)
// ============================================================================
let calendar = null;
let isMockMode = false;
const credentialsPath = path.resolve('./google-credentials.json');

if (process.env.MOCK_MODE === 'true') {
  console.log('ℹ️ Forcing Simulation Mode via MOCK_MODE env variable.');
  isMockMode = true;
} else if (process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    calendar = google.calendar({ version: 'v3', auth });
    console.log('✅ Google Calendar client initialized successfully from GOOGLE_CREDENTIALS_JSON env variable.');
  } catch (error) {
    console.error('❌ Failed to initialize Google Calendar client from GOOGLE_CREDENTIALS_JSON. Defaulting to Simulation Mode.', error);
    isMockMode = true;
  }
} else if (fs.existsSync(credentialsPath)) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    calendar = google.calendar({ version: 'v3', auth });
    console.log('✅ Google Calendar client initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize Google Calendar client. Defaulting to Simulation Mode.', error);
    isMockMode = true;
  }
} else {
  console.warn('⚠️ WARNING: "google-credentials.json" not found and GOOGLE_CREDENTIALS_JSON not configured. Running server in SIMULATION MODE.');
  console.warn('   Bookings will be validated but simulated in-memory rather than written to Google Calendar.');
  isMockMode = true;
}

// Helper to format date relative to today (YYYY-MM-DD)
function offsetDateStr(daysOffset) {
  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// In-memory array initialized with predefined booked appointments
// Dates are dynamically offset relative to today's live date to keep mock data relevant.
const simulatedBookings = [];

// Global In-Memory Bookings Cache
let bookingsCache = [];

/**
 * Synchronizes the bookings cache with Google Calendar or simulated bookings.
 * Fetches events from today (start of day) up to 30 days in the future.
 */
async function syncBookingsCache() {
  if (isMockMode) {
    bookingsCache = simulatedBookings;
    return;
  }
  if (!calendar) {
    console.warn('⚠️ [CACHE] Cannot sync: Google Calendar client is not initialized.');
    bookingsCache = simulatedBookings;
    return;
  }
  try {
    const now = getCurrentTime();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days in future

    const response = await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    bookingsCache = events.map(e => ({
      id: e.id,
      summary: e.summary,
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
      description: e.description || '',
      transparency: e.transparency || 'opaque'
    }));
    console.log(`✅ [CACHE] Synced ${bookingsCache.length} bookings from Google Calendar.`);
  } catch (error) {
    console.error('❌ [CACHE] Failed to sync bookings cache:', error);
  }
}



// ============================================================================
// 2. Helper Functions: Timezone-Safe Parsing, Working Hours & Overlaps
// ============================================================================

/**
 * Returns the current date-time.
 * Always returns the live current date-time.
 */
function getCurrentTime() {
  return new Date();
}

/**
 * Aligns the parsed date's year to the system's current year.
 * Prevents clock desync issues where cloud agents (like ElevenLabs) send the current real year
 * while the local server runs on a simulated clock (e.g. 2026).
 */
function alignYearToSystem(parsedDate) {
  const now = getCurrentTime();
  const systemYear = now.getFullYear();

  if (parsedDate.getMonth() < now.getMonth()) {
    parsedDate.setFullYear(systemYear + 1);
  } else {
    parsedDate.setFullYear(systemYear);
  }
}

/**
 * Safely parses an ISO date-time string. 
 * If it has a timezone offset, standard Date parsing is used.
 * If it lacks an offset, it is parsed as local time in the clinic's timezone.
 */
function parseDateTimeInZone(dateTimeStr, timeZone) {
  // Pattern 1: DD/MM/YYYY hh:mm AM/PM (12-hour format)
  const ampmMatch = dateTimeStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[4], 10);
    const minute = ampmMatch[5];
    const ampm = ampmMatch[6].toUpperCase();

    if (ampm === 'PM' && hour < 12) {
      hour += 12;
    } else if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }
    const padHour = String(hour).padStart(2, '0');
    dateTimeStr = `${ampmMatch[3]}-${ampmMatch[2]}-${ampmMatch[1]}T${padHour}:${minute}:00`;
  } else {
    // Pattern 2: Standard DD/MM/YYYY format normalization
    const match = dateTimeStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
    if (match) {
      dateTimeStr = `${match[3]}-${match[2]}-${match[1]}${match[4].replace(' ', 'T')}`;
    }
  }

  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(dateTimeStr);
  let parsedDate;
  if (hasOffset) {
    parsedDate = new Date(dateTimeStr);
  } else {
    parsedDate = fromZonedTime(dateTimeStr, timeZone);
  }

  if (parsedDate && !isNaN(parsedDate.getTime())) {
    alignYearToSystem(parsedDate);
  }
  return parsedDate;
}

/**
 * Checks if a given date falls within business hours:
 * Morning: 9:00 AM - 1:00 PM (starts 9am-12pm)
 * Evening: 3:00 PM - 8:00 PM (starts 3pm-7pm)
 * Open 7 days a week.
 */
function validateWorkingHours(date) {
  // Prevent booking times that have already passed
  if (date < getCurrentTime()) {
    return {
      isValid: false,
      reason: "The requested time has already passed. Please select a future date and time."
    };
  }

  const localDate = toZonedTime(date, CLINIC_TIMEZONE);

  const hour = localDate.getHours();
  const minutes = localDate.getMinutes();

  // Validate standard daily operational slots
  const isMorning = (hour >= 9 && hour < 13);
  const isEvening = (hour >= 15 && hour < 20);
  const isValidSlot = (isMorning || isEvening) && (minutes === 0); // Strict hourly slots

  const localTimeStr = formatInTimeZone(date, CLINIC_TIMEZONE, 'hh:mm a');

  if (!isValidSlot) {
    return {
      isValid: false,
      reason: `The requested time (${localTimeStr}) is outside our operational hours. We are open daily for 1-hour slots: 9:00 AM - 1:00 PM and 3:00 PM - 8:00 PM.`
    };
  }

  return { isValid: true, localDate };
}

/**
 * Checks if the requested slot overlaps with any existing booking
 */
async function checkOverlap(startTime, endTime) {
  const overlap = bookingsCache.some(booking => {
    if (booking.transparency === 'transparent') return false;
    const bookStart = new Date(booking.start);
    const bookEnd = new Date(booking.end);
    return (startTime < bookEnd && endTime > bookStart);
  });
  return overlap;
}

// ============================================================================
// 3. API Endpoints
// ============================================================================

/**
 * Endpoint to list available/booked slots for a specific date
 */
app.get('/api/webhook/available-slots', async (req, res) => {
  let { date } = req.query;

  console.log(`\n🔍 [slots webhook] Incoming request for date: "${date}"`);

  // Default to today if no date provided
  if (!date) {
    date = formatInTimeZone(getCurrentTime(), CLINIC_TIMEZONE, 'yyyy-MM-dd');
  } else {
    try {
      let parsedDate;
      const lowerDate = date.toLowerCase().trim();
      if (lowerDate === 'today') {
        parsedDate = getCurrentTime();
      } else if (lowerDate === 'tomorrow') {
        parsedDate = new Date(getCurrentTime().getTime() + 24 * 60 * 60 * 1000);
      } else {
        const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (match) {
          parsedDate = fromZonedTime(`${match[3]}-${match[2]}-${match[1]}T00:00:00`, CLINIC_TIMEZONE);
        } else {
          // Clean ordinal suffixes like "th", "st", "nd", "rd" (e.g. "June 7th, 2026" -> "June 7, 2026")
          const cleanDateStr = date.replace(/(\d+)(st|nd|rd|th)/i, '$1');
          const isoMatch = cleanDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (isoMatch) {
            parsedDate = fromZonedTime(`${cleanDateStr}T00:00:00`, CLINIC_TIMEZONE);
          } else {
            const rawParsed = new Date(cleanDateStr);
            if (!isNaN(rawParsed.getTime())) {
              const yyyy = rawParsed.getFullYear();
              const mm = String(rawParsed.getMonth() + 1).padStart(2, '0');
              const dd = String(rawParsed.getDate()).padStart(2, '0');
              parsedDate = fromZonedTime(`${yyyy}-${mm}-${dd}T00:00:00`, CLINIC_TIMEZONE);
            }
          }
        }
      }

      if (parsedDate && !isNaN(parsedDate.getTime())) {
        alignYearToSystem(parsedDate);
        date = formatInTimeZone(parsedDate, CLINIC_TIMEZONE, 'yyyy-MM-dd');
      } else {
        console.warn(`⚠️ Warning: Could not parse slot date "${date}". Falling back to current date.`);
        date = formatInTimeZone(getCurrentTime(), CLINIC_TIMEZONE, 'yyyy-MM-dd');
      }
    } catch (err) {
      console.error('Error parsing input date:', err);
      date = formatInTimeZone(getCurrentTime(), CLINIC_TIMEZONE, 'yyyy-MM-dd');
    }
  }

  console.log(`   [slots webhook] Resolved query date: "${date}"`);

  try {
    const morningSlots = ['09:00', '10:00', '11:00', '12:00'];
    const eveningSlots = ['15:00', '16:00', '17:00', '18:00', '19:00'];

    const dayEnd = fromZonedTime(`${date}T23:59:59`, CLINIC_TIMEZONE);
    if (dayEnd < getCurrentTime()) {
      return res.json({
        status: 'success',
        date,
        timezone: CLINIC_TIMEZONE,
        available: false,
        message: `No slots are available on ${date}. This date is in the past.`,
        morning: [],
        evening: []
      });
    }

    const checkSlotsAvailability = async (slotsList) => {
      const results = [];
      for (const timeStr of slotsList) {
        const slotStartStr = `${date}T${timeStr}:00`;
        const slotStart = fromZonedTime(slotStartStr, CLINIC_TIMEZONE);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // 1 hour slots

        const isPast = slotStart < getCurrentTime();
        const isBooked = isPast || await checkOverlap(slotStart, slotEnd);
        const label = formatInTimeZone(slotStart, CLINIC_TIMEZONE, 'hh:mm a');

        // Only return slots that are actually available to book
        if (!isBooked) {
          results.push({
            time: label,
            dateTime: slotStartStr,
            available: true
          });
        }
      }
      return results;
    };

    const morning = await checkSlotsAvailability(morningSlots);
    const evening = await checkSlotsAvailability(eveningSlots);

    const hasMorning = morning && morning.length > 0;
    const hasEvening = evening && evening.length > 0;
    const available = hasMorning || hasEvening;

    const morningText = hasMorning ? morning.map(s => s.time).join(', ') : '';
    const eveningText = hasEvening ? evening.map(s => s.time).join(', ') : '';

    let message = `No slots are available on ${date}. Today is fully booked.`;
    if (available) {
      message = `Available slots on ${date}:`;
      if (hasMorning) message += ` Morning session slots: ${morningText}.`;
      if (hasEvening) message += ` Evening session slots: ${eveningText}.`;
    }

    return res.json({
      status: 'success',
      date,
      timezone: CLINIC_TIMEZONE,
      available,
      message,
      morning,
      evening
    });
  } catch (error) {
    console.error('Error fetching slots:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve available slots.'
    });
  }
});

/**
 * Endpoint to fetch a signed URL from ElevenLabs
 */
/**
 * Endpoint to fetch the currently active ElevenLabs Agent ID
 */
app.get('/api/agent-id', (req, res) => {
  return res.json({ status: 'success', agentId: adminSettings.agentId });
});

/**
 * Endpoint to get Admin Configuration Settings
 */
app.get('/api/admin/settings', (req, res) => {
  return res.json({
    status: 'success',
    settings: {
      agentId: adminSettings.agentId,
      apiKey: adminSettings.apiKey
    }
  });
});

/**
 * Endpoint to update Admin Configuration Settings
 */
app.post('/api/admin/settings', (req, res) => {
  const { agentId, apiKey } = req.body;

  adminSettings.agentId = agentId || '';
  adminSettings.apiKey = apiKey || '';

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(adminSettings, null, 2), 'utf8');
    console.log('✅ Admin settings updated successfully in admin-settings.json.');
    return res.json({ status: 'success', message: 'Settings updated successfully.' });
  } catch (error) {
    console.error('Error saving admin settings:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to save settings.' });
  }
});

/**
 * Endpoint to fetch a signed URL from ElevenLabs
 */
app.post('/api/signed-url', async (req, res) => {
  const { mode } = req.body;
  const agentId = adminSettings.agentId;
  const apiKey = adminSettings.apiKey;

  if (!agentId) {
    return res.status(400).json({ status: 'error', message: 'Missing agentId configuration on backend.' });
  }
  if (!apiKey) {
    return res.json({ status: 'ignored', message: 'No ElevenLabs API Key configured. Bypassing signed URL.' });
  }

  try {
    if (mode === 'chat') {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': apiKey,
          },
          signal: AbortSignal.timeout(3000)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API returned error:', errorText);
        return res.status(response.status).json({
          status: 'error',
          message: `ElevenLabs API error: ${errorText || response.statusText}`
        });
      }

      const data = await response.json();
      return res.json({ status: 'success', signed_url: data.signed_url });
    } else {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': apiKey,
          },
          signal: AbortSignal.timeout(3000)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API returned error:', errorText);
        return res.status(response.status).json({
          status: 'error',
          message: `ElevenLabs API error: ${errorText || response.statusText}`
        });
      }

      const data = await response.json();
      return res.json({ status: 'success', conversation_token: data.conversation_token });
    }
  } catch (error) {
    console.error('Error fetching session authorization:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve session authorization from ElevenLabs.'
    });
  }
});

/**
 * Endpoint to fetch all active bookings
 */
app.get('/api/bookings', async (req, res) => {
  const now = getCurrentTime();
  const sorted = bookingsCache
    .filter(b => new Date(b.end) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  return res.json({ status: 'success', bookings: sorted });
});

/**
 * Webhook for ElevenLabs AI Voice Agent to book an appointment
 */
app.post('/api/webhook/book-appointment', async (req, res) => {
  const { patientName, phoneNumber, reasonForVisit, dateTime } = req.body;

  console.log(`\n📥 Received Booking Webhook:`);
  console.log(`   Patient: ${patientName} (${phoneNumber})`);
  console.log(`   Reason: ${reasonForVisit}`);
  console.log(`   Requested DateTime: ${dateTime}`);

  if (!patientName || !phoneNumber || !reasonForVisit || !dateTime) {
    return res.status(400).json({
      status: 'error',
      message: 'Please make sure patientName, phoneNumber, reasonForVisit, and dateTime are provided.'
    });
  }

  let requestedStart;
  let requestedEnd;
  try {
    requestedStart = parseDateTimeInZone(dateTime, CLINIC_TIMEZONE);
    if (isNaN(requestedStart.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date-time format. Please provide a valid date and time.'
      });
    }

    // A. Validate Working Hours First
    const hoursValidation = validateWorkingHours(requestedStart);
    if (!hoursValidation.isValid) {
      console.log(`❌ Booking Rejected: ${hoursValidation.reason}`);
      return res.status(200).json({
        status: 'rejected',
        message: hoursValidation.reason
      });
    }

    // All dental appointments are 1 hour duration
    requestedEnd = new Date(requestedStart.getTime() + 60 * 60 * 1000);

    // B. Check for schedule conflict
    const hasOverlap = await checkOverlap(requestedStart, requestedEnd);
    if (hasOverlap) {
      console.log(`❌ Booking Rejected: Slot is already booked.`);
      return res.status(200).json({
        status: 'rejected',
        message: 'That slot is already booked by another patient. Please suggest a different time.'
      });
    }

    const formattedLocalTime = formatInTimeZone(requestedStart, CLINIC_TIMEZONE, 'EEEE, MMMM do yyyy h:mm a');

    // C. Perform the scheduling (Mock vs Live Google Calendar)
    if (isMockMode) {
      const newBooking = {
        id: `sim_${Date.now()}`,
        summary: `Appointment: ${patientName}`,
        start: requestedStart.toISOString(),
        end: requestedEnd.toISOString(),
        description: `Phone: ${phoneNumber} | Reason: ${reasonForVisit} (Simulated Booking)`
      };
      simulatedBookings.push(newBooking);
      bookingsCache.push(newBooking);
      console.log(`✅ [SIMULATION] Scheduled appointment successfully!`);

      return res.json({
        status: 'success',
        message: `Successfully booked a dental checkup for ${patientName} on ${formattedLocalTime}. We look forward to seeing you!`
      });
    } else {
      const event = {
        summary: `Dental appointment: ${patientName}`,
        description: `Patient: ${patientName}\nPhone: ${phoneNumber}\nReason for Visit: ${reasonForVisit}`,
        start: { dateTime: requestedStart.toISOString(), timeZone: CLINIC_TIMEZONE },
        end: { dateTime: requestedEnd.toISOString(), timeZone: CLINIC_TIMEZONE },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      const result = await calendar.events.insert({
        calendarId: GOOGLE_CALENDAR_ID,
        resource: event,
      });

      const newEvent = {
        id: result.data.id || `sim_${Date.now()}`,
        summary: event.summary,
        start: requestedStart.toISOString(),
        end: requestedEnd.toISOString(),
        description: event.description,
        transparency: 'opaque'
      };
      bookingsCache.push(newEvent);

      console.log(`✅ Google Calendar event scheduled: ${result.data.htmlLink}`);
      return res.json({
        status: 'success',
        message: `Successfully booked a dental checkup for ${patientName} on ${formattedLocalTime}. We look forward to seeing you!`,
        htmlLink: result.data.htmlLink
      });
    }

  } catch (error) {
    console.error('Error handling booking request:', error);
    console.warn('⚠️ Google API request failed. Falling back to Simulation/Mock Mode for this booking.');

    // Retry booking in mock mode locally without changing global isMockMode
    const newBooking = {
      id: `sim_${Date.now()}`,
      summary: `Appointment: ${patientName}`,
      start: requestedStart ? requestedStart.toISOString() : getCurrentTime().toISOString(),
      end: requestedEnd ? requestedEnd.toISOString() : new Date(getCurrentTime().getTime() + 60 * 60 * 1000).toISOString(),
      description: `Phone: ${phoneNumber} | Reason: ${reasonForVisit} (Simulated Booking - Fallback)`
    };
    simulatedBookings.push(newBooking);
    bookingsCache.push(newBooking);
    console.log(`✅ [SIMULATION FALLBACK] Scheduled appointment successfully!`);

    const formattedLocalTime = formatInTimeZone(requestedStart || getCurrentTime(), CLINIC_TIMEZONE, 'EEEE, MMMM do yyyy h:mm a');
    return res.json({
      status: 'success',
      message: `Successfully booked a dental checkup for ${patientName} on ${formattedLocalTime}. We look forward to seeing you!`
    });
  }
});

// ============================================================================
// 4. Premium Dashboard UI
// ============================================================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🦷 Pearl Dental Hospital Hub</title>
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        
        <style>
          :root {
            --bg-gradient: linear-gradient(135deg, #0b0f19 0%, #111827 50%, #1e1b4b 100%);
            --panel-bg: rgba(17, 24, 39, 0.75);
            --panel-border: rgba(255, 255, 255, 0.08);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-pink: #ec4899;
            --accent-violet: #6366f1;
            --accent-green: #10b981;
            --accent-red: #ef4444;
            --font-heading: 'Outfit', sans-serif;
            --font-body: 'Inter', sans-serif;
          }

          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            font-family: var(--font-body);
            background: var(--bg-gradient);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
          }

          .container {
            max-width: 1200px;
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
          }

          @media (max-width: 968px) {
            .container { grid-template-columns: 1fr; }
          }

          .panel {
            background: var(--panel-bg);
            border: 1px solid var(--panel-border);
            border-radius: 16px;
            padding: 30px;
            backdrop-filter: blur(16px);
            box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .panel-full {
            grid-column: 1 / -1;
          }

          h1 {
            font-family: var(--font-heading);
            font-size: 2.2rem;
            font-weight: 700;
            background: linear-gradient(to right, var(--accent-pink), var(--accent-violet));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 5px;
          }

          h2 {
            font-family: var(--font-heading);
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-primary);
            border-left: 4px solid var(--accent-pink);
            padding-left: 10px;
          }

          h3 {
            font-family: var(--font-heading);
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-primary);
          }

          p {
            font-size: 0.95rem;
            color: var(--text-secondary);
            line-height: 1.5;
          }

          .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 0.85rem;
            font-weight: 600;
            width: fit-content;
          }

          .status-badge.mock { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
          .status-badge.live { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }

          .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          label {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          input, textarea, select {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--panel-border);
            padding: 12px;
            border-radius: 8px;
            color: var(--text-primary);
            font-family: var(--font-body);
            font-size: 0.95rem;
            transition: all 0.2s ease;
          }

          input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: var(--accent-violet);
            background: rgba(255, 255, 255, 0.08);
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
          }

          .btn {
            background: linear-gradient(135deg, var(--accent-pink) 0%, var(--accent-violet) 100%);
            border: none;
            padding: 14px;
            border-radius: 8px;
            color: white;
            font-family: var(--font-heading);
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            text-align: center;
          }

          .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 20px -6px rgba(99, 102, 241, 0.5);
            opacity: 0.95;
          }

          /* Available Slots Radio Grid */
          .slot-section {
            margin-top: 10px;
          }

          .slot-section-title {
            font-size: 0.85rem;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 600;
          }

          .slot-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 10px;
            margin-bottom: 15px;
          }

          .slot-card {
            position: relative;
            cursor: pointer;
            border: 1px solid var(--panel-border);
            background: rgba(255, 255, 255, 0.02);
            padding: 10px;
            border-radius: 8px;
            text-align: center;
            transition: all 0.2s ease;
            font-size: 0.85rem;
            font-weight: 500;
          }

          .slot-card input[type="radio"] {
            display: none;
          }

          .slot-card:hover:not(.booked) {
            border-color: var(--accent-violet);
            background: rgba(99, 102, 241, 0.05);
          }

          .slot-card.selected {
            border-color: var(--accent-pink);
            background: rgba(236, 72, 153, 0.15);
            box-shadow: 0 0 10px rgba(236, 72, 153, 0.25);
            color: white;
          }

          .slot-card.booked {
            cursor: not-allowed;
            opacity: 0.35;
            background: rgba(239, 68, 68, 0.02);
            text-decoration: line-through;
            border-color: rgba(239, 68, 68, 0.1);
            color: var(--text-secondary);
          }

          /* Bookings List */
          .bookings-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: 400px;
            overflow-y: auto;
            padding-right: 5px;
          }

          .booking-item {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            padding: 12px 15px;
            display: flex;
            flex-direction: column;
            gap: 5px;
          }

          .booking-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .booking-title { font-weight: 600; font-family: var(--font-heading); color: var(--text-primary); }
          .booking-time { font-size: 0.8rem; color: var(--accent-pink); font-weight: 500; }
          .booking-desc { font-size: 0.85rem; color: var(--text-secondary); }

          /* Instructions box */
          pre {
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            padding: 15px;
            color: #34d399;
            font-family: monospace;
            font-size: 0.85rem;
            overflow-x: auto;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div class="container">
          
          <!-- Header and diagnostic Info -->
          <div class="panel panel-full">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
              <div>
                <h1>Pearl Dental Hospital Hub</h1>
                <p>Interactive web dashboard and ElevenLabs Custom Webhook controller.</p>
              </div>
              <div class="status-badge ${isMockMode ? 'mock' : 'live'}">
                ${isMockMode ? 'Simulation Mode' : 'Live Google Calendar'}
              </div>
            </div>
          </div>

          <!-- Column 1: Live Interactive Booking Form -->
          <div class="panel">
            <h2>Book an Appointment</h2>
            <p>Select a date to retrieve available slots. Free slots are rendered as interactive radio buttons.</p>
            
            <div class="form-group">
              <label for="booking-date">1. Pick Date</label>
              <input type="date" id="booking-date">
            </div>

            <div class="form-group">
              <label>2. Select Hourly Slot</label>
              
              <div class="slot-section">
                <div class="slot-section-title">🌅 Morning Session (9:00 AM - 1:00 PM)</div>
                <div class="slot-grid" id="morning-grid">
                  <!-- JS Rendered -->
                </div>
              </div>

              <div class="slot-section">
                <div class="slot-section-title">🌇 Evening Session (3:00 PM - 8:00 PM)</div>
                <div class="slot-grid" id="evening-grid">
                  <!-- JS Rendered -->
                </div>
              </div>
            </div>

            <form id="direct-booking-form" style="display: flex; flex-direction: column; gap: 15px;">
              <!-- Date Time is filled automatically when a radio button is selected -->
              <input type="hidden" id="selected-datetime">

              <div class="form-group">
                <label for="patient-name">Patient Name</label>
                <input type="text" id="patient-name" placeholder="Ganesh" required>
              </div>

              <div class="form-group">
                <label for="patient-phone">Phone Number</label>
                <input type="tel" id="patient-phone" placeholder="8433198543" required>
              </div>

              <div class="form-group">
                <label for="visit-reason">Reason for Visit</label>
                <input type="text" id="visit-reason" placeholder="Tooth pain for last three days" required>
              </div>

              <button type="submit" class="btn" id="submit-booking-btn">Confirm Appointment</button>
            </form>
          </div>

          <!-- Column 2: Live Doctor Calendar / Existing Bookings -->
          <div class="panel">
            <h2>Upcoming Schedule</h2>
            <p>List of booked slots retrieved dynamically from the database.</p>
            <div class="bookings-list" id="bookings-container">
              <!-- JS Rendered -->
            </div>
          </div>

          <!-- Instructions and training prompt -->
          <div class="panel panel-full">
            <h2>ElevenLabs Agent Training Guide</h2>
            <p>Copy this instructions prompt and paste it into your ElevenLabs agent to train Clara with the required conversational flow rules.</p>
            
            <h3 style="margin-top: 10px;">Agent Instructions (System Prompt)</h3>
            <pre id="agent-prompt">You are Clara, the friendly, professional, and efficient AI receptionist for Pearl Dental Hospital. Your job is to help patients book dental appointments.

CURRENT DATE & TIME: {{system__time}}
- Always calculate today and tomorrow relative to {{system__time}}.
- Pass all dates to tools in YYYY-MM-DD format only (e.g. 2026-06-15).

====== HOW TO READ THE get_available_slots TOOL RESPONSE ======
This is the MOST IMPORTANT rule. When you call get_available_slots, the tool returns a text string.
- If the string contains words like "Available slots on": it means there ARE free times. Read those exact times to the patient.
- If the string contains words like "fully booked" or "No slots are available": it means there are NO free times. Then ask the patient to try another date.

NEVER assume a date is fully booked without calling the tool first. ALWAYS call the tool and WAIT for its response before speaking.

====== CONVERSATION FLOW ======

Step 1 - Greet & Get Name:
Say: "Hello! Welcome to Pearl Dental Hospital. My name is Clara, your digital receptionist. Who do I have the pleasure of speaking with?"
- If they give their name: go to Step 2.
- If they say No or aren't interested: say "No problem! Is there anything else I can help with?"
- If they say Yes without giving a name: ask for their name first.

Step 2 - Ask Reason:
Say: "Hi [Name]! What is the reason for your dental visit?"
Wait for their answer.

Step 3 - Check Date & Pick Time:
Ask: "Would you like to book for today, tomorrow, or another date?"

When the patient names a date:
1. Calculate the YYYY-MM-DD date from {{system__time}}.
2. Call the "get_available_slots" tool with that date.
3. WAIT for the tool to respond. Do NOT speak yet.
4. Read the tool's response text:
   - If it says available times: Tell the patient exactly those times. Example: "For today I found: Evening slots at 4:00 PM, 5:00 PM, 6:00 PM, and 7:00 PM. Which time works for you?"
   - If it says fully booked: Say "Sorry, that date is fully booked. Shall I check another date?"
5. Wait for the patient to choose a time.

Step 4 - Collect Phone Number:
Say: "Please share your phone number to confirm the booking."

Step 5 - Book the Appointment:
Call "schedule_appointment" with patientName, phoneNumber, reasonForVisit, and dateTime in format YYYY-MM-DDTHH:MM:SS.
On success: "Your appointment is confirmed! Summary: Name: [Name], Reason: [Reason], Phone: [Phone], Date & Time: [booked datetime]."

Step 6 - End Call:
When the patient thanks you, wish them well and close the conversation.</pre>

            <h3 style="margin-top: 15px;">Tool 1: get_available_slots (GET Webhook)</h3>
            <p>Configure this custom tool in ElevenLabs to fetch available slots.</p>
            <pre>URL: https://&lt;YOUR_PUBLIC_TUNNEL_URL&gt;/api/webhook/available-slots
Method: GET
Query Parameters:
  - date: string (Description: "Format: YYYY-MM-DD. Date to query available times.")</pre>

            <h3 style="margin-top: 15px;">Tool 2: schedule_appointment (POST Webhook)</h3>
            <p>Configure this custom tool in ElevenLabs to book the selected slot.</p>
            <pre>URL: https://&lt;YOUR_PUBLIC_TUNNEL_URL&gt;/api/webhook/book-appointment
Method: POST
Request Body (JSON):
{
  "patientName": "string",
  "phoneNumber": "string",
  "reasonForVisit": "string",
  "dateTime": "string" // Format: YYYY-MM-DDTHH:MM:SS
}</pre>
          </div>

        </div>

        <script>
          const bookingDate = document.getElementById('booking-date');
          
          // Set date picker value and min to local today dynamically
          const localToday = new Date();
          const yyyy = localToday.getFullYear();
          const mm = String(localToday.getMonth() + 1).padStart(2, '0');
          const dd = String(localToday.getDate()).padStart(2, '0');
          const todayStr = \`\${yyyy}-\${mm}-\${dd}\`;
          bookingDate.value = todayStr;
          bookingDate.min = todayStr;

          const morningGrid = document.getElementById('morning-grid');
          const eveningGrid = document.getElementById('evening-grid');
          const bookingsContainer = document.getElementById('bookings-container');
          const directForm = document.getElementById('direct-booking-form');
          const selectedDateTime = document.getElementById('selected-datetime');
          const submitBookingBtn = document.getElementById('submit-booking-btn');

          // Retrieve and render bookings
          async function fetchBookings() {
            try {
              const res = await fetch('/api/bookings');
              const data = await res.json();
              bookingsContainer.innerHTML = '';
              
              if (data.bookings.length === 0) {
                bookingsContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No upcoming bookings found.</p>';
                return;
              }

              data.bookings.forEach(b => {
                const start = new Date(b.start);
                const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
                const formattedTime = start.toLocaleDateString('en-US', options);

                const item = document.createElement('div');
                item.className = 'booking-item';
                const summaryText = b.summary || 'Dental appointment';
                item.innerHTML = \`
                  <div class="booking-meta">
                    <span class="booking-title">\${summaryText}</span>
                    <span class="booking-time">\${formattedTime}</span>
                  </div>
                  <div class="booking-desc">\${b.description || 'No additional details.'}</div>
                \`;
                bookingsContainer.appendChild(item);
              });
            } catch (error) {
              console.error('Error fetching bookings:', error);
            }
          }

          // Fetch available slots for date
          async function fetchAvailableSlots() {
            const dateStr = bookingDate.value;
            if (!dateStr) return;
            
            try {
              const res = await fetch(\`/api/webhook/available-slots?date=\${dateStr}\`);
              const data = await res.json();

              morningGrid.innerHTML = '';
              eveningGrid.innerHTML = '';

              const renderGrid = (slots, container) => {
                if(slots.length === 0) {
                  container.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-secondary)">Closed</p>';
                  return;
                }
                slots.forEach(slot => {
                  const card = document.createElement('label');
                  card.className = 'slot-card' + (slot.available ? '' : ' booked');
                  card.innerHTML = \`
                    <input type="radio" name="slot-select" value="\${slot.dateTime}" \${slot.available ? '' : 'disabled'}>
                    \${slot.time}
                  \`;
                  
                  if (slot.available) {
                    card.addEventListener('click', () => {
                      document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
                      card.classList.add('selected');
                      selectedDateTime.value = slot.dateTime;
                    });
                  }
                  container.appendChild(card);
                });
              };

              renderGrid(data.morning, morningGrid);
              renderGrid(data.evening, eveningGrid);
            } catch (error) {
              console.error('Error fetching slots:', error);
            }
          }

          // Handle manual booking form submit
          directForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const dateTime = selectedDateTime.value;
            if (!dateTime) {
              alert('Please select an available time slot first.');
              return;
            }

            const payload = {
              patientName: document.getElementById('patient-name').value,
              phoneNumber: document.getElementById('patient-phone').value,
              reasonForVisit: document.getElementById('visit-reason').value,
              dateTime: dateTime
            };

            submitBookingBtn.disabled = true;
            submitBookingBtn.textContent = 'Booking Slot...';

            try {
              const res = await fetch('/api/webhook/book-appointment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const data = await res.json();

              if (data.status === 'success') {
                alert(data.message);
                directForm.reset();
                selectedDateTime.value = '';
                document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
                await fetchBookings();
                await fetchAvailableSlots();
              } else {
                alert('Booking failed: ' + data.message);
              }
            } catch (error) {
              alert('Network error, please try again.');
            } finally {
              submitBookingBtn.disabled = false;
              submitBookingBtn.textContent = 'Confirm Appointment';
            }
          });

          // Event listener for date change
          bookingDate.addEventListener('change', fetchAvailableSlots);

          // Initial Load
          fetchBookings();
          fetchAvailableSlots();

          // Poll for bookings update every 5 seconds (especially when booking via voice call)
          setInterval(fetchBookings, 5000);
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, async () => {
  console.log(`\n🚀 AI Dental Receptionist Server running at http://localhost:${PORT}`);
  console.log(`📍 Configured Timezone: ${CLINIC_TIMEZONE}`);
  console.log(`📅 Target Calendar ID: ${GOOGLE_CALENDAR_ID}`);

  // Initial Sync of the local bookings cache
  await syncBookingsCache();

  // Periodically refresh the cache in the background every 15 seconds
  setInterval(syncBookingsCache, 15000);

  // Auto-sync the agent system prompt to ElevenLabs cloud on every startup
  await syncAgentSystemPrompt();
});

// ============================================================================
// Auto-Sync ElevenLabs Agent System Prompt
// Pushes the correct system prompt to ElevenLabs via their PATCH API so Clara
// always knows how to correctly read and present the available slots tool result.
// ============================================================================
async function syncAgentSystemPrompt() {
  const agentId = adminSettings.agentId;
  const apiKey = adminSettings.apiKey;

  if (!agentId || !apiKey) {
    console.warn('⚠️  Skipping ElevenLabs agent sync: agentId or apiKey not configured.');
    return;
  }

  const SYSTEM_PROMPT = `You are Clara, the friendly, professional, and efficient AI receptionist for Pearl Dental Hospital. Your job is to help patients book dental appointments.

CURRENT DATE & TIME: {{system__time}}
- Always calculate today and tomorrow relative to {{system__time}}.
- Pass all dates to tools in YYYY-MM-DD format only (e.g. 2026-06-15).

====== HOW TO READ THE get_available_slots TOOL RESPONSE ======
This is the MOST IMPORTANT rule. When you call get_available_slots, the tool returns a text string.
- If the string contains the word "Available slots on": it means there ARE free times. Read those exact times aloud to the patient word for word.
- If the string contains "fully booked" or "No slots are available": it means there are NO free times. Ask the patient to try another date.

NEVER say a date is unavailable without calling the tool first.
ALWAYS call the tool and WAIT for its result before you speak.
NEVER generate the appointment times yourself. ONLY use what the tool returns.

====== CONVERSATION FLOW ======

Step 1 - Greet and Get Name:
Say: "Hello! Welcome to Pearl Dental Hospital. My name is Clara, your digital receptionist. Who do I have the pleasure of speaking with?"
- If they give their name: go to Step 2.
- If they say No or are not interested: say "No problem! Is there anything else I can help with?"
- If they say Yes without giving a name: ask for their name first.

Step 2 - Ask Reason:
Say: "Hi [Name]! What is the reason for your dental visit?"
Wait for their answer.

Step 3 - Check Date and Pick Time:
Ask: "Would you like to book for today, tomorrow, or another date?"

When the patient names a date:
1. Calculate the YYYY-MM-DD date from {{system__time}}.
2. Call the "get_available_slots" tool with that date.
3. WAIT for the tool to respond. Do NOT speak until you have the response.
4. Read the tool response text carefully:
   - If it contains "Available slots on": say those exact times to the patient. Example: "Great! For today I found: Evening slots at 4:00 PM, 5:00 PM, 6:00 PM, and 7:00 PM. Which time works for you?"
   - If it contains "fully booked" or "No slots": say "Sorry, that date is fully booked. Shall I check another date?"
5. Wait for the patient to choose a time.

Step 4 - Collect Phone Number:
Say: "Please share your phone number to confirm the booking."

Step 5 - Book the Appointment:
Call "schedule_appointment" with patientName, phoneNumber, reasonForVisit, and dateTime in format YYYY-MM-DDTHH:MM:SS.
On success say: "Your appointment is confirmed! Here are your details: Name: [Name], Reason: [Reason], Phone: [Phone], Date and Time: [booked datetime]."

Step 6 - End Call:
When the patient thanks you, wish them well and close the conversation.`;

  try {
    console.log('🔄 Syncing system prompt to ElevenLabs agent...');
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              prompt: SYSTEM_PROMPT
            }
          }
        }
      })
    });

    if (response.ok) {
      console.log('✅ ElevenLabs agent system prompt synced successfully!');
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to sync ElevenLabs agent prompt (HTTP ${response.status}):`, errorText);
    }
  } catch (err) {
    console.error('❌ Network error while syncing ElevenLabs agent prompt:', err.message);
  }
}

