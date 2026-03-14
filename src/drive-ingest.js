/**
 * Google Drive (local sync) media ingestion helpers for Instagram autopilot.
 *
 * Expected folder contract:
 *   IG_DRIVE_ROOT/
 *     reels/inbox/*.mp4
 *     reels/posted/
 *     stories/inbox/*.(mp4|mov|jpg|png|webp)
 *     stories/posted/
 *
 * Optional caption sidecars:
 *   - <media-file>.txt
 *   - <same-name-without-extension>.txt
 */

import fs from 'fs';
import path from 'path';

const KIND_CONFIG = {
    reel: {
        folder: 'reels',
        mediaType: 'video',
        extensions: new Set(['.mp4', '.mov', '.m4v']),
    },
    story: {
        folder: 'stories',
        mediaType: 'mixed',
        extensions: new Set(['.mp4', '.mov', '.m4v', '.jpg', '.jpeg', '.png', '.webp']),
    },
};

function validateKind(kind) {
    if (!KIND_CONFIG[kind]) {
        throw new Error(`Unsupported drive asset kind: ${kind}`);
    }
}

function moveFileSafe(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    try {
        fs.renameSync(source, destination);
    } catch (error) {
        if (error?.code !== 'EXDEV') throw error;
        fs.copyFileSync(source, destination);
        fs.unlinkSync(source);
    }
}

function getCaptionCandidates(filePath) {
    const parsed = path.parse(filePath);
    return [
        `${filePath}.txt`,
        path.join(parsed.dir, `${parsed.name}.txt`),
    ];
}

function readCaptionSidecar(filePath) {
    const candidates = getCaptionCandidates(filePath);
    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        const text = fs.readFileSync(candidate, 'utf-8').trim();
        if (text) return { text, path: candidate };
    }
    return { text: '', path: null };
}

export function getDriveRoot(rootOverride = null) {
    const value = String(rootOverride ?? process.env.IG_DRIVE_ROOT ?? '').trim();
    if (!value) return null;
    return path.resolve(value);
}

export function getDriveRootStatus(rootOverride = null) {
    const root = getDriveRoot(rootOverride);
    if (!root) {
        return {
            configured: false,
            root: null,
            exists: false,
        };
    }
    return {
        configured: true,
        root,
        exists: fs.existsSync(root),
    };
}

export function getDriveQueueDir(kind, rootOverride = null) {
    validateKind(kind);

    const root = getDriveRoot(rootOverride);
    if (!root) return null;

    return path.join(root, KIND_CONFIG[kind].folder, 'inbox');
}

export function pickNextDriveAsset(kind, rootOverride = null) {
    validateKind(kind);

    const queueDir = getDriveQueueDir(kind, rootOverride);
    if (!queueDir || !fs.existsSync(queueDir)) return null;

    const config = KIND_CONFIG[kind];
    const entries = fs.readdirSync(queueDir, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => ({
            name: entry.name,
            filePath: path.join(queueDir, entry.name),
            ext: path.extname(entry.name).toLowerCase(),
        }))
        .filter(entry => config.extensions.has(entry.ext))
        .map(entry => ({
            ...entry,
            mtimeMs: fs.statSync(entry.filePath).mtimeMs,
        }))
        .sort((a, b) => a.mtimeMs - b.mtimeMs);

    if (entries.length === 0) return null;

    const chosen = entries[0];
    const caption = readCaptionSidecar(chosen.filePath);

    let mediaType = 'video';
    if (config.mediaType === 'mixed') {
        mediaType = ['.jpg', '.jpeg', '.png', '.webp'].includes(chosen.ext) ? 'image' : 'video';
    }

    return {
        kind,
        source: 'drive',
        filePath: chosen.filePath,
        fileName: chosen.name,
        extension: chosen.ext,
        mediaType,
        caption: caption.text || '',
        captionPath: caption.path,
    };
}

export function archiveDriveAsset(asset, options = {}) {
    if (!asset?.filePath || !asset?.kind) {
        throw new Error('Invalid drive asset: missing filePath or kind');
    }

    validateKind(asset.kind);

    const status = String(options.status || 'posted').trim() || 'posted';
    const root = getDriveRoot(options.rootOverride);
    if (!root) {
        throw new Error('Cannot archive drive asset: IG_DRIVE_ROOT is not configured');
    }

    const date = new Date().toISOString().slice(0, 10);
    const parsed = path.parse(asset.filePath);
    const suffix = Date.now();
    const archivedFileName = `${parsed.name}-${status}-${suffix}${parsed.ext}`;
    const targetDir = path.join(root, KIND_CONFIG[asset.kind].folder, 'posted', date);
    const archivedFilePath = path.join(targetDir, archivedFileName);

    moveFileSafe(asset.filePath, archivedFilePath);

    let archivedCaptionPath = null;
    if (asset.captionPath && fs.existsSync(asset.captionPath)) {
        const captionName = `${path.parse(archivedFileName).name}.txt`;
        archivedCaptionPath = path.join(targetDir, captionName);
        moveFileSafe(asset.captionPath, archivedCaptionPath);
    }

    return {
        archivedFilePath,
        archivedCaptionPath,
    };
}

export default {
    getDriveRoot,
    getDriveRootStatus,
    getDriveQueueDir,
    pickNextDriveAsset,
    archiveDriveAsset,
};
