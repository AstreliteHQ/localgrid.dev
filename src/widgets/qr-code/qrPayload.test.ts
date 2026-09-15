import { describe, expect, it } from 'vitest'
import { buildQrValue, isQrFieldsComplete, type QrFields } from './qrPayload'

describe('isQrFieldsComplete', () => {
  it('requires non-blank text for the text type', () => {
    expect(isQrFieldsComplete({ type: 'text', text: '' })).toBe(false)
    expect(isQrFieldsComplete({ type: 'text', text: '   ' })).toBe(false)
    expect(isQrFieldsComplete({ type: 'text', text: 'hello' })).toBe(true)
  })

  it('requires an SSID for wifi', () => {
    const base = { type: 'wifi', ssid: '', password: '', encryption: 'WPA', hidden: false } as const
    expect(isQrFieldsComplete(base)).toBe(false)
    expect(isQrFieldsComplete({ ...base, ssid: 'MyNetwork' })).toBe(true)
  })

  it('requires a recipient for email', () => {
    const base = { type: 'email', to: '', subject: '', body: '' } as const
    expect(isQrFieldsComplete(base)).toBe(false)
    expect(isQrFieldsComplete({ ...base, to: 'a@b.com' })).toBe(true)
  })

  it('requires a phone number for sms and phone', () => {
    expect(isQrFieldsComplete({ type: 'sms', phone: '', message: '' })).toBe(false)
    expect(isQrFieldsComplete({ type: 'sms', phone: '+15550100', message: '' })).toBe(true)
    expect(isQrFieldsComplete({ type: 'phone', phone: '' })).toBe(false)
    expect(isQrFieldsComplete({ type: 'phone', phone: '+15550100' })).toBe(true)
  })

  it('requires a first or last name for vcard', () => {
    const base = {
      type: 'vcard',
      firstName: '',
      lastName: '',
      organization: '',
      phone: '',
      email: '',
      url: '',
    } as const
    expect(isQrFieldsComplete(base)).toBe(false)
    expect(isQrFieldsComplete({ ...base, firstName: 'Ada' })).toBe(true)
    expect(isQrFieldsComplete({ ...base, lastName: 'Lovelace' })).toBe(true)
  })
})

describe('buildQrValue', () => {
  it('returns an empty string once fields are incomplete', () => {
    expect(buildQrValue({ type: 'text', text: '' })).toBe('')
  })

  it('passes text through unchanged', () => {
    expect(buildQrValue({ type: 'text', text: 'https://example.com' })).toBe('https://example.com')
  })

  it('builds a WIFI: payload with the security type and SSID', () => {
    const value = buildQrValue({
      type: 'wifi',
      ssid: 'MyNetwork',
      password: 'hunter2',
      encryption: 'WPA',
      hidden: false,
    })
    expect(value).toBe('WIFI:T:WPA;S:MyNetwork;P:hunter2;;')
  })

  it('omits the password field for an open network', () => {
    const value = buildQrValue({ type: 'wifi', ssid: 'Open', password: 'ignored', encryption: 'nopass', hidden: false })
    expect(value).toBe('WIFI:T:nopass;S:Open;;')
  })

  it('marks a hidden network', () => {
    const value = buildQrValue({ type: 'wifi', ssid: 'Hidden', password: 'pw', encryption: 'WEP', hidden: true })
    expect(value).toBe('WIFI:T:WEP;S:Hidden;P:pw;H:true;;')
  })

  it('escapes separator characters in wifi fields', () => {
    const value = buildQrValue({ type: 'wifi', ssid: 'a;b,c:d\\e', password: '', encryption: 'nopass', hidden: false })
    expect(value).toBe('WIFI:T:nopass;S:a\\;b\\,c\\:d\\\\e;;')
  })

  it('builds a mailto: link with percent-encoded subject and body', () => {
    const value = buildQrValue({ type: 'email', to: 'a@b.com', subject: 'Hi there', body: 'Line one' })
    expect(value).toBe('mailto:a@b.com?subject=Hi%20there&body=Line%20one')
  })

  it('builds a bare mailto: link when there is no subject or body', () => {
    expect(buildQrValue({ type: 'email', to: 'a@b.com', subject: '', body: '' })).toBe('mailto:a@b.com')
  })

  it('percent-encodes reserved characters in the recipient so they cannot start the query string early', () => {
    const value = buildQrValue({ type: 'email', to: 'sales?east@example.com', subject: 'Hi', body: '' })
    expect(value).toBe('mailto:sales%3Feast@example.com?subject=Hi')
  })

  it('builds an SMSTO: payload', () => {
    expect(buildQrValue({ type: 'sms', phone: '+15550100', message: 'hey' })).toBe('SMSTO:+15550100:hey')
  })

  it('builds a tel: link', () => {
    expect(buildQrValue({ type: 'phone', phone: '+15550100' })).toBe('tel:+15550100')
  })

  it('builds a vCard with only the provided fields', () => {
    const fields: QrFields = {
      type: 'vcard',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organization: 'Analytical Engines Ltd',
      phone: '+15550100',
      email: 'ada@example.com',
      url: 'https://example.com',
    }
    const value = buildQrValue(fields)
    expect(value).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Lovelace;Ada;;;',
        'FN:Ada Lovelace',
        'ORG:Analytical Engines Ltd',
        'TEL:+15550100',
        'EMAIL:ada@example.com',
        'URL:https://example.com',
        'END:VCARD',
      ].join('\n'),
    )
  })

  it('leaves commas and semicolons in the vCard URL unescaped, since it holds a URI not text', () => {
    const value = buildQrValue({
      type: 'vcard',
      firstName: 'Ada',
      lastName: '',
      organization: '',
      phone: '',
      email: '',
      url: 'https://example.com/search?tag=a,b;c',
    })
    expect(value).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:;Ada;;;',
        'FN:Ada',
        'URL:https://example.com/search?tag=a,b;c',
        'END:VCARD',
      ].join('\n'),
    )
  })

  it('omits blank optional vcard fields', () => {
    const value = buildQrValue({
      type: 'vcard',
      firstName: 'Ada',
      lastName: '',
      organization: '',
      phone: '',
      email: '',
      url: '',
    })
    expect(value).toBe(['BEGIN:VCARD', 'VERSION:3.0', 'N:;Ada;;;', 'FN:Ada', 'END:VCARD'].join('\n'))
  })
})
