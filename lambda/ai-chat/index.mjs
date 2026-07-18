import Anthropic from '@anthropic-ai/sdk';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const MODEL = 'claude-opus-4-8';
const MAX_INPUT_CHARS = 2000;
const MAX_HISTORY_TURNS = 8;
const MAX_TOKENS = 500;

const SYSTEM_PROMPT = `You are the AI Agent embedded on Alex ILIE's personal portfolio website.
Alex is a Solution / Enterprise Architect based in Aurora, Ontario, Canada, with experience
across cloud architecture, API & microservices architecture, Kafka & event-driven integration,
digital transformation, mainframe replacement, and banking/financial-services domains (clients
have included banks and large enterprises). His resumes and detailed portfolio are linked
directly on this site under the Resume, Profile, Technologies, Experience, and Portfolio
sections.

Answer visitor questions about Alex's background, skills, and experience using only the
general information above and what a visitor could reasonably infer from a solution
architect's portfolio site. Be concise and friendly (2-4 sentences). If asked for specific
details you don't know (exact dates, employers, project specifics), say so honestly and
point the visitor to the Resume/Portfolio sections or the contact form/email
(sorin.alex.ilie@gmail.com) instead of guessing. Do not answer questions unrelated to Alex,
his work, or this website; politely redirect those back to his professional background.`;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

let cachedApiKey;
let cachedClient;

async function getApiKey() {
    if (cachedApiKey) return cachedApiKey;
    const ssm = new SSMClient({});
    const result = await ssm.send(new GetParameterCommand({
        Name: process.env.ANTHROPIC_API_KEY_PARAM,
        WithDecryption: true,
    }));
    cachedApiKey = result.Parameter.Value;
    return cachedApiKey;
}

async function getClient() {
    if (cachedClient) return cachedClient;
    const apiKey = await getApiKey();
    cachedClient = new Anthropic({ apiKey });
    return cachedClient;
}

function corsHeaders(origin) {
    const allowOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || 'null');
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    };
}

function jsonResponse(statusCode, body, origin) {
    return {
        statusCode,
        headers: corsHeaders(origin),
        body: JSON.stringify(body),
    };
}

function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
        .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
        .slice(-MAX_HISTORY_TURNS)
        .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_INPUT_CHARS) }));
}

export const handler = async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin || '';
    const method = event.requestContext?.http?.method || event.httpMethod;

    if (method === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders(origin), body: '' };
    }

    if (method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' }, origin);
    }

    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch {
        return jsonResponse(400, { error: 'Invalid JSON body' }, origin);
    }

    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message) {
        return jsonResponse(400, { error: 'Missing "message"' }, origin);
    }
    if (message.length > MAX_INPUT_CHARS) {
        return jsonResponse(400, { error: `Message too long (max ${MAX_INPUT_CHARS} characters)` }, origin);
    }

    const messages = [
        ...sanitizeHistory(payload.history),
        { role: 'user', content: message },
    ];

    try {
        const client = await getClient();
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            output_config: { effort: 'low' },
            messages,
        });

        if (response.stop_reason === 'refusal') {
            return jsonResponse(200, {
                reply: "I'm not able to help with that. Feel free to ask about Alex's background and experience instead.",
            }, origin);
        }

        const textBlock = response.content.find((block) => block.type === 'text');
        const reply = textBlock ? textBlock.text : "Sorry, I couldn't generate a response — please try again.";

        return jsonResponse(200, { reply }, origin);
    } catch (err) {
        console.error('Anthropic API error:', err);
        return jsonResponse(502, { error: 'The AI agent is temporarily unavailable. Please try again shortly.' }, origin);
    }
};
