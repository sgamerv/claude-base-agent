import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cloud CDE Agent — 聊天",
  description: "AI 编程助手聊天界面",
};

export default function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  return <ChatPageContent params={params} />;
}

import ChatPageContent from "./ChatPageContent";
