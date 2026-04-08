# biostack study

## Run

1) Install deps

```bash
npm install
```

2) Install Ollama (free, no keys)

Install Ollama from `https://ollama.com`, then in a terminal:

```bash
ollama pull llama3.1:8b
```

3) Configure (optional)

```bash
cp .env.example .env
```

You can change `OLLAMA_MODEL` in `.env` if you pulled a different model.

4) Start the app

```bash
npm run dev
```

Open `http://localhost:5174/`.

