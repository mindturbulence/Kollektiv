/** Gemini prebuilt Live API voices, for speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName.
 * Source: https://docs.cloud.google.com/text-to-speech/docs/gemini-tts (verified 2026-07-10). */
export interface AssistantVoice {
    name: string;
    gender: 'Female' | 'Male';
}

export const ASSISTANT_VOICES: AssistantVoice[] = [
    { name: 'Achernar', gender: 'Female' },
    { name: 'Aoede', gender: 'Female' },
    { name: 'Autonoe', gender: 'Female' },
    { name: 'Callirrhoe', gender: 'Female' },
    { name: 'Despina', gender: 'Female' },
    { name: 'Erinome', gender: 'Female' },
    { name: 'Gacrux', gender: 'Female' },
    { name: 'Kore', gender: 'Female' },
    { name: 'Laomedeia', gender: 'Female' },
    { name: 'Leda', gender: 'Female' },
    { name: 'Pulcherrima', gender: 'Female' },
    { name: 'Sulafat', gender: 'Female' },
    { name: 'Vindemiatrix', gender: 'Female' },
    { name: 'Zephyr', gender: 'Female' },
    { name: 'Achird', gender: 'Male' },
    { name: 'Algenib', gender: 'Male' },
    { name: 'Algieba', gender: 'Male' },
    { name: 'Alnilam', gender: 'Male' },
    { name: 'Charon', gender: 'Male' },
    { name: 'Enceladus', gender: 'Male' },
    { name: 'Fenrir', gender: 'Male' },
    { name: 'Iapetus', gender: 'Male' },
    { name: 'Orus', gender: 'Male' },
    { name: 'Puck', gender: 'Male' },
    { name: 'Rasalgethi', gender: 'Male' },
    { name: 'Sadachbia', gender: 'Male' },
    { name: 'Sadaltager', gender: 'Male' },
    { name: 'Schedar', gender: 'Male' },
    { name: 'Umbriel', gender: 'Male' },
    { name: 'Zubenelgenubi', gender: 'Male' },
];

export const DEFAULT_MALE_VOICE = 'Puck';
export const DEFAULT_FEMALE_VOICE = 'Kore';

export const voiceGender = (name: string | undefined): 'Female' | 'Male' | undefined =>
    ASSISTANT_VOICES.find(v => v.name === name)?.gender;
