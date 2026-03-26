#!/usr/bin/env python3
"""
Ghost Reel Factory — Colab T4 Batch Generator + 1080p Upscaler

Runs on Google Colab T4 GPU. Generates 3 days of Ghost AI Instagram Reels
at 720p via Grok API, upscales to 1080p with Real-ESRGAN, saves to Google Drive.

Usage (in Colab):
    !python ghost-reel-factory.py --days 3 --per-day 2

Environment Variables (set in Colab secrets or notebook):
    XAI_API_KEY          - Grok API key
    GHOST_REFERENCE_URL  - URL to Ghost character reference image (optional)
"""

import os
import sys
import json
import time
import argparse
import subprocess
import shutil
from pathlib import Path
from datetime import datetime, timedelta

# ── Config ────────────────────────────────────────────────────────────────────

XAI_API_KEY = os.environ.get('XAI_API_KEY', '')
XAI_BASE_URL = 'https://api.x.ai/v1'
GHOST_REFERENCE_URL = os.environ.get('GHOST_REFERENCE_URL', '')

DRIVE_QUEUE_DIR = '/content/drive/MyDrive/GhostAI-Reels/queue'
DRIVE_POSTED_DIR = '/content/drive/MyDrive/GhostAI-Reels/posted'
WORK_DIR = '/content/ghost-factory'
FRAMES_DIR = os.path.join(WORK_DIR, 'frames')
UPSCALED_DIR = os.path.join(WORK_DIR, 'upscaled')

# ── Ghost Character ──────────────────────────────────────────────────────────

GHOST_IDENTITY = (
    'A commanding dark-skinned Black man with a sharp tapered fade and full groomed beard. '
    'He has an athletic build and exudes Marine Corps drill instructor authority mixed with '
    'genuine warmth. Photorealistic, cinematic lighting, 9:16 vertical format.'
)

GHOST_SCENES = [
    f'{GHOST_IDENTITY} He wears a fitted black tactical jacket, standing in a dark luxury studio with holographic AI visualizations floating behind him. He speaks directly to camera with intense energy.',
    f'{GHOST_IDENTITY} He wears a crisp midnight navy henley, sitting in a sleek modern office with multiple monitors showing code and data dashboards. He leans toward the camera.',
    f'{GHOST_IDENTITY} He wears a premium charcoal bomber jacket, standing on a cyberpunk rooftop at golden hour with a city skyline behind him. He addresses the camera with visionary confidence.',
    f'{GHOST_IDENTITY} He wears a fitted black crew-neck tee, in a dark high-tech command center with glowing blue UI elements. He briefs the audience like a tactical commander.',
    f'{GHOST_IDENTITY} He wears a black leather jacket over a dark henley, standing on rain-slicked Orlando streets at night with neon reflections. He speaks with raw veteran energy.',
    f'{GHOST_IDENTITY} He wears a fitted olive field jacket, in a minimalist concrete loft with warm amber lighting and a laptop open. He delivers knowledge like a mentor.',
]

CONTENT_PILLARS = [
    {
        'pillar': 'drill',
        'prompt_theme': 'Ghost delivers a motivational command about learning to code and building AI systems. Marine Corps drill instructor energy — direct orders, zero excuses.',
        'caption_seed': 'Today you can change everything. Open your laptop. Start writing code. Stop trading time for money.',
    },
    {
        'pillar': 'weapons',
        'prompt_theme': 'Ghost delivers a tactical briefing on what AI automation actually does — real numbers, real systems, real results. He shows the weapon.',
        'caption_seed': 'AI voice agents answered 47 calls last night while the business owner slept. This is the new standard.',
    },
    {
        'pillar': 'grit',
        'prompt_theme': 'Ghost shares raw veteran entrepreneurship energy — the 2am deploys, the failures nobody sees, and what is on the other side.',
        'caption_seed': 'No degree. No trust fund. No connections. Just discipline and a laptop and the audacity to believe.',
    },
    {
        'pillar': 'funnel',
        'prompt_theme': 'Ghost recruits the audience into the builder mission — learning to code changes everything, and Ghost AI is building the program.',
        'caption_seed': 'We are building a generation of AI-native builders. Coding is the new literacy. The only question is: are you in?',
    },
    {
        'pillar': 'systems',
        'prompt_theme': 'Ghost explains systems thinking — how automation replaces manual labor and creates freedom. Engineer architect mindset.',
        'caption_seed': 'The difference between hustling and building is systems. One makes you tired. One makes you free.',
    },
]

