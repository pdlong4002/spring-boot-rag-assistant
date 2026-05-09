package com.example.rag.repository;

import com.example.rag.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    // Lấy tin nhắn theo thứ tự thời gian để render lại UI
    List<ChatMessage> findBySessionIdOrderByCreatedAtAsc(String sessionId);

    // Xóa lịch sử
    void deleteBySessionId(String sessionId);
}