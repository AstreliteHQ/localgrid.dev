import { useEffect, useId, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { AlertTriangle, Check, Clipboard, Code2, Download } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { CopyButton } from '@/components/CopyButton'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
} from '@/components/ui/combobox'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { LANGUAGES, loadLanguage, type LanguageOption, type LoadedLanguage } from './languages'
import { parseLineNumbers } from './lineRanges'
import { renderSnippetImage } from './renderSnippetImage'
import { SNIPPET_THEME_ORDER, SNIPPET_THEMES, type SnippetThemeId } from './snippetThemes'
import { tokenizeCode } from './tokenizeCode'

const DEFAULT_CODE = `function greet(name) {\n  return \`Hello, \${name}!\`\n}`
const DEFAULT_LANGUAGE = 'javascript'
const DEFAULT_THEME: SnippetThemeId = 'dark'
const DEFAULT_FONT_SIZE = 16
const DEFAULT_LINE_INPUT = ''
// Redraws on every keystroke would re-tokenize and re-encode a PNG each
// time — cheap for a short snippet, but there's no reason to do it faster
// than a human can actually perceive while typing/pasting a longer one.
const RENDER_DEBOUNCE_MS = 150
// A plain `EditorView.lineWrapping` stand-in while a language's grammar is
// still being dynamically imported (or for plaintext, which has none) —
// CodeEditor's own `extraExtensions` escape hatch, not its built-in
// `language` map, since that map only covers the handful of languages
// other widgets need and would otherwise have to grow to cover this
// widget's full 15-language catalog for every widget that uses it.
const FALLBACK_EXTENSIONS = [EditorView.lineWrapping]

type CopyStatus = 'idle' | 'copied' | 'failed'

interface SnippetResult {
  url: string
  width: number
  height: number
}

