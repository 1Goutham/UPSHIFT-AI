"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

/**
 * Voice input via the browser's built-in speech recognition (Web Speech API).
 * Speech is processed by the browser vendor, not by UPSHIFT. When the browser
 * does not support it, the button is not rendered at all; nothing pretends to
 * listen. A streaming voice provider can replace this component later.
 */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function Dictate({ onText, className = "" }: { onText: (text: string) => void; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);

  useEffect(() => setSupported(!!getCtor()), []);
  useEffect(() => () => rec.current?.stop(), []);
  if (!supported) return null;

  const start = () => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .filter((x) => x.isFinal)
        .map((x) => x[0].transcript)
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone permission denied." : e.error === "no-speech" ? "No speech heard." : `Dictation error: ${e.error}`);
      setListening(false);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setError("");
    setListening(true);
    r.start();
  };

  return (
    <span className={`inline-flex shrink-0 flex-col items-end ${className}`}>
      <button
        type="button"
        onClick={() => (listening ? rec.current?.stop() : start())}
        className={`btn btn-sm ${listening ? "btn-accent" : "btn-quiet"}`}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictation" : "Dictate with your browser's speech recognition"}
        title="Dictation uses your browser's speech recognition"
      >
        {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
        {listening ? "Listening" : null}
      </button>
      {error ? (
        <span role="status" className="mt-1 text-[11px] text-fail">
          {error}
        </span>
      ) : null}
    </span>
  );
}
