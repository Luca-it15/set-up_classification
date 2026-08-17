# Glossario dei tool AI

Snapshot dei metadati pubblici GitHub: 2026-08-06. Le stelle sono un segnale di diffusione, non una valutazione qualitativa. Lo scanner usa le colonne `Nome canonico`, `Label`, `Categoria` e `Alias rilevabili`; gli alias devono essere specifici e separati da virgole.

Codex, Claude Code e GitHub Copilot non vengono classificati tramite alias testuali di questa tabella. Sono risolti dal registry deterministico `scripts/lib/ai-tool-rules.mjs`, che distingue firma canonica, compatibilità condivisa, superficie, scope, validità e stato runtime. Questo evita che una semplice menzione o un file condiviso come `AGENTS.md` assegni arbitrariamente un vendor.

| Nome canonico | Label | Categoria | Alias rilevabili | Repository | Stelle | Linguaggio | Licenza | Funzione essenziale |
|---|---|---|---|---|---:|---|---|---|
| Headroom | Riduzione token | token_reduction | headroom, headroom-ai, headroomlabs-ai | https://github.com/headroomlabs-ai/headroom | 65,225 | Python | Apache-2.0 | Comprime output di tool, log, file, JSON e chunk RAG prima che entrino nel contesto del modello. |
| RTK | Riduzione token | token_reduction | rtk, rkt, rtk-ai, rtk gain | https://github.com/rtk-ai/rtk | 75,046 | Rust | Apache-2.0 | Proxy CLI che compatta l'output dei comuni comandi di sviluppo destinato agli agenti. |
| Token Optimizer | Ottimizzazione contesto | context_optimization | token-optimizer, ghost tokens | https://github.com/alexgreensh/token-optimizer | 1,100+ | Python | Vedi repository | Misura sprechi strutturali e runtime del contesto e supporta checkpoint prima della compaction. |
| AutoGPT | Piattaforma agentica | agent_platform | autogpt, auto-gpt | https://github.com/Significant-Gravitas/AutoGPT | 185,968 | Python | Vedi repository | Piattaforma per creare e utilizzare agenti AI autonomi. |
| Ollama | Runtime modelli locali | local_model_runtime | ollama | https://github.com/ollama/ollama | 177,944 | Go | MIT | Esegue e gestisce modelli generativi localmente. |
| Stable Diffusion WebUI | Generazione immagini | image_generation | stable-diffusion-webui, automatic1111 | https://github.com/AUTOMATIC1111/stable-diffusion-webui | 164,427 | Python | AGPL-3.0 | Interfaccia web per Stable Diffusion. |
| Transformers | Libreria modelli | model_library | huggingface transformers, transformers library | https://github.com/huggingface/transformers | 163,418 | Python | Apache-2.0 | Definizioni e API per modelli di testo, visione, audio e multimodali. |
| Dify | Piattaforma agentica | agent_platform | dify, langgenius | https://github.com/langgenius/dify | 151,587 | TypeScript | Vedi repository | Costruisce workflow agentici e pipeline RAG con modelli e tool integrati. |
| Langflow | Workflow agentici | agent_workflow | langflow | https://github.com/langflow-ai/langflow | 152,897 | Python | MIT | Costruisce e distribuisce agenti e workflow AI visuali. |
| Open WebUI | Interfaccia AI | ai_interface | open-webui, open webui | https://github.com/open-webui/open-webui | 148,064 | Python | Vedi repository | Interfaccia self-hosted per Ollama e API compatibili OpenAI. |
| LangChain | Framework agentico | agent_framework | langchain | https://github.com/langchain-ai/langchain | 143,570 | Python | MIT | Framework per applicazioni e agenti basati su modelli. |
| ComfyUI | Workflow immagini | image_generation | comfyui, comfy-ui | https://github.com/Comfy-Org/ComfyUI | 124,368 | Python | GPL-3.0 | GUI e backend a nodi per workflow con modelli di diffusione. |
| llama.cpp | Motore inferenza | inference_engine | llama.cpp, llama-cpp | https://github.com/ggml-org/llama.cpp | 122,907 | C++ | MIT | Inferenza LLM efficiente in C e C++. |
| vLLM | Serving LLM | inference_engine | vllm, vllm-project | https://github.com/vllm-project/vllm | 88,361 | Python | Apache-2.0 | Motore ad alto throughput per inferenza e serving di LLM. |
| Cline | Coding agent | coding_agent | cline | https://github.com/cline/cline | 65,772 | TypeScript | Apache-2.0 | Coding agent disponibile come SDK, estensione IDE o CLI. |
| AutoGen | Framework multi-agent | agent_framework | autogen, microsoft autogen | https://github.com/microsoft/autogen | 60,271 | Python | CC-BY-4.0 | Framework di programmazione per sistemi agentici. |
| CrewAI | Framework multi-agent | agent_framework | crewai, crew-ai | https://github.com/crewAIInc/crewAI | 56,704 | Python | MIT | Orchestra agenti con ruoli e collaborazione. |
| Aider | Coding agent | coding_agent | aider, aider-ai | https://github.com/Aider-AI/aider | 47,997 | Python | Apache-2.0 | Pair programming AI nel terminale. |
| Continue | Coding agent | coding_agent | continuedev, continue.dev | https://github.com/continuedev/continue | 35,356 | TypeScript | Apache-2.0 | Coding agent open source per IDE e workflow di sviluppo. |

Per aggiungere tool locali o meno noti, inserire una riga con alias non ambigui. Applicare `tool_usage_evidence_v1`: una configurazione produce `configured`/`declared_only`, una semplice menzione produce `mentioned`/`inferred`, e soltanto un evento strutturato di invocazione produce `used`/`verified`.
