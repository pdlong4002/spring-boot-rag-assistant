-- Schema for Spring AI JDBC Chat Memory (H2)
-- Created to satisfy auto-configuration: classpath:org/springframework/ai/chat/memory/repository/jdbc/schema-h2.sql

DROP TABLE IF EXISTS SPRING_AI_CHAT_MEMORY;

CREATE TABLE SPRING_AI_CHAT_MEMORY (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    content CLOB NOT NULL,
    type VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

