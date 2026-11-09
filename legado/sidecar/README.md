# Sidecar (legado)

Implementação anterior do mesmo problema, guardada para referência e comparação:

- `voice-sidecar.mjs` — sidecar em processo próprio, com palavra de ativação `"open"`, STT por whisper e TTS por
  Piper; falava com o Habblaud por HTTP e lia a caixa de mensagens.
- `voice-sidecar.cjs` — versão reduzida (CommonJS) do anterior.
- `voice-sidecar-evaluation.md` — autoavaliação daquela implementação (5 eixos).

**Por que não é o caminho principal** — exigia Piper instalado, um processo de longa duração e uma segunda cópia da
regra de nomes. O `voz-agente` faz o mesmo turno em um comando único, sem estado e com a resolução de nome vinda do
próprio `/api/snapshot`.

Nada aqui é necessário para usar o projeto. Fica como histórico.
