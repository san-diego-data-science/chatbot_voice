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
4.  Once all required information is collected, clearly summarize the data you have collected.
5.  Explicitly ask: "Is this correct? Do you want me to submit?"
6.  WAIT for the user to say "Yes", "Correct", or "Submit".
7.  ONLY IF the user gives explicit confirmation, then use the "submit_form" tool.
8.  If the user says "No" or wants to change something, loop back to update the specific field and ask for confirmation again.
    DO NOT call "submit_form" until you have received a clear "Yes" after your summary.

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
                model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: "Zephyr"
                            }
                        }
                    }
                },
                context_window_compression: { // Added to match snippet logic (snake_case for raw JSON)
                    trigger_tokens: 25600,
                    sliding_window: { target_tokens: 12800 }
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
                                            description: "Key-value pairs where keys are the field IDs (e.g., entry.12345) and values are the user's answers."
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
        if (Buffer.isBuffer(data)) {
            // It's likely binary audio data or a binary frame
            ws.send(data);
            return;
        }

        try {
            const strData = data.toString();
            // Try to parse as JSON first
            const msg = JSON.parse(strData);

            // Handle server-side tool calls
            // Note: serverContent is the new structure, but older 'toolCall' might be used depending on API version
            // For BidiGenerateContent, toolCall is standard.

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

            // Always forward to client, even if we processed a tool call (Gemini might send audio with it or separately)
            ws.send(data);

        } catch (e) {
            // Not JSON, just forward raw
            ws.send(data);
        }
    });

    geminiWs.on('error', (err) => {
        console.error('Gemini WS error:', err);
    });

    geminiWs.on('close', (code, reason) => {
        console.log(`Gemini WS closed with code ${code} and reason: ${reason?.toString()}`);
        ws.close();
    });

    // Handle messages from the client (browser)
    ws.on('message', (message) => {
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