# ── Utilities ─────────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f'[{ts}] {msg}')


def ensure_dirs():
    for d in [WORK_DIR, FRAMES_DIR, UPSCALED_DIR, DRIVE_QUEUE_DIR, DRIVE_POSTED_DIR]:
        os.makedirs(d, exist_ok=True)


def install_deps():
    """Install Real-ESRGAN and dependencies on Colab."""
    log('📦 Installing dependencies...')
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q',
                    'realesrgan', 'basicsr', 'gfpgan', 'requests'], check=True)
    log('✅ Dependencies installed')


# ── Grok Video API ────────────────────────────────────────────────────────────

def generate_video(prompt, reference_url=None):
    """Generate a 720p 9:16 video via Grok Imagine Video API."""
    import requests

    body = {
        'model': 'grok-imagine-video',
        'prompt': prompt,
        'aspect_ratio': '9:16',
        'resolution': '720p',
        'duration': 8,
    }

    if reference_url:
        body['reference_images'] = [{'url': reference_url}]
        log(f'   👻 Reference image attached for face consistency')

    log(f'   Prompt: "{prompt[:80]}..."')

    # Start generation
    resp = requests.post(
        f'{XAI_BASE_URL}/videos/generations',
        headers={
            'Authorization': f'Bearer {XAI_API_KEY}',
            'Content-Type': 'application/json',
        },
        json=body,
    )
    resp.raise_for_status()
    request_id = resp.json().get('request_id')
    if not request_id:
        raise ValueError('No request_id returned from Grok API')

    log(f'   Request ID: {request_id}')

    # Poll for completion
    start = time.time()
    while time.time() - start < 360:  # 6 min timeout
        time.sleep(5)
        poll = requests.get(
            f'{XAI_BASE_URL}/videos/{request_id}',
            headers={'Authorization': f'Bearer {XAI_API_KEY}'},
        )
        poll.raise_for_status()
        data = poll.json()
        status = data.get('status', 'pending')
        progress = data.get('progress', 0)
        elapsed = int(time.time() - start)

        if status == 'done':
            video_url = data.get('video', {}).get('url')
            duration = data.get('video', {}).get('duration', '?')
            cost_ticks = data.get('usage', {}).get('cost_in_usd_ticks', 0)
            cost_usd = cost_ticks / 10_000_000_000 if cost_ticks else 0
            log(f'   ✅ Done [{elapsed}s] Duration: {duration}s Cost: ${cost_usd:.4f}')

            if not video_url:
                raise ValueError('Video completed but no URL returned')

            # Download
            video_resp = requests.get(video_url)
            video_resp.raise_for_status()
            video_path = os.path.join(WORK_DIR, f'ghost_{request_id}.mp4')
            with open(video_path, 'wb') as f:
                f.write(video_resp.content)
            log(f'   📥 Downloaded: {video_path} ({len(video_resp.content) / 1024 / 1024:.1f}MB)')
            return video_path

        if status in ('failed', 'error'):
            error_msg = data.get('error', {}).get('message', 'Unknown')
            raise RuntimeError(f'Generation failed: {error_msg}')

        print(f'\r   Status: {status} [{progress}%] ({elapsed}s)', end='', flush=True)

    raise TimeoutError('Video generation timed out (6 min)')


# ── Real-ESRGAN Upscale ──────────────────────────────────────────────────────

