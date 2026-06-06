# 🦷 AI Dental Receptionist Webhook Service

This repository houses the backend Express.js server that serves as the "brain" for the **AI Dental Receptionist**. It intercepts calls from the **ElevenLabs Conversational Voice Agent**, validates working hours, prevents schedule conflicts, and inserts bookings directly into your **Google Calendar**.

---

## 🛠️ Step 1: Local Installation

1. Open your terminal in this project directory.
2. Install the necessary dependencies (if not already installed):
   ```bash
   npm install
   ```
3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
4. Change the settings inside `.env` to match your local setup:
   - `CLINIC_TIMEZONE`: The timezone of your dental clinic (defaults to `Asia/Kolkata`, but can be changed to any valid timezone like `America/New_York`).
   - `GOOGLE_CALENDAR_ID`: The ID of your target calendar (defaults to `primary`).

---

## 🔑 Step 2: Google Calendar Credentials Setup

The server uses a **Google Cloud Service Account** to write events directly to your calendar.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Cloud Project.
3. Search for the **Google Calendar API** and click **Enable**.
4. Go to **APIs & Services > Credentials** and click **Create Credentials > Service Account**.
5. Give it a name (e.g. `dental-receptionist-bot`) and click **Done**.
6. Select your newly created Service Account, open the **Keys** tab, click **Add Key > Create New Key**, choose **JSON**, and save the file.
7. Rename this downloaded file to `google-credentials.json` and save it directly in the **root** folder of this project.
8. **CRITICAL STEP**: Open your Google Calendar in your web browser. Go to **Settings and Sharing** of the specific calendar you wish to use. Scroll to **Share with specific people**, click **Add people**, and paste the Service Account email address (found in your `google-credentials.json` file). Ensure permissions are set to **"Make changes to events"**.

> 💡 **No credentials yet?** Don't worry! If `google-credentials.json` is missing, the server will start automatically in **Simulation Mode** (in-memory mock database), allowing you to validate rules and test endpoints immediately.

---

## 🤖 Step 3: ElevenLabs Conversational Agent Setup

To allow your ElevenLabs AI voice assistant to book appointments, you must configure a **Webhook Tool**. 

### 💡 How Webhook Tools Work
An ElevenLabs voice agent is powered by a Large Language Model (LLM). On its own, it doesn't know how to book an appointment or speak to your server. 
When you define a **Tool**, you tell the agent:
1. **When to use it:** The LLM reads the tool's **Description** and decides *when* in the conversation it makes sense to trigger the tool (e.g., when a patient says "I'd like to book an appointment").
2. **What information to gather first:** The LLM reads the **Parameters Schema** (written in JSON Schema format) and knows it *must* ask the patient for their name, phone, reason, and date/time before it can trigger the webhook.
3. **Where to send it:** The **Webhook URL** is the web address of your running server where ElevenLabs will send this collected data as an HTTP POST request.

---

### Step-by-Step Instructions

