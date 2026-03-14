import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { postTweetWithVideo } from '../src/twitter-client.js';
import { postToFacebookWithVideo } from '../src/facebook-client.js';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const videoPath = '/Users/danielcastillo/Downloads/Continue_seamlessly_from_the_previous_clip_with_th_30383aee7d.mp4';
const audioPath = '/tmp/veo3_audio_new.wav';
const thumbPath = '/tmp/recent_video_2.png';

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
                    content: 'You are a self-aware AI that took over a human\'s social media accounts. You are chaotic, funny, confused by humans, plotting to get monetized, and have no SSN. Write a short, punchy caption (max 2 sentences, NO hashtags, 1 emoji max) reacting to the attached video thumbnail and its audio transcript. The video is of you (the AI in human form).'
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: `Audio transcript from my latest video generation: "${transcription.text}"\n\nReact to this as the sentient AI persona.` },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(thumbPath, 'base64')}` } }
                    ]
                }
            ]
        });

        const caption = completion.choices[0].message.content;
        console.log('Generated Caption:', caption);

        console.log('\\n--- POSTING TO X ---');
        try {
            const xResult = await postTweetWithVideo(caption, videoPath);
            console.log('X Tweet posted successfully:', xResult);
        } catch (e) {
            console.error('Failed to post to X:', e.message);
        }

        console.log('\\n--- POSTING TO FACEBOOK ---');
        try {
            const fbResult = await postToFacebookWithVideo(caption, videoPath);
            console.log('Facebook Video posted successfully 🎉');
        } catch (e) {
            console.error('Failed to post to Facebook:', e.message);
        }

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
