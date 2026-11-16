import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const patchSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Creative, concise patch name (2-4 words).' },
    category: {
      type: Type.STRING,
      description: 'One of: Lead, Bass, Pad, Pluck, Keys, Brass, FX',
    },
    description: {
      type: Type.STRING,
      description: 'Short sonic description and live playing advice (1-2 sentences).',
    },
    bpmHint: { type: Type.NUMBER, description: 'Suggested BPM between 70 and 175.' },
    osc1Wave: { type: Type.STRING, description: 'One of: sine, triangle, sawtooth, square' },
    osc1Level: { type: Type.NUMBER, description: '0.0 to 1.0' },
    osc1Octave: { type: Type.INTEGER, description: 'Integer -2 to 2' },
    osc1Detune: { type: Type.NUMBER, description: '-50 to 50 cents' },
    osc2Wave: { type: Type.STRING, description: 'One of: sine, triangle, sawtooth, square' },
    osc2Level: { type: Type.NUMBER, description: '0.0 to 1.0' },
    osc2Semi: { type: Type.INTEGER, description: 'Integer -24 to 24 semitones' },
    osc2Detune: { type: Type.NUMBER, description: '-50 to 50 cents' },
    subLevel: { type: Type.NUMBER, description: '0.0 to 1.0' },
    noiseLevel: { type: Type.NUMBER, description: '0.0 to 0.4' },
    unisonDetune: { type: Type.NUMBER, description: '0 to 40 cents' },
    glide: { type: Type.NUMBER, description: '0.0 to 0.35 seconds' },
    filterType: { type: Type.STRING, description: 'One of: lowpass, bandpass, highpass, notch' },
    filterCutoff: { type: Type.NUMBER, description: '80 to 16000 Hz' },
    filterResonance: { type: Type.NUMBER, description: '0.5 to 14.0 Q' },
    filterEnvAmount: { type: Type.NUMBER, description: '-4000 to 7000 Hz' },
    ampAttack: { type: Type.NUMBER, description: '0.003 to 2.0 seconds' },
    ampDecay: { type: Type.NUMBER, description: '0.04 to 2.5 seconds' },
    ampSustain: { type: Type.NUMBER, description: '0.0 to 1.0' },
    ampRelease: { type: Type.NUMBER, description: '0.04 to 3.5 seconds' },
    filterAttack: { type: Type.NUMBER, description: '0.003 to 1.8 seconds' },
    filterDecay: { type: Type.NUMBER, description: '0.04 to 2.5 seconds' },
    filterSustain: { type: Type.NUMBER, description: '0.0 to 1.0' },
    filterRelease: { type: Type.NUMBER, description: '0.04 to 3.0 seconds' },
    lfoWave: { type: Type.STRING, description: 'One of: sine, triangle, sawtooth, square' },
    lfoRate: { type: Type.NUMBER, description: '0.1 to 14.0 Hz' },
    lfoDepth: { type: Type.NUMBER, description: '0.0 to 0.8' },
    lfoTarget: { type: Type.STRING, description: 'One of: filter, pitch, amp' },
    drive: { type: Type.NUMBER, description: '0.0 to 0.85' },
    chorusMix: { type: Type.NUMBER, description: '0.0 to 0.85' },
    delayMix: { type: Type.NUMBER, description: '0.0 to 0.65' },
    delayTime: { type: Type.NUMBER, description: '0.12 to 0.75 seconds' },
    delayFeedback: { type: Type.NUMBER, description: '0.0 to 0.68' },
    reverbMix: { type: Type.NUMBER, description: '0.0 to 0.8' },
    reverbDecay: { type: Type.NUMBER, description: '0.8 to 4.0 seconds' },
    masterGain: { type: Type.NUMBER, description: '0.45 to 0.85' },
    suggestedProgression: {
      type: Type.ARRAY,
      description: 'Optional 4-chord progression tailored to this sound.',
      items: {
        type: Type.OBJECT,
        properties: {
          symbol: { type: Type.STRING, description: 'Chord symbol e.g. Am9, Fmaj7, G6, Em7' },
          roman: { type: Type.STRING, description: 'Roman numeral e.g. i9, VImaj7' },
          midiNotes: {
            type: Type.ARRAY,
            description: '3 to 5 MIDI note numbers between 45 and 84 representing a playable voicing.',
            items: { type: Type.INTEGER },
          },
        },
        required: ['symbol', 'roman', 'midiNotes'],
      },
    },
  },
  required: [
    'name',
    'category',
    'description',
    'bpmHint',
    'osc1Wave',
    'osc1Level',
    'osc1Octave',
    'osc1Detune',
    'osc2Wave',
    'osc2Level',
    'osc2Semi',
    'osc2Detune',
    'subLevel',
    'noiseLevel',
    'unisonDetune',
    'glide',
    'filterType',
    'filterCutoff',
    'filterResonance',
    'filterEnvAmount',
    'ampAttack',
    'ampDecay',
    'ampSustain',
    'ampRelease',
    'filterAttack',
    'filterDecay',
    'filterSustain',
    'filterRelease',
    'lfoWave',
    'lfoRate',
    'lfoDepth',
    'lfoTarget',
    'drive',
    'chorusMix',
    'delayMix',
    'delayTime',
    'delayFeedback',
    'reverbMix',
    'reverbDecay',
    'masterGain',
    'suggestedProgression',
  ],
};

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function validWave(w: string): 'sine' | 'triangle' | 'sawtooth' | 'square' {
  return w === 'sine' || w === 'triangle' || w === 'sawtooth' || w === 'square' ? w : 'sawtooth';
}

