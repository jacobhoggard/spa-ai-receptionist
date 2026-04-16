const https = require('https');

/**
 * Calls ElevenLabs TTS API and returns an MP3 audio buffer.
 * Uses eleven_flash_v2_5 model — fastest, cheapest, still sounds natural.
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {string} apiKey - ElevenLabs API key
 * @param {boolean} slowDown - If true, use slower/more deliberate voice settings
 */
function generateSpeech(text, voiceId, apiKey, slowDown = false) {
  return new Promise((resolve, reject) => {
    // Adjust voice settings for slower speech if requested
    const stability = slowDown ? 0.65 : 0.50;
    const similarity_boost = slowDown ? 0.85 : 0.75;

    const body = JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability,
        similarity_boost,
        style: 0.0,
        use_speaker_boost: true
      }
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', chunk => errorBody += chunk);
        res.on('end', () => reject(new Error(`ElevenLabs error ${res.statusCode}: ${errorBody}`)));
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { generateSpeech };
