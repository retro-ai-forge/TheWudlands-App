"use client";

import { useState } from "react";

const TEMPLATE_URL = "/downloads/wudlands-starter.twee";

// A random number after the story's name and in the file name, new on every
// download: the editor's import asks before replacing a story of the same name,
// so two downloads never collide. Without JavaScript the plain file downloads.
export function withNumber(twee: string, n: number): string {
  return twee.replace(/^(:: StoryTitle\r?\n)(.*)$/m, (_, header: string, name: string) => `${header}${name.trimEnd()} ${n}`);
}

export default function StarterDownload({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  async function download(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    try {
      const res = await fetch(TEMPLATE_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const n = 1000 + Math.floor(Math.random() * 9000);
      const blob = new Blob([withNumber(await res.text(), n)], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wudlands-starter-${n}.twee`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fall back to the plain file, without a number.
      setFailed(true);
      window.location.href = TEMPLATE_URL;
    }
  }

  return (
    <a href={TEMPLATE_URL} download onClick={failed ? undefined : download} className={className}>
      Download wudlands-starter.twee
    </a>
  );
}
