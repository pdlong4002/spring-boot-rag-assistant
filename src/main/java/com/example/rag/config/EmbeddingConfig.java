package com.example.rag.config;

import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.transformers.TransformersEmbeddingModel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class EmbeddingConfig {

    // NOTE: these URIs point to the ONNX model and tokenizer currently hosted on the
    // Hugging Face model hub (sentence-transformers/all-MiniLM-L6-v2). If you are using
    // Gemini or another provider for embeddings, replace these URIs with the appropriate
    // model resources or configure a different EmbeddingModel bean that loads from your
    // provider. Keeping the default URIs preserves the existing auto-download behavior.
    private static final String MODEL_URI =
        "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx";
    private static final String TOKENIZER_URI =
        "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json";

    @Bean
    public EmbeddingModel embeddingModel() throws Exception {
        TransformersEmbeddingModel model = new TransformersEmbeddingModel();
        model.setModelResource(MODEL_URI);
        model.setTokenizerResource(TOKENIZER_URI);
        model.afterPropertiesSet();
        return model;
    }
}