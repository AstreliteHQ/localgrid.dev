export type QrType = 'text' | 'wifi' | 'email' | 'sms' | 'phone' | 'vcard'

export type WifiEncryption = 'WPA' | 'WEP' | 'nopass'

export interface WifiFields {
  ssid: string
  password: string
  encryption: WifiEncryption
  hidden: boolean
}

export interface EmailFields {
  to: string
  subject: string
  body: string
}

export interface SmsFields {
  phone: string
  message: string
}

export interface PhoneFields {
  phone: string
}

export interface VCardFields {
  firstName: string
  lastName: string
  organization: string
  phone: string
  email: string
  url: string
}

export type QrFields =
  | ({ type: 'text' } & { text: string })
  | ({ type: 'wifi' } & WifiFields)
  | ({ type: 'email' } & EmailFields)
  | ({ type: 'sms' } & SmsFields)
  | ({ type: 'phone' } & PhoneFields)
  | ({ type: 'vcard' } & VCardFields)

/** WIFI: and vCard payloads are separator-delimited "MECARD-style" formats —
 * a value containing one of those separators (e.g. a Wi-Fi password with a
 * `;` in it) has to be backslash-escaped, or a scanner parsing the payload
 * would treat it as the start of the next field and silently truncate this
 * one. Backslashes are escaped first, so a value's own escape sequences
 * never get re-escaped by the loop below. */
function escapeSeparators(value: string, chars: string[]): string {
  let out = value.replace(/\\/g, '\\\\')
  for (const char of chars) {
    out = out.split(char).join(`\\${char}`)
  }
  return out
}

const escapeWifiValue = (value: string): string => escapeSeparators(value, [';', ',', ':'])

const escapeVCardValue = (value: string): string => escapeSeparators(value, [';', ',']).replace(/\n/g, '\\n')

function buildWifiValue(f: WifiFields): string {
  const parts = [`T:${f.encryption}`, `S:${escapeWifiValue(f.ssid)}`]
  if (f.encryption !== 'nopass') parts.push(`P:${escapeWifiValue(f.password)}`)
  if (f.hidden) parts.push('H:true')
  return `WIFI:${parts.join(';')};;`
}

function buildEmailValue(f: EmailFields): string {
  const query = [
    f.subject ? `subject=${encodeURIComponent(f.subject)}` : null,
    f.body ? `body=${encodeURIComponent(f.body)}` : null,
  ].filter((part): part is string => part !== null)
  return `mailto:${f.to}${query.length ? `?${query.join('&')}` : ''}`
}

function buildSmsValue(f: SmsFields): string {
  return `SMSTO:${f.phone}:${f.message}`
}

function buildPhoneValue(f: PhoneFields): string {
  return `tel:${f.phone}`
}

function buildVCardValue(f: VCardFields): string {
  const fullName = [f.firstName, f.lastName].filter(Boolean).join(' ')
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCardValue(f.lastName)};${escapeVCardValue(f.firstName)};;;`,
    `FN:${escapeVCardValue(fullName)}`,
  ]
  if (f.organization) lines.push(`ORG:${escapeVCardValue(f.organization)}`)
  if (f.phone) lines.push(`TEL:${escapeVCardValue(f.phone)}`)
  if (f.email) lines.push(`EMAIL:${escapeVCardValue(f.email)}`)
  if (f.url) lines.push(`URL:${escapeVCardValue(f.url)}`)
  lines.push('END:VCARD')
  return lines.join('\n')
}

/** Whether `fields` has enough to produce a payload worth rendering — each
 * type's one truly required field (an empty SSID or phone number would
 * still "work" but produce a QR code nobody meant to generate). */
export function isQrFieldsComplete(fields: QrFields): boolean {
  switch (fields.type) {
    case 'text':
      return fields.text.trim() !== ''
    case 'wifi':
      return fields.ssid.trim() !== ''
    case 'email':
      return fields.to.trim() !== ''
    case 'sms':
    case 'phone':
      return fields.phone.trim() !== ''
    case 'vcard':
      return fields.firstName.trim() !== '' || fields.lastName.trim() !== ''
  }
}

/** Builds the raw string encoded into the QR code — empty once `fields`
 * isn't complete yet, so the widget can tell "nothing to render" apart from
 * a real payload. */
export function buildQrValue(fields: QrFields): string {
  if (!isQrFieldsComplete(fields)) return ''
  switch (fields.type) {
    case 'text':
      return fields.text
    case 'wifi':
      return buildWifiValue(fields)
    case 'email':
      return buildEmailValue(fields)
    case 'sms':
      return buildSmsValue(fields)
    case 'phone':
      return buildPhoneValue(fields)
    case 'vcard':
      return buildVCardValue(fields)
  }
}
