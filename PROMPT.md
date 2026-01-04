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

### 2. Form Handling
- **Hardcoded Configuration**: Field definitions (IDs, names, required status) should be configured manually in the application code, not parsed dynamically.
- **One-time Inspection**: The developer (you) should inspect the form once to get the `entry.<id>` values.
- **Submission**: POST the collected data to the form's `formResponse` endpoint.

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

## Gemini Live API Reference Snippet

Use the following configuration and code structure for the Gemini Live API integration:

```typescript
// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node
import {
  GoogleGenAI,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from '@google/genai';
import mime from 'mime';
import { writeFile } from 'fs';
const responseQueue: LiveServerMessage[] = [];
let session: Session | undefined = undefined;

async function handleTurn(): Promise<LiveServerMessage[]> {
  const turn: LiveServerMessage[] = [];
  let done = false;
  while (!done) {
    const message = await waitMessage();
    turn.push(message);
    if (message.serverContent && message.serverContent.turnComplete) {
      done = true;
    }
  }
  return turn;
}

async function waitMessage(): Promise<LiveServerMessage> {
  let done = false;
  let message: LiveServerMessage | undefined = undefined;
  while (!done) {
    message = responseQueue.shift();
    if (message) {
      handleModelTurn(message);
      done = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return message!;
}

const audioParts: string[] = [];
function handleModelTurn(message: LiveServerMessage) {
  if(message.serverContent?.modelTurn?.parts) {
    const part = message.serverContent?.modelTurn?.parts?.[0];

    if(part?.fileData) {
      console.log(`File: ${part?.fileData.fileUri}`);
    }

    if (part?.inlineData) {
      const fileName = 'audio.wav';
      const inlineData = part?.inlineData;

      audioParts.push(inlineData?.data ?? '');

      const buffer = convertToWav(audioParts, inlineData.mimeType ?? '');
      saveBinaryFile(fileName, buffer);
    }

    if(part?.text) {
      console.log(part?.text);
    }
  }
}

function saveBinaryFile(fileName: string, content: Buffer) {
  writeFile(fileName, content, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing file ${fileName}:`, err);
      return;
    }
    console.log(`Appending stream content to file ${fileName}.`);
  });
}

interface WavConversionOptions {
  numChannels : number,
  sampleRate: number,
  bitsPerSample: number
}

function convertToWav(rawData: string[], mimeType: string) {
  const options = parseMimeType(mimeType);
  const dataLength = rawData.reduce((a, b) => a + b.length, 0);
  const wavHeader = createWavHeader(dataLength, options);
  const buffer = Buffer.concat(rawData.map(data => Buffer.from(data, 'base64')));

  return Buffer.concat([wavHeader, buffer]);
}

function parseMimeType(mimeType : string) {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');

  const options : Partial<WavConversionOptions> = {
    numChannels: 1,
    bitsPerSample: 16,
  };

  if (format && format.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') {
      options.sampleRate = parseInt(value, 10);
    }
  }

  return options as WavConversionOptions;
}

function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const {
    numChannels,
    sampleRate,
    bitsPerSample,
  } = options;

  // http://soundfile.sapp.org/doc/WaveFormat

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);                      // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
  buffer.write('WAVE', 8);                      // Format
  buffer.write('fmt ', 12);                     // Subchunk1ID
  buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);        // NumChannels
  buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
  buffer.writeUInt32LE(byteRate, 28);           // ByteRate
  buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
  buffer.write('data', 36);                     // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

  return buffer;
}

async function main() {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const model = 'models/gemini-2.5-flash-native-audio-preview-12-2025'

  const config = {
    responseModalities: [
        Modality.AUDIO,
    ],
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Zephyr',
        }
      }
    },
    contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' },
    },
  };

  session = await ai.live.connect({
    model,
    callbacks: {
      onopen: function () {
        console.debug('Opened');
      },
      onmessage: function (message: LiveServerMessage) {
        responseQueue.push(message);
      },
      onerror: function (e: ErrorEvent) {
        console.debug('Error:', e.message);
      },
      onclose: function (e: CloseEvent) {
        console.debug('Close:', e.reason);
      },
    },
    config
  });

  session.sendClientContent({
    turns: [
      `INSERT_INPUT_HERE`
    ]
  });

  await handleTurn();

  session.close();
}
main();
```
