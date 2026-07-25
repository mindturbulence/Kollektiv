# Voice Pipeline

## STT

Speech-to-text is the first step in the voice experience. The pipeline should capture microphone input, stream partial transcripts, and connect those transcripts to the assistant or a prompt-action workflow without introducing too much latency.

## Planning

Once speech is captured, the system should decide whether the user intends a conversational response, an action, or a simple command. The planner should interpret the spoken request in the same way it interprets typed input.

## Streaming

Streaming is essential for voice responsiveness. Partial text should flow through the UI quickly, and the assistant should be able to respond incrementally rather than waiting for the entire utterance to finish.

## TTS

Text-to-speech is used to make the assistant feel alive and responsive. The system should support clear output and a reliable way to stop or interrupt speech when the user begins speaking again.

## Interruptions

Interruption handling is a core part of the voice experience. The app should be able to cancel speech, stop tool execution, or replace an ongoing response when a more urgent instruction arrives.

## Voice Architecture Notes

The voice experience in the current app is designed as a layered pipeline rather than a monolithic feature:

1. capture audio and produce a transcript
2. hand the transcript to the same planning logic used for typed input
3. route the resulting action through the assistant tool loop or the generation layer
4. render spoken output back to the user with interruption support

This keeps live voice behavior aligned with the rest of the product rather than introducing a second, parallel execution path.
