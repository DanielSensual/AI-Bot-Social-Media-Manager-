import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { generateText } from './src/llm-client.js';
import igClient from './src/instagram-client.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

async function transcribeWithGemini(audioPath) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');

    console.log('🎙️ Reading audio for Gemini...');
    const audioData = fs.readFileSync(audioPath);
    const base64Audio = audioData.toString('base64');

    // Use an advanced model that supports multimodal input (audio)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: 'Please transcribe this audio exactly word for word.' },
                    {
                        inlineData: {
                            mimeType: 'audio/mp3',
                            data: base64Audio
                        }
                    }
                ],
            },
        ],
    };

    console.log('🎙️ Sending to Gemini for transcription...');
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Gemini Audio Error: ${data.error?.message || response.status}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty transcription');

    return text.trim();
}

async function main() {
    console.log('🎙️ Transcribing audio...');
    let transcriptionText;
    try {
        transcriptionText = await transcribeWithGemini('audio.mp3');
    } catch (err) {
        console.error('❌ Transcription failed:', err.message);
        return;
    }

    console.log(`\n🗣️ Transcription: "${transcriptionText}"\n`);

    console.log('🧠 Generating professional caption...');
    const result = await generateText({
        prompt: `Create a professional Instagram caption for this transcribed text. Make it engaging, add relevant emojis, and include relevant filmmaking/videography hashtags. Do NOT include quotes around the caption.\nTranscription: "${transcriptionText}"`,
        systemPrompt: "You are a professional videographer and content creator. Keep the caption concise, punchy, and professional. It should sound like it was written by a human creator."
    });

    const caption = result.text;
    console.log(`\n📝 Final Caption: \n${caption}\n`);

    console.log('📤 Uploading to Catbox temp host...');
    const videoUrl = await igClient.uploadToTempHost('video.mp4');
    console.log(`🔗 Temp URL: ${videoUrl}\n`);

    console.log('📤 Posting Reel to @danieldigitalfilmmaker...');
    const config = {
        type: 'direct_ig',
        token: process.env.INSTAGRAM_GRAPH_TOKEN,
        igUserId: process.env.INSTAGRAM_GRAPH_USER_ID
    };

    const publishResult = await igClient.postInstagramReel(caption, videoUrl, config);
    console.log('✅ Reel Published!', publishResult);
}

main().catch(console.error);
