import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Load keys from environment variable (comma separated)
const VALID_API_KEYS = new Set(
    (process.env.API_ACCESS_KEYS || '').split(',').map(key => key.trim()).filter(key => key.length > 0)
);

// If no keys are configured in production, we should probably warn or block
if (process.env.NODE_ENV === 'production' && VALID_API_KEYS.size === 0) {
    console.warn('⚠️ WARNING: No API_ACCESS_KEYS configured in production! API is open.');
}

// Path to key limits file
const KEY_LIMITS_PATH = path.join(process.cwd(), 'key-limits.json');

// Load key limits from file
function loadKeyLimits() {
    try {
        if (fs.existsSync(KEY_LIMITS_PATH)) {
            const data = fs.readFileSync(KEY_LIMITS_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading key-limits.json:', error);
    }
    return {};
}

// Save key limits to file
function saveKeyLimits(limits: any) {
    try {
        fs.writeFileSync(KEY_LIMITS_PATH, JSON.stringify(limits, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving key-limits.json:', error);
    }
}

// Check if key has exceeded its limit
function checkKeyLimit(apiKey: string): { allowed: boolean; remaining: number; message?: string } {
    const limits = loadKeyLimits();
    const keyData = limits[apiKey];

    if (!keyData) {
        // Key not in limits file - allow by default
        return { allowed: true, remaining: -1 };
    }

    // -1 means unlimited
    if (keyData.limit === -1) {
        return { allowed: true, remaining: -1 };
    }

    const remaining = keyData.limit - keyData.used;

    if (keyData.used >= keyData.limit) {
        return {
            allowed: false,
            remaining: 0,
            message: `API key limit exceeded. Used ${keyData.used}/${keyData.limit} requests.`
        };
    }

    return { allowed: true, remaining };
}

// Increment usage counter for key
export function incrementKeyUsage(apiKey: string) {
    const limits = loadKeyLimits();

    if (limits[apiKey]) {
        limits[apiKey].used += 1;
        saveKeyLimits(limits);
        console.log(`📊 Key "${limits[apiKey].name}" used: ${limits[apiKey].used}/${limits[apiKey].limit === -1 ? '∞' : limits[apiKey].limit}`);
    }
}

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for health check or specific paths if needed
    if (req.path === '/api/health') {
        return next();
    }

    const apiKey = req.headers['x-api-key'] || req.query.key;

    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide x-api-key header'
        });
    }

    if (!VALID_API_KEYS.has(apiKey)) {
        return res.status(403).json({
            error: 'Invalid API Key',
            message: 'Access denied'
        });
    }

    // Skip rate limit check for status and quota endpoints (they don't consume generations)
    const isStatusOrQuotaCheck = req.path.startsWith('/api/status') || req.path === '/api/quota';

    if (!isStatusOrQuotaCheck) {
        // Check rate limit only for actual generation endpoints
        const limitCheck = checkKeyLimit(apiKey);
        if (!limitCheck.allowed) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: limitCheck.message,
                remaining: 0
            });
        }

        // Attach remaining quota
        (req as any).remainingQuota = limitCheck.remaining;
    }

    // Attach key to request for logging
    (req as any).apiKey = apiKey;

    next();
};

