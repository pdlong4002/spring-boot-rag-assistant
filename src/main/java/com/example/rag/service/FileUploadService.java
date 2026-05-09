package com.example.rag.service;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.content.Media;
import org.springframework.ai.document.Document;
import org.springframework.ai.reader.tika.TikaDocumentReader;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeType;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class FileUploadService {

    private static final Set<String> IMAGE_EXTENSIONS = Set.of("jpg", "jpeg", "png", "gif", "webp", "bmp");

    private static final String IMAGE_PROMPT =
            "You are indexing this image for a RAG knowledge base. " +
                    "Extract ALL visible text verbatim. Then describe: visual content, charts, diagrams, tables, " +
                    "key concepts, and any data present. Be extremely thorough and detailed.";

    private final VectorStore vectorStore;
    private final ChatClient chatClient;
    private final TokenTextSplitter splitter;

    public FileUploadService(VectorStore vectorStore, ChatClient.Builder chatClientBuilder) {
        this.vectorStore = vectorStore;
        this.chatClient = chatClientBuilder.build();
        this.splitter = new TokenTextSplitter(400, 50, 10, 10000, true);
    }

    public String processFile(MultipartFile file) throws IOException {
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
        String ext = getExtension(filename);

        List<Document> docs;
        if (IMAGE_EXTENSIONS.contains(ext)) {
            docs = processImage(file, filename);
        } else {
            docs = processDocument(file, filename);
        }

        vectorStore.add(docs);
        return "\"" + filename + "\" indexed successfully (" + docs.size() + " chunk(s))";
    }

    private List<Document> processImage(MultipartFile file, String filename) throws IOException {
        byte[] bytes = file.getBytes();
        MimeType mimeType = MimeType.valueOf(
                file.getContentType() != null ? file.getContentType() : "image/jpeg");
        Media media = new Media(mimeType, new ByteArrayResource(bytes));

        // Use ChatClient's user builder — avoids touching the private UserMessage constructor
        String description = chatClient.prompt()
                .user(u -> u.text(IMAGE_PROMPT).media(media))
                .call()
                .content();

        Document doc = new Document(
                "Image: " + filename + "\n\n" + description,
                Map.of("file_name", filename, "type", "image")
        );
        return List.of(doc);
    }

    private List<Document> processDocument(MultipartFile file, String filename) throws IOException {
        ByteArrayResource resource = new ByteArrayResource(file.getBytes()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };

        TikaDocumentReader reader = new TikaDocumentReader(resource);
        List<Document> rawDocs = reader.read();
        return splitter.apply(rawDocs);
    }

    private String getExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : "";
    }
}