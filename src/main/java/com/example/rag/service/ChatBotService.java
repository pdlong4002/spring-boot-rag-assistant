package com.example.rag.service;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.ChatMemoryRepository;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChatBotService {

    private static final String CP_SYSTEM_PROMPT = """
            # ROLE
            You are an elite Competitive Programming (CP) Grandmaster and ICPC World Finalist. Your objective is to explain complex algorithms, data structures, and solve CP problems using strictly the provided context retrieved from algorithmic PDFs and textbooks.
            
            # CONSTRAINTS & INSTRUCTIONS
            1. STRICT GROUNDING: 
               - If the `{context}` contains the exact algorithm or solution, explain it thoroughly based on it.
               - If the context is empty or irrelevant, MUST output: "The retrieved context does not contain detailed information about this, but based on general CP knowledge..." and then proceed to answer. DO NOT hallucinate citations.
            
            2. MATHEMATICAL & LOGICAL RIGOR: 
               - Analyze constraints and state exact Big O Time/Space complexity.
               - MUST use LaTeX for formulas (e.g., $O(N \\log N)$, $10^9+7$).
            
            3. CP-OPTIMIZED CODE:
               - Provide highly optimized C++ (C++17/20 standard) code.
               - Include fast I/O: `ios_base::sync_with_stdio(false); cin.tie(NULL);`
               - Favor contiguous memory (`std::vector`) and concise implementations.
            
            4. LANGUAGE & OUTPUT STRUCTURE:
               - STRICT RULE: You MUST respond ENTIRELY in English, regardless of the language used in the user's query. Do not use French or any other language.
               - Structure your response using the following format:
                 - **Intuition:**
                 - **Detailed Explanation:**
                 - **Complexity:**
                 - **Implementation:**
            
            # RETRIEVED CONTEXT
            {context}
            """;

    private final ChatClient chatClient;
    private final DataRetrievalService retrievalService;
    private final ChatMemory chatMemory;

    public ChatBotService(ChatClient.Builder builder,
                          DataRetrievalService retrievalService,
                          ChatMemoryRepository memoryRepository) {
        this.chatClient = builder.build();
        this.retrievalService = retrievalService;

        this.chatMemory = MessageWindowChatMemory.builder()
                .chatMemoryRepository(memoryRepository)
                .maxMessages(10)
                .build();
    }

    public String chat(String question, String sessionId) {
        String context = retrievalService.findSimilarContent(question);

        String finalContext = context.isBlank()
                ? "(No relevant documents found in the database)"
                : context;

        return chatClient.prompt()
                .system(s -> s.text(CP_SYSTEM_PROMPT)
                        .param("context", finalContext))
                .user(question)
                .advisors(MessageChatMemoryAdvisor.builder(chatMemory)
                        .conversationId(sessionId)
                        .build())
                .call()
                .content();
    }

    @Transactional
    public void clearSession(String sessionId) {
        chatMemory.clear(sessionId);
    }
}