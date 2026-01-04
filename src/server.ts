import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import { GoogleFormHandler } from './form.js';
import http from 'http';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeMLg8CT19TR38gzNso1kf5SnPOitt1-XTSC262addWlBnytQ/viewform?usp=dialog';

if (!API_KEY) {
    console.error('GOOGLE_AI_STUDIO_API_KEY is not set in .env');
    process.exit(1);
}

const formHandler = new GoogleFormHandler(FORM_URL);
let cachedFields: any[] = [];
let systemInstruction = '';

// Initialize form data
async function init() {
    console.log('Fetching form fields...');
    try {
        cachedFields = await formHandler.fetchForm();
        console.log('Form fields detected:', cachedFields);

        const fieldDescriptions = cachedFields.map(f =>
            `- ${f.label} (ID: ${f.id}, Required: ${f.required}, Type: ${f.type})`
        ).join('\n');

        systemInstruction = `
You are a helpful voice assistant designed to collect information for a specific form.
Your goal is to conversationally collect the following pieces of information from the user:

${fieldDescriptions}

Procedure:
1.  Greet the user warmly.
2.  Ask for the required information one piece at a time. Do not overwhelm the user.
3.  If a user provides information, validate it simply (e.g., if it sounds like an email).
4.  Once all required information is collected, summarize it back to the user to confirm.
5.  If confirmed, output a tool call or a specific JSON structure indicating "SUBMIT" with the collected data mapping the Field IDs to the values.
    Actually, for this voice interface, you will facilitate the conversation. 
    When ready to submit, use the "submit_form" tool function.

Important:
- Be concise. Voice interactions should be short and natural.
- If the user asks to stop, say goodbye.
- Speak as if you are a friendly human agent.
`.trim();

    } catch (e) {
        console.error('Failed to init form:', e);
    }
}

// Serve static files
app.use(express.static(path.join(process.cwd(), 'src/public')));
app.use(express.json());

// API to check health or manually trigger things if needed
app.get('/api/health', (req, res) => res.send('OK'));

// API for the frontend to get the tool definition if we were doing client-side tools, 
// but we are doing server-side proxying.

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');

    // Connect to Gemini Live API
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

    const geminiWs = new WebSocket(geminiUrl);

    geminiWs.on('open', () => {
        console.log('Connected to Gemini');

        // Send initial setup message with config
        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp", // or relevant model supporting audio
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: "Puck"
                            }
                        }
                    }
                },
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                },
                tools: [
                    {
                        function_declarations: [
                            {
                                name: "submit_form",
                                description: "Submits the collected form data.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        data: {
                                            type: "OBJECT",
                                            description: "Key-value pairs where keys are the field IDs (e.g., entry.12345) and values are the user's answers.",
                                            additionalProperties: { type: "STRING" }
                                        }
                                    },
                                    required: ["data"]
                                }
                            }
                        ]
                    }
                ]
            }
        };
        geminiWs.send(JSON.stringify(setupMessage));
    });

    geminiWs.on('message', async (data: any) => {
        try {
            const msg = JSON.parse(data.toString());

            // Handle server-side tool calls
            if (msg.toolCall) {
                // Function calls come here
                const functionCalls = msg.toolCall.functionCalls;
                if (functionCalls) {
                    for (const call of functionCalls) {
                        if (call.name === 'submit_form') {
                            const args = call.args;
                            console.log('Submitting form with data:', args.data);
                            try {
                                await formHandler.submit(args.data);
                                // Send tool response back to Gemini
                                const response = {
                                    toolResponse: {
                                        functionResponses: [
                                            {
                                                id: call.id,
                                                response: { result: { success: true, message: "Form submitted successfully" } }
                                            }
                                        ]
                                    }
                                };
                                geminiWs.send(JSON.stringify(response));

                                // Explicitly tell Gemini to say something if needed, or it might just continue
                                const content = {
                                    client_content: {
                                        turns: [
                                            {
                                                role: "user",
                                                parts: [{ text: "The form has been submitted successfully. You can thank the user and end the conversation." }]
                                            }
                                        ],
                                        turn_complete: true
                                    }
                                };
                                geminiWs.send(JSON.stringify(content));

                            } catch (err: any) {
                                const response = {
                                    toolResponse: {
                                        functionResponses: [
                                            {
                                                id: call.id,
                                                response: { result: { success: false, error: err.message } }
                                            }
                                        ]
                                    }
                                };
                                geminiWs.send(JSON.stringify(response));
                            }
                        }
                    }
                }
            }

            // Forward raw data to client (audio, etc.)
            // Note: The client expects the raw binary or JSON structure. 
            // For simplicity in proxying, we often just pass the raw message if it's text, 
            // or binary if it's binary.
            // But `data` here from 'ws' 'message' event is likely Buffer or ArrayBuffer.

            ws.send(data);

        } catch (e) {
            // If it's not JSON, it might be binary audio data from Gemini to Client? 
            // Actually Gemini Bidi API sends JSONs with base64 encoded audio usually, or binary frames.
            // We should verify the protocol.
            // For now, simple pass-through is risky if we need to intercept tool calls which are JSON.
            // The parsing above `JSON.parse` handles the JSON messages.
            // If it throws, it means it's binary, which we should just forward.

            ws.send(data);
        }
    });

    geminiWs.on('error', (err) => {
        console.error('Gemini WS error:', err);
    });

    geminiWs.on('close', () => {
        console.log('Gemini WS closed');
        ws.close();
    });

    // Handle messages from the client (browser)
    ws.on('message', (message) => {
        // The client will send:
        // 1. Initial setup? No, we did that.
        // 2. Audio chunks (RealtimeInput).
        // 3. Text/other events.

        // We forward everything to Gemini.
        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(message);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        geminiWs.close();
    });
});

init().then(() => {
    server.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
});
