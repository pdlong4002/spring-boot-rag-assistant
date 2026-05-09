package com.example.rag.service;

import com.example.rag.entity.ChatMessage;
import com.example.rag.repository.ChatMessageRepository;
import org.springframework.ai.chat.memory.ChatMemoryRepository;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class PersistentChatMemoryRepository implements ChatMemoryRepository {

    private final ChatMessageRepository jpaRepository;

    public PersistentChatMemoryRepository(ChatMessageRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    // Keep a helper that can be called if some code still uses the old method name
    public void add(String conversationId, List<Message> messages) {
        saveAll(conversationId, messages);
    }

    @Override
    public void saveAll(String conversationId, List<Message> messages) {
        List<ChatMessage> entities = messages.stream().map(msg -> {
            ChatMessage entity = new ChatMessage();
            entity.setSessionId(conversationId);
            // Use new Message API
            entity.setContent(msg.getText());

            // Determine role using MessageType
            if (msg.getMessageType() == MessageType.USER) entity.setRole("USER");
            else if (msg.getMessageType() == MessageType.ASSISTANT) entity.setRole("ASSISTANT");
            else if (msg.getMessageType() == MessageType.SYSTEM) entity.setRole("SYSTEM");
            else entity.setRole("UNKNOWN");

            return entity;
        }).toList();

        jpaRepository.saveAll(entities);
    }

    // New ChatMemoryRepository API methods used across the app
    @Override
    public List<String> findConversationIds() {
        return jpaRepository.findAll()
                .stream()
                .map(ChatMessage::getSessionId)
                .distinct()
                .collect(Collectors.toList());
    }

    @Override
    public List<Message> findByConversationId(String conversationId) {
        return jpaRepository.findBySessionIdOrderByCreatedAtAsc(conversationId)
                .stream()
                .map(entity -> {
                    if ("USER".equals(entity.getRole())) {
                        return new UserMessage(entity.getContent());
                    } else if ("ASSISTANT".equals(entity.getRole())) {
                        return new AssistantMessage(entity.getContent());
                    } else {
                        return new SystemMessage(entity.getContent());
                    }
                }).collect(Collectors.toList());
    }

    @Override
    public void deleteByConversationId(String conversationId) {
        jpaRepository.deleteBySessionId(conversationId);
    }
}