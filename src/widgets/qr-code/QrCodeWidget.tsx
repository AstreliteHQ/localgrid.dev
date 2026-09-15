import { useId, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { AlertTriangle, Check, Download, ImageIcon } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/NumberField'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { buildQrValue, type QrFields, type QrType, type WifiEncryption } from './qrPayload'

type ErrorLevel = 'L' | 'M' | 'Q' | 'H'

const TYPE_OPTIONS: { label: string; value: QrType }[] = [
  { label: 'Text/URL', value: 'text' },
  { label: 'Wi-Fi', value: 'wifi' },
  { label: 'Email', value: 'email' },
  { label: 'SMS', value: 'sms' },
  { label: 'Phone', value: 'phone' },
  { label: 'Contact', value: 'vcard' },
]

const WIFI_ENCRYPTION_OPTIONS: { label: string; value: WifiEncryption }[] = [
  { label: 'WPA/WPA2', value: 'WPA' },
  { label: 'WEP', value: 'WEP' },
  { label: 'None', value: 'nopass' },
]

const ERROR_LEVEL_OPTIONS: { label: string; value: ErrorLevel }[] = [
  { label: 'Low', value: 'L' },
  { label: 'Medium', value: 'M' },
  { label: 'Quartile', value: 'Q' },
  { label: 'High', value: 'H' },
]

const ERROR_LEVEL_DESCRIPTIONS: Record<ErrorLevel, string> = {
  L: 'Recovers from ~7% damage: the smallest, least redundant code.',
  M: 'Recovers from ~15% damage: a good default for most codes.',
  Q: 'Recovers from ~25% damage: safer for printed or handled codes.',
  H: 'Recovers from ~30% damage: best if you plan to add a logo on top.',
}

const DEFAULT_TYPE: QrType = 'text'
const DEFAULT_TEXT = 'https://localgrid.dev'
const DEFAULT_SIZE = 200
const MIN_SIZE = 96
const MAX_SIZE = 1024
const MIN_MARGIN = 0
const MAX_MARGIN = 10
const DEFAULT_FG = '#000000'
const DEFAULT_BG = '#ffffff'
const DEFAULT_LEVEL: ErrorLevel = 'M'
const DEFAULT_MARGIN = 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type CopyImageStatus = 'idle' | 'copied' | 'failed'

export default function QrCodeWidget({ instanceId }: WidgetProps) {
  const [qrType, setQrType] = useWidgetState<QrType>(instanceId, 'qrType', DEFAULT_TYPE)
  const [text, setText] = useWidgetState(instanceId, 'text', DEFAULT_TEXT)

  const [wifiSsid, setWifiSsid] = useWidgetState(instanceId, 'wifiSsid', '')
  const [wifiPassword, setWifiPassword] = useWidgetState(instanceId, 'wifiPassword', '')
  const [wifiEncryption, setWifiEncryption] = useWidgetState<WifiEncryption>(instanceId, 'wifiEncryption', 'WPA')
  const [wifiHidden, setWifiHidden] = useWidgetState(instanceId, 'wifiHidden', false)

  const [emailTo, setEmailTo] = useWidgetState(instanceId, 'emailTo', '')
  const [emailSubject, setEmailSubject] = useWidgetState(instanceId, 'emailSubject', '')
  const [emailBody, setEmailBody] = useWidgetState(instanceId, 'emailBody', '')

  const [smsPhone, setSmsPhone] = useWidgetState(instanceId, 'smsPhone', '')
  const [smsMessage, setSmsMessage] = useWidgetState(instanceId, 'smsMessage', '')

  const [callPhone, setCallPhone] = useWidgetState(instanceId, 'callPhone', '')

  const [vcardFirstName, setVcardFirstName] = useWidgetState(instanceId, 'vcardFirstName', '')
  const [vcardLastName, setVcardLastName] = useWidgetState(instanceId, 'vcardLastName', '')
  const [vcardOrganization, setVcardOrganization] = useWidgetState(instanceId, 'vcardOrganization', '')
  const [vcardPhone, setVcardPhone] = useWidgetState(instanceId, 'vcardPhone', '')
  const [vcardEmail, setVcardEmail] = useWidgetState(instanceId, 'vcardEmail', '')
  const [vcardUrl, setVcardUrl] = useWidgetState(instanceId, 'vcardUrl', '')

  const [size, setSize] = useWidgetState(instanceId, 'size', DEFAULT_SIZE)
  const [fgColor, setFgColor] = useWidgetState(instanceId, 'fgColor', DEFAULT_FG)
  const [bgColor, setBgColor] = useWidgetState(instanceId, 'bgColor', DEFAULT_BG)
  const [errorLevel, setErrorLevel] = useWidgetState<ErrorLevel>(instanceId, 'errorLevel', DEFAULT_LEVEL)
  const [margin, setMargin] = useWidgetState(instanceId, 'margin', DEFAULT_MARGIN)
  const [customizeOpen, setCustomizeOpen] = useWidgetState(instanceId, 'customizeOpen', false)

  const qrContainerRef = useRef<HTMLDivElement>(null)

  const wifiSsidId = useId()
  const wifiPasswordId = useId()
  const emailToId = useId()
  const emailSubjectId = useId()
  const emailBodyId = useId()
  const smsPhoneId = useId()
  const smsMessageId = useId()
  const callPhoneId = useId()
  const vcardFirstNameId = useId()
  const vcardLastNameId = useId()
  const vcardOrganizationId = useId()
  const vcardPhoneId = useId()
  const vcardEmailId = useId()
  const vcardUrlId = useId()
  const fgColorId = useId()
  const bgColorId = useId()

  useWidgetDirty(
    instanceId,
    qrType !== DEFAULT_TYPE ||
      text !== DEFAULT_TEXT ||
      wifiSsid !== '' ||
      wifiPassword !== '' ||
      wifiEncryption !== 'WPA' ||
      wifiHidden ||
      emailTo !== '' ||
      emailSubject !== '' ||
      emailBody !== '' ||
      smsPhone !== '' ||
      smsMessage !== '' ||
      callPhone !== '' ||
      vcardFirstName !== '' ||
      vcardLastName !== '' ||
      vcardOrganization !== '' ||
      vcardPhone !== '' ||
      vcardEmail !== '' ||
      vcardUrl !== '' ||
      size !== DEFAULT_SIZE ||
      fgColor !== DEFAULT_FG ||
      bgColor !== DEFAULT_BG ||
      errorLevel !== DEFAULT_LEVEL ||
      margin !== DEFAULT_MARGIN,
  )

  // One discriminated-union object per render, built from whichever fields
  // are active for `qrType`. buildQrValue only ever looks at the branch
  // matching its own `type`, so the other tabs' fields are along for the
  // ride but harmless.
  const fields: QrFields = useMemo(() => {
    switch (qrType) {
      case 'text':
        return { type: 'text', text }
      case 'wifi':
        return {
          type: 'wifi',
          ssid: wifiSsid,
          password: wifiPassword,
          encryption: wifiEncryption,
          hidden: wifiHidden,
        }
      case 'email':
        return { type: 'email', to: emailTo, subject: emailSubject, body: emailBody }
      case 'sms':
        return { type: 'sms', phone: smsPhone, message: smsMessage }
      case 'phone':
        return { type: 'phone', phone: callPhone }
      case 'vcard':
        return {
          type: 'vcard',
          firstName: vcardFirstName,
          lastName: vcardLastName,
          organization: vcardOrganization,
          phone: vcardPhone,
          email: vcardEmail,
          url: vcardUrl,
        }
    }
  }, [
    qrType,
    text,
    wifiSsid,
    wifiPassword,
    wifiEncryption,
    wifiHidden,
    emailTo,
    emailSubject,
    emailBody,
    smsPhone,
    smsMessage,
    callPhone,
    vcardFirstName,
    vcardLastName,
    vcardOrganization,
    vcardPhone,
    vcardEmail,
    vcardUrl,
  ])

  const value = useMemo(() => buildQrValue(fields), [fields])

  // NumberField reports every keystroke as-typed, clamped only once the
  // field blurs (see its own comment on why), so a value mid-edit (e.g.
  // "5" on the way to typing "500") can briefly sit outside
  // [MIN_SIZE, MAX_SIZE]. Rendering that straight into the canvas' `size`
  // would ask the browser to allocate an arbitrarily large bitmap, so the
  // real render always goes through this clamp regardless of what the
  // field currently displays.
  const renderSize = clamp(size, MIN_SIZE, MAX_SIZE)
  const renderMargin = clamp(margin, MIN_MARGIN, MAX_MARGIN)

  const handleDownload = () => {
    const canvas = qrContainerRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'qr-code.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const [copyImageStatus, setCopyImageStatus] = useState<CopyImageStatus>('idle')
  const copyImageTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Hands the ClipboardItem a pending Blob promise rather than awaiting
  // canvas.toBlob() first. Safari only allows a clipboard write while
  // still inside the click's own call stack, and toBlob's callback fires
  // after that stack has already unwound. Passing the still-pending
  // promise into `write()` (itself still called synchronously from the
  // click) lets the browser wait on the encode without losing the click's
  // permission grant.
  const handleCopyImage = async () => {
    const canvas = qrContainerRef.current?.querySelector('canvas')
    if (canvas && typeof ClipboardItem !== 'undefined') {
      try {
        const blob = new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/png')
        })
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopyImageStatus('copied')
      } catch {
        setCopyImageStatus('failed')
      }
    } else {
      setCopyImageStatus('failed')
    }
    clearTimeout(copyImageTimeoutRef.current)
    copyImageTimeoutRef.current = setTimeout(() => setCopyImageStatus('idle'), 1200)
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <SegmentedControl value={qrType} onChange={setQrType} options={TYPE_OPTIONS} className="flex-wrap" />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        <div className="flex flex-col gap-2">
          {qrType === 'text' && (
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Text or URL…"
              spellCheck={false}
              aria-label="Text or URL"
              className="min-h-16 font-mono text-xs"
            />
          )}

          {qrType === 'wifi' && (
            <>
              <Field label="Network name (SSID)" htmlFor={wifiSsidId}>
                <Input
                  id={wifiSsidId}
                  value={wifiSsid}
                  onChange={(event) => setWifiSsid(event.target.value)}
                  placeholder="MyNetwork"
                />
              </Field>
              <SegmentedControl value={wifiEncryption} onChange={setWifiEncryption} options={WIFI_ENCRYPTION_OPTIONS} />
              {wifiEncryption !== 'nopass' && (
                <Field label="Password" htmlFor={wifiPasswordId}>
                  <Input
                    id={wifiPasswordId}
                    value={wifiPassword}
                    onChange={(event) => setWifiPassword(event.target.value)}
                    placeholder="Password"
                  />
                </Field>
              )}
              <Button
                type="button"
                onClick={() => setWifiHidden((prev) => !prev)}
                aria-pressed={wifiHidden}
                className={cn(
                  'h-auto w-fit rounded px-1.5 py-1 font-normal',
                  wifiHidden
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
                )}
              >
                Hidden network
              </Button>
            </>
          )}

          {qrType === 'email' && (
            <>
              <Field label="To" htmlFor={emailToId}>
                <Input
                  id={emailToId}
                  type="email"
                  value={emailTo}
                  onChange={(event) => setEmailTo(event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="Subject" htmlFor={emailSubjectId}>
                <Input
                  id={emailSubjectId}
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  placeholder="Subject"
                />
              </Field>
              <Field label="Body" htmlFor={emailBodyId}>
                <Textarea
                  id={emailBodyId}
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                  placeholder="Message body"
                  className="min-h-12 text-xs"
                />
              </Field>
            </>
          )}

          {qrType === 'sms' && (
            <>
              <Field label="Phone number" htmlFor={smsPhoneId}>
                <Input
                  id={smsPhoneId}
                  value={smsPhone}
                  onChange={(event) => setSmsPhone(event.target.value)}
                  placeholder="+1 555 0100"
                />
              </Field>
              <Field label="Message" htmlFor={smsMessageId}>
                <Textarea
                  id={smsMessageId}
                  value={smsMessage}
                  onChange={(event) => setSmsMessage(event.target.value)}
                  placeholder="Message"
                  className="min-h-12 text-xs"
                />
              </Field>
            </>
          )}

          {qrType === 'phone' && (
            <Field label="Phone number" htmlFor={callPhoneId}>
              <Input
                id={callPhoneId}
                value={callPhone}
                onChange={(event) => setCallPhone(event.target.value)}
                placeholder="+1 555 0100"
              />
            </Field>
          )}

          {qrType === 'vcard' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="First name" htmlFor={vcardFirstNameId}>
                <Input
                  id={vcardFirstNameId}
                  value={vcardFirstName}
                  onChange={(event) => setVcardFirstName(event.target.value)}
                />
              </Field>
              <Field label="Last name" htmlFor={vcardLastNameId}>
                <Input
                  id={vcardLastNameId}
                  value={vcardLastName}
                  onChange={(event) => setVcardLastName(event.target.value)}
                />
              </Field>
              <Field label="Organization" htmlFor={vcardOrganizationId} className="col-span-2">
                <Input
                  id={vcardOrganizationId}
                  value={vcardOrganization}
                  onChange={(event) => setVcardOrganization(event.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor={vcardPhoneId}>
                <Input id={vcardPhoneId} value={vcardPhone} onChange={(event) => setVcardPhone(event.target.value)} />
              </Field>
              <Field label="Email" htmlFor={vcardEmailId}>
                <Input
                  id={vcardEmailId}
                  type="email"
                  value={vcardEmail}
                  onChange={(event) => setVcardEmail(event.target.value)}
                />
              </Field>
              <Field label="Website" htmlFor={vcardUrlId} className="col-span-2">
                <Input
                  id={vcardUrlId}
                  value={vcardUrl}
                  onChange={(event) => setVcardUrl(event.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          {value ? (
            <>
              {/* Always a plain white surface, regardless of theme: a dark
               * container would hurt scan contrast against a light QR code,
               * same reasoning as ShareModal's own QR preview. */}
              <div ref={qrContainerRef} className="w-full max-w-[240px] rounded-lg bg-white p-2">
                {/* `size` (up to MAX_SIZE) still sets the canvas' real pixel
                 * resolution via the width/height attributes qrcode.react
                 * puts on it, untouched by this. Only the *display* size is
                 * overridden here, to fill this box's own width (itself
                 * capped, and never auto/content-dependent: a % width on
                 * the canvas resolving against an auto-width ancestor is
                 * what made the on-screen size and centering unreliable
                 * before). */}
                <QRCodeCanvas
                  value={value}
                  size={renderSize}
                  fgColor={fgColor}
                  bgColor={bgColor}
                  level={errorLevel}
                  marginSize={renderMargin}
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <CopyButton value={value} label="Copy value" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyImage}
                  aria-live="polite"
                  className={cn(
                    'h-auto gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground',
                    copyImageStatus === 'failed' && 'text-destructive hover:text-destructive',
                  )}
                >
                  {copyImageStatus === 'copied' ? (
                    <Check className="size-3.5" />
                  ) : copyImageStatus === 'failed' ? (
                    <AlertTriangle className="size-3.5" />
                  ) : (
                    <ImageIcon className="size-3.5" />
                  )}
                  {copyImageStatus === 'copied'
                    ? 'Copied'
                    : copyImageStatus === 'failed'
                      ? 'Copy failed'
                      : 'Copy image'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-auto gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="size-3.5" />
                  Download
                </Button>
              </div>
            </>
          ) : (
            <p className="py-6 text-muted-foreground">{emptyHint(qrType)}</p>
          )}
        </div>

        <Collapsible
          open={customizeOpen}
          onOpenChange={setCustomizeOpen}
          className="shrink-0 rounded-md border border-border bg-background px-2 py-1.5 dark:bg-muted/40"
        >
          <CollapsibleTrigger>
            <span className="font-medium">Customize</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-2 pt-2">
              <NumberField label="Size (px)" value={size} min={MIN_SIZE} max={MAX_SIZE} onChange={setSize} />
              <NumberField label="Margin" value={margin} min={0} max={10} onChange={setMargin} />
              <div className="flex gap-2">
                <Field label="Foreground" htmlFor={fgColorId}>
                  <Input
                    id={fgColorId}
                    type="color"
                    value={fgColor}
                    onChange={(event) => setFgColor(event.target.value)}
                    className="h-8 w-14 cursor-pointer p-0"
                    aria-label="Foreground color"
                  />
                </Field>
                <Field label="Background" htmlFor={bgColorId}>
                  <Input
                    id={bgColorId}
                    type="color"
                    value={bgColor}
                    onChange={(event) => setBgColor(event.target.value)}
                    className="h-8 w-14 cursor-pointer p-0"
                    aria-label="Background color"
                  />
                </Field>
              </div>
              <Field label="Error correction">
                <SegmentedControl
                  value={errorLevel}
                  onChange={setErrorLevel}
                  options={ERROR_LEVEL_OPTIONS}
                  className="flex-wrap"
                />
                <p className="pt-1 text-[11px] text-muted-foreground">{ERROR_LEVEL_DESCRIPTIONS[errorLevel]}</p>
              </Field>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

function emptyHint(type: QrType): string {
  switch (type) {
    case 'text':
      return 'Enter some text or a URL to generate a QR code'
    case 'wifi':
      return 'Enter a network name to generate a QR code'
    case 'email':
      return 'Enter a recipient to generate a QR code'
    case 'sms':
    case 'phone':
      return 'Enter a phone number to generate a QR code'
    case 'vcard':
      return 'Enter a first or last name to generate a QR code'
  }
}
