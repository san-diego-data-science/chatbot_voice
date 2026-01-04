# Project Request: Gemini Live Voice Assistant for Lead Capture

## Objective
Create a **voice-only** AI assistant using **TypeScript (Node.js)** and the **Gemini Live API**. The bot's purpose is to engage users in natural conversation to collect lead information and submit it to a specific Google Form.

## Target Google Form
- **URL**: [https://docs.google.com/forms/d/e/1FAIpQLSeMLg8CT19TR38gzNso1kf5SnPOitt1-XTSC262addWlBnytQ/viewform?usp=dialog](https://docs.google.com/forms/d/e/1FAIpQLSeMLg8CT19TR38gzNso1kf5SnPOitt1-XTSC262addWlBnytQ/viewform?usp=dialog)

## Functional Requirements

### 1. Voice Interface (Gemini Live API)
- **Voice-Only Interaction**: The app should not have a text chat interface. All interaction must happen via audio.
- **Real-Time**: Utilize the Gemini Multimodal Live API for low-latency, bidirectional voice communication.
- **Session Control**: The interaction continues until the user explicitly deactivates it via the UI or asks the bot to stop.

### 2. Intelligent Form Handling
- **Dynamic Field Extraction**: The application must fetch the Google Form HTML and programmatically parse it to discover:
  - Required fields.
  - Field names and their corresponding `entry.<id>` identifiers.
  - **Constraint**: Do NOT hardcode the `entry.<id>` values; they must be derived dynamically.
- **Submission**: Once data is collected and confirmed, the backend should POST the data to the form's `formResponse` endpoint.

### 3. Conversation Logic
- **Data Collection**: The bot should conversationally ask for missing required fields one by one.
- **Validation**: Perform basic validation (e.g., email format) during the conversation.
- **Confirmation**: Before submitting, the bot must verbally summarize the collected information and ask for user confirmation.

### 4. User Interface (Mobile-First)
- **Device Support**: The web interface must be fully responsive and optimized for mobile devices.
- **Minimalist Design**:
  - The UI should feature a **single large interaction button** (e.g., a microphone icon).
  - **Function**: Tap to start conversation; tap to stop.
  - **Visual Feedback**: visual indicator for "Listening/Active" vs "Inactive" states.

## Technical Constraints & Setup
- **Environment Variables**: Securely manage credentials. Read `GOOGLE_AI_STUDIO_API_KEY` from a `.env` file. Never expose keys to the client/browser.
- **Backend**: Node.js serving the API and handling the Gemini connection.
- **Frontend**: Minimal HTML/JS (or a lightweight framework if preferred, but keep it simple).

## Testing & Quality Assurance
- **Unit Tests**: Implement tests (using Vitest or Jest) for:
  - Form parsing and field extraction.
  - Input validation logic.
  - Conversation state management.
- **Test Mode**: Include a configuration flag that disables actual HTTP submission to Google Forms and instead logs the submission payload to the console for debugging.

## Deliverables
1. Complete source code.
2. `npm` scripts: `npm run dev`, `npm start`, `npm test`.
3. A `README.md` (this document) containing setup and usage instructions.
