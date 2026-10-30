import { useEffect } from 'react'
import SparkMD5 from 'spark-md5'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { InputSlot, OutputSlot } from '@/connectors/ConnectorSlots'
import { useWidgetOutput } from '@/connectors/useWidgetOutput'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'

type Algorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

const ALGORITHMS: Algorithm[] = [
  'MD5',
  'SHA-1',
  'SHA-256',
  'SHA-384',
  'SHA-512',
]

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function computeHash(
  algorithm: Algorithm,
  text: string,
): Promise<string> {
  if (algorithm === 'MD5') return SparkMD5.hash(text)
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest(algorithm, bytes)
  return bufferToHex(digest)
}

export default function HashGeneratorWidget({ instanceId }: WidgetProps) {
  const [algorithm, setAlgorithm] = useWidgetState<Algorithm>(instanceId, 'algorithm', 'SHA-256')
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  const [hash, setHash] = useWidgetState(instanceId, 'hash', '')
  useWidgetDirty(instanceId, input.length > 0)

  useEffect(() => {
    if (!input) return
    let cancelled = false
    computeHash(algorithm, input).then((result) => {
      if (!cancelled) setHash(result)
    })
    return () => {
      cancelled = true
    }
    // setHash (from useWidgetState) is stable across re-renders of this
    // mount, same guarantee as useState's own setter — safe to include.
  }, [algorithm, input, setHash])

  // Derived rather than reset via effect: clears instantly when input is
  // cleared instead of waiting a tick for the effect above to run.
  const displayedHash = input ? hash : ''
  useWidgetOutput(instanceId, displayedHash)

  return (
    <div className="flex h-full flex-col gap-2">
      <SegmentedControl
        value={algorithm}
        onChange={setAlgorithm}
        options={ALGORITHMS.map((value) => ({ label: value, value }))}
        className="flex-wrap"
      />
      <InputSlot input="input" className="flex flex-1 flex-col">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Text to hash…"
          spellCheck={false}
          className="h-16 w-full flex-1 resize-none p-2 font-mono text-xs"
        />
      </InputSlot>
      <OutputSlot>
        {/* Distinct, lighter readonly-output palette — deliberately not the
         * default Input look (see plan §6.2). */}
        <Input
          readOnly
          value={displayedHash}
          placeholder="Hash output"
          className="border-border bg-background p-2 pr-14 font-mono text-xs dark:bg-muted/40"
        />
        <CopyButton value={displayedHash} className="absolute right-1 top-1" />
      </OutputSlot>
    </div>
  )
}
