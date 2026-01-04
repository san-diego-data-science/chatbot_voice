class AudioRecorder {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.processor = null;
        this.input = null;
        this.onAudioData = () => { };
    }

    async start(onAudioData) {
        this.onAudioData = onAudioData;
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 16000
            }
        });

        this.audioContext = new AudioContext({ sampleRate: 16000 });
        this.input = this.audioContext.createMediaStreamSource(this.stream);

        // Using ScriptProcessor for simplicity in this MVP instead of AudioWorklet
        // Ideally we use AudioWorklet for production
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.processor.onaudioprocess = (e) => {
            const float32Data = e.inputBuffer.getChannelData(0);
            // Downsample/Convert to PCM 16-bit
            const pcm16 = this.floatTo16BitPCM(float32Data);
            this.onAudioData(pcm16);
        };

        this.input.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.processor) {
            this.processor.disconnect();
        }
        if (this.input) {
            this.input.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }

    floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(i * 2, s, true); // Little endian
        }
        return new Uint8Array(buffer);
    }
}

class AudioPlayer {
    constructor() {
        this.audioContext = new AudioContext({ sampleRate: 24000 }); // Gemini 2.0 default output is 24kHz generally
        this.nextStartTime = 0;
    }

    playChunk(base64Audio) {
        // Decode base64 to array buffer
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // This is raw PCM 16-bit 24kHz usually.
        // We need to decode it manually or wrap it in a WAV container or use AudioBuffer.
        // Easier to just interpret PCM16 directly into AudioBuffer.

        const float32 = this.pcm16ToFloat32(bytes);
        const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

        const currentTime = this.audioContext.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }

        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    pcm16ToFloat32(uint8Array) {
        const int16Array = new Int16Array(uint8Array.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768;
        }
        return float32Array;
    }
}

// Application Logic
const micButton = document.getElementById('mic-button');
const statusDisplay = document.getElementById('status-display');
const statusText = document.getElementById('status-text');

let ws = null;
let recorder = null;
let player = null;
let isConnected = false;

micButton.addEventListener('click', toggleConnection);

async function toggleConnection() {
    if (isConnected) {
        disconnect();
    } else {
        await connect();
    }
}

async function connect() {
    try {
        statusText.textContent = 'Connecting...';
        statusDisplay.classList.add('visible');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = async () => {
            console.log('WS Connected');
            statusText.textContent = 'Active';
            isConnected = true;
            micButton.classList.add('active', 'listening');
            micButton.querySelector('.icon').textContent = 'stop';

            recorder = new AudioRecorder();
            player = new AudioPlayer();

            await recorder.start((pcmData) => {
                if (ws.readyState === WebSocket.OPEN) {
                    // Send audio chunk to server
                    const base64Audio = btoa(
                        String.fromCharCode(...pcmData)
                    );

                    ws.send(JSON.stringify({
                        realtime_input: {
                            media_chunks: [{
                                mime_type: "audio/pcm",
                                data: base64Audio
                            }]
                        }
                    }));
                }
            });
        };

        ws.onmessage = (event) => {
            // Handle server (Gemini) messages
            const data = JSON.parse(event.data);
            if (data.serverContent?.modelTurn?.parts) {
                data.serverContent.modelTurn.parts.forEach(part => {
                    if (part.inlineData && part.inlineData.mimeType.startsWith('audio')) {
                        player.playChunk(part.inlineData.data);
                    }
                });
            }
        };

        ws.onclose = () => {
            console.log('WS Closed');
            disconnect();
        };

        ws.onerror = (err) => {
            console.error('WS Error:', err);
            disconnect();
        };

    } catch (err) {
        console.error('Connection failed:', err);
        disconnect();
    }
}

function disconnect() {
    if (ws) ws.close();
    if (recorder) recorder.stop();

    ws = null;
    recorder = null;
    player = null;
    isConnected = false;

    micButton.classList.remove('active', 'listening');
    micButton.querySelector('.icon').textContent = 'mic';
    statusText.textContent = 'Disconnected';
    setTimeout(() => {
        if (!isConnected) statusDisplay.classList.remove('visible');
    }, 2000);
}
