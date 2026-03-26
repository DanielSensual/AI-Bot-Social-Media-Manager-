#!/usr/bin/env node
/**
 * Subtitle Burner — Burns kinetic text into video using ffmpeg drawtext
 *
 * Takes a video and a script string, splits into timed word chunks,
 * and overlays them as clean, readable subtitles.
 *
 * Usage:
 *   import { burnSubtitles } from '../src/subtitle-burner.js';
 *   const burnedPath = await burnSubtitles(videoPath, scriptText);
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Get video duration in seconds using ffprobe.
 */
async function getVideoDuration(videoPath) {
    const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        videoPath,
    ]);
    return parseFloat(stdout.trim()) || 8;
}

/**
 * Split text into timed subtitle chunks.
 *
 * @param {string} text — full script
 * @param {number} duration — video duration in seconds
 * @param {number} wordsPerChunk — words per subtitle card
 * @returns {{ text: string, start: number, end: number }[]}
 */
function splitIntoChunks(text, duration, wordsPerChunk = 4) {
    const words = text.replace(/[""]/g, '"').split(/\s+/).filter(Boolean);
    const chunks = [];

    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }

    if (chunks.length === 0) return [];

    // Leave 0.3s padding at start and end
    const padStart = 0.3;
    const padEnd = 0.5;
    const usable = duration - padStart - padEnd;
    const chunkDuration = usable / chunks.length;

    return chunks.map((text, i) => ({
        text: text.replace(/'/g, "'\\''"),  // escape for ffmpeg
        start: padStart + i * chunkDuration,
        end: padStart + (i + 1) * chunkDuration,
    }));
}

/**
 * Build the ffmpeg drawtext filter string for all subtitle chunks.
 *
 * Style: white text, black outline, bold, bottom-center, with fade in/out.
 */
function buildDrawtextFilter(chunks, options = {}) {
    const {
        fontSize = 46,
        fontColor = 'white',
        borderW = 3,
        shadowColor = 'black@0.6',
        shadowX = 2,
        shadowY = 2,
        yPosition = 'h-th-100',
        font = '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    } = options;

    // Check if the font file exists, fallback to a generic one
    const fontPath = fs.existsSync(font) ? font : 'Arial';
    const useFile = fs.existsSync(font);

    const filters = chunks.map(chunk => {
        const escaped = chunk.text
            .replace(/\\/g, '\\\\')
            .replace(/:/g, '\\:')
            .replace(/'/g, "'\\\\\\''");

        const fontSpec = useFile ? `fontfile='${fontPath}'` : `font='${fontPath}'`;

        return [
            `drawtext=`,
            `${fontSpec}:`,
            `text='${escaped}':`,
            `fontsize=${fontSize}:`,
            `fontcolor=${fontColor}:`,
            `borderw=${borderW}:`,
            `bordercolor=black:`,
            `shadowcolor=${shadowColor}:`,
            `shadowx=${shadowX}:shadowy=${shadowY}:`,
            `x=(w-tw)/2:`,
            `y=${yPosition}:`,
            `enable='between(t,${chunk.start.toFixed(2)},${chunk.end.toFixed(2)})'`,
        ].join('');
    });

    return filters.join(',');
}

/**
 * Burns subtitles onto a video file.
 *
 * @param {string} videoPath — input video
 * @param {string} scriptText — text to overlay
 * @param {object} options
 * @returns {string} — path to subtitled video
 */
export async function burnSubtitles(videoPath, scriptText, options = {}) {
    if (!videoPath || !fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
    }
    if (!scriptText || scriptText.trim().length === 0) {
        console.log('⚠️ No script text provided — skipping subtitle burn');
        return videoPath;
    }

    const {
        wordsPerChunk = 4,
        fontSize = 46,
        style = 'kinetic',
    } = options;

    const duration = await getVideoDuration(videoPath);

    console.log(`📝 Burning subtitles: ${scriptText.split(/\s+/).length} words over ${duration.toFixed(1)}s`);

    const chunks = splitIntoChunks(scriptText, duration, wordsPerChunk);
    if (chunks.length === 0) return videoPath;

    console.log(`   ${chunks.length} subtitle cards (${wordsPerChunk} words each)`);

    const filter = buildDrawtextFilter(chunks, { fontSize });

    const ext = path.extname(videoPath);
    const outputPath = videoPath.replace(ext, `-subtitled${ext}`);

    const ffmpegArgs = [
        '-y',
        '-i', videoPath,
        '-vf', filter,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        outputPath,
    ];

    try {
        await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 20 * 1024 * 1024 });
    } catch (error) {
        const stderr = error?.stderr
            ? String(error.stderr).split('\n').slice(-5).join(' ')
            : error.message;
        console.error(`❌ Subtitle burn failed: ${stderr}`);
        // Return original video rather than crashing the pipeline
        return videoPath;
    }

    if (!fs.existsSync(outputPath)) {
        console.error('❌ ffmpeg did not produce subtitled output — using original');
        return videoPath;
    }

    const origSize = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
    const newSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`✅ Subtitles burned: ${origSize}MB → ${newSize}MB`);

    return outputPath;
}

export default { burnSubtitles };
