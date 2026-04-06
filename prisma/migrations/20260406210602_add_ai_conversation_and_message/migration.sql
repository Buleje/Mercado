-- CreateTable AIConversation
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'assistant',
    "title" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex AIConversation on tenantId
CREATE INDEX "AIConversation_tenantId_idx" ON "AIConversation"("tenantId");

-- CreateIndex AIConversation on user
CREATE INDEX "AIConversation_user_idx" ON "AIConversation"("user");

-- CreateIndex AIConversation on channel
CREATE INDEX "AIConversation_channel_idx" ON "AIConversation"("channel");

-- CreateIndex AIConversation on updatedAt
CREATE INDEX "AIConversation_updatedAt_idx" ON "AIConversation"("updatedAt");

-- CreateTable AIMessage
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "feedback" TEXT,
    "feedbackNote" TEXT,
    "mode" TEXT,
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation" ("id") ON DELETE CASCADE
);

-- CreateIndex AIMessage on conversationId
CREATE INDEX "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");

-- CreateIndex AIMessage on role
CREATE INDEX "AIMessage_role_idx" ON "AIMessage"("role");

-- CreateIndex AIMessage on createdAt
CREATE INDEX "AIMessage_createdAt_idx" ON "AIMessage"("createdAt");
