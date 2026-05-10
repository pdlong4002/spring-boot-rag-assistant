package com.example.rag.service;

import org.springframework.ai.document.Document;
import org.springframework.ai.reader.tika.TikaDocumentReader;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class DataLoaderService implements ApplicationRunner {

    private final VectorStore vectorStore;

    @Value("${rag.data-path:classpath:data/*.pdf}")
    private String dataPath;

    public DataLoaderService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] pdfResources;

        try {
            pdfResources = resolver.getResources(dataPath);
        } catch (Exception e) {
            System.out.println("[DataLoader] No startup PDFs found at: " + dataPath);
            return;
        }

        if (pdfResources.length == 0) {
            System.out.println("[DataLoader] No startup PDFs found. Upload files via the UI.");
            return;
        }

        TokenTextSplitter splitter = new TokenTextSplitter(400, 50, 10, 10000, true);
        List<Document> allDocuments = new ArrayList<>();

        for (Resource pdf : pdfResources) {
            System.out.println("[DataLoader] Loading: " + pdf.getFilename());
            try {
                List<Document> docs = splitter.apply(new TikaDocumentReader(pdf).read());
                allDocuments.addAll(docs);
            } catch (Exception e) {
                System.out.println("[DataLoader] Skipped " + pdf.getFilename() + ": " + e.getMessage());
            }
        }

        if (!allDocuments.isEmpty()) {
            vectorStore.add(allDocuments);
            System.out.println("[DataLoader] Indexed " + allDocuments.size()
                    + " chunks from " + pdfResources.length + " file(s).");
        }
    }
}