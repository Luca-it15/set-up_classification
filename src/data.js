export const CATEGORY_META = {
  skills: { label: 'Skills', icon: '✦', description: 'Istruzioni e capacità specializzate' },
  agents: { label: 'Agent', icon: '◉', description: 'Ruoli autonomi e orchestratori' },
  mcp_servers: { label: 'MCP server', icon: '⌘', description: 'Server e strumenti connessi' },
  knowledge_bases: { label: 'Knowledge base', icon: '▤', description: 'Fonti, RAG e vector store' },
  documentation: { label: 'Documentazione', icon: '▧', description: 'Guide e specifiche' },
  prompts: { label: 'Prompt', icon: '✎', description: 'Template e istruzioni' },
  tools: { label: 'Tool', icon: '⚙', description: 'Applicazioni e servizi' },
  models: { label: 'Modelli', icon: '◇', description: 'Modelli AI e provider' },
  workflows: { label: 'Workflow', icon: '→', description: 'Flussi e automazioni' },
  repositories: { label: 'Repository', icon: '⌗', description: 'Codice e sorgenti' },
  services: { label: 'Servizi', icon: '◌', description: 'Servizi esterni' },
  configurations: { label: 'Configurazioni', icon: '☷', description: 'File e impostazioni' },
  other: { label: 'Altro', icon: '•', description: 'Componenti non classificati' }
};

export const TYPE_TO_CATEGORY = { skill:'skills', agent:'agents', mcp_server:'mcp_servers', knowledge_base:'knowledge_bases', llm_wiki:'knowledge_bases', rag:'knowledge_bases', vector_store:'knowledge_bases', document:'documentation', prompt:'prompts', tool:'tools', application:'tools', model:'models', workflow:'workflows', repository:'repositories', service:'services', configuration:'configurations' };

export const PALETTES = {
  dark: { id:'dark', name:'Default Dark', mode:'dark', canvas:{background:'#101926',grid:'#243246',selection:'#d9f99d'}, centralTool:{background:'#e7f7c9',border:'#b7e870',text:'#163200'}, categories:{skills:'#d6b5ff',agents:'#8ee7e1',mcp_servers:'#ffbe7b',knowledge_bases:'#8fbcff',documentation:'#f5a8ce',prompts:'#ffc9a6',tools:'#b7e870',models:'#d0c6ff',workflows:'#f5da71',repositories:'#76d7ac',services:'#8fc9ff',configurations:'#d1bfa9',other:'#b8c0ca'}, severity:{critical:'#ff5a6d',high:'#ff966c',medium:'#f6d363',low:'#83d3a6',informational:'#8fbcff'} },
  light: { id:'light', name:'Default Light', mode:'light', canvas:{background:'#f5f8fb',grid:'#d9e2ea',selection:'#5d8e0f'}, centralTool:{background:'#e5f6c9',border:'#93c94d',text:'#1c3700'}, categories:{skills:'#7d48cc',agents:'#007d78',mcp_servers:'#bf6400',knowledge_bases:'#2367b8',documentation:'#bd3773',prompts:'#b94c0a',tools:'#568c00',models:'#6958ba',workflows:'#967000',repositories:'#087a4c',services:'#126eb0',configurations:'#735d48',other:'#64748b'}, severity:{critical:'#cc2440',high:'#c85228',medium:'#9c7200',low:'#18794e',informational:'#2367b8'} },
  contrast: { id:'contrast', name:'High Contrast', mode:'dark', canvas:{background:'#080808',grid:'#333',selection:'#fff'}, centralTool:{background:'#fff',border:'#fff',text:'#000'}, categories:{skills:'#ffea00',agents:'#00ffff',mcp_servers:'#ff8c00',knowledge_bases:'#7ab8ff',documentation:'#ff75cf',prompts:'#ffb14e',tools:'#b8ff00',models:'#d7a9ff',workflows:'#ffe45c',repositories:'#55ff9c',services:'#70bfff',configurations:'#eee',other:'#bbb'}, severity:{critical:'#ff5f73',high:'#ff9b72',medium:'#ffe35b',low:'#65eaa4',informational:'#70bfff'} }
};

