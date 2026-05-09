package com.example.rag.controller;

import com.example.rag.entity.ChatMessage;
import com.example.rag.entity.Conversation;
import com.example.rag.repository.ChatMessageRepository;
import com.example.rag.repository.ConversationRepository;
import com.example.rag.service.ChatBotService;
import com.example.rag.service.FileUploadService;
import org.springframework.ai.chat.memory.ChatMemoryRepository;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@Controller
public class ChatController {

    private final ChatBotService chatBotService;
    private final FileUploadService fileUploadService;
    private final ChatMemoryRepository memoryRepository;
    private final ChatMessageRepository chatMessageRepo;
    private final ConversationRepository conversationRepository;

    public ChatController(ChatBotService chatBotService,
                          FileUploadService fileUploadService,
                          ChatMemoryRepository memoryRepository,
                          ChatMessageRepository chatMessageRepo,
                          ConversationRepository conversationRepository) {
        this.chatBotService = chatBotService;
        this.fileUploadService = fileUploadService;
        this.memoryRepository = memoryRepository;
        this.chatMessageRepo = chatMessageRepo;
        this.conversationRepository = conversationRepository;
    }

    @GetMapping("/")
    public String index() {
        return "index";
    }

    /* ── Chat ── */
    @PostMapping("/api/chat")
    @ResponseBody
    public ResponseEntity<Map<String, String>> chat(@RequestBody Map<String, String> body) {
        String message = body.get("message");
        if (message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Message is required"));
        }
        String sessionId = body.getOrDefault("sessionId", UUID.randomUUID().toString());

        // Do NOT auto-create Conversation here. Conversation titles are managed separately
        // by the rename endpoint when the user edits the title.

        String response = chatBotService.chat(message, sessionId);
        return ResponseEntity.ok(Map.of("response", response, "sessionId", sessionId));
    }

    /* ── Session: list all conversation IDs with first message preview ── */
    @GetMapping("/api/sessions")
    @ResponseBody
    public ResponseEntity<List<Map<String, Object>>> listSessions() {
        List<String> ids = memoryRepository.findConversationIds();
        List<Map<String, Object>> result = new ArrayList<>();
        for (String id : ids) {
            List<Message> msgs = memoryRepository.findByConversationId(id);
            // Prefer stored conversation title if present
            String title = conversationRepository.findById(id)
                    .map(Conversation::getTitle)
                    .orElseGet(() -> msgs.stream()
                            .filter(m -> m.getMessageType() == MessageType.USER)
                            .findFirst()
                            .map(m -> truncate(m.getText(), 60))
                            .orElse("New Conversation")
                    );
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", id);
            entry.put("title", title);
            entry.put("messageCount", msgs.size());
            result.add(entry);
        }
        return ResponseEntity.ok(result);
    }

    /* ── Session: get all messages for a conversation ── */
    @GetMapping("/api/sessions/{sessionId}/messages")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> getSessionMessages(@PathVariable String sessionId) {
        List<Message> msgs = memoryRepository.findByConversationId(sessionId);
        List<Map<String, String>> list = new ArrayList<>();
        for (Message m : msgs) {
            if (m.getMessageType() == MessageType.SYSTEM) continue; // skip system messages
            list.add(Map.of(
                    "role", m.getMessageType().getValue(),
                    "content", m.getText()
            ));
        }
        return ResponseEntity.ok(Map.of("messages", list));
    }

    /* ── Session: rename a conversation ── */
    @PutMapping("/api/sessions/{sessionId}/rename")
    @ResponseBody
    public ResponseEntity<Map<String, String>> renameSession(@PathVariable String sessionId,
                                                             @RequestBody Map<String, String> body) {
        String title = body.get("title");
        if (title == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Title is required"));
        }
        // create or update Conversation record
        Conversation conv = conversationRepository.findById(sessionId).orElseGet(() -> {
            Conversation c = new Conversation();
            c.setSessionId(sessionId);
            return c;
        });
        conv.setTitle(title.trim().isEmpty() ? "New Conversation" : title.trim());
        conversationRepository.save(conv);
        return ResponseEntity.ok(Map.of("message", "Renamed", "title", conv.getTitle()));
    }

    /* ── Session: delete a conversation ── */
    @DeleteMapping("/api/sessions/{sessionId}")
    @ResponseBody
    @Transactional
    public ResponseEntity<Map<String, String>> deleteSession(@PathVariable String sessionId) {
        memoryRepository.deleteByConversationId(sessionId);
        conversationRepository.deleteById(sessionId);
        return ResponseEntity.ok(Map.of("message", "Deleted"));
    }

    /* ── Session: start a new conversation (clears old one) ── */
    @PostMapping("/api/chat/clear")
    @ResponseBody
    public ResponseEntity<Map<String, String>> clearChat(@RequestBody Map<String, String> body) {
        String sessionId = body.get("sessionId");
        if (sessionId != null && !sessionId.isBlank()) {
            chatBotService.clearSession(sessionId);
            conversationRepository.deleteById(sessionId);
        }
        return ResponseEntity.ok(Map.of(
                "sessionId", UUID.randomUUID().toString(),
                "message", "New conversation started"
        ));
    }

    /* ── File upload ── */
    @PostMapping("/api/upload")
    @ResponseBody
    public ResponseEntity<Map<String, String>> upload(@RequestParam("file") MultipartFile file) {
        try {
            String result = fileUploadService.processFile(file);
            return ResponseEntity.ok(Map.of("message", result));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/history/{sessionId}")
    public ResponseEntity<List<ChatMessage>> getHistory(@PathVariable String sessionId) {
        return ResponseEntity.ok(chatMessageRepo.findBySessionIdOrderByCreatedAtAsc(sessionId));
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "…";
    }
}