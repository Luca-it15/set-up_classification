# Setup Visualizer

Applicazione React locale per esplorare i report JSON prodotti da `setup-evaluator`.

## Avvio

```bash
npm install
npm start
```

Apri `http://localhost:3000`.

L'app parte con un report demo. Usa **Importa JSON** per caricare un report: il parsing e l'elaborazione rimangono nel browser.

## Funzioni incluse

- grafo radiale con tool centrale e categorie;
- import e validazione del report JSON;
- ricerca e filtro per confidenza;
- pannelli per categorie, componenti, relazioni, evidenze raw e finding;
- distinzione visiva per relazioni verificate, dichiarate e inferite;
- palette predefinite e colori categoria modificabili, memorizzati in `localStorage`;
- layout responsivo e alternativa testuale del grafo nei pannelli laterali.