export const demoReport = {
  schema_version:'1.0', report:{name:'Workspace AI · Codex'},
  components:[
    {id:'codex',name:'Codex',type:'tool',description:'Tool AI principale per sviluppo e orchestrazione.',status:'active',confidence:.98,maturity:'Defined',technologies:['React','MCP']},
    {id:'skill-review',name:'Repository Reviewer',type:'skill',description:'Analizza struttura, qualità e rischi del codice.',status:'active',confidence:.94,trigger:'Code review'},
    {id:'skill-setup',name:'Setup Evaluator',type:'skill',description:'Costruisce il report strutturato del setup AI.',status:'active',confidence:.97,trigger:'Analisi setup'},
    {id:'skill-docs',name:'Docs Writer',type:'skill',description:'Crea documentazione tecnica coerente.',status:'active',confidence:.88},
    {id:'agent-orch',name:'Engineering Orchestrator',type:'agent',description:'Coordina le attività di analisi e delivery.',status:'active',confidence:.91,framework:'Custom'},
    {id:'mcp-github',name:'GitHub MCP',type:'mcp_server',description:'Accesso a repository, PR e issue.',status:'active',confidence:.99,tools:['pull requests','issues']},
    {id:'kb-wiki',name:'LLM Wiki',type:'knowledge_base',description:'Base di conoscenza interna indicizzata.',status:'active',confidence:.82,path:'/knowledge/wiki'},
    {id:'doc-guide',name:'Architecture Guide',type:'document',description:'Decisioni e linee guida architetturali.',status:'stale',confidence:.72,path:'/docs/architecture.md'},
    {id:'workflow-delivery',name:'Change Delivery',type:'workflow',description:'Da richiesta a modifica verificata.',status:'active',confidence:.9},
    {id:'repo-main',name:'Application Repository',type:'repository',description:'Repository principale del prodotto.',status:'active',confidence:.99,path:'/workspace/app'}
  ],
  relationships:[
    {id:'r1',source_id:'codex',target_id:'skill-review',type:'uses',verification_status:'verified',confidence:.95,evidence_ids:['ev-01']},
    {id:'r2',source_id:'codex',target_id:'skill-setup',type:'uses',verification_status:'verified',confidence:.98,evidence_ids:['ev-02']},
    {id:'r3',source_id:'codex',target_id:'skill-docs',type:'uses',verification_status:'partially_verified',confidence:.83},
    {id:'r4',source_id:'codex',target_id:'agent-orch',type:'invoked_by',verification_status:'declared_only',confidence:.8},
    {id:'r5',source_id:'agent-orch',target_id:'mcp-github',type:'uses',verification_status:'verified',confidence:.94},
    {id:'r6',source_id:'codex',target_id:'kb-wiki',type:'reads_from',verification_status:'inferred',confidence:.72},
    {id:'r7',source_id:'skill-docs',target_id:'doc-guide',type:'updates',verification_status:'not_verified',confidence:.5},
    {id:'r8',source_id:'workflow-delivery',target_id:'repo-main',type:'produces',verification_status:'verified',confidence:.9}
  ],
  findings:[
    {id:'f1',component_id:'doc-guide',severity:'high',title:'Documentazione potenzialmente obsoleta',impact:'Può portare a decisioni non allineate.',recommendation:'Verificare e aggiornare la guida.'},
    {id:'f2',component_id:'kb-wiki',severity:'medium',title:'Freschezza non verificata',impact:'Le fonti potrebbero non essere aggiornate.',recommendation:'Aggiungere controlli di indicizzazione.'}
  ], evidence:[{id:'ev-01',type:'repository',path:'.codex/skills/review/SKILL.md',summary:'Skill rilevata nel workspace.'},{id:'ev-02',type:'configuration',path:'.codex/skills/setup-evaluator',summary:'Configurazione rilevata.'}], warnings:['Due relazioni sono inferite o non verificate.']
};
