"use client";

const URL_REGEX = /(https?:\/\/[^\s<>"')\]},]+)/g;

export function Linkify({ children }: { children: string }) {
  const parts = children.split(URL_REGEX);

  if (parts.length === 1) {
    return <>{children}</>;
  }

  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 underline underline-offset-2 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
