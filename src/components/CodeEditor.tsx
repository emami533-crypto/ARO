import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state"; // 👈 Compartment اضافه شد
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  filename: string;
  theme: "light" | "dark";
};

// ساخت یک Compartment برای مدیریت تم
const themeCompartment = new Compartment();

export function CodeEditor({ value, onChange, filename, theme }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // تشخیص زبان بر اساس پسوند فایل
  const getLanguageExtension = (name: string) => {
    if (name.endsWith(".html") || name.endsWith(".htm")) return html();
    if (name.endsWith(".css")) return css();
    if (name.endsWith(".js") || name.endsWith(".jsx") || name.endsWith(".ts") || name.endsWith(".tsx")) return javascript();
    return [];
  };

  // مقداردهی اولیه ادیتور
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        getLanguageExtension(filename),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { fontFamily: "var(--font-family-code)", overflow: "auto" },
        }),
        // 👈 تم را داخل Compartment قرار می‌دهیم
        themeCompartment.of(theme === "dark" ? oneDark : []),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // فقط یک بار در ابتدا اجرا می‌شود

  // آپدیت مقدار (اگر هوش مصنوعی کد را تغییر داد یا فایل عوض شد)
  useEffect(() => {
    if (viewRef.current) {
      const currentValue = viewRef.current.state.doc.toString();
      if (currentValue !== value) {
        viewRef.current.dispatch({
          changes: { from: 0, to: currentValue.length, insert: value },
        });
      }
    }
  }, [value]);

  // 👈 آپدیت تم با استفاده از Compartment (رفع خطای TypeScript)
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: themeCompartment.reconfigure(theme === "dark" ? oneDark : []),
      });
    }
  }, [theme]);

  return <div ref={containerRef} className="codemirror-wrapper" />;
}