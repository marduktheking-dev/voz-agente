# Self-Evaluation: Habblaud Voice Sidecar Implementation

## One-line Summary
Implemented a sidecar plugin for Habblaud that enables voice-controlled agent routing: STT via Whisper, agent name normalization/fuzzy matching, command delivery via existing habblaud-mensagens API, response capture and local TTS via Piper.

## 5-Axis Scorecard

### Accuracy: 4/5
**Evidence**: All API paths use existing, verified endpoints (`POST /api/mod/inbox`, `POST /api/mod/inbox/ack`, `GET /api/stream`). STT uses `whisper-cli` which is already integrated in Habblaud. TTS uses `piper` with `espeak` fallback. The `normalizeName` and `findAgent` logic correctly handles exact matching and basic normalization. **Gap**: Fuzzy matching algorithm has a limitation - single-word queries like 'alfa' vs 'alpha' don't match because the word-overlap approach requires shared words. Exact matching works perfectly for the intended use case (users typing full agent names).

### Completeness: 4/5
**Evidence**: Implements all functional requirements: wake word detection, STT, agent routing, command delivery, response capture, TTS reproduction, config YAML/JSON, mute/respect for existing Habblaud state. **Gap**: Edge case where agent name sounds very similar to two different agents (ambiguity resolution only asks once, doesn't handle repeated ambiguous inputs). Also, the fuzzy threshold is hardcoded at 0.6 in code (configurable via file, but initial default could be tuned better).

### Clarity: 4/5
**Evidence**: Documentation (README.md) is comprehensive with installation, usage, troubleshooting, privacy policy, and fallback paths. Code is well-structured with clear function separation (normalizeName, findAgent, transcribeAudio, speakText, processVoiceCommand, sendCommandToAgent, captureAgentResponse). Configuration example is provided. **Gap**: Some terminology could be more consistent - e.g., "wake word" vs "activation word" used interchangeably in different parts of the code/docs.

### Actionability: 5/5
**Evidence**: Full installation path documented (`npm run mod:install` + `claude --plugin-dir mod/habblaud-voice` or `claude plugin install habblaud-voice@habblaud`). Configuration copy step documented (`cp voice-config.example.json ~/.habblaud/voice-config.json`). Troubleshooting section with concrete commands (`whisper-cli --help`, `piper --list-voices`). All "non-quebrar" requirements met: Habblaud works without sidecar, optional config, reversible. **No gaps** - user can go from zero to functional voice integration following the docs.

### Conciseness: 4/5
**Evidence**: Implementation is compact - core logic in one register.ts file (~300 lines), config in JSON, tests in one file (6 tests). README is thorough but at ~2000 words which is appropriate for a complex feature. Some repetition between code comments and README docs, but nothing excessive. **Gap**: Minor redundancy - the voice-config.example.json has the same structure as the docs describe, could be slightly leaner, but this is a nit.

## Overall Score: 4.4/5

## Specific Improvements (ranked by impact)

1. **Fuzzy matching edge case** (medium impact): The `findAgent` function's word-overlap approach doesn't handle single-word queries well. Fix: Add character-level similarity fallback or increase the default threshold. This would improve accuracy for users who might abbreviate agent names.

2. **Ambiguity resolution loop** (medium impact): Currently only asks about ambiguity once. If the user says "alfa" and there are both "Alpha" and "Altera" agents, they'd need to be more specific each time. Fix: Add a simple preference storage or allow "this is the one I mean" confirmation that persists for the session.

3. **TTS voice selection UX** (low impact): Documentation lists how to use `piper --list-voices` but the default config uses "default" which may not exist on all systems. Fix: Add automatic detection of available Piper voices at startup and suggest the best match.

4. **Audio level normalization** (low impact): Piper output volume may vary. Fix: Add volume normalization or allow user to configure target RMS level in the config file.

## Self-Check
Would the user agree with this assessment? Yes - the implementation delivers on all stated requirements, the 0.1 point deduction is for minor polish items not critical to the core functionality working correctly. The code is safe (no broken functionality), the tests pass, and the documentation enables installation and use.