export default function CodeSnippetWidget({ instanceId }: WidgetProps) {
  const languageFieldId = useId()
  const themeFieldId = useId()
  const highlightFieldId = useId()
  const blurFieldId = useId()
  const [code, setCode] = useWidgetState(instanceId, 'code', DEFAULT_CODE)
  const [languageId, setLanguageId] = useWidgetState(instanceId, 'languageId', DEFAULT_LANGUAGE)
  const [themeId, setThemeId] = useWidgetState<SnippetThemeId>(instanceId, 'themeId', DEFAULT_THEME)
  const [fontSize, setFontSize] = useWidgetState(instanceId, 'fontSize', DEFAULT_FONT_SIZE)
  const [highlightLines, setHighlightLines] = useWidgetState(instanceId, 'highlightLines', DEFAULT_LINE_INPUT)
  const [blurLines, setBlurLines] = useWidgetState(instanceId, 'blurLines', DEFAULT_LINE_INPUT)
  const [loadedLanguage, setLoadedLanguage] = useState<LoadedLanguage | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SnippetResult | null>(null)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const blobRef = useRef<Blob | null>(null)
  const urlRef = useRef<string | null>(null)
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useWidgetDirty(
    instanceId,
    code !== DEFAULT_CODE ||
      languageId !== DEFAULT_LANGUAGE ||
      themeId !== DEFAULT_THEME ||
      fontSize !== DEFAULT_FONT_SIZE ||
      highlightLines !== DEFAULT_LINE_INPUT ||
      blurLines !== DEFAULT_LINE_INPUT,
  )

  const publishUrl = (url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
  }

  useEffect(() => () => publishUrl(null), [])

  // Drives the input editor's own live highlighting. Kept separate from the
  // debounced export effect below so switching languages restyles the
  // editor immediately, rather than waiting out the export's own debounce —
  // the resolved parser is then reused for tokenizeCode rather than
  // re-importing the same package a second time.
  useEffect(() => {
    let cancelled = false
    loadLanguage(languageId).then((loaded) => {
      if (!cancelled) setLoadedLanguage(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [languageId])

  const hasCode = code.trim().length > 0

  useEffect(() => {
    // Nothing to render — the empty state below is driven straight off
    // `code` itself, so a stale result/error can simply stay in state
    // unshown rather than needing a synchronous reset here.
    if (!hasCode) return
    let cancelled = false
    const timer = setTimeout(() => {
      setRendering(true)
      const tokens = tokenizeCode(code, loadedLanguage?.parser ?? null)
      renderSnippetImage(tokens, {
        theme: SNIPPET_THEMES[themeId],
        fontSize,
        highlightedLines: parseLineNumbers(highlightLines),
        blurredLines: parseLineNumbers(blurLines),
      })
        .then((image) => {
          if (cancelled) return
          blobRef.current = image.blob
          const url = URL.createObjectURL(image.blob)
          publishUrl(url)
          setResult({ url, width: image.width, height: image.height })
          setError(null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setError(err instanceof Error ? err.message : 'Could not render this snippet.')
        })
        .finally(() => {
          if (!cancelled) setRendering(false)
        })
    }, RENDER_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, hasCode, loadedLanguage, themeId, fontSize, highlightLines, blurLines])

  const handleCopyImage = async () => {
    const blob = blobRef.current
    if (blob && typeof ClipboardItem !== 'undefined') {
      try {
        // The write has to happen inside the click's own call stack for
        // Safari to allow it, so the already-resolved blob (not a fresh
        // render promise) is what gets written here — same reasoning as
        // ImageConverterWidget's own copy-to-clipboard button.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopyStatus('copied')
      } catch {
        setCopyStatus('failed')
      }
    } else {
      setCopyStatus('failed')
    }
    clearTimeout(copyStatusTimeoutRef.current)
    copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus('idle'), 1200)
  }

  const selectedLanguage = LANGUAGES.find((language) => language.id === languageId) ?? null
  const editorExtensions = loadedLanguage ? [loadedLanguage.extension] : FALLBACK_EXTENSIONS

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Field label="Language" htmlFor={languageFieldId} className="min-w-36 flex-1">
          <Combobox<LanguageOption>
            items={LANGUAGES}
            value={selectedLanguage}
            onValueChange={(language) => language && setLanguageId(language.id)}
            itemToStringLabel={(language) => language.label}
          >
            <ComboboxInput id={languageFieldId} placeholder="Search languages…" className="h-7 text-xs" />
            <ComboboxPortal>
              <ComboboxPositioner>
                <ComboboxPopup>
                  <ComboboxEmpty>No matching language</ComboboxEmpty>
                  <ComboboxList>
                    {(language: LanguageOption) => (
                      <ComboboxItem key={language.id} value={language}>
                        {language.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxPopup>
              </ComboboxPositioner>
            </ComboboxPortal>
          </Combobox>
        </Field>
        <Field label="Theme" htmlFor={themeFieldId} className="min-w-32">
          <select
            id={themeFieldId}
            value={themeId}
            onChange={(event) => setThemeId(event.target.value as SnippetThemeId)}
            className="h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {SNIPPET_THEME_ORDER.map((id) => (
              <option key={id} value={id}>
                {SNIPPET_THEMES[id].label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Field label="Size" layout="row" className="min-w-28 flex-1">
          <input
            type="range"
            min={12}
            max={28}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            aria-label="Snippet font size"
            className="h-1 min-w-16 flex-1 accent-primary"
          />
          <span className="w-8 shrink-0 text-right font-mono tabular-nums">{fontSize}</span>
        </Field>
        <Field label="Highlight lines" htmlFor={highlightFieldId} className="min-w-28 flex-1">
          <Input
            id={highlightFieldId}
            value={highlightLines}
            onChange={(event) => setHighlightLines(event.target.value)}
            placeholder="e.g. 3, 5-7"
            className="h-7 text-xs"
          />
        </Field>
        <Field label="Blur lines" htmlFor={blurFieldId} className="min-w-28 flex-1">
          <Input
            id={blurFieldId}
            value={blurLines}
            onChange={(event) => setBlurLines(event.target.value)}
            placeholder="e.g. 4"
            className="h-7 text-xs"
          />
        </Field>
      </div>

      <CodeEditor
        value={code}
        onChange={setCode}
        extraExtensions={editorExtensions}
        placeholder="Paste or type your code here…"
        aria-label="Code"
        className="min-h-32 flex-[2]"
      />

      {hasCode && error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
          {hasCode && result && (
            <div className="flex items-center gap-1">
              <CopyButton value={code} label="Copy code" className="px-2 py-1" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyImage}
                aria-live="polite"
                className={cn(
                  'h-auto gap-1 px-2 py-1 text-muted-foreground hover:text-foreground',
                  copyStatus === 'failed' && 'text-destructive hover:text-destructive',
                )}
              >
                {copyStatus === 'copied' ? (
                  <Check className="size-3.5" />
                ) : copyStatus === 'failed' ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  <Clipboard className="size-3.5" />
                )}
                {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy image'}
              </Button>
              <a
                href={result.url}
                download="snippet.png"
                className={cn(buttonVariants({ size: 'sm' }), 'h-auto gap-1 px-2 py-1')}
              >
                <Download className="size-3.5" />
                Download
              </a>
            </div>
          )}
        </div>
        <div className="flex max-h-40 items-center justify-center overflow-auto rounded-lg border border-border bg-muted/30 p-2">
          {hasCode && result ? (
            <img
              src={result.url}
              alt="Syntax-highlighted code preview"
              width={result.width}
              height={result.height}
              // The rendered PNG is 2x result.width/height (see
              // renderSnippetImage's EXPORT_SCALE, for a crisp download on
              // HiDPI screens) — without these explicit intrinsic
              // dimensions, the browser shows it at that doubled pixel
              // size instead of the size it was actually designed at. The
              // max-h/max-w below then shrink it further to fit this
              // fixed-height preview strip, so a large snippet reads as a
              // thumbnail here rather than dominating the widget.
              className="h-auto max-h-full w-auto max-w-full"
            />
          ) : (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Code2 className="size-3.5" />
              {rendering ? 'Rendering…' : 'Paste some code to preview it here'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
