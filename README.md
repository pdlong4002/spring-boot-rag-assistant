# RAGStone

**RAGStone**

Scientific Retrieval AI

---

Overview

RAGStone is a demo project that showcases a Retrieval-Augmented Generation (RAG) pipeline for building an AI assistant that answers questions using a searchable knowledge base of uploaded documents. The project combines modern retrieval (vector search) with transformer-based generation to produce grounded, context-aware responses. The brand name "RAGStone" is inspired by the fusion of RAG (Retrieval-Augmented Generation) and the adventurous spirit of Dr. Stone — scientific, precise, and exploratory.

Key Concepts

- Retrieval-Augmented Generation (RAG): Documents are converted into embeddings and stored in a vector store. At query-time, similar document chunks are retrieved and provided as context to a language model, which generates an answer grounded on the retrieved content. This reduces hallucination and improves factuality for domain documents.
- Document indexing: Uploaded files (PDF, DOCX, TXT, images, etc.) are parsed, optionally processed with OCR or model-assisted extraction for images, split into chunks, and encoded into vectors.
- Vector store: The project uses a Redis-backed vector store (via Spring AI components) to store and retrieve embeddings efficiently.
- Chat memory: Conversations are persisted so the assistant can reference prior turns and list available sessions.

What this repo contains

- A Spring Boot web application with a lightweight front-end (Thymeleaf + static JS/CSS).
- File upload & document processing pipeline using Apache Tika (text formats) and model-assisted image processing for images.
- Vector indexing via Spring AI vector-store abstractions (Redis vector store starter included).
- A chat API that demonstrates RAG: it retrieves relevant document chunks and calls a chat model to generate a response.
- Persistent chat memory backed by JDBC/H2 for demo purposes.

Getting started (development)

Prerequisites

- Java 21
- Maven 3.8+
- Redis if you want the Redis-backed vector store to run locally (optional for some demo modes)

Run locally

1. Build the project:

```cmd
mvn -DskipTests clean package
```

2. Start the application:

```cmd
mvn spring-boot:run
```

3. Open a browser to `http://localhost:8080/`.

Uploading documents

Use the Knowledge Base panel in the sidebar to drag & drop or pick files. Supported formats include PDF, DOCX, TXT, XLSX, HTML, CSV and common image formats. The app will parse, optionally OCR/describe images, split text into chunks, and index them into the vector store.

APIs

- `POST /api/upload` — accepts multipart file upload and indexes the document.
- `GET /api/sessions` — list conversation sessions and titles.
- `POST /api/chat` — send a user message; the server runs retrieval + generation and returns model response.
- `DELETE /api/sessions/{id}` — delete a conversation and its stored memory.

Configuration

Most configuration is provided via `application.yml` (embedding model, vector store connection, and API keys). For production use you should:

- Configure a persistent vector store (Redis or another provider supported by Spring AI).
- Provide API keys or model endpoints for the chat/embedding provider. This demo is configured to use **Gemini** (Google's Gemini models) as the primary chat/LLM provider, but you can also connect other supported providers (OpenAI or local transformer runtimes) via Spring AI configuration.

Why RAGStone?

RAGStone demonstrates a practical design pattern for building reliable, document-grounded assistants. The RAG pattern separates retrieval from generation to give the model concrete evidence to base its outputs on — a must for scientific and technical domains.

Brand and Tagline

RAGStone
Scientific Retrieval AI

Contributing

This project is a demo scaffold. Feel free to open issues, propose improvements, or adapt the code for your own RAG experiments.

License

This repository is provided as-is for demonstration purposes.
# Spring RAG Demo

Minimal RAG system using Spring Boot 3, Spring AI, Gemini (chat via configured LLM + local ONNX embeddings), and Redis as a vector store.

## Project Structure

```
spring-rag/
├── pom.xml
└── src/main/
    ├── java/com/example/rag/
    │   ├── RagApplication.java
    │   ├── controller/ChatController.java
    │   └── service/
    │       ├── DataLoaderService.java    # Loads PDF → chunks → Redis at startup
    │       ├── DataRetrievalService.java # Similarity search in Redis
     │       └── ChatBotService.java       # Builds prompt + calls Gemini (configured LLM)
    └── resources/
        ├── application.yml
        └── data/sample.pdf              # ← Place your PDF here
```

## Models used

| Role | Model | Where it runs |
|---|---|---|
| Chat | `mistralai/Mistral-7B-Instruct-v0.2` | Gemini (configured LLM) |
| Embedding | `sentence-transformers/all-MiniLM-L6-v2` (384-dim) | Local ONNX (auto-downloaded) |

## Prerequisites

- Java 21
- Maven 3.9+
- Docker

## 1. Start Redis with Docker

```bash
docker run -d --name redis-rag \
  -p 6379:6379 \
  redis/redis-stack:latest
```

> `redis/redis-stack` includes the RediSearch module required for vector similarity search.

## 2. Add your PDF

Place any PDF at:

```
src/main/resources/data/sample.pdf
```

## 3. Set your GEMINI_API_KEY

```bash
export GEMINI_API_KEY=your_token_here
```

Obtain your provider credentials (for Gemini, follow Google Cloud / Vertex AI docs to get the appropriate API key or service account credentials).

## 4. Run the application

```bash
cd spring-rag
mvn spring-boot:run
```

On first run, the ONNX embedding model (`all-MiniLM-L6-v2`) is downloaded automatically from the model hub (~90 MB). After that it is cached locally.

At startup, the PDF is read, chunked, embedded, and stored in Redis automatically.

## 5. Query the API

```bash
curl "http://localhost:8080/chat?message=What+is+this+document+about?"
```

## How it works

```
User question
     │
     ▼
DataRetrievalService  ──→  Redis (similarity search, top 4 chunks)
     │
     ▼
ChatBotService        ──→  Mistral-7B via configured LLM (Gemini)
     │
     ▼
     Answer
```

## Configuration (application.yml)

| Property | Value |
|---|---|
| Chat model | `mistralai/Mistral-7B-Instruct-v0.2` (or configure Gemini) |
| Embedding model | `all-MiniLM-L6-v2` (local ONNX) |
| Embedding dimensions | 384 |
| Vector store | Redis (`localhost:6379`) |
| Redis index | `rag-index` |
| Top-K results | 4 |
