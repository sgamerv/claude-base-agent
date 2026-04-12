import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cloud CDE Agent — 编辑器",
  description: "AI 编程助手代码编辑器界面",
};

export default function EditorPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  return <EditorPageContent params={params} />;
}

import EditorPageContent from "./EditorPageContent";
