package com.example.rag.service;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class DataRetrievalService {

    private final VectorStore vectorStore;

    public DataRetrievalService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public String findSimilarContent(String query) {
        List<Document> docs = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(8)                   // Tăng từ 4 → 8 để lấy nhiều context hơn
                        .similarityThreshold(0.3)  // Ngưỡng thấp hơn, không bỏ sót chunk liên quan
                        .build()
        );

        if (docs.isEmpty()) {
            return "(No relevant content found in documents)";
        }

        return docs.stream()
                .map(doc -> "[Source: " + doc.getMetadata().getOrDefault("file_name", "document") + "]\n" + doc.getText())
                .collect(Collectors.joining("\n\n---\n\n"));
    }
}