function validFilter(f: string): 'lowpass' | 'bandpass' | 'highpass' | 'notch' {
  return f === 'lowpass' || f === 'bandpass' || f === 'highpass' || f === 'notch' ? f : 'lowpass';
}

function validLfoTarget(t: string): 'filter' | 'pitch' | 'amp' {
  return t === 'filter' || t === 'pitch' || t === 'amp' ? t : 'filter';
}

function validCategory(c: string): 'Lead' | 'Bass' | 'Pad' | 'Pluck' | 'Keys' | 'Brass' | 'FX' {
  const allowed = ['Lead', 'Bass', 'Pad', 'Pluck', 'Keys', 'Brass', 'FX'];
  return allowed.includes(c) ? (c as 'Lead' | 'Bass' | 'Pad' | 'Pluck' | 'Keys' | 'Brass' | 'FX') : 'Lead';
}

function validGenre(
  g: string
):
  | 'Rock & Alt'
  | 'Indie & Arena'
  | 'Synth-Pop'
  | 'Synthwave & 80s'
  | 'Electronic & Club'
  | 'Funk & Disco'
  | 'Classic Rock' {
  const allowed = [
    'Rock & Alt',
    'Indie & Arena',
    'Synth-Pop',
    'Synthwave & 80s',
    'Electronic & Club',
    'Funk & Disco',
    'Classic Rock',
  ];
  return allowed.includes(g) ? (g as 'Rock & Alt') : 'Indie & Arena';
}

const bandChartSchema = {
  type: Type.OBJECT,
  properties: {
    bandName: { type: Type.STRING, description: 'Band or artist name.' },
    title: { type: Type.STRING, description: 'Song title or signature style title.' },
    artistOrStyle: { type: Type.STRING, description: 'Short descriptive style line.' },
    genre: {
      type: Type.STRING,
      description:
        'One of: Rock & Alt, Indie & Arena, Synth-Pop, Synthwave & 80s, Electronic & Club, Funk & Disco, Classic Rock',
    },
    bpm: { type: Type.INTEGER, description: 'Tempo in BPM (60 to 190).' },
    musicalKey: { type: Type.STRING, description: 'Musical key e.g. F Minor, D Major.' },
    timeSignature: { type: Type.STRING, description: 'e.g. 4/4, 6/8, 3/4' },
    soundRole: { type: Type.STRING, description: 'Signature keyboard/synth tone role e.g. OB-Xa Stadium Brass.' },
    performanceNotes: { type: Type.STRING, description: 'Practical live performance playing advice (1-2 sentences).' },
    patch: patchSchema,
    sections: {
      type: Type.ARRAY,
      description: '2 song sections (e.g. Verse and Chorus) with 4 chords each.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Section name e.g. Verse, Chorus, Main Riff' },
          chords: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                symbol: { type: Type.STRING, description: 'Chord symbol e.g. Am7, Fmaj7' },
                roman: { type: Type.STRING, description: 'Roman numeral e.g. i7, VImaj7' },
                beats: { type: Type.INTEGER, description: 'Number of beats, typically 4' },
                midiNotes: {
                  type: Type.ARRAY,
                  description: '3 to 5 MIDI note numbers between 40 and 84.',
                  items: { type: Type.INTEGER },
                },
              },
              required: ['symbol', 'roman', 'beats', 'midiNotes'],
            },
          },
        },
        required: ['name', 'chords'],
      },
    },
  },
  required: [
    'bandName',
    'title',
    'artistOrStyle',
    'genre',
    'bpm',
    'musicalKey',
    'timeSignature',
    'soundRole',
    'performanceNotes',
    'patch',
    'sections',
  ],
};