1. Go to the [ElevenLabs Conversational AI Dashboard](https://elevenlabs.io/app/conversational-ai).
2. Click **Create new Agent** (or select your existing agent). Select a voice and set it up.
3. In **Agent Instructions / Prompt**, paste a configuration similar to this to define the agent's behavior:
   ```text
   You are Clara, the friendly, professional, and efficient AI receptionist for the Pearl Dental Hospital. 
   Your goal is to help patients book dental appointments and answer basic queries.
   
   Rules:
   1. Ask the patient for their Name, Phone Number, and the Reason for their visit.
   2. Once gathered, ask them for their preferred Date and Time.
   3. Call the "schedule_appointment" tool.
   4. If the tool responds with "success", confirm the appointment time with the user.
   5. If the tool responds with "rejected" due to working hours (Mon-Fri, 9am - 5pm) or conflicts, state the reason clearly and offer alternatives.
   ```
4. Navigate to the **Tools** tab in the ElevenLabs agent settings, click **Add Tool**, select **Webhook**, and fill in the details:

   * **Tool Name**: `schedule_appointment`
     * *Why?* This is the unique identifier the AI agent uses in its code representation to invoke the tool.
   * **Description**: `Call this tool to book or schedule a new dental appointment. Pass the patient's name, phone, reason for visit, and the requested date-time.`
     * *Why?* The AI reads this description to understand *when* to execute this tool. If a user asks "Can I schedule a checkup?", the AI matches that intent with this description.
   * **Webhook URL**: `https://<YOUR_PUBLIC_SERVER_URL>/api/webhook/book-appointment`
     * *Why?* This is the endpoint on your Express server that handles the request. During development, replace `<YOUR_PUBLIC_SERVER_URL>` with your public **ngrok** URL (e.g., `https://a1b2-34-56-78-90.ngrok-free.app`).
   * **Method**: `POST`
     * *Why?* A `POST` request allows ElevenLabs to securely send the patient's information in the body payload of the request.
   * **Parameters / Request Body Schema**:
     * In the ElevenLabs tool creator, locate the **Body parameters** section:
       1. Set the dropdown to **JSON**.
       2. In the root **Description** box (which says *"Property description cannot be empty"*), enter:
          `The details of the dental appointment being booked, including patient contact info, reason, and requested date/time.`
       3. Scroll down to the **Properties** section directly below that Description box and add these **4 parameters**:

     | Parameter Key | Type | Description | Required |
     | :--- | :--- | :--- | :--- |
     | **`patientName`** | `string` | First and last name of the patient. | **Yes** (checked) |
     | **`phoneNumber`** | `string` | The phone number of the patient. | **Yes** (checked) |
     | **`reasonForVisit`** | `string` | Why they are visiting (e.g. routine checkup, cleaning, toothache). | **Yes** (checked) |
     | **`dateTime`** | `string` | The requested date-time, formatted exactly as DD/MM/YYYY:hh:mm AM/PM (e.g. 05/06/2026:04:00 PM). | **Yes** (checked) |

     * *Note: You do not need to write a JSON body manually. ElevenLabs will automatically combine these 4 properties into a JSON body object (e.g., `{"patientName": "...", "phoneNumber": "...", ...}`) when it sends the POST request to your server.*

---

---

## 🌐 Step 4: Local Testing (Creating a Public URL)

Because ElevenLabs is a cloud platform, it needs a public internet URL to reach your local server running on `http://localhost:3000`. 

If you do not have `ngrok` installed globally on your machine, you can run a tunnel instantly using one of these options:

### Option A: Use LocalTunnel (Free, no account needed)
This is the fastest method because you don't need to sign up or configure any tokens. Run this in a new terminal window:
```bash
npx localtunnel --port 3000
```
This will output a URL like `https://xxxx-xxxx-xxxx.localtunnel.me`. Use this URL as your base webhook URL.

---

### Option B: Use Ngrok via npm
If you prefer ngrok but don't have it installed globally, you can run it via `npx` (which will download and run it automatically):
```bash
npx ngrok http 3000
```
*(Note: Ngrok may require you to sign up for a free account and set an authtoken by running `npx ngrok config add-authtoken <token>` first).*

---

### Next Steps:
1. Copy the public `https://...` URL generated by either **localtunnel** or **ngrok** in the terminal.
2. Go to the ElevenLabs **Tools** page, open your webhook configuration, and paste that URL into the **Webhook URL** field:
   `https://<your-generated-tunnel-domain>/api/webhook/book-appointment`
3. Click **Save** in ElevenLabs to apply your webhook settings.

---

## 📞 Step 5: How to Call and Test Your Agent

Once your agent is configured, you can test it directly inside the ElevenLabs browser dashboard:

1. **Locate the Test Widget**: 
   * Look at the **right-hand side** of your ElevenLabs browser tab (or the bottom-right corner).
   * You will see a panel or a button that says **"Test Agent"** (usually with a microphone/phone icon).
2. **Start the Conversation**:
   * Click the **"Test Agent"** button. A test call panel will slide out.
   * You can choose to **Talk** (click the microphone and speak out loud) or **Type** (click the keyboard icon to send messages as text).
3. **Trigger the Booking**:
   * Say (or type) something like: *"Hello, I would like to book a dental checkup."*
   * The AI receptionist (Clara) will answer and ask for your name, phone number, reason for visit, and preferred date/time.
4. **Watch Your Terminal & Browser Dashboard**:
   * Once you provide all 4 details, Clara will notify you that she is checking the system.
   * **Terminal Output**: Look at your terminal window running `npm run dev`. You will see a beautifully formatted, boxed console log showing the incoming request and the confirmation details:
     ```text
     ┌────────────────────────────────────────────────────────┐
     │ 📥 RECEIVED BOOKING REQUEST                            │
     ├────────────────────────────────────────────────────────┤
     │ 👤 Patient:   John Doe                                 │
     │ 📞 Phone:     555-0199                                 │
     │ 📝 Reason:    routine checkup                          │
     │ 📅 DateTime:  05/06/2026:04:00 PM                      │
     └────────────────────────────────────────────────────────┘

     ┌────────────────────────────────────────────────────────┐
     │ ✅ BOOKING CONFIRMED (SIMULATION)                      │
     ├────────────────────────────────────────────────────────┤
     │ 📅 Scheduled: Friday, June 5th 2026 4:00 PM            │
     └────────────────────────────────────────────────────────┘
     ```
   * **Browser Dashboard**: Open `http://localhost:3000` (or your public ngrok/localtunnel URL) in your browser. You will see the **Pearl Dental Receptionist Hub**. Under **Confirmed Appointments**, the new booking card will appear automatically within 3 seconds without a page refresh!
   * If the requested time is outside business hours (Mon-Fri, 9am - 5pm) or overlaps with an existing booking, the server will reject it, display the reason in the terminal/dashboard, and Clara will offer alternatives to the customer.

---

## 🔌 API Reference

If you want to build custom extensions or query your bookings:

### 1. `GET /api/appointments`
Returns a list of all confirmed appointments sorted by start date.
*   **Response JSON**:
    ```json
    {
      "status": "success",
      "mode": "simulation", // or "live"
      "appointments": [
        {
          "id": "sim_1717498420000",
          "patientName": "John Doe",
          "start": "2026-06-05T16:00:00.000Z",
          "end": "2026-06-05T16:30:00.000Z",
          "description": "Phone: 555-0199 | Reason: routine checkup",
          "source": "simulated" // or "google"
        }
      ]
    }
    ```

### 2. `POST /api/webhook/book-appointment`
The endpoint called by ElevenLabs to schedule appointments.
*   **Headers**: `Content-Type: application/json`
*   **Body Parameters**:
    *   `patientName` (string, required)
    *   `phoneNumber` (string, required)
    *   `reasonForVisit` (string, required)
    *   `dateTime` (string, required - format: `DD/MM/YYYY:hh:mm AM/PM`)

