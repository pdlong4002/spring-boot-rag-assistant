package com.example.rag.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "conversations")
public class Conversation {

    @Id
    @Column(name = "session_id", nullable = false)
    private String sessionId;

    @Column(nullable = false)
    private String title = "New Conversation";

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}