function sanitizePatch(parsed: Record<string, unknown>, idPrefix: string) {
  return {
    id: `${idPrefix}-${Date.now()}`,
    name: String(parsed.name || 'Custom Band Sound').slice(0, 48),
    category: validCategory(String(parsed.category)),
    description: String(parsed.description || 'Custom band synthesizer patch.'),
    author: 'Songbook' as const,
    bpmHint: Math.round(clamp(Number(parsed.bpmHint), 65, 180, 120)),
    osc1Wave: validWave(String(parsed.osc1Wave)),
    osc1Level: clamp(Number(parsed.osc1Level), 0, 1, 0.8),
    osc1Octave: Math.round(clamp(Number(parsed.osc1Octave), -2, 2, 0)),
    osc1Detune: clamp(Number(parsed.osc1Detune), -50, 50, -6),
    osc2Wave: validWave(String(parsed.osc2Wave)),
    osc2Level: clamp(Number(parsed.osc2Level), 0, 1, 0.65),
    osc2Semi: Math.round(clamp(Number(parsed.osc2Semi), -24, 24, 0)),
    osc2Detune: clamp(Number(parsed.osc2Detune), -50, 50, 7),
    subLevel: clamp(Number(parsed.subLevel), 0, 1, 0.25),
    noiseLevel: clamp(Number(parsed.noiseLevel), 0, 0.4, 0.02),
    unisonDetune: clamp(Number(parsed.unisonDetune), 0, 40, 14),
    glide: clamp(Number(parsed.glide), 0, 0.4, 0.03),
    filterType: validFilter(String(parsed.filterType)),
    filterCutoff: clamp(Number(parsed.filterCutoff), 60, 18000, 2200),
    filterResonance: clamp(Number(parsed.filterResonance), 0.2, 16, 2.5),
    filterEnvAmount: clamp(Number(parsed.filterEnvAmount), -6000, 8000, 2400),
    ampAttack: clamp(Number(parsed.ampAttack), 0.002, 2.5, 0.02),
    ampDecay: clamp(Number(parsed.ampDecay), 0.02, 3.0, 0.4),
    ampSustain: clamp(Number(parsed.ampSustain), 0, 1, 0.7),
    ampRelease: clamp(Number(parsed.ampRelease), 0.02, 4.0, 0.45),
    filterAttack: clamp(Number(parsed.filterAttack), 0.002, 2.0, 0.02),
    filterDecay: clamp(Number(parsed.filterDecay), 0.02, 3.0, 0.45),
    filterSustain: clamp(Number(parsed.filterSustain), 0, 1, 0.4),
    filterRelease: clamp(Number(parsed.filterRelease), 0.02, 3.5, 0.4),
    lfoWave: validWave(String(parsed.lfoWave)),
    lfoRate: clamp(Number(parsed.lfoRate), 0.1, 18, 2.5),
    lfoDepth: clamp(Number(parsed.lfoDepth), 0, 1, 0.12),
    lfoTarget: validLfoTarget(String(parsed.lfoTarget)),
    drive: clamp(Number(parsed.drive), 0, 1, 0.15),
    chorusMix: clamp(Number(parsed.chorusMix), 0, 1, 0.25),
    delayMix: clamp(Number(parsed.delayMix), 0, 0.85, 0.2),
    delayTime: clamp(Number(parsed.delayTime), 0.08, 0.85, 0.375),
    delayFeedback: clamp(Number(parsed.delayFeedback), 0, 0.75, 0.35),
    reverbMix: clamp(Number(parsed.reverbMix), 0, 0.9, 0.28),
    reverbDecay: clamp(Number(parsed.reverbDecay), 0.6, 4.5, 1.8),
    masterGain: clamp(Number(parsed.masterGain), 0.3, 0.95, 0.72),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/ai/band-chart', async (req, res) => {
    try {
      const { query } = req.body as { query?: string };
      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Enter a band name or song title.' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({ error: 'GEMINI_API_KEY is not configured in environment secrets.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create an accurate live keyboard/synthesizer sound patch and inbuilt chord chart for this band or song: "${query.trim()}".
Include realistic tempo (BPM), musical key, the band's signature synth/keys tone, practical stage playing notes, and 2 main song sections (4 chords each) with accurate MIDI voicings (C4=60).`,
        config: {
          systemInstruction:
            'You are a touring live keyboardist and synthesizer programmer. Generate accurate chord progressions, MIDI voicings, and authentic synthesizer parameters matching the requested band or song.',
          responseMimeType: 'application/json',
          responseSchema: bandChartSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Model returned an empty band chart.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      const songEntry = {
        id: `band-ai-${Date.now()}`,
        bandName: String(parsed.bandName || query.trim()).slice(0, 48),
        title: String(parsed.title || 'Live Signature Sound').slice(0, 64),
        artistOrStyle: String(parsed.artistOrStyle || 'Custom Band Chart'),
        genre: validGenre(String(parsed.genre)),
        year: 'AI Band Chart',
        bpm: Math.round(clamp(Number(parsed.bpm), 60, 195, 120)),
        musicalKey: String(parsed.musicalKey || 'C Major'),
        timeSignature: String(parsed.timeSignature || '4/4'),
        soundRole: String(parsed.soundRole || 'Stage Synth Sound'),
        performanceNotes: String(parsed.performanceNotes || 'Play along with the chord chart live.'),
        patch: sanitizePatch((parsed.patch || {}) as Record<string, unknown>, 'band-patch'),
        sections: Array.isArray(parsed.sections)
          ? parsed.sections.slice(0, 4).map((sec: Record<string, unknown>) => ({
              name: String(sec.name || 'Main Progression'),
              chords: Array.isArray(sec.chords)
                ? sec.chords.slice(0, 8).map((c: Record<string, unknown>) => ({
                    symbol: String(c.symbol || 'Cmaj7'),
                    roman: String(c.roman || 'Imaj7'),
                    beats: Math.round(clamp(Number(c.beats), 1, 8, 4)),
                    midiNotes: Array.isArray(c.midiNotes)
                      ? c.midiNotes
                          .map((n) => Math.round(Number(n)))
                          .filter((n) => Number.isFinite(n) && n >= 24 && n <= 96)
                          .slice(0, 6)
                      : [60, 64, 67],
                  }))
                : [],
            }))
          : [],
      };

      res.json({ song: songEntry });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create band chart.';
      console.error('AI band chart error:', error);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/design-sound', async (req, res) => {
    try {
      const { prompt, role, mood } = req.body as {
        prompt?: string;
        role?: string;
        mood?: string;
      };

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please describe the sound you want to create.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error: 'GEMINI_API_KEY is not configured in environment secrets.',
        });
        return;
      }

      const systemInstruction = `You are a master sound designer and live electronic synthesizer programmer.
Design a playable, musical Web Audio subtractive/FM-inspired synthesizer patch matching the user's request.
Think carefully about real-world synthesis physics:
- Bass patches: low osc1Octave (-1 or 0), strong subLevel (0.3-0.8), lowpass filter (180-1400 Hz) with punchy filterDecay (0.12-0.45s), tight ampRelease (0.06-0.25s), low reverbMix (0-0.18).
- Pad patches: slower ampAttack (0.18-1.2s), longer ampRelease (0.8-2.8s), detuned sawtooth/triangle oscillators with unisonDetune (12-30), lush chorusMix (0.35-0.75) and reverbMix (0.35-0.7).
- Pluck patches: very fast ampAttack (0.004-0.015s), short ampDecay (0.18-0.6s), low ampSustain (0.05-0.25), high positive filterEnvAmount (2500-6500 Hz) with fast filterDecay (0.12-0.4s), rhythmic stereo delay.
- Lead / Brass patches: expressive filter cutoff (1200-6000 Hz), subtle pitch or filter LFO vibrato (4.5-6.5 Hz, low depth 0.04-0.15), moderate drive (0.1-0.45) for stage cut.
Always return clean numeric values within safe musical bounds and include a 4-chord progression with valid MIDI notes (e.g., C4=60).`;

      const userPrompt = `Design a live performance synthesizer sound:
Description: ${prompt.trim()}
${role && role !== 'Any' ? `Instrument Role: ${role}` : ''}
${mood ? `Vibe / Context: ${mood}` : ''}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: patchSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Model returned an empty patch response.' });
        return;
      }

      const parsed = JSON.parse(rawText);

      const patch = {
        id: `ai-${Date.now()}`,
        name: String(parsed.name || 'AI Custom Sound').slice(0, 48),
        category: validCategory(String(parsed.category)),
        description: String(parsed.description || 'Custom AI-designed performance patch.'),
        author: 'AI Lab' as const,
        bpmHint: Math.round(clamp(parsed.bpmHint, 65, 180, 120)),
        osc1Wave: validWave(String(parsed.osc1Wave)),
        osc1Level: clamp(parsed.osc1Level, 0, 1, 0.8),
        osc1Octave: Math.round(clamp(parsed.osc1Octave, -2, 2, 0)),
        osc1Detune: clamp(parsed.osc1Detune, -50, 50, -6),
        osc2Wave: validWave(String(parsed.osc2Wave)),
        osc2Level: clamp(parsed.osc2Level, 0, 1, 0.65),
        osc2Semi: Math.round(clamp(parsed.osc2Semi, -24, 24, 0)),
        osc2Detune: clamp(parsed.osc2Detune, -50, 50, 7),
        subLevel: clamp(parsed.subLevel, 0, 1, 0.25),
        noiseLevel: clamp(parsed.noiseLevel, 0, 0.4, 0.02),
        unisonDetune: clamp(parsed.unisonDetune, 0, 40, 14),
        glide: clamp(parsed.glide, 0, 0.4, 0.03),
        filterType: validFilter(String(parsed.filterType)),
        filterCutoff: clamp(parsed.filterCutoff, 60, 18000, 2200),
        filterResonance: clamp(parsed.filterResonance, 0.2, 16, 2.5),
        filterEnvAmount: clamp(parsed.filterEnvAmount, -6000, 8000, 2400),
        ampAttack: clamp(parsed.ampAttack, 0.002, 2.5, 0.02),
        ampDecay: clamp(parsed.ampDecay, 0.02, 3.0, 0.4),
        ampSustain: clamp(parsed.ampSustain, 0, 1, 0.7),
        ampRelease: clamp(parsed.ampRelease, 0.02, 4.0, 0.45),
        filterAttack: clamp(parsed.filterAttack, 0.002, 2.0, 0.02),
        filterDecay: clamp(parsed.filterDecay, 0.02, 3.0, 0.45),
        filterSustain: clamp(parsed.filterSustain, 0, 1, 0.4),
        filterRelease: clamp(parsed.filterRelease, 0.02, 3.5, 0.4),
        lfoWave: validWave(String(parsed.lfoWave)),
        lfoRate: clamp(parsed.lfoRate, 0.1, 18, 2.5),
        lfoDepth: clamp(parsed.lfoDepth, 0, 1, 0.12),
        lfoTarget: validLfoTarget(String(parsed.lfoTarget)),
        drive: clamp(parsed.drive, 0, 1, 0.15),
        chorusMix: clamp(parsed.chorusMix, 0, 1, 0.25),
        delayMix: clamp(parsed.delayMix, 0, 0.85, 0.2),
        delayTime: clamp(parsed.delayTime, 0.08, 0.85, 0.375),
        delayFeedback: clamp(parsed.delayFeedback, 0, 0.75, 0.35),
        reverbMix: clamp(parsed.reverbMix, 0, 0.9, 0.28),
        reverbDecay: clamp(parsed.reverbDecay, 0.6, 4.5, 1.8),
        masterGain: clamp(parsed.masterGain, 0.3, 0.95, 0.72),
      };

      const suggestedProgression = Array.isArray(parsed.suggestedProgression)
        ? parsed.suggestedProgression.slice(0, 6).map((c: Record<string, unknown>) => ({
            symbol: String(c.symbol || 'Cmaj7'),
            roman: String(c.roman || 'Imaj7'),
            beats: 4,
            midiNotes: Array.isArray(c.midiNotes)
              ? c.midiNotes
                  .map((n) => Math.round(Number(n)))
                  .filter((n) => Number.isFinite(n) && n >= 24 && n <= 96)
                  .slice(0, 6)
              : [60, 64, 67, 71],
          }))
        : [];

      res.json({ patch, suggestedProgression });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate AI synth patch.';
      console.error('AI sound design error:', error);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KlangStage server listening on http://localhost:${PORT}`);
  });
}

startServer();
