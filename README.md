# Gemini Voice Assistant

A voice-only AI assistant that builds a conversation to collect lead information and submits it to a Google Form using the **Gemini Multimodal Live API**.

## Features

*   **Voice Interface**: Real-time, low-latency voice interaction via Gemini (WebSocket proxy).
*   **Form Handling**: Pre-configured field mapping to specific Google Form entries.
*   **Mobile-First UI**: Minimalist design with a single "pus-to-talk" style interaction (tap start/stop).
*   **Secure**: API keys are kept server-side.

## Prerequisites

*   Node.js v18+
*   A Google AI Studio API Key with access to Gemini 2.0 Flash / Pro (Experimental).

## Setup

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory:
    ```bash
    GOOGLE_AI_STUDIO_API_KEY=your_api_key_here
    # Optional: PORT=3000
    ```

## Usage

### Development

Run the server with TypeScript execution (using `ts-node`):

```bash
npm run dev
```

Open `http://localhost:3000` on your device (or use a tunnel like ngrok for mobile testing).

### Production

Build the project and run the optimized server:

```bash
npm run build
npm start
```

### Testing

Run unit tests:

```bash
npm test
```

## Architecture

*   **Frontend**: Plain HTML/JS + CSS. Captures microphone audio (PCM), downsamples if necessary, and streams via WebSocket to the backend. Plays back received PCM audio chunks.
*   **Backend**: Node.js + Express + WebSocket (`ws`).
    *   **Proxy**: Forwards audio/text bi-directionally between the client and Google's Gemini Live API.
    *   **Form Handler**: Fetches the targeted Google Form, extracts questions/entries, and instructs the model on what to ask.
    *   **Tools**: Exposes a `submit_form` tool to the Gemini model, which the backend executes to POST data to Google Forms.

## Configuration

To change the target Google Form, modify the `FORM_URL` constant in `src/server.ts`.