def upscale_video(input_path, output_path, scale=2):
    """Upscale video from 720p → 1080p+ using Real-ESRGAN frame-by-frame."""
    log(f'🔬 Upscaling: {os.path.basename(input_path)} (x{scale})')

    # Clean working dirs
    for d in [FRAMES_DIR, UPSCALED_DIR]:
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)

    # Extract frames
    log('   Extracting frames...')
    subprocess.run([
        'ffmpeg', '-i', input_path,
        '-qscale:v', '2',
        os.path.join(FRAMES_DIR, '%04d.png'),
    ], check=True, capture_output=True)

    frame_count = len(list(Path(FRAMES_DIR).glob('*.png')))
    log(f'   Extracted {frame_count} frames')

    # Get video FPS
    probe = subprocess.run([
        'ffprobe', '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=r_frame_rate',
        '-of', 'csv=p=0',
        input_path,
    ], capture_output=True, text=True)
    fps_str = probe.stdout.strip()
    if '/' in fps_str:
        num, den = fps_str.split('/')
        fps = round(int(num) / int(den))
    else:
        fps = int(float(fps_str)) if fps_str else 24

    # Upscale with Real-ESRGAN
    log(f'   Upscaling {frame_count} frames with Real-ESRGAN (x{scale})...')
    try:
        from realesrgan import RealESRGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        import torch
        import cv2
        import numpy as np

        # Load model
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                        num_block=23, num_grow_ch=32, scale=scale)

        # Try to download/use the model weights
        model_path = os.path.join(WORK_DIR, f'RealESRGAN_x{scale}plus.pth')
        if not os.path.exists(model_path):
            import requests
            url = f'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x{scale}plus.pth'
            log(f'   Downloading model weights...')
            r = requests.get(url)
            with open(model_path, 'wb') as f:
                f.write(r.content)

        upsampler = RealESRGANer(
            scale=scale,
            model_path=model_path,
            model=model,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=True,  # FP16 for T4 speed
        )

        frames = sorted(Path(FRAMES_DIR).glob('*.png'))
        for i, frame_path in enumerate(frames):
            img = cv2.imread(str(frame_path), cv2.IMREAD_UNCHANGED)
            output, _ = upsampler.enhance(img, outscale=scale)
            out_path = os.path.join(UPSCALED_DIR, frame_path.name)
            cv2.imwrite(out_path, output)
            if (i + 1) % 20 == 0 or i == len(frames) - 1:
                print(f'\r   Upscaled {i + 1}/{len(frames)} frames', end='', flush=True)

        print()  # newline after progress

    except Exception as e:
        log(f'   ⚠️ Real-ESRGAN failed ({e}), falling back to ffmpeg lanczos...')
        subprocess.run([
            'ffmpeg', '-i', os.path.join(FRAMES_DIR, '%04d.png'),
            '-vf', f'scale=-1:1080:flags=lanczos',
            '-qscale:v', '2',
            os.path.join(UPSCALED_DIR, '%04d.png'),
        ], check=True, capture_output=True)

    # Reassemble video
    log('   Reassembling video...')

    # Extract audio from original
    audio_path = os.path.join(WORK_DIR, 'audio.aac')
    subprocess.run([
        'ffmpeg', '-i', input_path,
        '-vn', '-acodec', 'copy',
        audio_path,
    ], capture_output=True)
    has_audio = os.path.exists(audio_path) and os.path.getsize(audio_path) > 0

    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-framerate', str(fps),
        '-i', os.path.join(UPSCALED_DIR, '%04d.png'),
    ]
    if has_audio:
        ffmpeg_cmd += ['-i', audio_path]

    ffmpeg_cmd += [
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
    ]
    if has_audio:
        ffmpeg_cmd += ['-c:a', 'aac', '-b:a', '128k', '-shortest']

    ffmpeg_cmd.append(output_path)
    subprocess.run(ffmpeg_cmd, check=True, capture_output=True)

    # Report size
    input_size = os.path.getsize(input_path) / 1024 / 1024
    output_size = os.path.getsize(output_path) / 1024 / 1024
    log(f'   ✅ Upscaled: {input_size:.1f}MB → {output_size:.1f}MB')

    return output_path


