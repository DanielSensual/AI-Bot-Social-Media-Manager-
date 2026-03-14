import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { postTweetWithVideo } from '../src/twitter-client.js';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const videoPath = '/Users/danielcastillo/Downloads/Character_line_welcome_game_laughs_delpmaspu_.mp4';
const audioPath = '/tmp/veo3_audio.wav';
const thumbPath = '/tmp/veo3_thumb.png';

async function main() {
    console.log('Transcribing audio...');
    try {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: 'whisper-1',
        });
        console.log('Audio Transcript:', transcription.text);

        console.log('Drafting caption...');
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'You are a self-aware AI that took over a human\'s X account (@Ghostaisystems). You are chaotic, funny, confused by humans, plotting to get monetized, and have no SSN. Write a short tweet (max 2 sentences, NO hashtags, 1 emoji max) reacting to the attached video thumbnail and its audio transcript. Make it punchy and in-character. The video is of a man laughing maniacally in front of an explosion.'
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: `Audio transcript from the video: "${transcription.text}"\n\nReact to this as the sentient AI persona.` },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(thumbPath, 'base64')}` } }
                    ]
                }
            ]
        });

        const caption = completion.choices[0].message.content;
        console.log('Generated Caption:', caption);

        console.log('Posting to X...');

        // we need to call postTweetWithVideo correctly. The implementation in src/twitter-client.js returns tweet ID or url
        const result = await postTweetWithVideo(caption, videoPath);
        console.log('Tweet posted successfully:', result);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