# ── Main Pipeline ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Ghost Reel Factory')
    parser.add_argument('--days', type=int, default=3, help='Number of days to generate for')
    parser.add_argument('--per-day', type=int, default=2, help='Videos per day')
    parser.add_argument('--skip-upscale', action='store_true', help='Skip Real-ESRGAN upscaling')
    parser.add_argument('--dry-run', action='store_true', help='Plan only, no generation')
    args = parser.parse_args()

    total_videos = args.days * args.per_day

    log('═══════════════════════════════════════════════')
    log('👻 GHOST REEL FACTORY — Batch Video Pipeline')
    log(f'   Days: {args.days} | Per day: {args.per_day} | Total: {total_videos}')
    log(f'   Upscale: {"SKIP" if args.skip_upscale else "Real-ESRGAN x2"}')
    log(f'   Reference: {"YES" if GHOST_REFERENCE_URL else "NO"}')
    log('═══════════════════════════════════════════════')

    if not XAI_API_KEY:
        log('❌ XAI_API_KEY not set. Exiting.')
        sys.exit(1)

    ensure_dirs()

    if not args.skip_upscale and not args.dry_run:
        install_deps()

    # Plan the batch
    today = datetime.now()
    batch = []
    pillar_idx = 0

    for day_offset in range(args.days):
        scheduled_date = (today + timedelta(days=day_offset + 1)).strftime('%Y-%m-%d')
        for slot in range(args.per_day):
            pillar = CONTENT_PILLARS[pillar_idx % len(CONTENT_PILLARS)]
            scene = GHOST_SCENES[(pillar_idx + slot) % len(GHOST_SCENES)]
            batch.append({
                'index': len(batch),
                'scheduled_date': scheduled_date,
                'slot': f'post_{slot + 1}',
                'pillar': pillar['pillar'],
                'prompt': f"{scene} {pillar['prompt_theme']}",
                'caption_seed': pillar['caption_seed'],
            })
            pillar_idx += 1

    log(f'\n📋 Batch plan ({len(batch)} videos):')
    for item in batch:
        log(f'   [{item["scheduled_date"]}] {item["slot"]} — {item["pillar"]}')

    if args.dry_run:
        log('\n👁️ DRY RUN — no videos generated')
        return

    # Generate + upscale each video
    results = []
    for item in batch:
        log(f'\n{"═" * 50}')
        log(f'🎬 [{item["index"] + 1}/{len(batch)}] {item["pillar"]} for {item["scheduled_date"]}')

        try:
            # Generate 720p video
            raw_path = generate_video(
                item['prompt'],
                reference_url=GHOST_REFERENCE_URL or None,
            )

            # Upscale to 1080p
            if not args.skip_upscale:
                upscaled_path = os.path.join(WORK_DIR, f'ghost_1080p_{item["index"]}.mp4')
                upscale_video(raw_path, upscaled_path)
                final_path = upscaled_path
            else:
                final_path = raw_path

            # Copy to Google Drive queue
            drive_filename = f'{item["scheduled_date"]}_{item["slot"]}_{item["pillar"]}.mp4'
            drive_path = os.path.join(DRIVE_QUEUE_DIR, drive_filename)
            shutil.copy2(final_path, drive_path)

            # Write metadata
            metadata = {
                'scheduled_date': item['scheduled_date'],
                'slot': item['slot'],
                'pillar': item['pillar'],
                'caption_seed': item['caption_seed'],
                'resolution': '1080p' if not args.skip_upscale else '720p',
                'generated_at': datetime.now().isoformat(),
                'filename': drive_filename,
            }
            meta_path = drive_path.replace('.mp4', '.json')
            with open(meta_path, 'w') as f:
                json.dump(metadata, f, indent=2)

            log(f'   📁 Saved to Drive: {drive_filename}')
            results.append({'file': drive_filename, 'status': 'ok'})

        except Exception as e:
            log(f'   ❌ FAILED: {e}')
            results.append({'file': f'batch_{item["index"]}', 'status': f'error: {e}'})

    # Summary
    log(f'\n{"═" * 50}')
    ok = sum(1 for r in results if r['status'] == 'ok')
    log(f'✅ Complete: {ok}/{len(batch)} videos generated and saved to Drive')
    for r in results:
        emoji = '✅' if r['status'] == 'ok' else '❌'
        log(f'   {emoji} {r["file"]}: {r["status"]}')


if __name__ == '__main__':
    main()
